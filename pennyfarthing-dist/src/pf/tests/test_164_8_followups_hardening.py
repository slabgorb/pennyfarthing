"""RED tests for story 164-8: followups.py hardening (four ACs).

AC 1 — Promote _parse_session_deviations to public parse_session_deviations
        (summary.py:164 definition, summary.py:255 + followups.py:23,84 callers).

AC 2 — CWE-22 path-traversal containment on session_path in suggest_followups
        (followups.py:~185): crafted paths outside .session/ are rejected with a
        clean error before .exists()/read.

AC 3 — TypedDict modeling for candidate dicts (two shapes: finding-source and
        deviation-source) and suggestion dicts — FindingCandidateDict,
        DeviationCandidateDict, SuggestionDict must exist with expected keys.

AC 4 — Dedup extends to future.yaml (followups.py:~141): a candidate already
        present in future.initiatives[].epics[].stories[] is NOT re-minted.

All tests written to FAIL on the current implementation (RED state). No
implementation code in this file.
"""

from __future__ import annotations

import ast
import typing
from pathlib import Path

import pytest


# ---------------------------------------------------------------------------
# Module import helpers
# ---------------------------------------------------------------------------


def _followups():
    from pf.findings import followups

    return followups


def _summary():
    from pf.findings import summary

    return summary


# ---------------------------------------------------------------------------
# Session / content fixtures
# ---------------------------------------------------------------------------


def _finding(ftype: str, urgency: str, desc: str) -> str:
    return (
        f"- **{ftype}** ({urgency}): {desc}. "
        f"Affects `src/pf/findings/followups.py` (harden the API). "
        f"*Found by Reviewer during code review.*"
    )


def _deviation(desc: str, forward_impact: str | None = "none") -> str:
    lines = [
        f"- **{desc}**",
        "  - Spec source: context-story-164-8.md",
        '  - Spec text: "harden followups"',
        "  - Implementation: partial hardening only",
        "  - Rationale: time-boxed",
        "  - Severity: minor",
    ]
    if forward_impact is not None:
        lines.append(f"  - Forward impact: {forward_impact}")
    return "\n".join(lines)


def _session_md(
    finding_lines: list[str] | None = None,
    deviation_lines: list[str] | None = None,
    story_id: str = "164-8",
    epic: str = "164",
) -> str:
    findings_block = (
        "\n".join(finding_lines) if finding_lines else "- No upstream findings."
    )
    deviations_block = (
        "\n\n".join(deviation_lines)
        if deviation_lines
        else "- No deviations from spec."
    )
    return (
        "---\n"
        f'story_id: "{story_id}"\n'
        'jira_key: ""\n'
        f'epic: "{epic}"\n'
        'workflow: "tdd"\n'
        "---\n"
        f"# Story {story_id}: Fixture story\n"
        "\n"
        "## Delivery Findings\n"
        "\n"
        "<!-- Agents: append findings below this line. "
        "Do not edit other agents' entries. -->\n"
        "\n"
        "### Reviewer (code review)\n"
        f"{findings_block}\n"
        "\n"
        "## Design Deviations\n"
        "\n"
        "<!-- Agents: append deviations below this line. "
        "Do not edit other agents' entries. -->\n"
        "\n"
        "### Dev (implementation)\n"
        f"{deviations_block}\n"
    )


