"""Tests for 162-38: harden the 162-8 PF_PY policy sweep (162-8 review tail).

162-8 built a POLICY sweep over dist templates (see
``test_162_8_template_pf_py_policy.py``): discover markdown under
TEMPLATE_ROOTS, extract every bash fence that executes ``pf.*`` code, assert
every such site routes through the fail-loud ``${PF_PY:?...}`` guard.

The 162-8 review left four holes. This file pins all four.

1. GATE-FENCE SENTINEL (highest value). ``SENTINEL_TEMPLATES`` — the
   anti-vacuity tripwire — lists only ``agents/*.md``. Five ``gates/*.md``
   files run pf code through the guard, and ``gates`` is a TEMPLATE_ROOT with
   NO sentinel. Drop/rename that root (or break gate-fence discovery) and every
   gate template silently leaves the sweep with no test failing. That is the
   "unswept root" failure mode 162-8 was created to fix, one rename away from
   recurring. Fix: a gates/ entry in SENTINEL_TEMPLATES.

2. SCRIPT-PATH BLIND SPOT (documented gap). A fence that invokes a ``.py``
   file which itself imports pf — ``python3 scripts/foo.py`` — is invisible to
   the predicate: the predicate looks for an INLINE pf payload (``-m pf.x``, or
   ``from pf.x`` in the fence text), and a script path carries its imports in
   another file. Closing it needs cross-file resolution (resolve the path,
   possibly through ``.pennyfarthing/`` symlinks, then parse its imports), so
   per 162-8's disposition discipline it is DOCUMENTED, not papered over. The
   tests below pin the invisibility explicitly AND assert no live offender
   exists today, so the gap stays latent rather than becoming a live hole.

3. BLIND-SPOT SHAPES. Three shapes the sweep misses today. All three are cheap
   to close in the sweep's regexes/discovery, so all three are INTENDED FIXES
   (RED until Dev widens the sweep), not documented gaps:
     (a) dash-less heredoc — ``python3 <<'PYEOF'`` runs stdin exactly like
         ``python3 - <<'PYEOF'``, which 162-8 did match;
     (b) version-suffixed interpreter — ``python3.12 -c``;
     (c) untagged fence — ``` with no ``bash``/``sh``/``shell`` info string.
   Zero live offenders exist in the tree for any of the three (verified), so
   widening the sweep cannot break the current tree — it only closes the door
   on the next offender.

4. DEVIATION-FORMAT DOC RULE. ``gates/deviations.py`` enforces a Spec-source
   SPECIFICITY rule (``_VALID_SPEC_SOURCE_RE`` in ``_validate_entry``): a
   deviation's ``Spec source`` must be non-empty AND must reference a file with
   an extension, an AC reference (``AC-3``/``AC3``), a ``Section N`` reference,
   ``SOUL.md``, or a markdown heading — otherwise the gate fails the entry as a
   "vague Spec source". ``guides/deviation-format.md`` documents the field as
   "Document path and section/AC reference" but never states that the gate
   REJECTS anything vaguer, so an agent writing ``Spec source: the story`` gets
   a gate failure the authoritative doc never warned about.

Disposition summary (intended fix vs documented gap):

    intended fix : gate-fence sentinel, dash-less heredoc,
                   version-suffixed python, untagged fence,
                   deviation-format spec-source doc section
    documented gap: script-path invocation (needs cross-file import
                   resolution; pinned + kept latent)

Story: 162-38 (epic 162), follow-up to 162-8 review
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

import pytest

from pf.gates.deviations import _VALID_SPEC_SOURCE_RE
from pf.tests.test_162_8_template_pf_py_policy import (
    ANY_FENCE_RE,
    BARE_PYTHON_EXEC_RE,
    DIST_DIR,
    SENTINEL_TEMPLATES,
    _bash_fences,
    _executes_pf,
    _pf_exec_fences,
    _rel,
    _template_files,
)

GUIDE_PATH = DIST_DIR / "guides" / "deviation-format.md"
POLICY_TEST_PATH = Path(__file__).resolve().parent / "test_162_8_template_pf_py_policy.py"

# A gate fence that runs pf code, found WITHOUT going through TEMPLATE_ROOTS —
# so this file notices if the gates root leaves the sweep.
GATE_PF_FENCE_RE = re.compile(
    r"```(?:bash|sh|shell)\n(?P<body>(?:(?!```).)*?(?:-m pf\.|from pf\.|import pf\.).*?)```",
    re.DOTALL,
)

# Shapes under test (3). Each is a full bash-fence body with an inline pf payload.
DASHLESS_HEREDOC_FENCE = "python3 <<'PYEOF'\nfrom pf.sprint.status import main\nmain()\nPYEOF\n"
VERSION_SUFFIXED_FENCE = 'python3.12 -c "from pf.sprint.status import main; main()"\n'
VERSION_SUFFIXED_MODULE_FENCE = "python3.12 -m pf.sprint.status\n"
UNTAGGED_FENCE_DOC = "Run this:\n\n```\npython3 -m pf.sprint.status\n```\n"

# Script-path shapes: the pf import lives in ANOTHER file, not in the fence.
SCRIPT_PATH_BARE_FENCE = "python3 .pennyfarthing/scripts/workflow/thing.py --json\n"
SCRIPT_PATH_GUARDED_FENCE = (
    'PF_PY="$(sed -n \'1s/^#!//p\' "$(command -v pf)")"\n'
    '"${PF_PY:?PF_PY not set - could not resolve the pf launcher interpreter}" '
    ".pennyfarthing/scripts/workflow/thing.py\n"
)

SCRIPT_INVOCATION_RE = re.compile(r"""python[\w.]*["']?\s+(?P<script>[\w./-]+\.py)\b""")
PY_IMPORTS_PF_RE = re.compile(r"^\s*(?:from|import)\s+pf[\s.]", re.MULTILINE)


