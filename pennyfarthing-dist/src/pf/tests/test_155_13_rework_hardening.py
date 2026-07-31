"""Rework RED for story 155-13, round 1 — pins the Reviewer's confirmed findings.

REVIEWER FINDINGS PINNED (see 155-13 session, Reviewer Assessment):

- [HIGH-1] Command injection surface: `epic` interpolated unquoted/unsanitized
  (probe: epic frontmatter `200; rm -rf ~` renders verbatim into the command);
  missing-epic sentinel `<epic>` is live shell redirection syntax; `!`
  (histexpand) unneutralized in the quoted title; no CWE-88 leading-dash guard.
  CONTRACT: every emitted command fullmatches the SAFE GRAMMAR
  `pf sprint story add <charset-epic> "<neutralized-title>" <digits>`; a
  candidate whose epic can't be rendered safely may lose its command but must
  NEVER lose its markdown listing (a deferral silently dropped is the exact
  failure this feature exists to prevent).

- [HIGH-2] Result-object contract: unguarded `read_text` and unguarded
  `get_project_root()` raise (probes: UnicodeDecodeError on undecodable bytes;
  FileNotFoundError when invoked with no project_root from a marker-less cwd —
  the LIVE sm-finish fence path). CONTRACT: unreadable session →
  {success: False, error}; unresolvable project root → fail-OPEN like missing
  sprint data ({success: True}, suggestions intact, dedup skipped) because the
  root is only needed for dedup and this is a report, not a gate.

- [MEDIUM] Mutation pins the round-1 suite lacked: sanitized title text must
  appear in the command; metachar descriptions must be neutralized; the
  "Already tracked" markdown section must name the covering story.

- [MEDIUM] SOUL #2 delegation (AST, 155-8 precedent — behavioral oracles pass
  on copied logic, structural pins force actual delegation): epic extraction
  must call the package's `_parse_frontmatter`; status openness must route
  through `normalize_status` (behavioral alias pin: status "in-review" must
  still dedup).

- [LOW] Word-boundary tag phrases: "untracked" must not match "tracked",
  with a positive control.

Newline-in-description is NOT tested: R1 findings and deviation fields are
parsed line-wise upstream, so a newline cannot reach the command builder.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

import pytest

STORY_ID = "200-9"
EPIC_ID = "200"

GUARD_DESC = "Widen the archive guard sweep to cover sibling shards"

# Safe grammar for every emitted command: epic that CANNOT be option-shaped
# (non-dash first char — CWE-88, since epic is the unquoted first positional to
# a Click command with value-taking options), double-quoted title free of
# quote/backtick/dollar/backslash/newline/histexpand chars and not option-shaped,
# digit points. NB: the epic segment is anchored to a non-dash first char — a
# grammar that mirrored the buggy `[A-Za-z0-9._-]+` allowlist could not catch a
# leading-dash epic (155-13 r2 review finding [HIGH-B]).
SAFE_COMMAND = re.compile(
    r'^pf sprint story add [A-Za-z0-9][A-Za-z0-9._-]* "[^"`$\\\n!][^"`$\\\n!]*" \d+$'
)


def _followups():
    from pf.findings import followups

    return followups


def _finding(ftype: str, urgency: str, desc: str) -> str:
    return (
        f"- **{ftype}** ({urgency}): {desc}. "
        f"Affects `src/pf/frame/otel.py` (rename the span attribute). "
        f"*Found by Reviewer during code review.*"
    )


def _session_md(
    finding_lines: list[str],
    story_id: str = STORY_ID,
    epic_line: str | None = f'epic: "{EPIC_ID}"',
) -> str:
    frontmatter = "---\n" + f'story_id: "{story_id}"\n'
    if epic_line is not None:
        frontmatter += epic_line + "\n"
    frontmatter += 'workflow: "tdd"\n---\n'
    return (
        frontmatter
        + f"# Story {story_id}: Fixture story\n"
        + "\n## Delivery Findings\n\n"
        + "<!-- Agents: append findings below this line. "
        + "Do not edit other agents' entries. -->\n\n"
        + "### Reviewer (code review)\n"
        + "\n".join(finding_lines)
        + "\n"
    )


@pytest.fixture
def project(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    (tmp_path / ".session").mkdir()
    monkeypatch.setenv("PROJECT_ROOT", str(tmp_path))
    return tmp_path


def _write_session(root: Path, content: str, story_id: str = STORY_ID) -> Path:
    session = root / ".session" / f"{story_id}-session.md"
    session.write_text(content, encoding="utf-8")
    return session


def _suggest(fu, session: Path, root: Path) -> dict:
    return fu.suggest_followups(session, story_id=STORY_ID, project_root=root)


# ---------------------------------------------------------------------------
# HIGH-1: the generated command is a hardened surface
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("epic_line", "desc"),
    [
        (f'epic: "{EPIC_ID}"', GUARD_DESC),
        (f'epic: "{EPIC_ID}"', 'Sweep `rm -rf` docs with "$HOME" and back\\slash'),
        (f'epic: "{EPIC_ID}"', "This really needs a follow-up!"),
        ('epic: "200; rm -rf ~"', GUARD_DESC),
        (None, GUARD_DESC),
    ],
    ids=["plain", "metachar-desc", "histexpand", "malicious-epic", "missing-epic"],
)
def test_every_emitted_command_matches_safe_grammar(
    project: Path, epic_line: str | None, desc: str
) -> None:
    """Any command the block emits must be paste-safe; a candidate whose
    command cannot be rendered safely must still be listed in the markdown."""
    fu = _followups()
    session = _write_session(
        project,
        _session_md([_finding("Improvement", "non-blocking", desc)], epic_line=epic_line),
    )
    result = _suggest(fu, session, project)
    assert result["success"] is True
    data = result["data"]
    for suggestion in data["suggestions"]:
        command = suggestion.get("command")
        if command:
            assert SAFE_COMMAND.fullmatch(command), (
                f"unsafe command emitted: {command!r}"
            )
    # The deferral itself must never silently vanish from the report.
    assert desc.split("`")[0].split('"')[0].strip()[:20] in data["markdown"] or (
        data["suggestions"] and data["skipped"] == []
    ), data["markdown"]


def test_malicious_epic_payload_never_reaches_a_command(project: Path) -> None:
    fu = _followups()
    session = _write_session(
        project,
        _session_md(
            [_finding("Improvement", "non-blocking", GUARD_DESC)],
            epic_line='epic: "200; rm -rf ~"',
        ),
    )
    result = _suggest(fu, session, project)
    assert result["success"] is True
    blob = "\n".join(
        s.get("command") or "" for s in result["data"]["suggestions"]
    ) + result["data"]["markdown"]
    assert "; rm -rf" not in blob, blob
    assert GUARD_DESC in result["data"]["markdown"]


def test_missing_epic_emits_no_shell_active_placeholder(project: Path) -> None:
    """`<epic>` pasted verbatim is a shell redirection — forbid it anywhere
    a command appears; the candidate stays visible in the markdown."""
    fu = _followups()
    session = _write_session(
        project,
        _session_md(
            [_finding("Improvement", "non-blocking", GUARD_DESC)], epic_line=None
        ),
    )
    result = _suggest(fu, session, project)
    assert result["success"] is True
    for suggestion in result["data"]["suggestions"]:
        command = suggestion.get("command")
        if command:
            assert "<epic>" not in command, command
            assert SAFE_COMMAND.fullmatch(command), command
    assert GUARD_DESC in result["data"]["markdown"]


def test_dash_leading_description_is_not_option_shaped(project: Path) -> None:
    """CWE-88: a title argv beginning with '-' is parsed by click as a flag
    (contrast preflight/finish.py::_reject_option_like precedent)."""
    fu = _followups()
    session = _write_session(
        project,
        _session_md(
            [_finding("Improvement", "non-blocking", "--force the rename cascade")]
        ),
    )
    result = _suggest(fu, session, project)
    assert result["success"] is True
    for suggestion in result["data"]["suggestions"]:
        command = suggestion.get("command")
        if command:
            title_match = re.search(r'"([^"]*)"', command)
            assert title_match, command
            assert not title_match.group(1).startswith("-"), command


@pytest.mark.parametrize(
    "malicious_story_id",
    [
        '9" ; touch /tmp/PWNED ; echo "',
        "9$(id)",
        "9`whoami`",
        "9\\bad",
    ],
    ids=["quote-break", "cmdsub-dollar", "cmdsub-backtick", "backslash"],
)
def test_story_id_cannot_inject_into_command(
    project: Path, malicious_story_id: str
) -> None:
    """[HIGH-A] story_id lands in `provenance`, spliced into the SAME
    double-quoted title as the sanitized description. It must be neutralized
    too — every emitted command must still match the safe grammar."""
    fu = _followups()
    session = _write_session(
        project, _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)])
    )
    result = fu.suggest_followups(
        session, story_id=malicious_story_id, project_root=project
    )
    assert result["success"] is True
    for suggestion in result["data"]["suggestions"]:
        command = suggestion.get("command")
        if command:
            assert SAFE_COMMAND.fullmatch(command), (
                f"story_id injection reached command: {command!r}"
            )
            # The specific break sequences must not survive into the command.
            for danger in ('" ;', "$(", "`", "\\"):
                assert danger not in command, command


@pytest.mark.parametrize(
    "dash_epic",
    ['epic: "--sprint-file"', 'epic: "--dry-run"', 'epic: "-rf"'],
    ids=["sprint-file", "dry-run", "rf"],
)
def test_leading_dash_epic_never_reaches_a_command(
    project: Path, dash_epic: str
) -> None:
    """[HIGH-B] CWE-88: epic is the unquoted first positional to a Click
    command with value-taking options (--sprint-file, --jira, ...). An
    option-shaped epic must be rejected (command suppressed), never emitted
    unquoted where Click would consume the title as its option value."""
    fu = _followups()
    session = _write_session(
        project,
        _session_md(
            [_finding("Improvement", "non-blocking", GUARD_DESC)], epic_line=dash_epic
        ),
    )
    result = fu.suggest_followups(session, story_id=STORY_ID, project_root=project)
    assert result["success"] is True
    for suggestion in result["data"]["suggestions"]:
        command = suggestion.get("command")
        assert command is None, (
            f"option-shaped epic reached a command: {command!r}"
        )
    # Deferral still visible for manual minting.
    assert GUARD_DESC in result["data"]["markdown"]


def test_sanitized_title_text_present_in_command(project: Path) -> None:
    """Mutation pin: an implementation that interpolates an empty title must
    fail — the operator pastes the title, it IS the deliverable."""
    fu = _followups()
    session = _write_session(
        project, _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)])
    )
    result = _suggest(fu, session, project)
    commands = [s.get("command") or "" for s in result["data"]["suggestions"]]
    assert any(GUARD_DESC in c for c in commands), commands


def test_metachar_description_neutralized_but_prose_survives(project: Path) -> None:
    fu = _followups()
    desc = 'Sweep `rm -rf` docs with "$HOME" and back\\slash'
    session = _write_session(
        project, _session_md([_finding("Improvement", "non-blocking", desc)])
    )
    result = _suggest(fu, session, project)
    commands = [s.get("command") or "" for s in result["data"]["suggestions"]]
    assert commands and commands[0], result["data"]
    title = re.search(r'"([^"]*)"', commands[0])
    assert title, commands[0]
    for ch in ("`", "$", "\\", '"'):
        assert ch not in title.group(1), commands[0]
    # The neutralized prose still identifies the work.
    assert "docs with" in commands[0], commands[0]


# ---------------------------------------------------------------------------
# HIGH-2: result-object contract on the failure taxonomy + live fence path
# ---------------------------------------------------------------------------


def test_undecodable_session_returns_error_result(project: Path) -> None:
    session = project / ".session" / f"{STORY_ID}-session.md"
    session.write_bytes(b'---\nepic: "200"\n---\ncaf\xe9 \xff\xfe\n')
    fu = _followups()
    result = _suggest(fu, session, project)
    assert result["success"] is False
    assert "session" in (result.get("error") or "").lower(), result


@pytest.mark.skipif(
    __import__("os").geteuid() == 0, reason="chmod 000 is ineffective as root"
)
def test_permission_denied_session_returns_error_result(project: Path) -> None:
    fu = _followups()
    session = _write_session(
        project, _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)])
    )
    session.chmod(0o000)
    try:
        result = _suggest(fu, session, project)
    finally:
        session.chmod(0o644)
    assert result["success"] is False
    assert result.get("error"), result


def test_rootless_default_project_root_fails_open(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The LIVE sm-finish fence passes no project_root. From a marker-less
    cwd, get_project_root() raises — the report must instead fail OPEN
    (root is only needed for dedup; a deferral must not be lost to it)."""
    fu = _followups()
    monkeypatch.delenv("PROJECT_ROOT", raising=False)
    monkeypatch.delenv("CLAUDE_PROJECT_DIR", raising=False)
    monkeypatch.chdir(tmp_path)
    (tmp_path / ".session").mkdir()
    session = _write_session(
        tmp_path, _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)])
    )
    result = fu.suggest_followups(session, story_id=STORY_ID)
    assert result["success"] is True, result
    assert len(result["data"]["suggestions"]) == 1, result["data"]


