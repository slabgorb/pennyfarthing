"""Tests for 162-8: EVERY dist template that executes pf.* code must route it
through the fail-loud ``${PF_PY:?...}`` guard — not a project ``.venv`` python,
not a bare ``python``/``python3``.

155-11 (gh #112) fixed exactly one template (``agents/sm-finish.md``) with a
per-file pinned test suite. The sibling templates were never swept, so the
ModuleNotFoundError-thrash bug is still live in ``agents/sm-setup.md``,
``agents/testing-runner.md``, ``commands/pf-standalone.md`` and others, and a
new template can reintroduce it tomorrow with no test failing.

This suite is therefore a POLICY sweep, not a set of per-file pins: it
discovers every template under TEMPLATE_ROOTS, extracts every site that
executes pf.* code, and asserts the guard invariants over all of them. A future
template that bypasses the guard fails CI without anyone editing this file.

Two guard weaknesses 155-11 left open, which this suite closes:

- ``PF_PY="$(sed -n '1s/^#!//p' "$(command -v pf)")"`` leaves PF_PY EMPTY when
  pf is not on PATH (sed gets an empty filename argument). The use sites then
  expand ``"$PF_PY" -m pf.foo`` to ``"" -m pf.foo`` — a confusing
  "command not found" instead of a diagnosis. The fail-loud parameter
  expansion ``"${PF_PY:?msg}"`` aborts the fence with the message instead.
- ``python3 - <<'PYEOF'`` (heredoc on stdin) executes pf code just as surely as
  ``-m``/``-c``, but 155-11's bare-python regex only matched ``-m``/``-c``.
  ``agents/sm-setup.md`` uses precisely that form.

ACs (session file 162-8):

- AC1: sm-setup, testing-runner, pf-standalone and every other offender use the
  uniform ``${PF_PY:?}`` guard for every pf.* invocation — no
  ``.venv/bin/activate``, no ``.venv/bin/python``, no bare ``python``.
  Covered by TestNoUnguardedPfExecution + TestFailLoudGuardShape.
- AC2: the policy test covers all dist templates, so new offenders fail CI.
  Covered by the discovery sweep (TEMPLATE_ROOTS, no per-file allowlist) and
  guarded by TestPolicySweepIntegrity, which fails if the sweep silently stops
  finding templates.
- AC3: suite stays exit 0 apart from the known 162-5 xfails. No test here is
  xfail/skip-by-default.

KNOWN LIMITATION — the script-path blind spot (162-38): a fence that hands a
``.py`` script to the interpreter (``python3 .pennyfarthing/scripts/foo.py``) is
NOT detected as pf-executing, even when that script imports pf. ``_executes_pf``
only sees INLINE pf payloads (``-m pf.x``, or ``from pf.x`` in the fence text),
and a script carries its imports in another file. Closing the blind spot needs
cross-file resolution (resolve the path, possibly through ``.pennyfarthing/``
symlinks, then parse the script's imports), so it stays a documented limitation
rather than a silent gap. It is pinned executably in
``test_162_38_pf_py_policy_hardening.py``
(``TestScriptPathBlindSpotIsDocumented``), which also asserts no template in the
tree currently uses the shape, keeping the gap latent.

SCOPE DECISION (logged as a Design Deviation in the session file):
TEMPLATE_ROOTS covers agent/command/skill/workflow-step/template markdown plus
markdown under scripts/, i.e. files whose bash fences are executed by an agent
or copy-pasted by an operator. ``guides/`` is excluded: its pf.* fences are
pennyfarthing-repo dev-setup instructions that intentionally use this repo's own
``.venv`` (guides/tui.md running the TUI from source), which is a different
contract from a template invoking an installed pf. Logged as a non-blocking
Delivery Finding instead of being force-fixed here.

Story: 162-8 (epic 162), follow-up to 155-11 / gh #112
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

from pf.tests.test_155_11_sm_finish_pf_py import (
    _derive_pf_py,
    _make_fake_env,
    _pf_capable_interpreter,
)

# ---------------------------------------------------------------------------
# Discovery
# ---------------------------------------------------------------------------

# src/pf/tests -> src/pf -> src -> pennyfarthing-dist
DIST_DIR = Path(__file__).resolve().parents[3]

# Roots whose markdown is executed by an agent (or copy-pasted by an operator).
TEMPLATE_ROOTS = (
    "agents",
    "commands",
    "gates",
    "skills",
    "workflows",
    "templates",
    "scripts",
)

# Templates known to execute pf.* code. If the sweep stops seeing these, the
# discovery logic broke (or the files moved) and every other assertion in this
# file went vacuously green — TestPolicySweepIntegrity catches that.
SENTINEL_TEMPLATES = (
    "agents/sm-finish.md",
    "agents/sm-setup.md",
    "agents/testing-runner.md",
    # commands/pf-standalone.md removed in 164-6: its only pf-executing fence
    # (the PR title ${PF_PY} -c block) was replaced with `pf git format-title`.
    # The file no longer invokes the Python interpreter directly.
    # 162-38: a gates/ sentinel too. With agents/ as the only represented root,
    # dropping "gates" from TEMPLATE_ROOTS (or a discovery regex that stops
    # matching the gate fence shape) silently removes five pf-executing gate
    # templates from the policy with every test still green — the unswept-root
    # failure mode this suite exists to prevent.
    "gates/ac-completion.md",
)

# 162-38: fence delimiters are matched line-by-line so an UNTAGGED ``` fence can
# be paired correctly. A regex over the whole text cannot: once the empty info
# string is allowed, the closing delimiter of a ```yaml block looks like the
# opening of an untagged one and the pairing slides by one fence.
FENCE_DELIM_RE = re.compile(r"^[ \t]*```(?P<info>[^\s`]*)[ \t]*$")
# Info strings whose fence body is shell an agent executes. "" (untagged) counts:
# an agent runs an untagged fence exactly like a ```bash one, and dropping the
# tag is the most common markdown slip. ```yaml / ```json / ```python remain
# data/sample blocks and are NOT swept.
SHELL_INFO_STRINGS = frozenset({"", "bash", "sh", "shell"})
ANY_FENCE_RE = re.compile(r"```.*?```", re.DOTALL)
INLINE_SPAN_RE = re.compile(r"`([^`\n]+)`")

PF_PY_ASSIGN_RE = re.compile(r"^\s*(?:export\s+)?PF_PY=.+$", re.MULTILINE)

# A python interpreter invoked to execute code: -m MODULE, -c PAYLOAD, a bare
# `-` (heredoc/stdin script, as in `python3 - "$ARG" <<'PYEOF'`), or a dash-less
# heredoc (`python3 <<'PYEOF'`, which bash runs identically — 162-38).
# The interpreter name may carry a version suffix (`python3.12`), which is as
# unpinned as `python3` and need not have pf installed (162-38).
# Excluded by the lookbehind: `"$PF_PY"`, `${PF_PY:?..}`, `.venv/bin/python`
# are matched by their own dedicated rules below, not by this one.
_EXEC_FORM = r"(?:-[mc]\b|-(?=\s)|<<)"
BARE_PYTHON_EXEC_RE = re.compile(rf'(?<![\w/"$}}-])python3?(?:\.\d+)?\s+{_EXEC_FORM}')
# Any python-ish interpreter reference running code, whatever the prefix.
ANY_PYTHON_EXEC_RE = re.compile(rf'python3?(?:\.\d+)?["\']?\s+{_EXEC_FORM}')
VENV_PYTHON_RE = re.compile(r"\.venv/bin/python3?\b")
VENV_ACTIVATE_RE = re.compile(r"(?:source|\.)\s+\S*\.venv/bin/activate")

# A line that executes pf code: `-m pf.<module>`, or an interpreter invocation
# inside a fence that carries an inline `from pf.` / `import pf.` payload.
PF_MODULE_RUN_RE = re.compile(r"-m pf\.")

# Any expansion of PF_PY (as opposed to an assignment to it).
PF_PY_EXPANSION_RE = re.compile(r"\$\{?PF_PY\b[^}]*\}?")
# The one accepted shape: fail-loud, with a non-empty diagnostic message.
FAIL_LOUD_RE = re.compile(r"\$\{PF_PY:\?[^}]+\}")


def _template_files() -> list[Path]:
    files: list[Path] = []
    for root in TEMPLATE_ROOTS:
        d = DIST_DIR / root
        if d.is_dir():
            files.extend(sorted(d.rglob("*.md")))
    return files


def _bash_fences(text: str) -> list[str]:
    """Bodies of every shell fence (```bash/sh/shell, or untagged) in ``text``.

    Line-based pairing, not a single regex: an untagged fence is a legitimate
    execution site (162-38), and the moment the empty info string is accepted a
    whole-text regex mistakes the CLOSING delimiter of a ```yaml block for the
    opening of an untagged one, shifting every subsequent pairing by one fence
    and dropping real bash fences out of the sweep.
    """
    fences: list[str] = []
    info: str | None = None
    body: list[str] = []
    for line in text.splitlines(keepends=True):
        delimiter = FENCE_DELIM_RE.match(line)
        if info is None:
            if delimiter:
                info = delimiter.group("info").lower()
                body = []
            continue
        if delimiter:
            if info in SHELL_INFO_STRINGS:
                fences.append("".join(body))
            info = None
            continue
        body.append(line)
    return fences


def _executes_pf(fence: str) -> bool:
    """True if this bash fence runs pf.* Python code.

    Either a module run (``-m pf.x``), or an interpreter invocation whose
    payload imports pf (``-c "from pf.x import y"``, or a ``python3 -`` heredoc
    containing ``from pf.x``).

    The interpreter reference counts whether it is spelled as a literal
    ``python``/``python3`` or as a PF_PY expansion. Both are required: once a
    fence is rewritten to ``"${PF_PY:?..}" -c "from pf.x import y"`` the word
    "python" is gone from it, so a literal-only check would stop recognising
    exactly the fences this policy governs — the guard-shape and
    local-derivation assertions would go dark on them.
    """
    if PF_MODULE_RUN_RE.search(fence):
        return True
    if not (ANY_PYTHON_EXEC_RE.search(fence) or PF_PY_EXPANSION_RE.search(fence)):
        return False
    # \b (not \s) on purpose: the payload is usually quote-adjacent, as in
    # `python3 -c "from pf.jira.client import ..."`.
    return bool(re.search(r"\b(?:from|import)\s+pf[\s.]", fence))


def _pf_exec_fences() -> list[tuple[Path, str]]:
    """(path, fence) for every bash fence in every template that runs pf code."""
    out: list[tuple[Path, str]] = []
    for path in _template_files():
        for fence in _bash_fences(path.read_text(encoding="utf-8")):
            if _executes_pf(fence):
                out.append((path, fence))
    return out


def _pf_exec_lines() -> list[tuple[Path, str]]:
    """(path, line) for every line inside a pf-executing fence that is itself
    the interpreter invocation.

    Three ways to be an invocation line, because none of them subsumes the
    others once the guard is applied:

    - a module run (``-m pf.x``);
    - a literal interpreter name plus code flags (``python3 -c``, ``python3 -``);
    - any PF_PY expansion. Required: once a line is rewritten to
      ``"${PF_PY:?..}" -c`` or ``"${PF_PY:?..}" - <<'PYEOF'`` the word "python"
      is gone from it, so the two rules above stop matching and the guard checks
      would silently stop inspecting the very lines this story fixes.

    Assignment lines are excluded — they define PF_PY rather than expanding it,
    and they have their own behavioral tests.
    """
    out: list[tuple[Path, str]] = []
    for path, fence in _pf_exec_fences():
        for line in fence.splitlines():
            if PF_PY_ASSIGN_RE.match(line):
                continue
            if (
                PF_MODULE_RUN_RE.search(line)
                or ANY_PYTHON_EXEC_RE.search(line)
                or PF_PY_EXPANSION_RE.search(line)
            ):
                out.append((path, line.strip()))
    return out


def _rel(path: Path) -> str:
    return str(path.relative_to(DIST_DIR))


def _fmt(items: list[tuple[Path, str]]) -> str:
    return "\n".join(f"  {_rel(p)}: {s[:100]}" for p, s in items)


def _fail_loud_guards() -> list[tuple[Path, str]]:
    """(path, guard-token) for every fail-loud PF_PY expansion at a pf-exec site.

    Every test that inspects guard tokens asserts this is non-empty first —
    otherwise those tests pass vacuously while the templates are unguarded.
    """
    return [
        (path, expansion)
        for path, line in _pf_exec_lines()
        for expansion in FAIL_LOUD_RE.findall(line)
    ]


def _all_pf_py_assignments() -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    seen: set[tuple[str, str]] = set()
    for path in _template_files():
        for line in PF_PY_ASSIGN_RE.findall(path.read_text(encoding="utf-8")):
            key = (_rel(path), line.strip())
            if key not in seen:
                seen.add(key)
                out.append((path, line.strip()))
    return out


# ---------------------------------------------------------------------------
# Sweep integrity — these guard against every other test going vacuous
# ---------------------------------------------------------------------------


class TestPolicySweepIntegrity:
    def test_sweep_finds_template_files(self):
        """Discovery actually walks the dist tree."""
        files = _template_files()
        assert len(files) > 20, (
            f"template discovery found only {len(files)} markdown files under "
            f"{TEMPLATE_ROOTS} — the sweep is broken, so every policy "
            "assertion below is vacuous"
        )

    def test_sweep_finds_known_pf_executing_templates(self):
        """Every sentinel template is recognised as executing pf code.

        Without this, a regex tweak that stops matching (say) the ``python3 -``
        heredoc form would make the policy silently pass.
        """
        found = {_rel(p) for p, _ in _pf_exec_fences()}
        missing = [s for s in SENTINEL_TEMPLATES if s not in found]
        assert missing == [], (
            "pf-execution detection missed templates known to run pf.* code "
            f"{missing}; detected set was {sorted(found)}"
        )

    def test_sweep_finds_pf_exec_lines(self):
        """At least one concrete invocation line is extracted per sentinel."""
        by_file: dict[str, int] = {}
        for path, _ in _pf_exec_lines():
            by_file[_rel(path)] = by_file.get(_rel(path), 0) + 1
        for sentinel in SENTINEL_TEMPLATES:
            assert by_file.get(sentinel, 0) > 0, (
                f"no pf.* invocation lines extracted from {sentinel} — line-level "
                "extraction is broken and the guard checks are vacuous"
            )


# ---------------------------------------------------------------------------
# AC1: nothing executes pf code outside the guard
# ---------------------------------------------------------------------------


class TestNoUnguardedPfExecution:
    def test_no_project_venv_activation(self):
        """No pf-executing fence sources a project .venv (gh #112 root cause).

        Offenders at RED: commands/pf-standalone.md,
        workflows/git-cleanup/steps/step-03-execute.md.
        """
        offenders = [
            (p, line.strip())
            for p, fence in _pf_exec_fences()
            for line in fence.splitlines()
            if VENV_ACTIVATE_RE.search(line)
        ]
        assert offenders == [], (
            "templates activate a project .venv before running pf.* code; on a "
            "uv-tool install that venv has no pf and every call dies with "
            "ModuleNotFoundError (gh #112). Use the PF_PY guard:\n" + _fmt(offenders)
        )

    def test_no_venv_python_runs_pf_code(self):
        """pf code is never run by an explicit .venv python either.

        Rewriting `source .venv/bin/activate && python` to
        `.venv/bin/python` would satisfy the activation check while keeping the
        bug, so pin the direct form too.
        """
        offenders = [
            (p, line.strip())
            for p, fence in _pf_exec_fences()
            for line in fence.splitlines()
            if VENV_PYTHON_RE.search(line)
        ]
        assert offenders == [], (
            "templates run pf.* code with a project .venv interpreter, which "
            "need not contain pf:\n" + _fmt(offenders)
        )

    def test_no_bare_python_runs_pf_code(self):
        """No bare python/python3 executes pf code — including heredoc form.

        Offenders at RED: agents/sm-setup.md (both `python3 -c` and
        `python3 - <<PYEOF`), agents/testing-runner.md (`python -m
        pf.session.test_cache`), commands/pf-standalone.md.
        """
        offenders = [(p, line) for p, line in _pf_exec_lines() if BARE_PYTHON_EXEC_RE.search(line)]
        assert offenders == [], (
            "templates execute pf.* code with a bare python interpreter, which "
            "resolves to whatever is first on PATH (often the project .venv) "
            "rather than the pf launcher's interpreter:\n" + _fmt(offenders)
        )

    def test_every_pf_exec_line_references_pf_py(self):
        """Every extracted invocation line routes through PF_PY."""
        offenders = [(p, line) for p, line in _pf_exec_lines() if "PF_PY" not in line]
        assert offenders == [], "pf.* invocation lines that do not go through PF_PY:\n" + _fmt(
            offenders
        )

    def test_pf_exec_fences_derive_pf_py_locally(self):
        """Each pf-executing fence derives PF_PY in that same fence.

        Subagents run fences independently, so a derivation in an earlier fence
        does not carry over (155-11 AC3, applied tree-wide).
        """
        offenders = [
            (p, fence.strip().splitlines()[0])
            for p, fence in _pf_exec_fences()
            if not PF_PY_ASSIGN_RE.search(fence)
        ]
        assert offenders == [], (
            "pf-executing fences with no local PF_PY derivation — not "
            "self-contained, so a subagent running the fence alone gets an "
            "unset PF_PY:\n" + _fmt(offenders)
        )


# ---------------------------------------------------------------------------
# AC1: the guard is the FAIL-LOUD shape, uniformly
# ---------------------------------------------------------------------------


class TestFailLoudGuardShape:
    def test_pf_py_expansions_are_fail_loud(self):
        """Every PF_PY expansion at a pf-exec site uses ${PF_PY:?message}.

        Plain "$PF_PY" degrades to an empty argv[0] when derivation failed
        (pf not on PATH), producing "command not found" instead of a diagnosis.
        Offenders at RED include agents/sm-finish.md, which 155-11 left on the
        plain form.
        """
        offenders: list[tuple[Path, str]] = []
        for path, line in _pf_exec_lines():
            for expansion in PF_PY_EXPANSION_RE.findall(line):
                if not FAIL_LOUD_RE.fullmatch(expansion):
                    offenders.append((path, f"{expansion}   in: {line}"))
        assert offenders == [], (
            "PF_PY expansions that are not fail-loud. Required shape:\n"
            '  "${PF_PY:?PF_PY not set - could not resolve the pf launcher '
            'interpreter}"\n'
            "Offenders:\n" + _fmt(offenders)
        )

    def test_fail_loud_message_is_diagnostic(self):
        """The guard message names PF_PY and says something actionable.

        An empty or one-word message ("${PF_PY:?x}") satisfies the shape check
        while telling the operator nothing.
        """
        guards = _fail_loud_guards()
        assert guards, (
            "no fail-loud ${PF_PY:?...} guards found in any template — the "
            "162-8 guard has not been applied"
        )
        weak: list[tuple[Path, str]] = []
        for path, expansion in guards:
            message = expansion.split(":?", 1)[1].rstrip("}")
            if len(message.split()) < 4 or "PF_PY" not in message:
                weak.append((path, expansion))
        assert weak == [], (
            "fail-loud guards with non-diagnostic messages — the message must "
            "name PF_PY and explain the failure (at least a few words):\n" + _fmt(weak)
        )

    def test_fail_loud_guard_aborts_when_pf_py_unset(self):
        """BEHAVIORAL: the guard token actually aborts, nonzero, with its message.

        Regex-shape checks alone would pass on a subtly wrong expansion such as
        ${PF_PY-default} or ${PF_PY:=...}; this executes the real token.
        """
        guards = _fail_loud_guards()
        assert guards, (
            "no fail-loud ${PF_PY:?...} guards found in any template — the "
            "162-8 guard has not been applied"
        )
        for path, expansion in guards:
            result = subprocess.run(
                ["bash", "-c", f'unset PF_PY; printf "%s" "{expansion}"'],
                capture_output=True,
                text=True,
                check=False,
            )
            assert result.returncode != 0, (
                f"{_rel(path)}: guard {expansion} did not abort with PF_PY "
                f"unset (rc=0, stdout={result.stdout!r}) — it is not fail-loud"
            )
            assert result.stdout == "", (
                f"{_rel(path)}: guard {expansion} still produced output "
                f"{result.stdout!r} with PF_PY unset"
            )
            assert "PF_PY" in result.stderr, (
                f"{_rel(path)}: guard {expansion} aborted without a PF_PY "
                f"diagnostic on stderr: {result.stderr!r}"
            )

    def test_fail_loud_guard_passes_value_through_when_set(self):
        """BEHAVIORAL: the guard is transparent when PF_PY is set.

        Negative case for the test above: a guard that always aborts would pass
        the abort test and break every template.
        """
        guards = _fail_loud_guards()
        assert guards, (
            "no fail-loud ${PF_PY:?...} guards found in any template — the "
            "162-8 guard has not been applied"
        )
        seen: set[str] = set()
        for path, expansion in guards:
            if expansion in seen:
                continue
            seen.add(expansion)
            result = subprocess.run(
                ["bash", "-c", f'PF_PY=/usr/bin/python3; printf "%s" "{expansion}"'],
                capture_output=True,
                text=True,
                check=False,
            )
            assert result.returncode == 0, (
                f"{_rel(path)}: guard {expansion} failed even with PF_PY set: {result.stderr!r}"
            )
            assert result.stdout == "/usr/bin/python3", (
                f"{_rel(path)}: guard {expansion} did not expand to the PF_PY "
                f"value; got {result.stdout!r}"
            )


# ---------------------------------------------------------------------------
# AC1: the derivation itself, behaviorally, in every template
# ---------------------------------------------------------------------------


class TestDerivationAcrossTemplates:
    def test_every_derivation_resolves_launcher_shebang(self, tmp_path):
        """Every PF_PY= line in every template resolves to the pf launcher's
        shebang interpreter — with a space in the launcher dir and a decoy
        project .venv in CWD (155-11 fixture, applied tree-wide).
        """
        assignments = _all_pf_py_assignments()
        assert assignments, (
            "no template defines a PF_PY derivation — pf.* is still invoked via "
            "bare/venv python everywhere (gh #112)"
        )
        bin_dir, proj = _make_fake_env(tmp_path, sys.executable)
        for path, assignment in assignments:
            derived = _derive_pf_py(assignment, bin_dir, proj)
            assert derived == sys.executable, (
                f"{_rel(path)}: derivation {assignment!r} resolved to "
                f"{derived!r}, expected the launcher shebang interpreter "
                f"{sys.executable!r}"
            )
            assert str(proj / ".venv") not in derived, (
                f"{_rel(path)}: derivation consulted the project .venv: {derived!r}"
            )

    def test_derivation_fails_closed_without_pf_on_path(self, tmp_path):
        """With no pf launcher on PATH the derivation must not hang and must
        leave PF_PY empty, so the ${PF_PY:?} guard is what reports the problem.

        ``sed -n '1s/^#!//p' ""`` with an empty filename is the hang risk: a
        sed that falls back to stdin would block a subagent forever.
        """
        assignments = _all_pf_py_assignments()
        assert assignments, "no PF_PY derivation to exercise"
        proj = tmp_path / "proj"
        proj.mkdir()
        for path, assignment in assignments:
            try:
                result = subprocess.run(
                    ["bash", "-c", f'{assignment}\nprintf "%s" "${{PF_PY}}"'],
                    capture_output=True,
                    text=True,
                    cwd=proj,
                    env={"PATH": "/usr/bin:/bin", "HOME": str(proj)},
                    stdin=subprocess.DEVNULL,
                    timeout=10,
                    check=False,
                )
            except subprocess.TimeoutExpired:
                pytest.fail(
                    f"{_rel(path)}: derivation {assignment!r} hung with no pf "
                    "on PATH (reads stdin instead of failing closed)"
                )
            assert result.stdout.strip() == "", (
                f"{_rel(path)}: derivation {assignment!r} produced a bogus "
                f"PF_PY {result.stdout!r} with no pf launcher on PATH; it must "
                "resolve to empty so the fail-loud guard fires"
            )

    def test_derived_interpreter_imports_pf(self, tmp_path):
        """The derived interpreter can import pf from a project whose .venv
        cannot (155-11 AC4, re-asserted for the swept templates)."""
        assignments = _all_pf_py_assignments()
        assert assignments, "no PF_PY derivation to exercise"
        interpreter = _pf_capable_interpreter()
        if interpreter is None:
            pytest.skip(
                "no interpreter with pf installed found — the fake launcher "
                "fixture cannot host this check in this environment"
            )
        bin_dir, proj = _make_fake_env(tmp_path, interpreter)
        derived = _derive_pf_py(assignments[0][1], bin_dir, proj)
        assert derived == interpreter
        result = subprocess.run(
            [derived, "-c", "import pf"],
            capture_output=True,
            text=True,
            cwd=proj,
            check=False,
        )
        assert result.returncode == 0, (
            f"derived PF_PY interpreter cannot import pf: {result.stderr.strip()[:200]}"
        )


# ---------------------------------------------------------------------------
# AC1: prose instructions count too
# ---------------------------------------------------------------------------


class TestInlineInstructionsGuarded:
    def test_no_unguarded_pf_invocation_in_inline_code(self):
        """Inline code spans that tell an agent to run pf.* must not name a
        bare python either.

        An agent reading ``- Run: `python -c "from pf.x import y"``` executes it
        exactly as written, so a prose instruction is as much an offender as a
        bash fence. Offenders at RED: commands/pf-prime.md (advertises
        ``python3 -m pf.cli`` as an alternative to the pf launcher) and both
        workflows/scenario-builder/steps-*/step-06-validate.md.
        """
        offenders: list[tuple[Path, str]] = []
        for path in _template_files():
            prose = ANY_FENCE_RE.sub("", path.read_text(encoding="utf-8"))
            for span in INLINE_SPAN_RE.findall(prose):
                if "pf." not in span:
                    continue
                if BARE_PYTHON_EXEC_RE.search(span) or VENV_PYTHON_RE.search(span):
                    offenders.append((path, span))
        assert offenders == [], (
            "inline instructions tell an agent to run pf.* code with a bare or "
            "venv python. Use the pf launcher itself, or the PF_PY guard:\n" + _fmt(offenders)
        )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