# ---------------------------------------------------------------------------
# 1. Gate-fence sentinel — the unswept-root tripwire
# ---------------------------------------------------------------------------


def _gate_templates_running_pf() -> list[Path]:
    """gates/*.md whose bash fences run pf code, discovered independently.

    Deliberately does NOT reuse the sweep's TEMPLATE_ROOTS walk: this list is
    the ground truth the sweep is compared against.
    """
    gates_dir = DIST_DIR / "gates"
    if not gates_dir.is_dir():
        return []
    return [p for p in sorted(gates_dir.rglob("*.md")) if GATE_PF_FENCE_RE.search(p.read_text())]


class TestGateFenceSentinel:
    def test_gate_templates_running_pf_exist(self):
        """Ground truth is non-empty, else the two tests below are vacuous."""
        gates = _gate_templates_running_pf()
        assert len(gates) >= 3, (
            "independent discovery found only "
            f"{[_rel(p) for p in gates]} gate templates running pf.* code — the "
            "ground-truth scan is broken, so the sentinel assertions below "
            "cannot fail for the right reason"
        )

    def test_sentinel_templates_includes_a_gate_fence(self):
        """SENTINEL_TEMPLATES must pin at least one gates/ template.

        SENTINEL_TEMPLATES is the sweep's only anti-vacuity tripwire. With
        agents/ as its sole represented root, removing "gates" from
        TEMPLATE_ROOTS — or a discovery regex that stops matching the gate
        fence shape (`"${PF_PY:?..}" -c "` + a newline-led heredoc payload,
        which is NOT the shape any current sentinel uses) — drops five
        pf-executing templates out of the policy with every test still green.
        """
        gate_sentinels = [s for s in SENTINEL_TEMPLATES if s.startswith("gates/")]
        assert gate_sentinels, (
            "SENTINEL_TEMPLATES pins no gates/ template, so the gates root is "
            "unswept-by-accident-proof only by luck. Current sentinels: "
            f"{list(SENTINEL_TEMPLATES)}. Gate templates that DO run pf.* code: "
            f"{[_rel(p) for p in _gate_templates_running_pf()]}"
        )

    def test_every_sentinel_template_exists_on_disk(self):
        """A sentinel naming a deleted/moved file makes the sweep unfixable-red
        instead of meaningful — and tempts the next agent to just delete it."""
        missing = [s for s in SENTINEL_TEMPLATES if not (DIST_DIR / s).is_file()]
        assert missing == [], f"SENTINEL_TEMPLATES entries with no file on disk: {missing}"

    def test_gate_fences_are_reached_by_the_sweep(self):
        """Every gate template that runs pf code is seen by the sweep.

        This is the unswept-root regression detector: it fails if "gates" is
        dropped from TEMPLATE_ROOTS even if nobody touches SENTINEL_TEMPLATES.
        """
        detected = {_rel(p) for p, _ in _pf_exec_fences()}
        missed = [_rel(p) for p in _gate_templates_running_pf() if _rel(p) not in detected]
        assert missed == [], (
            "gate templates run pf.* code but the policy sweep does not see "
            f"them {missed} — they are outside TEMPLATE_ROOTS or the fence "
            "predicate misses their shape, so the PF_PY guard is unenforced "
            "there"
        )