@pytest.fixture
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Minimal project root: .session/ dir, no sprint data."""
    (tmp_path / "sprint").mkdir()
    (tmp_path / ".session").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


def _write_session(root: Path, content: str, story_id: str = "164-8") -> Path:
    session = root / ".session" / f"{story_id}-session.md"
    session.write_text(content, encoding="utf-8")
    return session


# ---------------------------------------------------------------------------
# AC 1: _parse_session_deviations → parse_session_deviations (public)
# ---------------------------------------------------------------------------


def test_ac1_public_parse_session_deviations_exists_in_summary() -> None:
    """PUBLIC name must be importable from pf.findings.summary.

    FAILS RED: only _parse_session_deviations exists currently.
    """
    sm = _summary()
    assert hasattr(sm, "parse_session_deviations"), (
        "RED 164-8 AC1: pf.findings.summary.parse_session_deviations does not exist — "
        "promote _parse_session_deviations (line 164) to public"
    )


def test_ac1_public_parse_session_deviations_is_callable() -> None:
    """Public function must be callable."""
    sm = _summary()
    fn = getattr(sm, "parse_session_deviations", None)
    assert fn is not None and callable(fn), (
        "RED 164-8 AC1: parse_session_deviations must be callable"
    )


def test_ac1_public_parse_session_deviations_behavior_unchanged() -> None:
    """Behavior must be identical to the private implementation: accepts session
    content string, returns list of deviation dicts with expected keys."""
    sm = _summary()
    fn = getattr(sm, "parse_session_deviations", None)
    if fn is None:
        pytest.fail("RED 164-8 AC1: parse_session_deviations not yet defined")

    content = _session_md(
        deviation_lines=[
            _deviation(
                "Used alternative approach",
                forward_impact="next sprint must revisit the approach",
            )
        ]
    )
    result = fn(content)
    assert isinstance(result, list), f"Expected list, got {type(result)}"
    assert len(result) == 1, f"Expected 1 deviation, got {result}"
    dev = result[0]
    assert dev.get("description") == "Used alternative approach", dev
    assert "forward_impact" in dev, (
        f"Expected 'forward_impact' key in deviation dict, got {dev}"
    )


def test_ac1_public_parse_session_deviations_returns_empty_on_clean_session() -> None:
    """Unchanged behavior: clean session → empty list."""
    sm = _summary()
    fn = getattr(sm, "parse_session_deviations", None)
    if fn is None:
        pytest.fail("RED 164-8 AC1: parse_session_deviations not yet defined")
    result = fn(_session_md())
    assert result == [], f"Expected [], got {result}"


def test_ac1_followups_imports_public_name_not_private() -> None:
    """followups.py:23 must import parse_session_deviations (public).

    FAILS RED: current import is ``from pf.findings.summary import
    _parse_session_deviations`` (private name).
    """
    fu = _followups()
    tree = ast.parse(Path(fu.__file__).read_text(encoding="utf-8"))
    private_imports: list[str] = []
    public_imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.ImportFrom):
            for alias in node.names:
                if alias.name == "_parse_session_deviations":
                    private_imports.append(f"line {node.lineno}: {alias.name}")
                if alias.name == "parse_session_deviations":
                    public_imports.append(f"line {node.lineno}: {alias.name}")
    assert not private_imports, (
        "RED 164-8 AC1: followups.py still imports the private name — "
        f"update import: {private_imports}"
    )
    assert public_imports, (
        "RED 164-8 AC1: followups.py does not import parse_session_deviations "
        "(public) — update import at followups.py:23"
    )


def test_ac1_summary_internal_callers_use_public_name() -> None:
    """summary.py:255 must call parse_session_deviations (public), not the
    private _parse_session_deviations.

    FAILS RED: current call is ``_parse_session_deviations(content)``.
    """
    sm = _summary()
    tree = ast.parse(Path(sm.__file__).read_text(encoding="utf-8"))
    private_calls: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            func = node.func
            name: str | None = None
            if isinstance(func, ast.Attribute):
                name = func.attr
            elif isinstance(func, ast.Name):
                name = func.id
            if name == "_parse_session_deviations":
                private_calls.append(f"line {node.lineno}: {name}()")
    assert not private_calls, (
        "RED 164-8 AC1: summary.py still calls _parse_session_deviations — "
        f"update all call sites to public name: {private_calls}"
    )


# ---------------------------------------------------------------------------
# AC 2: CWE-22 path-traversal containment on session_path
# ---------------------------------------------------------------------------


def test_ac2_traversal_to_existing_outside_file_is_rejected(project: Path) -> None:
    """A path that resolves to an EXISTING FILE outside .session/ must be
    rejected before .exists()/read is attempted.

    FAILS RED: current code calls .exists() without containment check, reads
    the outside file, and returns {success: True}.
    """
    fu = _followups()
    # Create a real file outside .session/ so .exists() returns True on
    # current code — making the traversal a live read, not merely a 404.
    outside = project / "sprint" / "fixture-not-a-session.yaml"
    outside.write_text("future:\n  initiatives: []\n", encoding="utf-8")

    # Craft traversal: .session/../sprint/fixture-not-a-session.yaml
    traversal = project / ".session" / ".." / "sprint" / "fixture-not-a-session.yaml"

    result = fu.suggest_followups(traversal, story_id="164-8", project_root=project)

    assert result["success"] is False, (
        "RED 164-8 AC2: traversal to existing outside file was NOT rejected — "
        "current code reads the file and returns success=True (CWE-22): "
        f"{result}"
    )
    err = (result.get("error") or "").lower()
    assert any(
        kw in err for kw in ("traversal", "outside", "contain", "not within", "invalid")
    ), (
        f"RED 164-8 AC2: error message does not signal a traversal rejection: {err!r}"
    )


def test_ac2_dot_dot_path_component_is_rejected(project: Path) -> None:
    """A path string containing '..' that escapes .session/ must be rejected.

    FAILS RED: current code has no '..' detection before .exists().
    """
    fu = _followups()
    # This path has '..' and escapes .session/ — may or may not exist on the
    # filesystem but must be rejected regardless.
    traversal_str = str(project / ".session" / ".." / "CLAUDE.md")

    result = fu.suggest_followups(traversal_str, story_id="164-8", project_root=project)

    assert result["success"] is False, (
        "RED 164-8 AC2: path with '..' component was not rejected: "
        f"got success=True from {traversal_str!r}"
    )
    err = (result.get("error") or "").lower()
    # Must NOT be a simple "not found" — must signal containment failure.
    assert any(
        kw in err for kw in ("traversal", "outside", "contain", "not within", "invalid")
    ), (
        f"RED 164-8 AC2: error is a generic 'not found', not a traversal rejection: {err!r}"
    )


def test_ac2_inbounds_session_path_still_succeeds(project: Path) -> None:
    """Regression: a legitimate session path inside .session/ must still succeed."""
    fu = _followups()
    session = _write_session(
        project,
        _session_md([_finding("Improvement", "non-blocking", "Widen the archive guard")]),
    )
    result = fu.suggest_followups(session, story_id="164-8", project_root=project)
    assert result["success"] is True, (
        f"RED 164-8 AC2 regression: inbounds session path was rejected: {result}"
    )


# ---------------------------------------------------------------------------
# AC 3: TypedDict modeling for candidate and suggestion dicts
# ---------------------------------------------------------------------------


def test_ac3_finding_candidate_typeddict_exists() -> None:
    """FindingCandidateDict TypedDict must be defined at module level.

    FAILS RED: no such type exists yet in followups.py.
    """
    fu = _followups()
    assert hasattr(fu, "FindingCandidateDict"), (
        "RED 164-8 AC3: FindingCandidateDict not found in pf.findings.followups — "
        "define a TypedDict for finding-source candidate dicts"
    )


def test_ac3_deviation_candidate_typeddict_exists() -> None:
    """DeviationCandidateDict TypedDict must be defined at module level.

    FAILS RED: no such type exists yet in followups.py.
    """
    fu = _followups()
    assert hasattr(fu, "DeviationCandidateDict"), (
        "RED 164-8 AC3: DeviationCandidateDict not found in pf.findings.followups — "
        "define a TypedDict for deviation-source candidate dicts"
    )


def test_ac3_suggestion_typeddict_exists() -> None:
    """SuggestionDict TypedDict must be defined at module level.

    FAILS RED: no such type exists yet in followups.py.
    """
    fu = _followups()
    assert hasattr(fu, "SuggestionDict"), (
        "RED 164-8 AC3: SuggestionDict not found in pf.findings.followups — "
        "define a TypedDict for suggestion dicts"
    )


def test_ac3_finding_candidate_typeddict_has_required_keys() -> None:
    """FindingCandidateDict must declare keys: source, description, type."""
    fu = _followups()
    cls = getattr(fu, "FindingCandidateDict", None)
    if cls is None:
        pytest.fail("RED 164-8 AC3: FindingCandidateDict not defined")
    try:
        hints = typing.get_type_hints(cls)
    except Exception as exc:
        pytest.fail(f"RED 164-8 AC3: get_type_hints(FindingCandidateDict) raised: {exc}")
    for key in ("source", "description", "type"):
        assert key in hints, (
            f"RED 164-8 AC3: FindingCandidateDict missing field {key!r} — "
            f"got fields: {list(hints)}"
        )


def test_ac3_deviation_candidate_typeddict_has_required_keys() -> None:
    """DeviationCandidateDict must declare keys: source, description, forward_impact."""
    fu = _followups()
    cls = getattr(fu, "DeviationCandidateDict", None)
    if cls is None:
        pytest.fail("RED 164-8 AC3: DeviationCandidateDict not defined")
    try:
        hints = typing.get_type_hints(cls)
    except Exception as exc:
        pytest.fail(f"RED 164-8 AC3: get_type_hints(DeviationCandidateDict) raised: {exc}")
    for key in ("source", "description", "forward_impact"):
        assert key in hints, (
            f"RED 164-8 AC3: DeviationCandidateDict missing field {key!r} — "
            f"got fields: {list(hints)}"
        )


def test_ac3_suggestion_typeddict_has_required_keys() -> None:
    """SuggestionDict must declare keys: description, command, provenance, source."""
    fu = _followups()
    cls = getattr(fu, "SuggestionDict", None)
    if cls is None:
        pytest.fail("RED 164-8 AC3: SuggestionDict not defined")
    try:
        hints = typing.get_type_hints(cls)
    except Exception as exc:
        pytest.fail(f"RED 164-8 AC3: get_type_hints(SuggestionDict) raised: {exc}")
    for key in ("description", "command", "provenance", "source"):
        assert key in hints, (
            f"RED 164-8 AC3: SuggestionDict missing field {key!r} — "
            f"got fields: {list(hints)}"
        )


def test_ac3_detect_deferred_followups_return_type_uses_typeddicts() -> None:
    """detect_deferred_followups must declare a return type that references both
    FindingCandidateDict and DeviationCandidateDict, not bare dict.

    Regression guard: a future removal of the annotation will fail this test.
    """
    fu = _followups()
    fn = getattr(fu, "detect_deferred_followups", None)
    assert fn is not None and callable(fn), (
        "AC3 regression: detect_deferred_followups not found"
    )
    try:
        hints = typing.get_type_hints(fn)
    except Exception as exc:
        pytest.fail(
            f"AC3 regression: get_type_hints(detect_deferred_followups) raised: {exc}"
        )
    return_hint = hints.get("return")
    assert return_hint is not None, (
        "AC3 regression: detect_deferred_followups has no return type annotation — "
        "annotate with list[FindingCandidateDict | DeviationCandidateDict]"
    )
    type_str = str(return_hint)
    assert "FindingCandidateDict" in type_str, (
        f"AC3 regression: detect_deferred_followups return type does not reference "
        f"FindingCandidateDict: {type_str}"
    )
    assert "DeviationCandidateDict" in type_str, (
        f"AC3 regression: detect_deferred_followups return type does not reference "
        f"DeviationCandidateDict: {type_str}"
    )


def test_ac3_suggestion_dict_annotation_applied_in_suggest_followups() -> None:
    """SuggestionDict must be used as an annotation inside suggest_followups, not
    just defined at module level.

    Regression guard: a future drop of the annotation will fail this test.
    """
    import inspect

    fu = _followups()
    fn = getattr(fu, "suggest_followups", None)
    assert fn is not None and callable(fn), (
        "AC3 regression: suggest_followups not found"
    )
    source = inspect.getsource(fn)
    assert "SuggestionDict" in source, (
        "AC3 regression: SuggestionDict not used as annotation inside "
        "suggest_followups — annotate the suggestions list or construction site"
    )


# ---------------------------------------------------------------------------
# AC 4: Dedup extends to future.yaml
# ---------------------------------------------------------------------------

_FUTURE_DESC = "Widen the archive guard sweep to cover sibling shards"
_FUTURE_STORY_ID = "200-99"
_FUTURE_EPIC_ID = "200"
_UNRELATED_DESC = "Completely unrelated improvement about pagination limits"


def _future_yaml(story_id: str, story_title: str, epic_id: str = _FUTURE_EPIC_ID) -> str:
    return (
        "future:\n"
        "  initiatives:\n"
        "    - id: future-init-1\n"
        "      title: Future Initiative One\n"
        "      epics:\n"
        f"        - id: {epic_id!r}\n"
        "          title: Future Epic\n"
        "          stories:\n"
        f"            - id: {story_id!r}\n"
        f"              title: {story_title}\n"
        "              points: 3\n"
    )


@pytest.fixture
def project_with_future(project: Path) -> Path:
    """Project root with future.yaml containing one known story; no current sprint."""
    (project / "sprint" / "future.yaml").write_text(
        _future_yaml(_FUTURE_STORY_ID, _FUTURE_DESC),
        encoding="utf-8",
    )
    return project


def test_ac4_candidate_in_future_yaml_is_deduped(project_with_future: Path) -> None:
    """A candidate matching a story in future.yaml must appear in skipped,
    NOT in suggestions.

    FAILS RED: _open_stories() only loads the current sprint, never future.yaml,
    so the candidate is suggested instead of deduped.
    """
    fu = _followups()
    session = _write_session(
        project_with_future,
        _session_md([_finding("Improvement", "non-blocking", _FUTURE_DESC)]),
    )
    result = fu.suggest_followups(
        session, story_id="164-8", project_root=project_with_future
    )
    assert result["success"] is True, result
    data = result["data"]

    suggested_descs = [s["description"] for s in data["suggestions"]]
    assert not any(_FUTURE_DESC in d for d in suggested_descs), (
        "RED 164-8 AC4: candidate already in future.yaml was RE-SUGGESTED — "
        "_open_stories() must scan future.yaml and dedup: " + str(data)
    )
    assert data["skipped"], (
        "RED 164-8 AC4: future.yaml candidate not in skipped list: " + str(data)
    )
    skipped_blob = str(data["skipped"])
    assert _FUTURE_DESC in skipped_blob, (
        "RED 164-8 AC4: skipped list missing future.yaml candidate description: "
        + str(data["skipped"])
    )


def test_ac4_skipped_entry_names_covering_future_story_id(
    project_with_future: Path,
) -> None:
    """The skipped entry for a future.yaml match must name the covering story id.

    FAILS RED: same reason as test_ac4_candidate_in_future_yaml_is_deduped.
    """
    fu = _followups()
    session = _write_session(
        project_with_future,
        _session_md([_finding("Improvement", "non-blocking", _FUTURE_DESC)]),
    )
    result = fu.suggest_followups(
        session, story_id="164-8", project_root=project_with_future
    )
    assert result["success"] is True
    skipped_blob = str(result["data"].get("skipped", []))
    assert _FUTURE_STORY_ID in skipped_blob, (
        f"RED 164-8 AC4: skipped entry does not name covering future story id "
        f"{_FUTURE_STORY_ID!r}: {skipped_blob}"
    )


def test_ac4_no_future_yaml_fails_open_does_not_crash(project: Path) -> None:
    """Regression: when future.yaml is absent, dedup fails open (no crash,
    the candidate is still suggested).

    Fails open = no future.yaml means nothing to dedup against from that source;
    current-sprint dedup still applies (none in this fixture → candidate suggested).
    """
    fu = _followups()
    # project fixture has no future.yaml
    session = _write_session(
        project,
        _session_md([_finding("Improvement", "non-blocking", _FUTURE_DESC)]),
    )
    result = fu.suggest_followups(session, story_id="164-8", project_root=project)
    assert result["success"] is True, (
        "RED 164-8 AC4 regression: absent future.yaml must fail open, not crash: "
        f"{result}"
    )
    # With no sprint or future data, no dedup occurs → candidate is suggested.
    assert len(result["data"]["suggestions"]) == 1, (
        "RED 164-8 AC4 regression: candidate missing when future.yaml absent: "
        + str(result["data"])
    )


def test_ac4_candidate_not_in_future_yaml_is_still_suggested(
    project_with_future: Path,
) -> None:
    """Regression: a candidate that does NOT match any future.yaml story must
    still appear in suggestions (no false-positive dedup)."""
    fu = _followups()
    session = _write_session(
        project_with_future,
        _session_md([_finding("Improvement", "non-blocking", _UNRELATED_DESC)]),
    )
    result = fu.suggest_followups(
        session, story_id="164-8", project_root=project_with_future
    )
    assert result["success"] is True
    suggested_descs = [s["description"] for s in result["data"]["suggestions"]]
    assert any(_UNRELATED_DESC in d for d in suggested_descs), (
        "RED 164-8 AC4 regression: unrelated candidate false-positive deduped "
        "against future.yaml: " + str(result["data"])
    )


def test_ac4_future_yaml_nested_story_is_found() -> None:
    """future.yaml structure: future.initiatives[].epics[].stories[] — the
    iterator must walk all three nesting levels.

    FAILS RED: _open_stories() doesn't visit future.yaml at all.
    """
    fu = _followups()

    # Build a deeper future.yaml with two initiatives, multiple epics.
    future_content = (
        "future:\n"
        "  initiatives:\n"
        "    - id: init-1\n"
        "      title: First Initiative\n"
        "      epics:\n"
        "        - id: '300'\n"
        "          title: Epic 300\n"
        "          stories:\n"
        "            - id: '300-1'\n"
        "              title: Irrelevant story\n"
        "              points: 2\n"
        "    - id: init-2\n"
        "      title: Second Initiative\n"
        "      epics:\n"
        "        - id: '301'\n"
        "          title: Epic 301\n"
        "          stories:\n"
        "            - id: '301-5'\n"
        f"              title: {_FUTURE_DESC}\n"
        "              points: 3\n"
    )

    import pytest as _pytest

    tmp = _pytest.importorskip("pytest").tmp_path if False else None
    # Use tmp_path from a local context — inline the fixture logic.
    import tempfile, os

    with tempfile.TemporaryDirectory() as tmp_dir:
        root = Path(tmp_dir)
        (root / "sprint").mkdir()
        (root / ".session").mkdir()
        (root / "sprint" / "future.yaml").write_text(future_content, encoding="utf-8")

        session = _write_session(
            root,
            _session_md([_finding("Improvement", "non-blocking", _FUTURE_DESC)]),
        )
        result = fu.suggest_followups(session, story_id="164-8", project_root=root)

    assert result["success"] is True
    data = result["data"]
    suggested_descs = [s["description"] for s in data["suggestions"]]
    assert not any(_FUTURE_DESC in d for d in suggested_descs), (
        "RED 164-8 AC4: nested future.yaml story not deduped — "
        "_open_stories must walk initiatives[].epics[].stories[]: " + str(data)
    )
    assert data["skipped"], (
        "RED 164-8 AC4: nested future.yaml story not in skipped: " + str(data)
    )
