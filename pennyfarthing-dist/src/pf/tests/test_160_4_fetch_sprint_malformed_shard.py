"""RED tests for story 160-4 (gh #50, from 156-4 review finding M1).

Bug: pf/frame/ws_push.py:fetch_sprint() defines a nested ``_load_file(path)``
that catches *all* parse errors and returns ``None``::

    def _load_file(path):
        try:
            return yaml.safe_load(path.read_text()) or {}
        except Exception:
            return None

When a shard file EXISTS but is malformed, ``_load_file`` returns ``None``;
``merge_epic_shards`` then hits ``if epic_data is None: continue`` and the
shard vanishes from the merged sprint with NO warning. The missing-FILE case
already warns (shard_merge.py: "Sprint epic ref '<ref>' not found"), but the
present-but-malformed case is a silent drop — a fail-loud violation (gh #50).

A second variant: a shard that PARSES to a non-dict scalar (e.g. a bare YAML
string) is returned verbatim by ``_load_file``, then ``merge_epic_shards``
calls ``.get`` on it and raises ``AttributeError``, which the runtime swallows
in ``send_initial_data``'s broad ``except`` — so the whole panel silently goes
blank. That non-dict case must also be surfaced, not silently dropped/crashed.

Surfacing mechanism — pinned to the module's adjacent prior art: the
missing-ref and orphan-shard paths in shard_merge.py all use
``warnings.warn(...)``. These tests therefore assert via ``pytest.warns`` so
Dev's GREEN matches the existing surfacing convention for consistency.

fetch_sprint() takes NO args; it resolves the project dir via
FRAME_PROJECT_DIR -> PF_PROJECT_DIR -> cwd. The ``project_dir`` fixture points
that env var at a tmp tree and clears PF_PROJECT_DIR so each fetch is isolated.

DESIGNED INTERFACE (for Dev / GREEN):
- On a present-but-unparseable shard, fetch_sprint must emit a warning (via
  ``warnings.warn``) that names the shard file (``epic-<ref>.yaml`` or its
  path) AND references the parse problem. The other shards must still load and
  the payload must still return (warn, don't crash — AC2).
- On a shard that parses to a non-dict (scalar/list), fetch_sprint must emit a
  warning identifying the shard, must not crash, and must not silently treat it
  as an empty/loaded epic.
- Missing-file behavior is UNCHANGED: the existing "not found" missing-ref
  warning still fires for a referenced shard whose file is absent, and the NEW
  malformed/parse warning must NOT fire for that case.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.frame.ws_push import fetch_sprint

# Regex fragments matched against emitted warning text.
# A malformed/parse-failure warning must NOT look like the pre-existing
# missing-file ("not found") warning — it has to surface the parse failure.
_MALFORMED_PAT = r"epic-99\.yaml"
_PARSE_PROBLEM_PAT = r"(?i)(pars|malform|load|yaml|invalid)"
_NON_DICT_PAT = r"(?i)(non-?dict|not a (?:dict|mapping)|scalar|mapping|dict)"
_MISSING_PAT = r"(?i)not found"


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False))


@pytest.fixture
def project_dir(tmp_path, monkeypatch):
    """A tmp project root wired so fetch_sprint() reads from it."""
    monkeypatch.setenv("FRAME_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
    (tmp_path / "sprint").mkdir()
    return tmp_path


SPRINT_HEADER = {
    "name": "Test Sprint",
    "goal": "exercise fetch_sprint malformed-shard surfacing",
    "status": "active",
    "number": 9001,
}


def _good_shard(eid: str, status: str = "in_progress") -> dict:
    return {
        "id": eid,
        "type": "epic",
        "title": f"Epic {eid}",
        "status": status,
        "stories": [{"id": f"{eid}-1", "title": "s", "points": 1, "status": status}],
    }


# ---------------------------------------------------------------------------
# AC1 — malformed-but-present shard surfaces a warning naming path + problem
# ---------------------------------------------------------------------------


def test_ac1_malformed_present_shard_emits_warning(project_dir):
    """A referenced shard that exists but fails to parse must warn (not drop).

    RED: today _load_file swallows the parse error -> None -> merge_epic_shards
    silently `continue`s -> zero warnings, epic gone.
    """
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": ["99"], "stories": []},
    )
    # Invalid YAML (bad indentation / stray colons) — present but unparseable.
    (project_dir / "sprint" / "epic-99.yaml").write_text(
        "id: 99\ntitle: broken\n  bad: : indent::\n"
    )

    with pytest.warns(UserWarning, match=_MALFORMED_PAT):
        fetch_sprint()


def test_ac1_malformed_warning_names_parse_problem(project_dir):
    """The warning must reference the parse problem, not just say 'not found'.

    Distinguishes a malformed-present shard from the pre-existing missing-file
    warning so the operator can tell the two apart.
    """
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": ["99"], "stories": []},
    )
    (project_dir / "sprint" / "epic-99.yaml").write_text(
        "id: 99\ntitle: broken\n  bad: : indent::\n"
    )

    with pytest.warns(UserWarning) as record:
        fetch_sprint()

    msgs = [str(w.message) for w in record]
    assert any(_MALFORMED_PAT_match(m) for m in msgs), (
        f"no warning named the malformed shard file; warnings={msgs!r}"
    )
    # And it must surface the *parse* nature, not masquerade as missing-file.
    import re

    assert any(
        re.search(_MALFORMED_PAT, m) and re.search(_PARSE_PROBLEM_PAT, m) for m in msgs
    ), f"warning did not surface the parse problem; warnings={msgs!r}"


def _MALFORMED_PAT_match(text: str) -> bool:
    import re

    return bool(re.search(_MALFORMED_PAT, text))


# ---------------------------------------------------------------------------
# AC2 — warn, don't crash: sibling shards still load, payload still returns
# ---------------------------------------------------------------------------


def test_ac2_other_shards_still_load_when_one_is_malformed(project_dir):
    """One malformed shard must not take down the other (valid) shards.

    fetch_sprint must still return a payload with the healthy epic present.
    """
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": ["99", "88"], "stories": []},
    )
    (project_dir / "sprint" / "epic-99.yaml").write_text(
        "id: 99\ntitle: broken\n  bad: : indent::\n"
    )
    _write_yaml(project_dir / "sprint" / "epic-88.yaml", _good_shard("88"))

    # pytest.warns asserts the malformed shard surfaced AND that fetch_sprint
    # returned normally (warn, not raise).
    with pytest.warns(UserWarning, match=_MALFORMED_PAT):
        result = fetch_sprint()

    active_ids = [e.get("id") for e in result["epics"]]
    assert "88" in active_ids, (
        f"healthy sibling shard dropped when sibling was malformed; got {active_ids!r}"
    )


# ---------------------------------------------------------------------------
# AC3 — shard that parses to a NON-DICT scalar is surfaced, not crashed/dropped
# ---------------------------------------------------------------------------


def test_ac3_non_dict_scalar_shard_is_surfaced(project_dir):
    """A shard whose YAML is a bare scalar (not a mapping) must warn, not crash.

    RED: today _load_file returns the scalar verbatim; merge_epic_shards then
    calls .get() on a str -> AttributeError (swallowed at runtime => blank
    panel). Dev must detect the non-dict and surface it via a warning while
    keeping the rest of the fetch alive.
    """
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": ["99", "88"], "stories": []},
    )
    # Valid YAML, but the top-level document is a scalar string, not a mapping.
    (project_dir / "sprint" / "epic-99.yaml").write_text("just a bare scalar string\n")
    _write_yaml(project_dir / "sprint" / "epic-88.yaml", _good_shard("88"))

    with pytest.warns(UserWarning, match=_MALFORMED_PAT):
        result = fetch_sprint()  # must NOT raise

    active_ids = [e.get("id") for e in result["epics"]]
    assert "88" in active_ids, (
        f"healthy sibling dropped alongside non-dict shard; got {active_ids!r}"
    )
    # The scalar must not have been smuggled in as an epic.
    assert "99" not in active_ids


# ---------------------------------------------------------------------------
# AC4 — missing-file behavior UNCHANGED (existing warn-on-missing-ref only)
# ---------------------------------------------------------------------------


def test_ac4_missing_file_still_warns_not_found_only(project_dir):
    """A referenced-but-absent shard keeps the pre-existing 'not found' warning
    and must NOT additionally trip the new malformed/parse warning."""
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": ["77"], "stories": []},
    )
    # No epic-77.yaml written.

    with pytest.warns(UserWarning, match=_MISSING_PAT) as record:
        fetch_sprint()

    import re

    msgs = [str(w.message) for w in record]
    # The missing-file warning fires...
    assert any(re.search(_MISSING_PAT, m) for m in msgs), (
        f"missing-ref warning regressed; warnings={msgs!r}"
    )
    # ...and the new malformed-parse warning does NOT fire for a missing file.
    assert not any(
        re.search(_PARSE_PROBLEM_PAT, m) and not re.search(_MISSING_PAT, m)
        for m in msgs
    ), f"missing file wrongly reported as a parse failure; warnings={msgs!r}"


# ---------------------------------------------------------------------------
# AC5 — regression: all-healthy shards/inline epics emit NO spurious warnings
# ---------------------------------------------------------------------------


def test_ac5_healthy_shards_emit_no_warning(project_dir, recwarn):
    """Well-formed shard + inline epics must not trip any malformed warning."""
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": ["88"], "stories": []},
    )
    _write_yaml(project_dir / "sprint" / "epic-88.yaml", _good_shard("88"))

    result = fetch_sprint()

    assert [e.get("id") for e in result["epics"]] == ["88"]
    import re

    spurious = [
        str(w.message)
        for w in recwarn.list
        if re.search(_PARSE_PROBLEM_PAT, str(w.message))
        or re.search(_NON_DICT_PAT, str(w.message))
    ]
    assert not spurious, f"healthy shard emitted spurious warning(s): {spurious!r}"