# ---------------------------------------------------------------------------
# 2. Script-path blind spot — DOCUMENTED GAP
# ---------------------------------------------------------------------------


class TestScriptPathBlindSpotIsDocumented:
    @pytest.mark.parametrize(
        "fence,label",
        [
            (SCRIPT_PATH_BARE_FENCE, "bare python running a .py script"),
            (SCRIPT_PATH_GUARDED_FENCE, "PF_PY-guarded python running a .py script"),
        ],
    )
    def test_script_path_invocation_is_invisible_to_the_predicate(self, fence, label):
        """KNOWN LIMITATION, pinned deliberately.

        The predicate requires an INLINE pf payload. A fence handing a ``.py``
        path to the interpreter carries its ``import pf`` in that other file, so
        the fence is not recognised as pf-executing and the guard is not
        enforced on it. Asserting False here is not an endorsement — it makes
        the gap executable and reviewable. If a future change closes it, this
        test fails loudly and gets flipped, which is the intended signal.
        """
        assert _executes_pf(fence) is False, (
            f"the sweep now detects the script-path shape ({label}) — the known "
            "162-38 limitation is closed. Flip this test to assert True and "
            "remove the limitation note from the 162-8 policy docstring"
        )

    def test_script_path_blind_spot_is_documented_in_the_policy_module(self):
        """The limitation must be written down where the sweep lives.

        An undocumented blind spot reads as coverage: the next reader sees a
        tree-wide policy sweep and assumes ``python3 foo.py`` is covered.
        """
        assert POLICY_TEST_PATH.is_file(), f"policy module not found at {POLICY_TEST_PATH}"
        lowered = POLICY_TEST_PATH.read_text(encoding="utf-8").lower()
        missing = [token for token in ("blind spot", ".py", "script") if token not in lowered]
        assert not missing, (
            "the 162-8 policy module does not document the script-path blind "
            f"spot (missing markers: {missing}). Add a KNOWN LIMITATION note "
            "stating that a fence invoking a .py file which imports pf is not "
            "detected, because the predicate only sees inline pf payloads"
        )

    def test_no_live_script_path_offender_in_the_tree(self):
        """The gap must stay LATENT: no template today hands a pf-importing
        script to an interpreter. Green guard — it turns red the day someone
        introduces the shape the sweep cannot see."""
        offenders: list[tuple[str, str]] = []
        for path in _template_files():
            for fence in _bash_fences(path.read_text(encoding="utf-8")):
                for line in fence.splitlines():
                    match = SCRIPT_INVOCATION_RE.search(line)
                    if not match:
                        continue
                    rel = match.group("script").replace(".pennyfarthing/", "")
                    target = DIST_DIR / rel
                    if target.is_file() and PY_IMPORTS_PF_RE.search(
                        target.read_text(encoding="utf-8", errors="replace")
                    ):
                        offenders.append((_rel(path), line.strip()))
        assert offenders == [], (
            "a template invokes a .py script that imports pf. That shape is in "
            "the sweep's documented blind spot, so the PF_PY guard is NOT "
            "enforced on it and gh #112 can recur silently. Either inline the "
            "pf payload behind the guard, or close the blind spot:\n"
            + "\n".join(f"  {p}: {line}" for p, line in offenders)
        )


