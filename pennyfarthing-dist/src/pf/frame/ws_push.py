"""WebSocket push — initial data + periodic broadcast for TUI panels.

Provides channel-specific data fetchers and a background polling loop
that keeps connected TUI panels updated.
"""

from __future__ import annotations

import asyncio
import os
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from pf.sprint.status_normalize import normalize_status

POLL_INTERVAL_S = 5.0

# Single shared executor per process for all blocking fetchers (Story 161-1,
# gh #97). Relying on the event-loop default pool let each poll/initial-data
# call schedule blocking subprocess work without a stable, bounded pool;
# capping concurrency here keeps per-poll kernel resource churn (Mach ports)
# from accumulating across the life of the long-running server.
_shared_executor: ThreadPoolExecutor | None = None


def get_shared_executor() -> ThreadPoolExecutor:
    """Return the process-wide shared executor (stable singleton).

    All blocking fetcher work (``send_initial_data`` and ``poll_and_broadcast``)
    runs on this one bounded pool rather than constructing a fresh pool — or
    leaning on an unbounded default pool — per poll cycle.
    """
    global _shared_executor
    if _shared_executor is None:
        _shared_executor = ThreadPoolExecutor(
            max_workers=4, thread_name_prefix="frame-fetch"
        )
    return _shared_executor


def _get_project_dir() -> str:
    return os.environ.get("FRAME_PROJECT_DIR", os.environ.get("PF_PROJECT_DIR", os.getcwd()))


# ---------------------------------------------------------------------------
# Channel data fetchers — each returns a dict ready to send as JSON
# ---------------------------------------------------------------------------


def fetch_git() -> dict[str, Any]:
    """Fetch multi-repo git status."""
    from pf.frame.routes.data_proxy import _get_git_info, _get_repos_config

    project_dir = _get_project_dir()
    repos = _get_repos_config(project_dir)
    results = []
    for repo in repos:
        repo_path = str(Path(project_dir, repo["path"]))
        info = _get_git_info(repo_path)
        results.append({
            "name": repo["name"],
            "path": repo["path"],
            "branch": info["branch"] if info else "unknown",
            "clean": info["clean"] if info else True,
            "ahead": info.get("ahead") if info else None,
            "behind": info.get("behind") if info else None,
            "developBehind": info.get("developBehind") if info else None,
            "dirtyFiles": info.get("dirtyFiles", []) if info else [],
        })
    return {"type": "update", "repos": results}


def fetch_diffs() -> dict[str, Any]:
    """Fetch git diffs for all dirty files across repos."""
    import shutil

    project_dir = _get_project_dir()

    git_bin = shutil.which("git")
    if not git_bin:
        return {"type": "init", "diffs": []}

    from pf.frame.routes.data_proxy import _get_repos_config

    repos = _get_repos_config(project_dir)
    diffs: list[dict[str, Any]] = []

    for repo in repos:
        repo_path = str(Path(project_dir, repo["path"]))
        if not Path(repo_path, ".git").exists():
            continue

        old_cwd = os.getcwd()
        try:
            os.chdir(repo_path)
            # Get diff for tracked files (staged + unstaged)
            import subprocess

            result = subprocess.run(
                [git_bin, "--no-optional-locks", "diff", "HEAD", "--unified=3", "--no-color"],
                capture_output=True, text=True, timeout=10,
            )
            if result.returncode != 0:
                continue

            # Also get untracked file contents
            subprocess.run(
                [git_bin, "--no-optional-locks", "status", "--porcelain"],
                capture_output=True, text=True, timeout=5,
            )

            # Parse the unified diff into per-file entries
            current_file = None
            current_diff_lines: list[str] = []
            additions = 0
            deletions = 0
            file_status = "M"

            def _flush(f, lines, status, add, del_):
                if f:
                    diffs.append({
                        "path": f,
                        "diff": "\n".join(lines),
                        "status": status,
                        "additions": add,
                        "deletions": del_,
                    })

            for line in result.stdout.split("\n"):
                if line.startswith("diff --git"):
                    _flush(current_file, current_diff_lines, file_status, additions, deletions)
                    parts = line.split(" b/", 1)
                    current_file = parts[1] if len(parts) > 1 else ""
                    current_diff_lines = [line]
                    additions = 0
                    deletions = 0
                    file_status = "M"
                elif current_file is not None:
                    current_diff_lines.append(line)
                    if line.startswith("+") and not line.startswith("+++"):
                        additions += 1
                    elif line.startswith("-") and not line.startswith("---"):
                        deletions += 1
                    if line.startswith("new file"):
                        file_status = "A"
                    elif line.startswith("deleted file"):
                        file_status = "D"
            _flush(current_file, current_diff_lines, file_status, additions, deletions)

        except Exception:
            pass
        finally:
            os.chdir(old_cwd)

    return {"type": "init", "diffs": diffs}


