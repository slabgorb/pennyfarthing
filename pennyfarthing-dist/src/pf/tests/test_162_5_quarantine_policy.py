"""Marker-policy meta-guard for the triaged test baseline (Story 162-5).

Epic: 162 — Finish & sprint-tooling truthfulness

Story 162-5 triaged a ~30-failure baseline that had been red long enough that
every story re-proved it by hand. Two things have to stay true afterwards or the
baseline silently rots back:

1. **The triaged modules stay green.** Not "green modulo the usual failures" —
   green, where an explicit ``xfail``/``skip`` counts as green and anything else
   is a regression. That is what ``TestInScopeModulesHaveNoUnmarkedFailures``
   asserts, so the guarantee is a test rather than a claim in a story
   description.

2. **Quarantines stay LOUD.** A quarantine is a debt marker. Without a reason and
   a tracking reference it is indistinguishable from a silent deletion, and the
   next reader cannot tell a known upstream bug from an abandoned test. The
   policy tests below make an anonymous quarantine a test failure.

Acceptance criteria covered:
- [AC1] Full suite has zero UNMARKED failures (enforced here for the modules
        this story triaged)
- [AC3] Every quarantine carries a rationale and a tracking reference
"""

from __future__ import annotations

import ast
import re
import subprocess
import sys
from pathlib import Path

TESTS_DIR = Path(__file__).resolve().parent

# The six modules this story triaged. Kept explicit rather than globbed: this
# list is the story's contract, and a glob would quietly absorb new modules and
# make the guard's scope drift.
IN_SCOPE_MODULES = [
    "test_143_9_tdd_cycle_e2e.py",
    "test_143_10_reviewer_dev_roundtrip.py",
    "test_153_4_story_mutation_on_sharded_yaml.py",
    "test_independence.py",
    "test_init_justfile.py",
    "test_peloton_portrait_panes.py",
]

# A tracking reference is a story id (``162-5``), a gh issue (``gh #113``), or a
# bare issue number (``#113``). Quarantines must point somewhere.
_TRACKING_RE = re.compile(r"\b\d+-\d+\b|\bgh\s*#\d+|#\d+")

_QUARANTINE_MARKERS = ("mark.xfail", "mark.skip", "mark.skipif")


def _markers_in_source(source: str) -> list[tuple[str, ast.expr]]:
    """Core detection: yield (test_name, decorator_node) for one module's source.

    Split out from the tree walk (story 162-29) so the anti-vacuity guards can
    exercise *this* function against a synthetic module. Before the split they
    asserted that the real test tree contained quarantines — which made paying
    off the last xfail a test failure, exactly backwards from the intent.
    """
    found: list[tuple[str, ast.expr]] = []
    try:
        tree = ast.parse(source)
    except SyntaxError:  # pragma: no cover - a broken test file fails elsewhere
        return found
    for node in ast.walk(tree):
        decorators = getattr(node, "decorator_list", None)
        if not decorators:
            continue
        for dec in decorators:
            src = ast.unparse(dec)
            if any(m in src for m in _QUARANTINE_MARKERS):
                found.append((getattr(node, "name", "<unknown>"), dec))
    return found


# A module carrying one of every quarantine flavour. The guards below run
# _markers_in_source over this instead of over the real tree, so discovery is
# pinned whether or not the tree currently holds any debt.
SYNTHETIC_MODULE = '''
import pytest

@pytest.mark.xfail(reason="synthetic 999-1: pinned by the discovery guard", strict=False)
def test_synthetic_xfail():
    pass

@pytest.mark.skip(reason="synthetic gh #999: pinned by the discovery guard")
def test_synthetic_skip():
    pass

@pytest.mark.skipif(True, reason="synthetic #999: pinned by the discovery guard")
def test_synthetic_skipif():
    pass

@pytest.mark.xfail
def test_synthetic_bare_xfail():
    pass

def test_not_quarantined():
    pass
'''


def _iter_quarantine_markers() -> list[tuple[Path, str, ast.expr]]:
    """Yield (file, test_name, decorator_node) for every quarantine marker."""
    found: list[tuple[Path, str, ast.expr]] = []
    for path in sorted(TESTS_DIR.rglob("test_*.py")):
        for name, dec in _markers_in_source(path.read_text()):
            found.append((path, name, dec))
    return found


def _reason_of(dec: ast.expr) -> str | None:
    """Extract a literal ``reason=`` string from a marker, if present."""
    if not isinstance(dec, ast.Call):
        return None
    for kw in dec.keywords:
        if kw.arg == "reason":
            try:
                value = ast.literal_eval(kw.value)
            except (ValueError, SyntaxError):
                return None
            return value if isinstance(value, str) else None
    return None


