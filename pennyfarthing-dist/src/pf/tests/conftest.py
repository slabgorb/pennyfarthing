"""Pytest configuration for pf tests.

Story 63-9: Reorganize pf into fan-out CLI pattern.
Story 126-1: Updated for src/ layout migration.
Story 162-49: Added `pf_project_dir` — a hermetic PF_PROJECT_DIR fixture so
frame-route results can never depend on the cwd pytest was invoked from.
"""

import sys
import textwrap
from collections.abc import Generator
from pathlib import Path

import pytest

# Project root (where pyproject.toml lives): src/pf/tests -> src/pf -> src -> pennyfarthing-dist
PROJECT_ROOT = Path(__file__).resolve().parents[3]

# For src-layout, add src/ to sys.path so "import pf" resolves to src/pf/
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))


@pytest.fixture(autouse=True)
def _no_real_tmux(monkeypatch):
    """Block all real tmux calls globally.

    Every tmux interaction goes through pf.tmux.panes._run_tmux.
    Mock it to return a safe error dict so no panes are ever spawned.
    """
    from unittest.mock import MagicMock

    mock = MagicMock(return_value={"success": False, "error": "blocked by test fixture"})
    monkeypatch.setattr("pf.tmux.panes._run_tmux", mock)


@pytest.fixture(autouse=True)
def textual_app_context():
    """Provide a Textual app context for all tests.

    Many Textual widgets (Input, Switch, Select) access self.app during
    initialization. This sets the active_app context variable so widgets
    can be created outside a running event loop.
    """
    from unittest.mock import MagicMock, PropertyMock, patch

    from textual._context import active_app, active_message_pump
    from textual.app import App

    class _MinimalApp(App):
        pass

    app = _MinimalApp()
    # Mock the screen property to avoid ScreenStackError
    mock_screen = MagicMock()
    mock_screen.scroll_target_y = 0
    with patch.object(type(app), "screen", new_callable=PropertyMock, return_value=mock_screen):
        token = active_app.set(app)
        pump_token = active_message_pump.set(app)
        yield app
        active_message_pump.reset(pump_token)
        active_app.reset(token)


@pytest.fixture
def project_root() -> Path:
    """Return the project root path."""
    return PROJECT_ROOT


# ---------------------------------------------------------------------------
# Story 162-49: cwd-independent project-dir fixture
# ---------------------------------------------------------------------------
#
# `pf.frame.routes.data_proxy._get_project_dir()` resolves the project directory
# from ``PF_PROJECT_DIR`` and falls back to ``os.getcwd()``. Because the fallback
# won, the frame-route suite silently changed shape with the invocation cwd:
# from the orchestrator root the persona route reached its `load_persona(...)`
# call and blew up, while from `pennyfarthing-dist/` no `.pennyfarthing/` was
# found above the cwd, the route short-circuited to 404, and the very same tests
# passed VACUOUSLY (6119 passed / 4 failed from one cwd vs 6123 / 0 from the
# other). Suite counts that depend on the shell's cwd are not evidence.
#
# `pf_project_dir` removes that degree of freedom: it builds a complete, hermetic
# Pennyfarthing project under tmp_path, points PF_PROJECT_DIR at it, and clears
# every other ambient variable that could redirect project-root resolution
# (PROJECT_ROOT, CLAUDE_PROJECT_DIR, PF_THEME, SESSION_ID). Tests that go through
# a frame route should depend on this fixture — one fixture, not a monkeypatch
# copy-pasted into each test.

TEST_THEME = "conftest-test-theme"

_TEST_THEME_YAML = """\
id: conftest-test-theme
name: Conftest Test Theme
tier: test
user_title: Test Pilot
agents:
  dev:
    character: Ada Lovelace
    style: precise and unhurried
    role: Developer
    quote: First, make it correct.
    trait: methodical
    quirk: annotates everything
    motto: Correctness before speed.
    helper:
      name: Difference Engine
      style: mechanical
  tea:
    character: Grace Hopper
    style: relentlessly skeptical
    role: Test Engineer
    quote: A ship in port is safe, but that is not what ships are built for.
    trait: paranoid
    motto: Prove it breaks.
  sm:
    character: Margaret Hamilton
    style: calm and exacting
    role: Scrum Master
"""


