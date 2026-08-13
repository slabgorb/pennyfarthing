"""Hardening guards for the 162-5 quarantine meta-guard (Story 162-31).

Epic: 162 — Finish & sprint-tooling truthfulness

Story 162-5 built ``test_162_5_quarantine_policy.py`` to keep quarantines loud.
Its own review found three holes, and this module pins the fixes. Each hole has
the same shape: the guard *looks* like it enforces something, and an easy,
plausible move slips past it.

1. **XPASS is silent.** The quarantines are ``xfail(strict=False)``. When the
   underlying bug is finally fixed the test XPASSes, pytest exits 0, and nobody
   is told to lift the quarantine — the debt marker outlives the debt and the
   test stops being a test. ``TestXpassIsLoud`` requires a forcing function:
   an XPASS in a quarantined module must be *detected*.

2. **The tracking-reference regex is gameable.** ``\\b\\d+-\\d+\\b`` matches any
   two numbers with a hyphen between them: ``flaky 3-14 on macos``, ``see 1-1``,
   a bare ``2026-08``. A reference nobody can follow is the same as no reference,
   only harder to notice. ``TestTrackingReferenceIsNotGameable`` pins both
   sides — junk rejected, real story/issue references accepted.

3. **Discovery walks decorator lists only.** A module-level
   ``pytestmark = pytest.mark.xfail(...)`` quarantines every test in a file, and
   a runtime ``pytest.xfail("...")`` quarantines one, and neither is a decorator.
   Both bypass the policy completely. ``TestDiscoveryCatchesBypasses`` pins that
   the marker scan sees them.

These tests are written RED on purpose: the names they import do not exist yet,
and the tightened regex deliberately rejects inputs the current one accepts.
"""

from __future__ import annotations

import ast
import textwrap
from pathlib import Path

import pytest

from pf.tests.test_162_5_quarantine_policy import (
    _TRACKING_RE,
    IN_SCOPE_MODULES,
    TESTS_DIR,
    _markers_in_source,
    _reason_of,
)


def find_xpasses(targets: list[Path]) -> list[str]:
    """Adapter for the helper story 162-31 asks Dev to add.

    Imported lazily rather than at module scope on purpose: a top-level import
    of a not-yet-written name is a *collection* error, which aborts this whole
    file and hides the tracking-regex and discovery failures below. Deferring it
    keeps each of the three deliverables reporting independently.
    """
    from pf.tests.test_162_5_quarantine_policy import (  # noqa: PLC0415
        find_xpasses as _impl,
    )

    return _impl(targets)

# ===========================================================================
# Deliverable 1: an XPASS must be loud
# ===========================================================================

# A quarantined test that *passes*. This is what B1/B2/B4 getting fixed looks
# like from the outside: the xfail marker is now a lie, and with strict=False
# pytest says nothing about it.
_XPASSING_MODULE = '''\
import pytest

@pytest.mark.xfail(reason="synthetic story 999-1: bug is actually fixed", strict=False)
def test_quarantined_but_actually_passing():
    assert True
'''

# The control: a quarantine whose bug is genuinely still there. This one must
# NOT be reported, or the forcing function would demand that live debt be
# un-quarantined and the guard would punish honest markers.
_STILL_FAILING_MODULE = '''\
import pytest

@pytest.mark.xfail(reason="synthetic story 999-2: bug is still open", strict=False)
def test_quarantined_and_still_failing():
    assert False, "the underlying bug is not fixed"
'''


def _write_module(tmp_path: Path, name: str, source: str) -> Path:
    path = tmp_path / name
    path.write_text(textwrap.dedent(source))
    return path