class TestQuarantineMarkersAreLoud:
    """AC3: no anonymous quarantines anywhere in the test tree."""

    def test_marker_discovery_works(self) -> None:
        """Guard the guard.

        The policy tests below iterate a collection. If marker discovery ever
        broke — a rename in pytest's API, an AST-walk regression — they would
        pass over an empty list and assert nothing at all.

        Pinned against SYNTHETIC_MODULE rather than against the real tree
        (story 162-29). Asserting the tree holds >= N quarantines made *paying
        off* debt a failure: 162-29 removed the last four xfails and this guard
        went red for it. Discovery correctness and debt volume are different
        facts and only the first belongs in a guard.
        """
        names = [name for name, _ in _markers_in_source(SYNTHETIC_MODULE)]
        assert names == [
            "test_synthetic_xfail",
            "test_synthetic_skip",
            "test_synthetic_skipif",
            "test_synthetic_bare_xfail",
        ], f"discovery is broken — found {names!r}"
        # And it must reject, not just accept: the unmarked test stays out.
        assert "test_not_quarantined" not in names

    def test_tree_scan_reaches_the_test_suite(self) -> None:
        """The tree walk must actually visit modules, even at zero debt.

        Separate from discovery correctness: this catches TESTS_DIR pointing at
        the wrong place or the glob matching nothing, which would make every
        policy test below vacuous no matter how good the detection is.
        """
        modules = sorted(TESTS_DIR.rglob("test_*.py"))
        assert len(modules) > 50, (
            f"tree scan found only {len(modules)} test modules under "
            f"{TESTS_DIR} — the walk is not reaching the suite."
        )
        assert Path(__file__).resolve() in modules

    def test_every_quarantine_has_a_reason(self) -> None:
        """A bare ``@pytest.mark.xfail`` hides why a test was given up on."""
        offenders = [
            f"{path.name}::{name} -> {ast.unparse(dec)}"
            for path, name, dec in _iter_quarantine_markers()
            if not (_reason_of(dec) or "").strip()
        ]
        assert not offenders, (
            "Quarantine markers must carry a non-empty reason= explaining the "
            "root cause. Offenders:\n  " + "\n  ".join(offenders)
        )

    def test_every_xfail_cites_a_tracking_reference(self) -> None:
        """An ``xfail`` reason without a tracking reference is a dead end.

        Scoped to ``xfail`` on purpose. An ``xfail`` says "this SHOULD pass and
        does not" — that is debt, and debt needs somewhere to be followed to. A
        ``skipif`` usually encodes a permanent environment fact (running as root
        defeats ``chmod 000``) which is self-explanatory and will never have a
        story, so demanding a reference there would only invite fake ones.
        """
        offenders = [
            f"{path.name}::{name} -> {_reason_of(dec)!r}"
            for path, name, dec in _iter_quarantine_markers()
            if "mark.xfail" in ast.unparse(dec)
            and not _TRACKING_RE.search(_reason_of(dec) or "")
        ]
        assert not offenders, (
            "xfail reasons must cite a tracking reference (story id like "
            "'162-5', or an issue like 'gh #113') so the debt is followable. "
            "Offenders:\n  " + "\n  ".join(offenders)
        )

    def test_xfail_filter_and_tracking_regex_are_live(self) -> None:
        """Guard the guard, part two.

        ``test_every_quarantine_has_a_reason`` and
        ``test_every_xfail_cites_a_tracking_reference`` both narrow the marker
        list before asserting. Pin that the xfail filter and the tracking-ref
        regex each accept AND reject, so neither policy test can go vacuous.

        Pinned against SYNTHETIC_MODULE (story 162-29) — see
        ``test_marker_discovery_works`` for why the real tree is the wrong
        fixture here.
        """
        markers = _markers_in_source(SYNTHETIC_MODULE)
        xfails = [(n, d) for n, d in markers if "mark.xfail" in ast.unparse(d)]
        assert [n for n, _ in xfails] == [
            "test_synthetic_xfail",
            "test_synthetic_bare_xfail",
        ], "the xfail filter is broken"

        by_name = dict(xfails)
        # Accepts a reason carrying a tracking reference...
        assert _TRACKING_RE.search(_reason_of(by_name["test_synthetic_xfail"]) or "")
        # ...and rejects a bare marker, which carries no reason at all.
        assert _reason_of(by_name["test_synthetic_bare_xfail"]) is None
        # The regex must be capable of rejecting, not just accepting.
        assert not _TRACKING_RE.search("no reference here at all")
        assert _TRACKING_RE.search("gh #113")
        assert _TRACKING_RE.search("162-29")


class TestInScopeModulesHaveNoUnmarkedFailures:
    """AC1: the triaged baseline stays green (xfail/skip counts as green)."""

    def test_all_in_scope_modules_are_present(self) -> None:
        """A renamed or deleted module must not silently shrink the guard."""
        missing = [m for m in IN_SCOPE_MODULES if not (TESTS_DIR / m).exists()]
        assert not missing, (
            "In-scope modules from story 162-5 are missing. If a module was "
            f"intentionally renamed, update IN_SCOPE_MODULES: {missing}"
        )

    def test_in_scope_modules_pass(self) -> None:
        """Run the triaged modules in a subprocess and require a clean exit.

        A subprocess is used deliberately: collecting these modules into the
        current session would recurse into this file. pytest exits 0 only when
        there are no failures and no errors — xfailed and skipped tests do not
        affect the exit code, which is exactly the "zero UNMARKED failures"
        contract. Any newly red test in these modules fails here with the
        offending test ids in the message.
        """
        targets = [str(TESTS_DIR / m) for m in IN_SCOPE_MODULES]
        proc = subprocess.run(
            [sys.executable, "-m", "pytest", "-q", "-p", "no:cacheprovider", *targets],
            capture_output=True,
            text=True,
            cwd=TESTS_DIR.parent.parent.parent.parent,
        )

        assert proc.returncode == 0, (
            "The story 162-5 baseline has regressed — an unmarked failure "
            "appeared in a triaged module. Either fix it, or quarantine it with "
            "an xfail/skip carrying a reason and a tracking reference.\n\n"
            f"--- stdout ---\n{proc.stdout[-4000:]}\n"
            f"--- stderr ---\n{proc.stderr[-2000:]}"
        )