# ---------------------------------------------------------------------------
# 3. Blind-spot shapes — INTENDED FIXES
# ---------------------------------------------------------------------------


class TestDashlessHeredocShape:
    def test_dashless_heredoc_is_detected_as_pf_execution(self):
        """``python3 <<'PYEOF'`` runs stdin exactly like ``python3 - <<'PYEOF'``.

        162-8 explicitly closed the ``python3 -`` heredoc hole but its regexes
        require the dash. Drop the dash — a form bash accepts identically — and
        the fence leaves the policy entirely.
        """
        assert _executes_pf(DASHLESS_HEREDOC_FENCE) is True, (
            "dash-less heredoc fence not recognised as executing pf code; "
            "ANY_PYTHON_EXEC_RE / BARE_PYTHON_EXEC_RE require -m, -c or a bare "
            "dash. Add the heredoc operator (<<) as an execution form"
        )

    def test_dashless_heredoc_is_flagged_as_bare_python(self):
        """Detection alone is not enough — the bare-python rule must fire too,
        otherwise the fence is swept but its offence is invisible."""
        line = DASHLESS_HEREDOC_FENCE.splitlines()[0]
        assert BARE_PYTHON_EXEC_RE.search(line), (
            f"BARE_PYTHON_EXEC_RE does not flag {line!r} — a bare interpreter "
            "running pf code off stdin resolves to whatever is first on PATH "
            "(gh #112)"
        )

    def test_guarded_dashless_heredoc_is_not_flagged_as_bare(self):
        """Negative case: widening the regex must not flag the CORRECT form.

        Without this, Dev could satisfy the two tests above with a regex that
        matches every heredoc, making the guarded shape a false offender and
        the 162-8 suite unfixable.
        """
        line = "\"${PF_PY:?PF_PY not set - cannot resolve the pf launcher}\" <<'PYEOF'"
        assert not BARE_PYTHON_EXEC_RE.search(line), (
            f"BARE_PYTHON_EXEC_RE flags the guarded heredoc form {line!r} as a "
            "bare python offender — false positive"
        )


class TestVersionSuffixedPythonShape:
    @pytest.mark.parametrize(
        "fence",
        [VERSION_SUFFIXED_FENCE, VERSION_SUFFIXED_MODULE_FENCE],
        ids=["dash-c", "dash-m"],
    )
    def test_version_suffixed_interpreter_is_detected(self, fence):
        """``python3.12 -c`` is a bare interpreter with a version suffix.

        The sweep's interpreter pattern is ``python3?`` followed immediately by
        quote-or-space, so ``python3.12`` (and ``python3.13``, and
        ``/opt/homebrew/bin/python3.12``) slips past it.
        """
        assert _executes_pf(fence) is True, (
            f"version-suffixed interpreter fence {fence.strip()!r} not "
            "recognised as executing pf code — allow an optional .N version "
            "suffix in the interpreter pattern"
        )

    @pytest.mark.parametrize(
        "line",
        [VERSION_SUFFIXED_FENCE.strip(), VERSION_SUFFIXED_MODULE_FENCE.strip()],
        ids=["dash-c", "dash-m"],
    )
    def test_version_suffixed_interpreter_is_flagged_as_bare_python(self, line):
        """``python3.12 -m pf.x`` is already swept (via ``-m pf.``) but its
        bare-interpreter offence is not flagged — the exact silent-pass shape."""
        assert BARE_PYTHON_EXEC_RE.search(line), (
            f"BARE_PYTHON_EXEC_RE does not flag {line!r}; a version-suffixed "
            "bare interpreter is as unpinned as `python3` and need not have pf "
            "installed"
        )

    def test_pf_py_expansion_is_still_not_flagged_as_bare_python(self):
        """Negative case for the widening: the guarded form stays clean."""
        line = (
            '"${PF_PY:?PF_PY not set - could not resolve the pf launcher '
            'interpreter}" -c "from pf.sprint.status import main"'
        )
        assert not BARE_PYTHON_EXEC_RE.search(line), (
            f"BARE_PYTHON_EXEC_RE flags the guarded form {line!r} — the "
            "widened interpreter pattern lost its lookbehind exclusions"
        )