class TestXpassIsLoud:
    """A quarantine that has started passing must be reported, not ignored."""

    def test_xpassing_quarantine_is_detected(self, tmp_path: Path) -> None:
        """The core forcing function.

        Run against a real pytest execution, not a regex over source: the fact
        we care about ("this xfail passed") only exists at runtime.
        """
        module = _write_module(tmp_path, "test_synthetic_xpass.py", _XPASSING_MODULE)

        offenders = find_xpasses([module])

        assert offenders, (
            "an xfail(strict=False) test that passes must be detected as an "
            "XPASS so the quarantine gets lifted — nothing was reported"
        )
        assert any("test_quarantined_but_actually_passing" in o for o in offenders), (
            f"the XPASSing test must be named in the report, got: {offenders!r}"
        )

    def test_still_failing_quarantine_is_not_reported(self, tmp_path: Path) -> None:
        """Reject as well as accept: live debt must not be flagged."""
        module = _write_module(
            tmp_path, "test_synthetic_xfail_live.py", _STILL_FAILING_MODULE
        )

        assert find_xpasses([module]) == [], (
            "a quarantine whose bug is still open is an honest xfail and must "
            "not be reported as an XPASS"
        )

    def test_clean_module_is_not_reported(self, tmp_path: Path) -> None:
        """A module with no quarantines at all produces no offenders."""
        module = _write_module(
            tmp_path,
            "test_synthetic_clean.py",
            "def test_ordinary():\n    assert True\n",
        )

        assert find_xpasses([module]) == []

    def test_in_scope_modules_have_no_xpass(self) -> None:
        """The policy itself: the 162-5 baseline carries no stale quarantines.

        This is the test that goes red when B1/B2/B4 are fixed, which is the
        entire point — the fix must be accompanied by removing the marker.
        """
        targets = [TESTS_DIR / m for m in IN_SCOPE_MODULES]

        offenders = find_xpasses(targets)

        assert offenders == [], (
            "A quarantined test in the story 162-5 baseline now PASSES. The "
            "underlying bug is fixed — remove the xfail marker instead of "
            "leaving a marker that no longer describes reality:\n  "
            + "\n  ".join(offenders)
        )


# ===========================================================================
# Deliverable 2: the tracking-reference regex must not be gameable
# ===========================================================================

# Every one of these was accepted by the 162-5 regex. None of them lets a reader
# find the tracking item, which is the only thing a tracking reference is for.
_JUNK_REFERENCES = [
    "flaky 3-14 on macos",
    "see 1-1",
    "quarantined 2026-08",
    "known bad since 2026-08-11",
    "fails 2 of 3 runs",
    "top #5 flake in the suite",
    "no reference here at all",
    "",
]

# Real references, in the forms actually used in this repo. The regex must keep
# accepting these — tightening it into rejecting everything would be a
# different, equally useless failure.
_REAL_REFERENCES = [
    "story 162-31: upstream bug in the resolver",
    "tracked by story 3-14",
    "epic 162 story 162-5 tracks the fix",
    "gh #113",
    "github #113",
    "issue #113",
    "see PF-1234",
]


class TestTrackingReferenceIsNotGameable:
    """A tracking reference must be followable, not merely hyphen-shaped."""

    @pytest.mark.parametrize("reason", _JUNK_REFERENCES)
    def test_junk_is_rejected(self, reason: str) -> None:
        assert not _TRACKING_RE.search(reason), (
            f"{reason!r} is not a followable tracking reference — the regex "
            "must require a story/issue context, not any two hyphenated "
            "numbers"
        )

    @pytest.mark.parametrize("reason", _REAL_REFERENCES)
    def test_real_references_are_accepted(self, reason: str) -> None:
        assert _TRACKING_RE.search(reason), (
            f"{reason!r} is a legitimate tracking reference and must still be "
            "accepted — a regex that rejects everything is not an improvement"
        )


# ===========================================================================
# Deliverable 3: discovery must catch the non-decorator bypasses
# ===========================================================================

_MODULE_LEVEL_MARK = '''\
import pytest

pytestmark = pytest.mark.xfail(reason="synthetic story 999-3: module-level quarantine")

def test_one():
    assert False

def test_two():
    assert False
'''

