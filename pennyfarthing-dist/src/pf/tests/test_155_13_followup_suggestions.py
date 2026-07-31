"""RED tests for story 155-13 (gh #114): auto-suggest follow-up stories at finish
for deferred Delivery Findings / Design Deviations.

AC RECORD (story context delegated AC definition to TEA — this docstring is the
authoritative AC record for 155-13; logged as a Design Deviation in the session):

- AC-1 Detection heuristics. A pure scanner over session markdown finds
  deferral candidates:
    (a) Delivery Finding of type Improvement or Question with urgency
        non-blocking;
    (b) any non-blocking finding whose description carries a deferral tag
        phrase ("follow-up", "later", "future", "defer", "out of scope",
        "tracked");
    (c) Design Deviation whose "Forward impact" names future work (present,
        non-empty, and not "none" case-insensitively).
  Blocking findings are NEVER candidates (blocking work is resolved in-story,
  even when its text mentions a follow-up). Plain non-blocking Gaps without a
  tag phrase are not candidates. "No upstream findings." / "No deviations from
  spec." yield no candidates.

- AC-2 Suggestion block. At sm-finish preflight (before archive_session /
  remove_session — the last moment the session is live), a "Deferred
  follow-ups detected" block lists each candidate with a pre-filled
  `pf sprint story add <epic> "<title>" ...` command the operator can run or
  skip. The epic comes from the session (frontmatter `epic:` field) — never
  from prefix-parsing the story id (155-4 rule).

- AC-3 Deduplication. Before suggesting, candidates are checked against open
  stories in the current sprint (merged view via pf.sprint.loader.load_sprint).
  A candidate already covered by an existing story is reported as skipped —
  naming the covering story id (the answer to "is that tracked? where?") —
  and gets no pre-filled command. When no sprint data is loadable, dedup
  fails OPEN: candidates are still suggested (nothing to dedup against
  must not suppress the report).

- AC-4 Provenance. Every suggestion back-references its source story:
  the literal text "from <STORY_ID>" appears in the pre-filled command itself
  (so the mint carries the audit trail) and in the suggestion's `provenance`
  field.

- AC-5 Non-blocking posture ("suggest" default). The scan is a report, not a
  gate: `suggest_followups` returns `{success: True, ...}` whether or not
  candidates exist, and a missing session file returns
  `{success: False, error: ...}` (return-don't-throw, SOUL #10) rather than
  raising.

DESIGNED INTERFACE (for Dev — tests bind to these names via keyword args):

    # pennyfarthing-dist/src/pf/findings/followups.py
    def detect_deferred_followups(content: str) -> list[dict]:
        # each candidate: {"source": "finding"|"deviation",
        #                  "description": str, ...}

    def suggest_followups(session_path, *, story_id, project_root) -> dict:
        # {"success": bool, "error": ...,
        #  "data": {"candidates": [...],
        #           "suggestions": [{"description", "command", "provenance"}],
        #           "skipped": [{"description", ...covering story id...}],
        #           "markdown": str}}

Wiring: agents/sm-finish.md gains a bash-fenced step invoking
pf.findings.followups through the PF_PY interpreter (same shape as the
Impact Summary step) so the block is emitted during preflight, before the
finish ceremony archives and removes the session.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

DIST_DIR = Path(__file__).resolve().parents[3]
SM_FINISH_TEMPLATE = DIST_DIR / "agents" / "sm-finish.md"

STORY_ID = "200-9"
EPIC_ID = "200"

# Candidate A: exact-title match against the backlog fixture story → dedup-skipped.
OTEL_DESC = "Rename the OTEL span tier label in telemetry"
# Candidate B: shares no meaningful tokens with any fixture story title → suggested.
GUARD_DESC = "Widen the archive guard sweep to cover sibling shards"

COVERING_STORY_ID = "200-1"


def _followups():
    """Import the module under test, failing (not erroring) while it is missing."""
    try:
        from pf.findings import followups
    except ImportError:
        pytest.fail(
            "RED 155-13: pf.findings.followups does not exist yet — implement "
            "detect_deferred_followups(content) and "
            "suggest_followups(session_path, *, story_id, project_root) per the "
            "AC record in this file's docstring"
        )
    return followups


def _finding(ftype: str, urgency: str, desc: str) -> str:
    return (
        f"- **{ftype}** ({urgency}): {desc}. "
        f"Affects `src/pf/frame/otel.py` (rename the span attribute). "
        f"*Found by Reviewer during code review.*"
    )


def _deviation(desc: str, forward_impact: str | None) -> str:
    lines = [
        f"- **{desc}**",
        "  - Spec source: context-story-200-9.md",
        '  - Spec text: "scan every shard"',
        "  - Implementation: scanned only the current shard",
        "  - Rationale: time-boxed to story scope",
        "  - Severity: minor",
    ]
    if forward_impact is not None:
        lines.append(f"  - Forward impact: {forward_impact}")
    return "\n".join(lines)


def _session_md(
    finding_lines: list[str] | None = None,
    deviation_lines: list[str] | None = None,
    story_id: str = STORY_ID,
    epic: str = EPIC_ID,
) -> str:
    findings_block = (
        "\n".join(finding_lines)
        if finding_lines
        else "- No upstream findings."
    )
    deviations_block = (
        "\n\n".join(deviation_lines)
        if deviation_lines
        else "- No deviations from spec."
    )
    # Plain concatenation on purpose: textwrap.dedent over interpolated
    # multi-line blocks silently dedents nothing (TEA gotcha).
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


SPRINT_YAML = f"""sprint:
  name: Followup Test Sprint
  number: 9999
