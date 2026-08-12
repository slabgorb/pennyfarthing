"""Tests for 162-39: CWE-78 sweep — no template fence may interpolate
agent-assembled data into a Python source string.

THE VULNERABILITY
-----------------
Dist markdown templates carry bash fences that an agent executes verbatim. A
number of them build the Python payload as a DOUBLE-QUOTED ``-c`` string and
splice agent-assembled values straight into the Python source::

    "${PF_PY:?...}" -c "
    from pf.gates.ac_completion import validate_ac_completion
    result = validate_ac_completion('${CONTEXT_FILE}', '${SESSION_FILE}')
    "

Two distinct injection channels, both live:

1. SHELL. The heredoc-less double-quoted string is expanded by the shell before
   python ever sees it, so ``$(...)``/backticks reaching that text are COMMAND
   substitution — classic CWE-78. The route that opens this is the
   ``{PLACEHOLDER}`` token: the AGENT substitutes it while writing the command,
   so hostile story/PR text becomes literal SCRIPT TEXT that bash then parses.
   (A ``${VAR}`` whose runtime value contains ``$(...)`` is not re-expanded by
   bash, so the gate fences' exposure is channel 2 — reproduced separately.)
2. PYTHON. Whatever reaches the payload lands inside a ``'...'`` literal in the
   Python source. A single apostrophe (``Keith's fix``) closes the literal and
   the fence dies with a SyntaxError; a crafted value
   (``'); import os; ...  #``) executes arbitrary Python with the pf
   interpreter's privileges. BOTH interpolation routes open this channel.

THE DEFENSE (already documented, applied non-uniformly)
------------------------------------------------------
``agents/sm-setup.md`` Step 5 is the reference implementation and the exact form
Dev must copy tree-wide::

    PF_PY="$(sed -n '1s/^#!//p' "$(command -v pf)")"
    STRATEGIES=$("${PF_PY:?PF_PY not set - could not resolve the pf launcher interpreter}" - "{REPOS}" <<'PYEOF'
    import sys
    from pf.git.repos import get_repo_config
    rc = get_repo_config(sys.argv[1])
    print(rc.branch_strategy if rc else "gitflow")
    PYEOF
    )

Three properties, all required — none of them alone is sufficient:

- SINGLE-QUOTED heredoc (``<<'PYEOF'``): the shell performs NO expansion on the
  payload, closing channel 1.
- POSITIONAL ARGV: values ride as double-quoted words after the ``-`` and are
  read via ``sys.argv[N]``, so they are DATA, never source text — closing
  channel 2.
- NO interpolation token inside the payload: no ``${VAR}``, no ``$VAR``, no
  ``$(...)``, no ``{PLACEHOLDER}``.

SCOPE — what the SM's "nine fences" actually resolve to
------------------------------------------------------
The story listed nine sites by line number. Three of them (``agents/sm-finish.md``
``format_pr_title``, ``commands/pf-standalone.md``, ``workflows/git-cleanup``
step-03) were already remediated by 164-6, which replaced their Python fences
with the ``pf git format-title`` CLI. Re-scanning the tree finds EIGHT still-live
offenders — the three sm-finish sites (the SM's stale line refs pointed at the
already-fixed one and missed two others) plus the five gate fences. All eleven
sites are pinned here: eight as offenders to fix, three as
already-safe regression guards so 164-6's fix cannot be undone. Logged as a
Design Deviation in the session file.

The offender check is a DISCOVERY SWEEP, not a per-file allowlist (the 162-8
pattern): a template added tomorrow with the vulnerable shape fails CI with
nobody editing this file. ``PINNED_SITES`` exists on top of the sweep so the
specific eleven are named, and ``TestFencesStillExist`` is the negative guard
that stops the sweep being satisfied by DELETING a fence.

Story: 162-39 (epic 162), from the 162-8 review
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

from pf.tests.test_162_8_template_pf_py_policy import (
    DIST_DIR,
    _bash_fences,
    _executes_pf,
    _rel,
    _template_files,
)

# ---------------------------------------------------------------------------
# Payload extraction
# ---------------------------------------------------------------------------

# A Python payload handed to the interpreter as a QUOTED -c string. The quote
# char is captured so a single-quoted -c payload (shell-expansion-free) is
# distinguished from the double-quoted one (expanded before python sees it).
DASH_C_PAYLOAD_RE = re.compile(r"-c\s*(?P<q>[\"'])(?P<payload>.*?)(?P=q)", re.DOTALL)

# A heredoc payload. The delimiter's quoting is what decides whether the shell
# expands the body, so it is captured too: <<'PYEOF' is inert, <<PYEOF is not.
HEREDOC_RE = re.compile(
    r"<<-?\s*(?P<open_q>['\"]?)(?P<tag>[A-Za-z_][A-Za-z0-9_]*)(?P=open_q)"
    r"(?P<rest>.*?)^(?P<body>.*?)^[ \t]*(?P=tag)[ \t]*$",
    re.DOTALL | re.MULTILINE,
)

# Shell expansion inside a payload: ${VAR}, $VAR, $(cmd), `cmd`.
SHELL_EXPANSION_RE = re.compile(r"\$\{[^}]+\}|\$\([^)]*\)|\$[A-Za-z_][A-Za-z0-9_]*|`[^`]*`")
# An agent-substituted template placeholder: {STORY_ID}, {REPOS}, {SESSION_FILE}.
# Upper-case only, so Python dict/f-string braces are not false positives.
TEMPLATE_PLACEHOLDER_RE = re.compile(r"\{[A-Z][A-Z0-9_]*\}")

# The interpreter-invocation line of the safe form: a bare `-` (read the program
# from stdin), then the positional words, then the heredoc redirect.
#
# The leading `"` is load-bearing, not decoration: it anchors the match to the
# END of the quoted interpreter word. Without it the regex matches the ` - ` in
# the guard's own diagnostic ("PF_PY not set - could not resolve ...") and
# swallows the rest of the message as bogus "positional arguments", failing even
# a correctly-written fence. Caught by
# TestDocumentedDefenseIsIntact::test_reference_fence_satisfies_every_check_this_suite_imposes.
POSITIONAL_ARGV_RE = re.compile(r'"\s+-\s+(?P<args>[^\n]*?)\s*<<')
# The payload consumes its values as data.
SYS_ARGV_RE = re.compile(r"sys\.argv\[")


def _looks_like_python(text: str) -> bool:
    """Whether a payload body is Python source (vs. YAML/JSON data on stdin).

    scenario-builder's step-06 fence pipes an agent-assembled YAML document
    through a single-quoted heredoc into ``yaml.safe_load(sys.stdin)``. That
    body is DATA on a data channel, not source text, so sweeping it as a Python
    payload would flag a fence that is already safe by this story's contract.
    """
    return bool(
        re.search(r"^\s*(?:import|from)\s+\w", text, re.MULTILINE)
        or re.search(r"^\s*\w+\s*=\s*\w+\(", text, re.MULTILINE)
    )


class PythonPayload:
    """One Python payload delivered by one fence, with its delivery mechanics."""

    def __init__(self, path: Path, fence: str, text: str, *, quoting: str, kind: str):
        self.path = path
        self.fence = fence
        self.text = text
        # "double" (shell-expanded), "single"/"heredoc-quoted" (inert).
        self.quoting = quoting
        self.kind = kind  # "-c" | "heredoc"

    @property
    def shell_expanded(self) -> bool:
        return self.quoting == "double"

    @property
    def interpolations(self) -> list[str]:
        """Every interpolation token in the payload, shell tokens first.

        Placeholders are matched against the text with shell expansions already
        removed: ``${SESSION_FILE}`` contains ``{SESSION_FILE}``, and reporting
        both would double-count one token and misdescribe its channel.
        """
        shell = SHELL_EXPANSION_RE.findall(self.text)
        remainder = SHELL_EXPANSION_RE.sub("", self.text)
        return shell + TEMPLATE_PLACEHOLDER_RE.findall(remainder)

    @property
    def uses_positional_argv(self) -> bool:
        return bool(SYS_ARGV_RE.search(self.text))

    def __repr__(self) -> str:
        first = next((ln for ln in self.text.splitlines() if ln.strip()), "")
        return f"{_rel(self.path)} [{self.kind}/{self.quoting}]: {first[:70]}"


def _python_payloads() -> list[PythonPayload]:
    """Every Python payload in every pf-executing dist template fence."""
    out: list[PythonPayload] = []
    for path in _template_files():
        for fence in _bash_fences(path.read_text(encoding="utf-8")):
            if not _executes_pf(fence):
                continue
            for m in DASH_C_PAYLOAD_RE.finditer(fence):
                payload = m.group("payload")
                if not _looks_like_python(payload):
                    continue
                out.append(
                    PythonPayload(
                        path,
                        fence,
                        payload,
                        quoting="double" if m.group("q") == '"' else "single",
                        kind="-c",
                    )
                )
            for m in HEREDOC_RE.finditer(fence):
                body = m.group("body")
                if not _looks_like_python(body):
                    continue
                out.append(
                    PythonPayload(
                        path,
                        fence,
                        body,
                        quoting="heredoc-quoted" if m.group("open_q") else "double",
                        kind="heredoc",
                    )
                )
    return out


def _unsafe_payloads() -> list[PythonPayload]:
    """Payloads that splice interpolated data into Python source text."""
    return [p for p in _python_payloads() if p.interpolations]


# ---------------------------------------------------------------------------
# The pinned sites
# ---------------------------------------------------------------------------


class Site:
    def __init__(self, rel: str, callable_name: str, *, vulnerable_at_red: bool, note: str):
        self.rel = rel
        self.callable_name = callable_name
        self.vulnerable_at_red = vulnerable_at_red
        self.note = note

    @property
    def path(self) -> Path:
        return DIST_DIR / self.rel

    def __str__(self) -> str:
        return f"{self.rel}::{self.callable_name}"


# The SM's "nine fences", resolved against the tree as it stands.
PINNED_SITES = (
    # --- sm-finish: three Python fences, all splicing {PLACEHOLDER} tokens ---
    Site(
        "agents/sm-finish.md",
        "get_repo_config",
        vulnerable_at_red=True,
        note="get_repo_config('{REPOS}') inside a double-quoted -c payload",
    ),
    Site(
        "agents/sm-finish.md",
        "write_impact_summary_to_session",
        vulnerable_at_red=True,
        note="Path('.session/{STORY_ID}-session.md') inside a double-quoted -c payload",
    ),
    Site(
        "agents/sm-finish.md",
        "suggest_followups",
        vulnerable_at_red=True,
        note="Path('.session/{STORY_ID}-session.md'), story_id='{STORY_ID}'",
    ),
    # --- the five gate fences, all splicing ${SHELL_VARS} ---
    Site(
        "gates/ac-completion.md",
        "validate_ac_completion",
        vulnerable_at_red=True,
        note="validate_ac_completion('${CONTEXT_FILE}', '${SESSION_FILE}')",
    ),
    Site(
        "gates/spec-check.md",
        "validate_spec_alignment",
        vulnerable_at_red=True,
        note="validate_spec_alignment('${SESSION_FILE}', '${CONTEXT_FILE}')",
    ),
    Site(
        "gates/spec-drift-precheck.md",
        "run_spec_drift_precheck",
        vulnerable_at_red=True,
        note="run_spec_drift_precheck('${SESSION_FILE}', '${CONTEXT_FILE}')",
    ),
    Site(
        "gates/deviations-logged.md",
        "validate_deviations",
        vulnerable_at_red=True,
        note="validate_deviations('${SESSION_FILE}', '${AGENT}')",
    ),
    Site(
        "gates/spec-reconcile-pass.md",
        "validate_spec_reconcile",
        vulnerable_at_red=True,
        note="validate_spec_reconcile('${SESSION_FILE}')",
    ),
    # --- already remediated by 164-6; pinned so the fix cannot be undone ---
    Site(
        "agents/sm-finish.md",
        "pf git format-title",
        vulnerable_at_red=False,
        note="164-6 replaced the format_pr_title Python fence with the CLI",
    ),
    Site(
        "commands/pf-standalone.md",
        "pf git format-title",
        vulnerable_at_red=False,
        note="164-6 replaced the format_pr_title Python fence with the CLI",
    ),
    Site(
        "workflows/git-cleanup/steps/step-03-execute.md",
        "pf git format-title",
        vulnerable_at_red=False,
        note="164-6 replaced the format_pr_title Python fence with the CLI",
    ),
)

VULNERABLE_SITES = tuple(s for s in PINNED_SITES if s.vulnerable_at_red)


def _payloads_for(site: Site) -> list[PythonPayload]:
    return [p for p in _python_payloads() if p.path == site.path and site.callable_name in p.text]


# ---------------------------------------------------------------------------
# Sweep integrity — without these, every assertion below can go vacuously green
# ---------------------------------------------------------------------------


class TestSweepIntegrity:
    def test_sweep_finds_python_payloads(self):
        payloads = _python_payloads()
        assert len(payloads) >= 8, (
            f"payload extraction found only {len(payloads)} Python payloads in "
            "the dist templates — the scanner is broken, so every CWE-78 "
            "assertion in this file is vacuous"
        )

    @pytest.mark.parametrize("site", VULNERABLE_SITES, ids=str)
    def test_sweep_locates_every_pinned_payload(self, site: Site):
        """Each pinned site's payload is actually extracted.

        A regex tweak that stops matching (say) the multi-line double-quoted
        ``-c`` form would silently drop these fences from the policy while
        leaving the suite green.
        """
        assert site.path.is_file(), f"{site.rel} does not exist — pinned site moved"
        assert _payloads_for(site), (
            f"no Python payload extracted from {site} — extraction is broken and "
            f"the CWE-78 checks for this fence are vacuous (expected: {site.note})"
        )


# ---------------------------------------------------------------------------
# AC1: no agent-assembled data reaches a Python source string
# ---------------------------------------------------------------------------


class TestNoInterpolationIntoPythonSource:
    def test_no_template_interpolates_data_into_python_source(self):
        """POLICY SWEEP: zero payloads contain an interpolation token.

        Fails at RED with the eight live offenders. A new template with the
        vulnerable shape fails here too, with no edit to this file.
        """
        offenders = _unsafe_payloads()
        assert offenders == [], (
            "template fences splice interpolated data into Python source "
            f"({len(offenders)} sites). Every value must ride as a positional "
            "argv word and be read via sys.argv[N], with the payload in a "
            "single-quoted <<'PYEOF' heredoc (see agents/sm-setup.md Step 5):\n"
            + "\n".join(f"  {p!r}  tokens={p.interpolations}" for p in offenders)
        )

    def test_no_python_payload_is_shell_expanded(self):
        """No payload is delivered by a shell-EXPANDED quoting form.

        Independent of the check above: a payload with no token today is still
        one edit away from injection while its delivery mechanism expands the
        shell. Only ``-c '...'`` or ``<<'PYEOF'`` are inert.
        """
        offenders = [p for p in _python_payloads() if p.shell_expanded]
        assert offenders == [], (
            "Python payloads delivered in a shell-expanded form (double-quoted "
            "-c, or an unquoted heredoc) — the shell performs command "
            "substitution on the payload before python parses it (CWE-78). Use "
            "a single-quoted <<'PYEOF' heredoc:\n" + "\n".join(f"  {p!r}" for p in offenders)
        )

    @pytest.mark.parametrize("site", VULNERABLE_SITES, ids=str)
    def test_pinned_site_uses_positional_argv_form(self, site: Site):
        """Per-site pin: each of the eight uses the sm-setup form exactly.

        Named individually so a partial fix cannot hide behind an aggregate
        count, and so the failure output points Dev at one file.
        """
        payloads = _payloads_for(site)
        assert payloads, f"no payload found for {site} — see TestSweepIntegrity"
        for payload in payloads:
            assert not payload.shell_expanded, (
                f"{site}: payload is delivered by a shell-expanded form "
                f"({payload.kind}/{payload.quoting}); required: "
                f"single-quoted <<'PYEOF' heredoc. Current: {site.note}"
            )
            assert payload.interpolations == [], (
                f"{site}: payload interpolates {payload.interpolations} into "
                f"Python source. Pass them positionally instead. Current: {site.note}"
            )
            assert payload.uses_positional_argv, (
                f"{site}: payload does not read any value from sys.argv, so its "
                "inputs are still source text rather than data. Required form:\n"
                '  "${PF_PY:?...}" - "$SESSION_FILE" <<\'PYEOF\'\n'
                "  import sys\n"
                "  ... (sys.argv[1])\n"
                "  PYEOF"
            )

    @pytest.mark.parametrize("site", VULNERABLE_SITES, ids=str)
    def test_pinned_site_passes_values_as_quoted_positional_words(self, site: Site):
        """The values must actually appear as double-quoted argv words.

        Without this a fence could satisfy the payload checks by hard-coding a
        path (dropping the parameter) or by passing an UNQUOTED word, which the
        shell re-splits on whitespace and glob-expands — a fresh bug.
        """
        payloads = _payloads_for(site)
        assert payloads, f"no payload found for {site} — see TestSweepIntegrity"
        for payload in payloads:
            match = POSITIONAL_ARGV_RE.search(payload.fence)
            assert match, (
                f"{site}: interpreter line passes no positional argument. "
                "Required: '\"${PF_PY:?...}\" - \"$VALUE\" <<'PYEOF''"
            )
            args = match.group("args").split()
            unquoted = [a for a in args if not (a.startswith('"') and a.endswith('"'))]
            assert unquoted == [], (
                f"{site}: positional arguments {unquoted} are not double-quoted "
                "— the shell word-splits and glob-expands them"
            )


# ---------------------------------------------------------------------------
# NEGATIVE GUARD: the sweep must not be satisfiable by deleting the fences
# ---------------------------------------------------------------------------


class TestFencesStillExist:
    """Every check above passes trivially on an empty file. These do not."""

    @pytest.mark.parametrize("site", PINNED_SITES, ids=str)
    def test_site_file_still_exists(self, site: Site):
        assert site.path.is_file(), (
            f"{site.rel} was deleted — the CWE-78 fix must preserve the fence, "
            "not remove the functionality"
        )

    @pytest.mark.parametrize("site", PINNED_SITES, ids=str)
    def test_site_still_performs_its_function(self, site: Site):
        """The file still names the callable/CLI its fence exists to invoke."""
        text = site.path.read_text(encoding="utf-8")
        assert site.callable_name in text, (
            f"{site.rel} no longer references {site.callable_name!r} — the "
            f"CWE-78 fix removed the fence's behavior instead of securing it "
            f"({site.note})"
        )

    @pytest.mark.parametrize("site", VULNERABLE_SITES, ids=str)
    def test_vulnerable_site_still_executes_python(self, site: Site):
        """Each fixed fence still runs pf Python through the PF_PY guard.

        Deleting the fence, or downgrading it to prose, would satisfy the
        interpolation sweep while breaking the template.
        """
        text = site.path.read_text(encoding="utf-8")
        fences = [f for f in _bash_fences(text) if _executes_pf(f)]
        assert fences, f"{site.rel} has no pf-executing bash fence left at all"
        owning = [f for f in fences if site.callable_name in f]
        assert owning, (
            f"{site.rel}: no pf-executing fence invokes {site.callable_name!r} "
            "any more — behavior was dropped rather than secured"
        )
        for fence in owning:
            assert "${PF_PY:?" in fence, (
                f"{site.rel}: the {site.callable_name} fence lost its fail-loud "
                "PF_PY guard (162-8 regression)"
            )

    @pytest.mark.parametrize("site", VULNERABLE_SITES, ids=str)
    def test_vulnerable_site_still_declares_its_inputs(self, site: Site):
        """The values the fence used to interpolate are still referenced.

        Hard-coding a path would satisfy every interpolation check while
        breaking composability (the gates are explicitly parameterized).
        """
        text = site.path.read_text(encoding="utf-8")
        tokens = set(TEMPLATE_PLACEHOLDER_RE.findall(site.note)) | {
            m.strip("${}") for m in SHELL_EXPANSION_RE.findall(site.note)
        }
        tokens = {t.strip("{}") for t in tokens if t.strip("${}")}
        assert tokens, f"{site} note declares no input tokens — fix the pin"
        missing = [t for t in tokens if t not in text]
        assert missing == [], (
            f"{site.rel}: inputs {missing} are no longer referenced anywhere in "
            "the file — the fence was hard-coded instead of parameterized "
            f"({site.note})"
        )


# ---------------------------------------------------------------------------
# REPRODUCTION: the vulnerable form breaks and injects; the safe form does not
# ---------------------------------------------------------------------------

# The value the fence is supposed to treat as opaque data.
HOSTILE_VALUES = {
    "apostrophe": "Keith's fix",
    "double_quote": 'a "quoted" path',
    "command_substitution": "$(printf pwned > PWNED_MARKER)",
    "backtick_substitution": "`printf pwned > PWNED_MARKER`",
    "python_injection": "x'); import pathlib; pathlib.Path('PWNED_MARKER').write_text('pwned'); ('",
    "newline": "line1\nline2",
    "shell_var": "${HOME}",
}

# The two fence shapes, reduced to their essentials. Both call the same helper
# and print what it received, so a run either reports the value verbatim (safe)
# or misbehaves (vulnerable).
#
# The substitution placeholder is a sentinel, not a str.format field: these
# templates deliberately contain ``${VALUE}`` and ``{`` characters, which
# str.format would either reject or mangle.
VALUE_SLOT = "__VALUE_WORD__"

# SHAPE A — the five gate fences: a runtime shell variable expanded inside a
# double-quoted -c payload. ``record('${VALUE}')``.
#
# Note what this shape does and does NOT do: bash performs no RE-expansion on
# the result of a parameter expansion, so a ``$(...)`` inside the variable's
# VALUE is not command-substituted here. The live vector is channel 2 — the
# value lands inside a Python string literal, so an apostrophe breaks the fence
# and a crafted value executes as Python. Command substitution belongs to shape
# B below. Both shapes are reproduced because a fix that only addresses one of
# them leaves eight fences half-patched.
VULNERABLE_SHELLVAR_FENCE = """set -u
VALUE=__VALUE_WORD__
"$PYBIN" -c "
import sys
sys.path.insert(0, '.')
from stub_target import record
record('${VALUE}')
"
"""

# SHAPE B — the three sm-finish fences: a ``{PLACEHOLDER}`` token the AGENT
# substitutes while writing the command, so the hostile value becomes literal
# SCRIPT TEXT before bash parses it. Both channels are open: the shell
# command-substitutes ``$(...)``/backticks in the value, and whatever survives
# is spliced into the Python literal. _run_fence substitutes the RAW value here
# (no shell quoting) because that is exactly what an agent expanding
# ``record('{STORY_ID}')`` produces.
VULNERABLE_PLACEHOLDER_FENCE = """set -u
"$PYBIN" -c "
import sys
sys.path.insert(0, '.')
from stub_target import record
record('__VALUE_WORD__')
"
"""

SAFE_FENCE = """set -u
VALUE=__VALUE_WORD__
"$PYBIN" - "$VALUE" <<'PYEOF'
import sys
sys.path.insert(0, '.')
from stub_target import record
record(sys.argv[1])
PYEOF
"""

STUB_TARGET = """def record(value):
    with open("RECEIVED", "w") as fh:
        fh.write(value)
    print("ok")