class TestUntaggedFenceShape:
    def test_untagged_fence_is_extracted_by_the_sweep(self):
        """An untagged ``` fence is executed by an agent just like ```bash.

        Fence extraction keys on the info string (bash|sh|shell), so dropping
        the tag — the single most common markdown slip — removes the fence from
        the policy. Zero untagged pf-executing fences exist in the tree today,
        so widening extraction costs nothing and closes the shape.
        """
        fences = _bash_fences(UNTAGGED_FENCE_DOC)
        assert any("-m pf." in f for f in fences), (
            "untagged fence containing `-m pf.` was not extracted; extracted "
            f"fences were {fences!r}. Accept an empty info string in the fence "
            "pattern"
        )

    def test_untagged_pf_fence_would_be_detected_end_to_end(self):
        """Extraction plus predicate — the two halves must line up, otherwise
        the fence is extracted and then dropped."""
        fences = _bash_fences(UNTAGGED_FENCE_DOC)
        assert any(_executes_pf(f) for f in fences), (
            f"no extracted fence from an untagged pf block is recognised as "
            f"executing pf code; fences were {fences!r}"
        )

    @pytest.mark.parametrize("info_string", ["yaml", "json", "markdown", "text", "python"])
    def test_non_shell_info_strings_are_still_not_swept(self, info_string):
        """Negative case: widening must not swallow data/sample fences.

        A ```yaml GATE_RESULT block or a ```python source sample is not
        something an agent executes as shell; sweeping them would make the
        162-8 policy fail on documentation.
        """
        doc = f"```{info_string}\npython3 -m pf.sprint.status\n```\n"
        assert _bash_fences(doc) == [], (
            f"fence tagged ```{info_string} was swept as a shell fence — the "
            "widened pattern is too greedy and now treats sample/data blocks "
            "as executable policy sites"
        )

    def test_tree_has_no_untagged_pf_executing_fence(self):
        """Green guard: nothing in the tree relies on the untagged shape today,
        so the widening above cannot turn the 162-8 suite red."""
        untagged_re = re.compile(r"```[ \t]*\n(.*?)```", re.DOTALL)
        offenders = [
            (_rel(path), fence.strip().splitlines()[0])
            for path in _template_files()
            for fence in untagged_re.findall(path.read_text(encoding="utf-8"))
            if _executes_pf(fence) or "-m pf." in fence
        ]
        assert offenders == [], (
            "untagged fences execute pf.* code — tag them ```bash so the "
            "policy sweep governs them:\n" + "\n".join(f"  {p}: {line}" for p, line in offenders)
        )


# ---------------------------------------------------------------------------
# 4. deviation-format.md must document deviations.py's Spec-source rule
# ---------------------------------------------------------------------------


def _guide_text() -> str:
    return GUIDE_PATH.read_text(encoding="utf-8")


def _spec_source_rule_section() -> str:
    """Text of the guide subsection that states the Spec-source rule.

    A heading whose text mentions "spec source"; returns "" when absent.
    """
    if not GUIDE_PATH.is_file():
        return ""
    lines = _guide_text().splitlines()
    out: list[str] = []
    depth = 0
    for line in lines:
        heading = re.match(r"^(#{2,4})\s+(.*)$", line)
        if heading:
            level = len(heading.group(1))
            if "spec source" in heading.group(2).lower():
                depth = level
                out = []
                continue
            if depth and level <= depth:
                depth = 0
        if depth:
            out.append(line)
    return "\n".join(out).strip()