def fetch_sprint() -> dict[str, Any]:
    """Fetch sprint data in the format expected by SprintPanel."""
    project_dir = _get_project_dir()

    import yaml

    sprint_path = Path(project_dir, "sprint", "current-sprint.yaml")
    if not sprint_path.is_file():
        return {"sprint": {}, "epics": []}

    try:
        data = yaml.safe_load(sprint_path.read_text()) or {}
    except Exception:
        return {"sprint": {}, "epics": []}

    sprint_info = data.get("sprint", {})

    # Merge epics through the canonical loader so inline-dict epics (legacy
    # monolithic format, keyed by `id` with no `jira`) AND sharded epics
    # (string refs + epic-{ref}.yaml) both arrive as fully-merged dicts.
    # The bespoke shard-only path silently dropped inline epics (gh #50).
    from pf.sprint.shard_merge import merge_epic_shards

    epics: list[dict[str, Any]] = []
    completed_epics: list[dict[str, Any]] = []
    sprint_dir = Path(project_dir, "sprint")

    def _load_file(path: Path) -> Any:
        try:
            return yaml.safe_load(path.read_text()) or {}
        except Exception:
            return None

    # Capture the original index refs BEFORE merge: merge_epic_shards replaces
    # string refs with full shard dicts and loses the original ref string. The
    # ref (e.g. "PROJ-14298") is the TUI Jira column source when the shard has
    # no `jira:` field of its own. Map resolved epic id -> original ref.
    ref_by_id: dict[str, str] = {}
    for ref in data.get("epics", []):
        if isinstance(ref, str):
            shard = _load_file(sprint_dir / f"epic-{ref}.yaml")
            resolved_id = str(shard.get("id", "")) if isinstance(shard, dict) else ""
            if resolved_id:
                ref_by_id[resolved_id] = ref

    merged = merge_epic_shards(data, sprint_dir, load_file=_load_file)

    for epic_data in merged.get("epics", []):
        if not isinstance(epic_data, dict):
            continue
        epic_id = str(epic_data.get("id", ""))
        # jiraKey precedence: shard's own `jira` field -> original index ref
        # string -> "". Inline-dict epics (no jira, no string ref) yield "".
        jira_key = epic_data.get("jira", "") or ref_by_id.get(epic_id, "")
        epic_entry = {
            "id": epic_data.get("id", ""),
            "title": epic_data.get("title", ""),
            "jiraKey": jira_key,
            "status": epic_data.get("status", "backlog"),
            "stories": epic_data.get("stories", []),
        }
        if epic_data.get("status") in ("done", "completed", "cancelled"):
            completed_epics.append(epic_entry)
        else:
            epics.append(epic_entry)

    # Standalone stories as a pseudo-epic
    standalone = data.get("standalone_stories", [])
    if standalone:
        epics.append({
            "id": "standalone",
            "title": "Standalone Stories",
            "jiraKey": "",
            "status": "backlog",
            "stories": standalone,
        })

    # Load archived stories from sprint archive (completed epics with shards)
    archive_dir = Path(project_dir, "sprint", "archive")
    if archive_dir.is_dir():
        sprint_number = sprint_info.get("number")
        for archive_path in sorted(archive_dir.glob("sprint-*-completed.yaml")):
            try:
                archive_data = yaml.safe_load(archive_path.read_text()) or {}
            except Exception:
                continue
            # Only include current sprint's archive
            if sprint_number and archive_data.get("sprint", {}).get("number") != sprint_number:
                continue
            # Load stories from archived epic shards
            for epic_ref in archive_data.get("completed_epics", []):
                shard_path = archive_dir / f"epic-{epic_ref}.yaml"
                if not shard_path.is_file():
                    continue
                try:
                    shard_data = yaml.safe_load(shard_path.read_text()) or {}
                except Exception:
                    continue
                epic_entry = {
                    "id": shard_data.get("id", ""),
                    "title": shard_data.get("title", ""),
                    "jiraKey": str(epic_ref),
                    "status": shard_data.get("status", "done"),
                    "stories": shard_data.get("stories", []),
                }
                completed_epics.append(epic_entry)
            # Also include inline completed_stories as a pseudo-epic
            inline_completed = archive_data.get("completed_stories", [])
            if inline_completed:
                completed_epics.append({
                    "id": "archived",
                    "title": "Archived Stories",
                    "jiraKey": "",
                    "status": "done",
                    "stories": inline_completed,
                })

    # Compute sprint summary
    all_stories = []
    for e in epics + completed_epics:
        all_stories.extend(e.get("stories", []))

    done_pts = sum(
        s.get("points", 0) or 0
        for s in all_stories
        if (s.get("status") or "done") in ("done", "completed", "cancelled")
    )
    in_progress_pts = sum(
        s.get("points", 0) or 0
        for s in all_stories
        if normalize_status(s.get("status") or "") == "in_progress"
    )
    in_review_pts = sum(
        s.get("points", 0) or 0
        for s in all_stories
        if normalize_status(s.get("status") or "") == "in_review"
    )
    total_pts = sum(s.get("points", 0) or 0 for s in all_stories)
    remaining_pts = total_pts - done_pts - in_progress_pts - in_review_pts

    sprint_summary = {
        "number": sprint_info.get("number", ""),
        "name": sprint_info.get("name", ""),
        "goal": sprint_info.get("goal", ""),
        "done": done_pts,
        "remaining": remaining_pts,
        "inProgress": in_progress_pts,
        "inReview": in_review_pts,
    }

    return {
        "type": "init",
        "sprint": sprint_summary,
        "epics": epics,
        "completedEpics": completed_epics,
    }