"""


def _shell_single_quote(value: str) -> str:
    """POSIX single-quote a value — how a real caller assigns it to VALUE."""
    return "'" + value.replace("'", "'\\''") + "'"


def _run_fence(fence_template: str, value: str, tmp_path: Path, *, raw: bool = False):
    """Execute one fence shape with one hostile value, hermetically.

    No gh, no jira, no network: the payload imports a local stub module whose
    only job is to report the value it was handed.

    ``raw=True`` splices the value in unquoted, modelling an AGENT expanding a
    ``{PLACEHOLDER}`` token into the script text. Otherwise the value is POSIX
    single-quoted, modelling a shell variable set from a real runtime source.
    """
    (tmp_path / "stub_target.py").write_text(STUB_TARGET, encoding="utf-8")
    script = fence_template.replace(VALUE_SLOT, value if raw else _shell_single_quote(value))
    result = subprocess.run(
        ["bash", "-c", script],
        capture_output=True,
        text=True,
        cwd=tmp_path,
        env={"PATH": "/usr/bin:/bin", "PYBIN": sys.executable, "HOME": str(tmp_path)},
        stdin=subprocess.DEVNULL,
        timeout=30,
        check=False,
    )
    received_path = tmp_path / "RECEIVED"
    received = received_path.read_text(encoding="utf-8") if received_path.is_file() else None
    return result, received, (tmp_path / "PWNED_MARKER").is_file()


class TestVulnerableFormIsExploitable:
    """RED-state reproduction: the shape in the eight fences today is broken.

    These tests PASS at RED (they characterize the bug) and must keep passing
    after the fix — they pin the vulnerable shape's badness, which is why the
    fix has to be a different shape rather than more escaping.
    """

    def test_apostrophe_breaks_the_shellvar_form(self, tmp_path):
        """The exact production symptom: an apostrophe kills the gate fence."""
        result, received, _ = _run_fence(
            VULNERABLE_SHELLVAR_FENCE, HOSTILE_VALUES["apostrophe"], tmp_path
        )
        assert result.returncode != 0, (
            "expected the double-quoted-interpolation fence to die on an "
            f"apostrophe; it exited 0 with received={received!r}"
        )
        assert "SyntaxError" in result.stderr or "unterminated" in result.stderr.lower(), (
            f"expected a Python syntax error from the broken literal, got: {result.stderr[:400]!r}"
        )
        assert received is None, "the target should never have been reached"

    def test_crafted_value_injects_python_under_the_shellvar_form(self, tmp_path):
        """Channel 2: the value escapes the literal and runs as Python.

        This is the whole gate-fence exposure: SESSION_FILE/CONTEXT_FILE/AGENT
        are agent-supplied gate arguments, so a crafted one runs arbitrary
        Python under the pf interpreter.
        """
        _, _, pwned = _run_fence(
            VULNERABLE_SHELLVAR_FENCE, HOSTILE_VALUES["python_injection"], tmp_path
        )
        assert pwned, (
            "expected the crafted value to close the Python string literal and "
            "execute injected statements (PWNED_MARKER written)"
        )

    def test_newline_corrupts_the_shellvar_form(self, tmp_path):
        """A newline splits the payload into two statements."""
        result, received, _ = _run_fence(
            VULNERABLE_SHELLVAR_FENCE, HOSTILE_VALUES["newline"], tmp_path
        )
        assert received != HOSTILE_VALUES["newline"], (
            "a newline in the value must not survive the vulnerable form "
            f"intact; got received={received!r} rc={result.returncode}"
        )

    def test_command_substitution_executes_under_the_placeholder_form(self, tmp_path):
        """CWE-78 proper: the shell runs the agent-substituted value.

        Bash does not re-expand a parameter expansion's result, so this vector
        needs the ``{PLACEHOLDER}`` channel — where the value is script TEXT
        before bash ever parses the line. That is precisely sm-finish's shape.
        """
        result, _, pwned = _run_fence(
            VULNERABLE_PLACEHOLDER_FENCE,
            HOSTILE_VALUES["command_substitution"],
            tmp_path,
            raw=True,
        )
        assert pwned, (
            "expected $(...) in an agent-substituted placeholder to be "
            f"command-substituted by the shell (PWNED_MARKER written); "
            f"rc={result.returncode} stderr={result.stderr[:300]!r}"
        )

    def test_backticks_execute_under_the_placeholder_form(self, tmp_path):
        """Backticks are the same door — a fix must close both spellings."""
        _, _, pwned = _run_fence(
            VULNERABLE_PLACEHOLDER_FENCE,
            HOSTILE_VALUES["backtick_substitution"],
            tmp_path,
            raw=True,
        )
        assert pwned, "expected backtick substitution to fire in the agent-substituted placeholder"

    def test_crafted_value_injects_python_under_the_placeholder_form(self, tmp_path):
        """The placeholder channel opens the Python vector too."""
        _, _, pwned = _run_fence(
            VULNERABLE_PLACEHOLDER_FENCE,
            HOSTILE_VALUES["python_injection"],
            tmp_path,
            raw=True,
        )
        assert pwned, "expected placeholder substitution to permit Python injection"


class TestSafeFormIsInert:
    """The sm-setup form treats every hostile value as opaque data."""

    @pytest.mark.parametrize("name,value", sorted(HOSTILE_VALUES.items()))
    def test_positional_argv_form_passes_value_through_verbatim(self, name, value, tmp_path):
        result, received, pwned = _run_fence(SAFE_FENCE, value, tmp_path)
        assert not pwned, (
            f"[{name}] the positional-argv form executed injected code — PWNED_MARKER exists"
        )
        assert result.returncode == 0, (
            f"[{name}] positional-argv fence failed (rc={result.returncode}): "
            f"{result.stderr[:400]!r}"
        )
        assert received == value, (
            f"[{name}] value did not arrive verbatim: expected {value!r}, got {received!r}"
        )

    def test_safe_form_payload_has_no_interpolation_token(self):
        """The reference shape satisfies this file's own policy checks.

        Otherwise the tests could demand a shape the scanner would still flag.
        """
        payload = SAFE_FENCE.split("<<'PYEOF'\n", 1)[1].split("PYEOF", 1)[0]
        assert SHELL_EXPANSION_RE.findall(payload) == []
        assert TEMPLATE_PLACEHOLDER_RE.findall(payload) == []
        assert SYS_ARGV_RE.search(payload)


class TestDocumentedDefenseIsIntact:
    """sm-setup.md is the reference Dev copies — it must stay correct."""

    def test_sm_setup_reference_fence_uses_the_safe_form(self):
        text = (DIST_DIR / "agents" / "sm-setup.md").read_text(encoding="utf-8")
        assert "<<'PYEOF'" in text, (
            "agents/sm-setup.md lost its single-quoted heredoc — the reference "
            "implementation for this story's fix is gone"
        )
        assert "sys.argv[1]" in text, "agents/sm-setup.md no longer reads values from sys.argv"
        payloads = [
            p
            for p in _python_payloads()
            if p.path == DIST_DIR / "agents" / "sm-setup.md" and "get_repo_config" in p.text
        ]
        assert payloads, "sm-setup's reference payload is not extracted by the scanner"
        for payload in payloads:
            assert not payload.shell_expanded
            assert payload.interpolations == []
            assert payload.uses_positional_argv

    def test_reference_fence_satisfies_every_check_this_suite_imposes(self):
        """REACHABILITY: the checks Dev must satisfy are satisfiable.

        Runs the two per-site assertions against sm-setup's already-correct
        fence. If the argv regex or the quoting rule were mis-specified, the
        eight pinned sites would be unfixable and this test — not the RED
        failures — is what says so.
        """
        payloads = [
            p
            for p in _python_payloads()
            if p.path == DIST_DIR / "agents" / "sm-setup.md" and "get_repo_config" in p.text
        ]
        assert payloads, "sm-setup's reference payload is not extracted by the scanner"
        for payload in payloads:
            match = POSITIONAL_ARGV_RE.search(payload.fence)
            assert match, (
                "the reference fence in agents/sm-setup.md does not match "
                "POSITIONAL_ARGV_RE — the regex is wrong, so no site can be fixed"
            )
            args = match.group("args").split()
            assert args, "reference fence matched but yielded no positional words"
            unquoted = [a for a in args if not (a.startswith('"') and a.endswith('"'))]
            assert unquoted == [], (
                f"the reference fence's own positional words {unquoted} fail the "
                "quoting rule this suite imposes — the rule is wrong"
            )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