class TestDeviationFormatDocumentsSpecSourceRule:
    def test_guide_exists(self):
        assert GUIDE_PATH.is_file(), f"authoritative deviation guide missing at {GUIDE_PATH}"

    def test_guide_has_a_spec_source_rule_section(self):
        """The rule needs its own section, not a table cell.

        ``deviations.py`` fails any entry whose Spec source does not match
        ``_VALID_SPEC_SOURCE_RE`` ("vague Spec source — must reference a file
        path, AC, or section"). The guide currently describes the field only as
        "Document path and section/AC reference", which reads as guidance, not
        as an enforced constraint.
        """
        section = _spec_source_rule_section()
        assert section, (
            "guides/deviation-format.md has no 'Spec source' section stating "
            "the specificity rule that deviations.py enforces; agents hit the "
            "gate failure with no documented rule to consult"
        )

    def test_guide_states_the_accepted_spec_source_forms(self):
        """The doc must enumerate the forms the validator actually accepts."""
        section = _spec_source_rule_section().lower()
        assert section, "no Spec source rule section to inspect"
        missing = [token for token in ("file", "ac-", "section", "vague") if token not in section]
        assert not missing, (
            "the Spec source section does not state the enforced rule "
            f"(missing: {missing}). deviations.py accepts a file reference with "
            "an extension, an AC reference (AC-3/AC3), a 'Section N' "
            "reference, SOUL.md, or a markdown heading — and rejects anything "
            "else as a vague Spec source"
        )

    def test_guide_names_the_gate_consequence(self):
        """A rule without its consequence gets treated as a style suggestion."""
        section = _spec_source_rule_section().lower()
        assert section, "no Spec source rule section to inspect"
        assert any(word in section for word in ("gate fails", "fails", "rejects", "rejected")), (
            "the Spec source section does not say the deviations-logged gate "
            "FAILS the entry when the source is vague"
        )

    def test_guide_shows_a_rejected_counter_example(self):
        """The section must show at least one value the real validator rejects.

        Accepted-only examples leave "how vague is too vague" to guesswork.
        Verified against ``_VALID_SPEC_SOURCE_RE`` itself, so a counter-example
        that the gate would actually ACCEPT does not satisfy this.
        """
        section = _spec_source_rule_section()
        assert section, "no Spec source rule section to inspect"
        spans = re.findall(r"`([^`\n]+)`", section)
        rejected = [s for s in spans if not _VALID_SPEC_SOURCE_RE.search(s)]
        assert rejected, (
            "the Spec source section shows no inline example that "
            "deviations.py would reject; add a counter-example (e.g. a bare "
            f"'the story' style value). Inline examples found: {spans}"
        )

    def test_guide_accepted_examples_pass_the_real_validator(self):
        """Every ``Spec source:`` value shown anywhere in the guide must pass
        the gate. Green guard: catches a doc example the gate would reject."""
        values = re.findall(r"^\s*-\s*Spec source:\s*(.+)$", _guide_text(), re.MULTILINE)
        assert values, "guide shows no 'Spec source:' example lines"
        bad = [
            v.strip()
            for v in values
            if not v.strip().startswith("{") and not _VALID_SPEC_SOURCE_RE.search(v)
        ]
        assert bad == [], (
            "guides/deviation-format.md shows Spec source examples that "
            f"deviations.py would reject as vague: {bad}"
        )


# ---------------------------------------------------------------------------
# Anti-vacuity: the imported sweep internals must still be the real thing
# ---------------------------------------------------------------------------


class TestImportedSweepIsIntact:
    def test_sweep_still_finds_pf_exec_fences(self):
        fences = _pf_exec_fences()
        assert len(fences) >= 5, (
            f"the 162-8 sweep found only {len(fences)} pf-executing fences — "
            "the sweep is broken and this file's shape assertions cannot be "
            "trusted"
        )

    def test_any_fence_re_still_matches_fences(self):
        assert ANY_FENCE_RE.search("```bash\necho hi\n```"), (
            "ANY_FENCE_RE no longer matches a fence — the prose/inline checks in 162-8 are vacuous"
        )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