# ---------------------------------------------------------------------------
# MEDIUM: markdown pins + SOUL #2 delegation + status alias
# ---------------------------------------------------------------------------


def _sprint_yaml(status: str) -> str:
    return (
        "sprint:\n  name: Rework Fixture Sprint\n  number: 9999\n"
        "epics:\n"
        f'  - id: "{EPIC_ID}"\n'
        "    title: Rework fixture epic\n"
        "    stories:\n"
        '      - id: "200-1"\n'
        f"        title: {GUARD_DESC}\n"
        "        points: 2\n"
        "        priority: p3\n"
        f"        status: {status}\n"
        "        workflow: tdd\n"
    )


def test_already_tracked_markdown_names_covering_story(project: Path) -> None:
    (project / "sprint").mkdir()
    (project / "sprint" / "current-sprint.yaml").write_text(
        _sprint_yaml("backlog"), encoding="utf-8"
    )
    fu = _followups()
    session = _write_session(
        project, _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)])
    )
    result = _suggest(fu, session, project)
    markdown = result["data"]["markdown"]
    assert re.search(r"(?i)already tracked", markdown), markdown
    assert "200-1" in markdown, markdown


def test_alias_spelled_status_still_dedups(project: Path) -> None:
    """A story recorded as "in-review" (the alias normalize_status exists
    for) is open — it must suppress the duplicate suggestion."""
    (project / "sprint").mkdir()
    (project / "sprint" / "current-sprint.yaml").write_text(
        _sprint_yaml("in-review"), encoding="utf-8"
    )
    fu = _followups()
    session = _write_session(
        project, _session_md([_finding("Improvement", "non-blocking", GUARD_DESC)])
    )
    result = _suggest(fu, session, project)
    assert result["data"]["skipped"], result["data"]
    assert result["data"]["suggestions"] == [], result["data"]