_MODULE_LEVEL_MARK_LIST = '''\
import pytest

pytestmark = [
    pytest.mark.xfail(reason="synthetic story 999-4: list form"),
]

def test_one():
    assert False
'''

_RUNTIME_XFAIL = '''\
import pytest

def test_runtime_quarantined():
    pytest.xfail("synthetic story 999-5: bailed out at runtime")
'''

_MODULE_LEVEL_INNOCENT = '''\
import pytest

pytestmark = pytest.mark.slow

def test_one():
    assert True
'''


class TestDiscoveryCatchesBypasses:
    """``pytestmark`` and runtime ``pytest.xfail`` are quarantines too."""

    def test_module_level_pytestmark_is_discovered(self) -> None:
        """A module-level xfail quarantines a whole file and must be seen."""
        found = _markers_in_source(_MODULE_LEVEL_MARK)

        assert found, (
            "a module-level `pytestmark = pytest.mark.xfail(...)` quarantines "
            "every test in the file and currently bypasses the policy entirely"
        )
        assert [name for name, _ in found] == ["<module>"], (
            "a module-level marker belongs to the module, so it must be "
            f"reported under '<module>', got: {[n for n, _ in found]!r}"
        )
        assert _reason_of(found[0][1]) == (
            "synthetic story 999-3: module-level quarantine"
        )

    def test_module_level_pytestmark_list_is_discovered(self) -> None:
        """The list form is the common one and must not be a loophole."""
        found = _markers_in_source(_MODULE_LEVEL_MARK_LIST)

        assert [name for name, _ in found] == ["<module>"]
        assert _reason_of(found[0][1]) == "synthetic story 999-4: list form"

    def test_runtime_xfail_call_is_discovered(self) -> None:
        """``pytest.xfail("...")`` is an undeclared quarantine.

        It never appears in a decorator list, so today it is invisible to the
        policy while still removing the test from the suite.
        """
        found = _markers_in_source(_RUNTIME_XFAIL)

        assert [name for name, _ in found] == ["test_runtime_quarantined"], (
            "a runtime pytest.xfail() call must be attributed to its test, "
            f"got: {[n for n, _ in found]!r}"
        )

    def test_runtime_xfail_reason_is_extracted(self) -> None:
        """A runtime xfail's reason is positional, not ``reason=``."""
        found = _markers_in_source(_RUNTIME_XFAIL)

        assert _reason_of(found[0][1]) == (
            "synthetic story 999-5: bailed out at runtime"
        ), "the positional reason of pytest.xfail() must be readable"

    def test_non_quarantine_module_marker_is_ignored(self) -> None:
        """Reject as well as accept: ``pytestmark = pytest.mark.slow`` is fine."""
        assert _markers_in_source(_MODULE_LEVEL_INNOCENT) == []

    def test_module_level_bypass_is_subject_to_the_reason_policy(self) -> None:
        """Discovery is only useful if the found marker feeds the policy.

        An anonymous module-level quarantine must be an offender by the same
        rule that catches an anonymous decorator one.
        """
        anonymous = "import pytest\n\npytestmark = pytest.mark.xfail\n"

        found = _markers_in_source(anonymous)

        assert [name for name, _ in found] == ["<module>"]
        assert not (_reason_of(found[0][1]) or "").strip(), (
            "a bare module-level xfail carries no reason and must be reported "
            "as an anonymous quarantine"
        )

    def test_module_level_markers_are_ast_expressions(self) -> None:
        """The returned node must stay unparseable-back for the offender report.

        ``_iter_quarantine_markers`` callers ``ast.unparse`` the node; returning
        anything else would break the policy tests' error messages.
        """
        for _, node in _markers_in_source(_MODULE_LEVEL_MARK):
            assert isinstance(node, ast.expr)
            assert "mark.xfail" in ast.unparse(node)