epics:
  - id: "{EPIC_ID}"
    title: Followup fixture epic
    stories:
      - id: "{COVERING_STORY_ID}"
        title: {OTEL_DESC}
        points: 2
        priority: p3
        status: backlog
        workflow: tdd
      - id: "200-2"
        title: Unrelated fixture story about kanban columns
        points: 1
        priority: p3
        status: backlog
        workflow: trivial
"""


@pytest.fixture
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """A minimal project root load_sprint() can read, with .session/ dir.

    PROJECT_ROOT is pinned so an implementation that defaults its sprint
    lookup to get_project_root() still lands on the fixture, never the
    live repo.
    """
    (tmp_path / "sprint").mkdir()
    (tmp_path / "sprint" / "current-sprint.yaml").write_text(
        SPRINT_YAML, encoding="utf-8"
    )
    (tmp_path / ".session").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


def _write_session(root: Path, content: str, story_id: str = STORY_ID) -> Path:
    session = root / ".session" / f"{story_id}-session.md"
    session.write_text(content, encoding="utf-8")
    return session


# ---------------------------------------------------------------------------
# AC-1: detection heuristics (pure scan)
# ---------------------------------------------------------------------------


def test_improvement_nonblocking_is_candidate():
    fu = _followups()
    content = _session_md([_finding("Improvement", "non-blocking", OTEL_DESC)])
    candidates = fu.detect_deferred_followups(content)
    assert len(candidates) == 1, candidates
    assert candidates[0]["source"] == "finding"
    assert OTEL_DESC in candidates[0]["description"]


def test_question_nonblocking_is_candidate():
    fu = _followups()
    content = _session_md(
        [_finding("Question", "non-blocking", "Should the tier rename cascade")]
    )
    candidates = fu.detect_deferred_followups(content)
    assert len(candidates) == 1, candidates
    assert "tier rename cascade" in candidates[0]["description"]


def test_blocking_finding_is_never_candidate():
    # Even when the text mentions a follow-up, blocking work is resolved
    # in-story — it must not be minted into the backlog as a deferral.
    fu = _followups()
    content = _session_md(
        [_finding("Improvement", "blocking", "Fix now, worth a follow-up too")]
    )
    assert fu.detect_deferred_followups(content) == []


def test_plain_nonblocking_gap_is_not_candidate():
    fu = _followups()
    content = _session_md(
        [_finding("Gap", "non-blocking", "Docstring missing on the helper")]
    )
    assert fu.detect_deferred_followups(content) == []


@pytest.mark.parametrize(
    "desc",
    [
        "Span mislabel is worth a follow-up ticket",
        "Rename pass can happen later in the epic",
        "A future guard story should widen this",
        "Team agreed to defer the rename pass",
        "Rename pass is out of scope for this story",
        "Rename pass should be tracked somewhere durable",
    ],
)
def test_tag_phrase_makes_nonblocking_gap_a_candidate(desc: str):
    fu = _followups()
    content = _session_md([_finding("Gap", "non-blocking", desc)])
    candidates = fu.detect_deferred_followups(content)
    assert len(candidates) == 1, (desc, candidates)


def test_deviation_with_future_forward_impact_is_candidate():
    fu = _followups()
    content = _session_md(
        deviation_lines=[
            _deviation(
                GUARD_DESC,
                "epic 160 guard story must widen its scan scope",
            )
        ]
    )
    candidates = fu.detect_deferred_followups(content)
    assert len(candidates) == 1, candidates
    assert candidates[0]["source"] == "deviation"
    assert GUARD_DESC in candidates[0]["description"]


@pytest.mark.parametrize("impact", ["none", "None", "NONE", None])
def test_deviation_without_future_forward_impact_is_not_candidate(
    impact: str | None,
):
    fu = _followups()
    content = _session_md(deviation_lines=[_deviation(GUARD_DESC, impact)])
    assert fu.detect_deferred_followups(content) == []


def test_clean_session_yields_no_candidates():
    fu = _followups()
    assert fu.detect_deferred_followups(_session_md()) == []


# ---------------------------------------------------------------------------
# AC-2 + AC-4: suggestion block, pre-filled command, provenance
# ---------------------------------------------------------------------------


def test_suggestion_has_prefilled_story_add_command(project: Path):
    fu = _followups()
    session = _write_session(
        project,
        _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)]),
    )
    result = fu.suggest_followups(
        session, story_id=STORY_ID, project_root=project
    )
    assert result["success"] is True
    suggestions = result["data"]["suggestions"]
    assert len(suggestions) == 1, suggestions
    command = suggestions[0]["command"]
    # Epic from session frontmatter; quoted title; runnable as-is or after
    # the operator fills placeholders.
    assert f'pf sprint story add {EPIC_ID} "' in command, command
    markdown = result["data"]["markdown"]
    assert re.search(r"(?i)deferred follow-ups? detected", markdown), markdown
    assert command in markdown, markdown


def test_suggestion_carries_provenance_in_command_and_field(project: Path):
    fu = _followups()
    session = _write_session(
        project,
        _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)]),
    )
    result = fu.suggest_followups(
        session, story_id=STORY_ID, project_root=project
    )
    assert result["success"] is True
    suggestion = result["data"]["suggestions"][0]
    # The command itself must carry the back-reference: with the suggest
    # posture, the operator's copy-paste is the only mint path, so provenance
    # not embedded in the command is provenance lost.
    assert f"from {STORY_ID}" in suggestion["command"], suggestion["command"]
    assert STORY_ID in suggestion["provenance"], suggestion


# ---------------------------------------------------------------------------
# AC-3: dedup against open stories — trustworthy, not noisy
# ---------------------------------------------------------------------------


def test_dedup_skips_candidate_covered_by_backlog_story(project: Path):
    fu = _followups()
    session = _write_session(
        project,
        _session_md(
            [
                _finding("Improvement", "non-blocking", OTEL_DESC),
                _finding("Improvement", "non-blocking", GUARD_DESC),
            ]
        ),
    )
    result = fu.suggest_followups(
        session, story_id=STORY_ID, project_root=project
    )
    assert result["success"] is True
    data = result["data"]

    suggested_descs = [s["description"] for s in data["suggestions"]]
    assert any(GUARD_DESC in d for d in suggested_descs), data
    assert not any(OTEL_DESC in d for d in suggested_descs), (
        "candidate already covered by backlog story "
        f"{COVERING_STORY_ID} was re-suggested — dedup missing: {data}"
    )

    assert data["skipped"], data
    skipped_blob = str(data["skipped"])
    assert OTEL_DESC in skipped_blob, data["skipped"]
    # "Is that tracked? WHERE?" — the skip must name the covering story.
    assert COVERING_STORY_ID in skipped_blob, data["skipped"]

    # No pre-filled command for the deduped candidate anywhere in the block.
    assert OTEL_DESC not in "".join(
        s["command"] for s in data["suggestions"]
    ), data["suggestions"]


def test_dedup_fails_open_without_sprint_data(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
):
    # No sprint/ dir at all: nothing to dedup against must not suppress the
    # report (an empty project still deserves the suggestion block).
    fu = _followups()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    (tmp_path / ".session").mkdir()
    session = _write_session(
        tmp_path,
        _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)]),
    )
    result = fu.suggest_followups(
        session, story_id=STORY_ID, project_root=tmp_path
    )
    assert result["success"] is True
    assert len(result["data"]["suggestions"]) == 1, result["data"]


# ---------------------------------------------------------------------------
# AC-5: non-blocking posture, return-don't-throw
# ---------------------------------------------------------------------------


def test_clean_session_reports_success_with_no_suggestions(project: Path):
    fu = _followups()
    session = _write_session(project, _session_md())
    result = fu.suggest_followups(
        session, story_id=STORY_ID, project_root=project
    )
    assert result["success"] is True
    assert result["data"]["suggestions"] == []
    assert "story add" not in result["data"]["markdown"].lower()


def test_missing_session_returns_error_result(project: Path):
    fu = _followups()
    missing = project / ".session" / "999-1-session.md"
    result = fu.suggest_followups(
        missing, story_id="999-1", project_root=project
    )
    assert result["success"] is False
    assert result.get("error"), result


# ---------------------------------------------------------------------------
# Wiring + hygiene
# ---------------------------------------------------------------------------


def test_sm_finish_template_wires_followups_scan():
    """The scan must run at sm-finish preflight — a module nobody invokes is
    a feature nobody gets. Mirrors the Impact Summary wiring shape."""
    text = SM_FINISH_TEMPLATE.read_text(encoding="utf-8")
    assert "pf.findings.followups" in text, (
        "agents/sm-finish.md never invokes pf.findings.followups — the "
        "deferral scan is not wired into the finish preflight"
    )
    fences = re.findall(r"```bash\n(.*?)```", text, re.DOTALL)
    wired = [f for f in fences if "pf.findings.followups" in f]
    assert wired, (
        "pf.findings.followups is mentioned in sm-finish.md but not inside a "
        "```bash fence — the subagent only executes fenced steps"
    )
    for fence in wired:
        assert "PF_PY" in fence, (
            "followups fence must route through the PF_PY interpreter "
            f"(155-11 discipline):\n{fence}"
        )


def test_followups_module_hygiene():
    """Rule #5: read_text/open need encoding=. Rule #2: no mutable defaults."""
    fu = _followups()
    tree = ast.parse(Path(fu.__file__).read_text(encoding="utf-8"))

    offenders: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = None
            if isinstance(node.func, ast.Attribute):
                name = node.func.attr
            elif isinstance(node.func, ast.Name):
                name = node.func.id
            if name in ("read_text", "open"):
                kwargs = {kw.arg for kw in node.keywords}
                if "encoding" not in kwargs:
                    offenders.append(
                        f"line {node.lineno}: {name}() without encoding="
                    )
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            for default in list(node.args.defaults) + [
                d for d in node.args.kw_defaults if d is not None
            ]:
                if isinstance(default, (ast.List, ast.Dict, ast.Set)):
                    offenders.append(
                        f"line {node.lineno}: {node.name}() mutable default"
                    )
    assert offenders == [], offenders