def fetch_story() -> dict[str, Any]:
    """Fetch active story info."""
    from pf.frame.routes.data_proxy import _get_project_dir, _get_story_info

    project_dir = _get_project_dir()
    info = _get_story_info(project_dir)
    return {"type": "init", **info}


def fetch_context() -> dict[str, Any]:
    """Fetch context window usage."""
    try:
        from pf.context_window import ContextConfig, check_context

        project_dir = _get_project_dir()
        config = ContextConfig(project_dir=project_dir)
        result = check_context(config)
        return {
            "type": "init",
            "context": {
                "percent": result.percent,
                "tokens": result.tokens,
                "status": result.status,
            },
        }
    except Exception:
        return {"type": "init", "context": {"percent": None, "tokens": None, "status": None}}


def fetch_settings() -> dict[str, Any]:
    """Fetch settings."""
    from pf.frame.routes.state import _load_settings

    project_dir = _get_project_dir()
    settings = _load_settings(project_dir)
    return {"type": "init", "settings": settings}


def fetch_persona() -> dict[str, Any]:
    """Fetch active persona using the same agent resolution as statusline."""
    try:
        project_dir = _get_project_dir()
        agents_dir = Path(project_dir, ".session", "agents")
        if not agents_dir.is_dir():
            return {}

        # Find most recently written agent file (same logic as statusline._resolve_agent)
        agent_name = None
        latest_mtime = 0.0
        for f in agents_dir.iterdir():
            if f.is_file() and not f.name.startswith("."):
                mt = f.stat().st_mtime
                if mt > latest_mtime:
                    latest_mtime = mt
                    agent_name = f.read_text().strip()

        if not agent_name:
            return {}

        from pf.prime.persona import load_persona

        persona, theme = load_persona(agent_name, project_root=Path(project_dir))
        if not persona:
            return {}

        # Resolve portrait path server-side (AC-1)
        portrait_path = None
        try:
            from pf.tui.portrait_resolver import resolve_portrait_path

            resolved = resolve_portrait_path(theme, agent_name, project_root=Path(project_dir))
            if resolved:
                portrait_path = str(resolved)
        except Exception:
            pass  # AC-3: graceful degradation

        return {
            "character": persona.character,
            "role": agent_name,
            "roleDescription": persona.style,
            "quote": persona.quote or persona.motto or "",
            "theme": theme or "",
            "trait": persona.trait or "",
            "isStreaming": False,
            "portraitPath": portrait_path,
        }
    except Exception:
        return {}