@pytest.fixture
def pf_project_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """Build a hermetic Pennyfarthing project and export it as PF_PROJECT_DIR.

    The returned directory contains everything the frame data-proxy routes need
    to resolve a real persona:

    - ``.pennyfarthing/`` so ``_detect_pf_project`` succeeds
    - ``.pennyfarthing/config.local.yaml`` selecting ``TEST_THEME``
    - ``.pennyfarthing/personas/themes/<TEST_THEME>.yaml`` defining dev/tea/sm
    - ``.session/agents/dev`` marking ``dev`` as the active agent
    - ``.session/162-49-session.md`` so story-shaped routes have something to read

    Ambient project-root env vars are cleared so nothing outside tmp_path can
    influence resolution. Because the project dir is passed explicitly via
    PF_PROJECT_DIR, results are identical no matter which directory pytest was
    launched from.
    """
    project = tmp_path / "pf-project"
    pf_dir = project / ".pennyfarthing"
    themes_dir = pf_dir / "personas" / "themes"
    themes_dir.mkdir(parents=True)

    (pf_dir / "config.local.yaml").write_text(
        f"theme: {TEST_THEME}\nbell_mode: off\n", encoding="utf-8"
    )
    (themes_dir / f"{TEST_THEME}.yaml").write_text(_TEST_THEME_YAML, encoding="utf-8")

    agents_dir = project / ".session" / "agents"
    agents_dir.mkdir(parents=True)
    (agents_dir / "current").write_text("dev\n", encoding="utf-8")

    (project / ".session" / "162-49-session.md").write_text(
        textwrap.dedent("""\
            # Story 162-49: conftest fixture project

            **Story ID:** 162-49
            **Phase:** green
            **Workflow:** tdd
            """),
        encoding="utf-8",
    )

    monkeypatch.setenv("PF_PROJECT_DIR", str(project))
    # FRAME_PROJECT_DIR is cleared because it OUTRANKS PF_PROJECT_DIR in both
    # resolvers (ws_push and, since 162-49's rework, data_proxy). Leaving it set
    # would let an ambient value from a running Frame server redirect resolution
    # straight past this fixture — the docstring's "every other ambient variable"
    # claim was previously false for the one variable production actually sets.
    for ambient in (
        "FRAME_PROJECT_DIR",
        "PROJECT_ROOT",
        "CLAUDE_PROJECT_DIR",
        "PF_THEME",
        "SESSION_ID",
    ):
        monkeypatch.delenv(ambient, raising=False)

    # Story 162-49 (rework 2): stub the CDN fetch explicitly. The persona payload
    # resolves a portrait via resolve_portrait_path -> portrait_cdn.fetch_portrait,
    # which does up to four urlopen(timeout=30) calls. Today this fixture reaches
    # it only to bail early, because the test theme omits shortName/ocean and the
    # slug never resolves — i.e. the suite is network-free by ACCIDENT. Adding an
    # `ocean:` key to the theme above would silently convert every test using this
    # fixture into a network-dependent one with a 30s timeout. Stub it so the
    # hermeticity is a property of the fixture, not of a theme-YAML omission.
    # Returning None keeps portraitPath None, matching the previous behaviour;
    # tests that want the portrait branch override this with their own stub.
    monkeypatch.setattr(
        "pf.package.portrait_cdn.fetch_portrait",
        lambda *a, **kw: None,
    )

    return project


@pytest.fixture
def active_agent(pf_project_dir: Path):
    """Set which agent the ``.session/agents/`` marker names as active.

    Returns a setter so a test can retarget the active agent without reaching
    into the fixture's directory layout.
    """
    agents_dir = pf_project_dir / ".session" / "agents"

    def _set(agent_name: str | None) -> None:
        for existing in agents_dir.iterdir():
            existing.unlink()
        if agent_name is not None:
            (agents_dir / "current").write_text(f"{agent_name}\n", encoding="utf-8")

    return _set


@pytest.fixture
def run_from_cwd(monkeypatch: pytest.MonkeyPatch):
    """Chdir into an arbitrary directory for the duration of a test.

    Used to prove cwd-independence: the same request must produce the same
    response whether pytest ran from the repo root, from ``pennyfarthing-dist``,
    or from an unrelated temp directory.
    """

    def _chdir(target: Path) -> Path:
        resolved = Path(target).resolve()
        monkeypatch.chdir(resolved)
        return resolved

    return _chdir


@pytest.fixture
def sprint_yaml_path(project_root: Path) -> Path:
    """Return path to current-sprint.yaml."""
    return project_root / "sprint" / "current-sprint.yaml"


@pytest.fixture
def mock_jira_client() -> Generator:
    """Mock JiraClient for tests that don't need real API calls."""
    from unittest.mock import MagicMock, patch

    mock_client = MagicMock()
    mock_client.get_issue_sync.return_value = {
        "key": "PROJ-12345",
        "fields": {
            "summary": "Test Issue",
            "status": {"name": "To Do"},
            "customfield_10031": 3,
        },
    }
    mock_client.get_issue_async.return_value = mock_client.get_issue_sync.return_value
    mock_client.create_issue_sync.return_value = {"key": "PROJ-12346", "id": "10001"}

    with patch("pf.jira.client.JiraClient", return_value=mock_client):
        yield mock_client


@pytest.fixture
def sample_sprint_data() -> dict:
    """Return sample sprint data for testing."""
    return {
        "sprint": {
            "name": "TO Sprint 2604",
            "jira_sprint_id": 276,
            "status": "active",
            "start_date": "2026-01-20",
            "end_date": "2026-02-02",
        },
        "epics": [
            {
                "id": "epic-63",
                "title": "Test Epic",
                "jira": "PROJ-12000",
                "stories": [
                    {
                        "id": "63-1",
                        "title": "First Story",
                        "status": "backlog",
                        "points": 3,
                        "jira": "PROJ-12001",
                    },
                    {
                        "id": "63-2",
                        "title": "Second Story",
                        "status": "in_progress",
                        "points": 5,
                        "jira": "PROJ-12002",
                    },
                ],
            },
        ],
    }


@pytest.fixture
def sample_jira_issue() -> dict:
    """Return sample Jira issue data for testing."""
    return {
        "key": "PROJ-12345",
        "id": "10001",
        "fields": {
            "summary": "Test Story",
            "description": {"type": "doc", "content": []},
            "status": {"name": "To Do"},
            "issuetype": {"name": "Story"},
            "priority": {"name": "Medium"},
            "customfield_10031": 3,  # Story points
            "customfield_10020": [  # Sprint
                {"id": 276, "name": "TO Sprint 2604", "state": "active"}
            ],
        },
    }