def test_epic_extraction_delegates_to_frontmatter_parser() -> None:
    """155-8 structural precedent: behavioral oracles pass on copied logic;
    only a real Call to the package's frontmatter parser satisfies SOUL #2."""
    fu = _followups()
    tree = ast.parse(Path(fu.__file__).read_text(encoding="utf-8"))
    calls = [
        (node.func.attr if isinstance(node.func, ast.Attribute) else
         node.func.id if isinstance(node.func, ast.Name) else "")
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
    ]
    assert any(name.endswith("parse_frontmatter") for name in calls), (
        "followups.py must delegate epic extraction to the package's "
        "_parse_frontmatter (findings/aggregate.py), not a hand-rolled regex"
    )


def test_status_check_delegates_to_normalize_status() -> None:
    fu = _followups()
    tree = ast.parse(Path(fu.__file__).read_text(encoding="utf-8"))
    calls = [
        (node.func.attr if isinstance(node.func, ast.Attribute) else
         node.func.id if isinstance(node.func, ast.Name) else "")
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
    ]
    assert "normalize_status" in calls, (
        "_open_stories must route status membership through "
        "pf.sprint.status_normalize.normalize_status (SOUL #2)"
    )


# ---------------------------------------------------------------------------
# LOW: word-boundary tag phrases
# ---------------------------------------------------------------------------


def test_tag_phrase_untracked_is_not_tracked() -> None:
    fu = _followups()
    content = (
        '---\nstory_id: "200-9"\nepic: "200"\n---\n# t\n\n## Delivery Findings\n\n'
        "<!-- m -->\n\n### Reviewer (code review)\n"
        + _finding("Gap", "non-blocking", "Handle untracked files cleanly")
        + "\n"
    )
    assert fu.detect_deferred_followups(content) == []


def test_tag_phrase_tracked_positive_control() -> None:
    fu = _followups()
    content = (
        '---\nstory_id: "200-9"\nepic: "200"\n---\n# t\n\n## Delivery Findings\n\n'
        "<!-- m -->\n\n### Reviewer (code review)\n"
        + _finding("Gap", "non-blocking", "This should be tracked in the backlog")
        + "\n"
    )
    assert len(fu.detect_deferred_followups(content)) == 1