def fetch_benchmark_history() -> dict[str, Any]:
    """Fetch benchmark pipeline replay results from result files.

    Walks ``internal/results/pipeline-replay/`` and reads ``majority_vote.yaml``
    or ``score.yaml`` from each run directory. Uses mtime-based caching to
    avoid re-parsing YAML every poll cycle.
    """
    project_dir = _get_project_dir()
    results_dir = Path(project_dir, "internal", "results", "pipeline-replay")

    if not results_dir.is_dir():
        return {"type": "init", "runs": []}

    import yaml

    runs: list[dict[str, Any]] = []

    for scenario_dir in sorted(results_dir.iterdir()):
        if not scenario_dir.is_dir() or scenario_dir.name.startswith("_"):
            continue
        scenario_id = scenario_dir.name

        for theme_dir in sorted(scenario_dir.iterdir()):
            if not theme_dir.is_dir() or theme_dir.name.startswith("_"):
                continue
            theme = theme_dir.name

            for run_dir in sorted(theme_dir.iterdir()):
                if not run_dir.is_dir() or not run_dir.name.startswith("run-"):
                    continue

                # Prefer majority_vote.yaml over score.yaml
                mv_file = run_dir / "majority_vote.yaml"
                score_file = run_dir / "score.yaml"
                chosen = mv_file if mv_file.exists() else score_file
                if not chosen.exists():
                    continue

                try:
                    score_data = yaml.safe_load(chosen.read_text())
                except Exception:
                    continue

                if not isinstance(score_data, dict):
                    continue

                # Extract run_id from directory name
                run_id = score_data.get("run_id")
                if run_id is None:
                    run_name = run_dir.name
                    try:
                        run_id = int(run_name.split("-")[1])
                    except (IndexError, ValueError):
                        run_id = 0

                # Extract framework version
                fw = score_data.get("framework_version") or {}
                version = fw.get("tag") or fw.get("commit") or ""

                # Extract date from pipeline.yaml
                run_date = ""
                pipeline_file = run_dir / "pipeline.yaml"
                if pipeline_file.exists():
                    try:
                        pipeline_data = yaml.safe_load(pipeline_file.read_text())
                        run_date = pipeline_data.get("completed_at", "") or pipeline_data.get("started_at", "")
                    except Exception:
                        pass
                if not run_date:
                    # Fallback to file mtime
                    try:
                        from datetime import UTC, datetime
                        mtime = chosen.stat().st_mtime
                        run_date = datetime.fromtimestamp(mtime, tz=UTC).isoformat()
                    except Exception:
                        pass

                # Token usage per phase from pipeline.yaml
                token_usage = {}
                if pipeline_file.exists():
                    try:
                        if not pipeline_data:
                            pipeline_data = yaml.safe_load(pipeline_file.read_text())
                        phases = pipeline_data.get("phases", {})
                        if isinstance(phases, dict):
                            for p_name, p_data in phases.items():
                                if isinstance(p_data, dict):
                                    token_usage[p_name] = {
                                        "tokens": p_data.get("input_tokens", 0) + p_data.get("output_tokens", 0),
                                        "cost": p_data.get("cost", 0),
                                    }
                    except Exception:
                        pass

                # Duration
                duration_s = None
                if pipeline_file.exists():
                    try:
                        duration_s = pipeline_data.get("duration_s")
                    except Exception:
                        pass

                # Narrative excerpt
                narrative_excerpt = ""
                narrative_file = run_dir / "narrative.md"
                if narrative_file.exists():
                    try:
                        text = narrative_file.read_text()[:300]
                        # Skip frontmatter
                        if text.startswith("---"):
                            end = text.find("---", 3)
                            if end > 0:
                                text = text[end + 3:].strip()
                        narrative_excerpt = text[:150]
                    except Exception:
                        pass

                runs.append({
                    "scenario_id": scenario_id,
                    "theme": theme if theme != "control" else None,
                    "run_id": run_id,
                    "score_pct": score_data.get("score_pct", 0),
                    "total_caught": score_data.get("total_caught", 0),
                    "total_findings": score_data.get("total_findings", 0),
                    "weighted_caught": score_data.get("weighted_caught", 0),
                    "total_weight": score_data.get("total_weight", 0),
                    "findings": score_data.get("findings", []),
                    "date": run_date,
                    "version": version,
                    "token_usage": token_usage,
                    "duration_s": duration_s,
                    "narrative_excerpt": narrative_excerpt,
                })

    return {"type": "init", "runs": runs}


def fetch_benchmark_events() -> dict[str, Any]:
    """Fetch current benchmark events state (phase transitions, live run data)."""
    from pf.frame.routes.state import get_benchmark_events_snapshot

    return get_benchmark_events_snapshot()


def fetch_subagent_transitions() -> dict[str, Any]:
    """Fetch recent subagent transition events."""
    from pf.frame.routes.state import _subagent_events

    return {"type": "init", "events": _subagent_events}


def fetch_spans() -> dict[str, Any]:
    """Fetch enriched spans."""
    from pf.frame.routes.state import _enriched_spans

    return {"type": "init", "spans": _enriched_spans}


def fetch_todos() -> dict[str, Any]:
    """Fetch todos."""
    from pf.frame.routes.state import _web_mode_todos

    return {"type": "init", "todos": _web_mode_todos}


def fetch_token_stats() -> dict[str, Any]:
    """Fetch accumulated token stats from the OTLP receiver."""
    from pf.frame.app import _receiver

    return _receiver.get_token_stats()


# Channel -> fetcher mapping
# Channels not listed here get no initial data push (they're event-driven)
CHANNEL_FETCHERS: dict[str, Any] = {
    "git": fetch_git,
    "diffs": fetch_diffs,
    "sprint": fetch_sprint,
    "story": fetch_story,
    "context": fetch_context,
    "settings": fetch_settings,
    "persona": fetch_persona,
    "spans": fetch_spans,
    "todos": fetch_todos,
    "token-stats": fetch_token_stats,
    "benchmark-history": fetch_benchmark_history,
    "benchmark-events": fetch_benchmark_events,
    "subagent-transitions": fetch_subagent_transitions,
}

# Channels that should be polled periodically (their data changes externally via files).
# Event-driven channels (spans, token-stats, subagent-transitions) are broadcast in
# real-time from OTLP/API endpoints and must NOT be polled — polling sends "init"
# messages that clear panel state.
POLL_CHANNELS = {"git", "diffs", "sprint", "story", "context", "benchmark-history", "persona", "settings"}


async def send_initial_data(websocket: Any, channel: str) -> None:
    """Send initial data payload when a client connects to a channel."""
    fetcher = CHANNEL_FETCHERS.get(channel)
    if fetcher is None:
        return
    try:
        import json

        data = await asyncio.get_event_loop().run_in_executor(
            get_shared_executor(), fetcher
        )
        await websocket.send_text(json.dumps(data))
    except Exception:
        pass


async def poll_and_broadcast(broadcast_fn: Any) -> None:
    """Periodically fetch data for poll channels and broadcast to clients.

    Rewrites ``type`` from ``init`` to ``update`` so panels distinguish
    between the initial connection payload (which may trigger a full
    reload/clear) and periodic refreshes.
    """

    from pf.frame.app import _ws_clients

    while True:
        await asyncio.sleep(POLL_INTERVAL_S)
        for channel in POLL_CHANNELS:
            if not _ws_clients.get(channel):
                continue
            fetcher = CHANNEL_FETCHERS.get(channel)
            if fetcher is None:
                continue
            try:
                data = await asyncio.get_event_loop().run_in_executor(
                    get_shared_executor(), fetcher
                )
                # Rewrite "init" → "update" so panels don't clear on poll
                if isinstance(data, dict) and data.get("type") == "init":
                    data = {**data, "type": "update"}
                await broadcast_fn(channel, data)
            except Exception:
                pass
