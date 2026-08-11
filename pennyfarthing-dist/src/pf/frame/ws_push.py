"""WebSocket push — initial data + periodic broadcast for TUI panels.

Provides channel-specific data fetchers and a background polling loop
that keeps connected TUI panels updated.
"""

from __future__ import annotations

import asyncio
import os
import shutil
import subprocess
import time
import warnings
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


def shutdown_shared_executor() -> None:
    """Shut down the shared executor (non-blocking) and drop the singleton.

    Called from the Frame lifespan exit path so the bounded ``frame-fetch`` pool
    does not outlive the server. ``wait=False`` keeps teardown from stalling
    behind an in-flight subprocess fetch. A no-op when no pool was ever created.
    """
    global _shared_executor
    if _shared_executor is not None:
        _shared_executor.shutdown(wait=False)
        _shared_executor = None


def _get_project_dir() -> str:
    return os.environ.get("FRAME_PROJECT_DIR", os.environ.get("PF_PROJECT_DIR", os.getcwd()))


def _read_text_file(path: Path) -> str | None:
    """Read a text file as UTF-8, surfacing present-but-broken reads.

    Returns the file contents, or ``None`` when the file cannot be read. A
    genuinely absent file (``FileNotFoundError``) is silent — callers gate on
    ``exists()``/``is_file()`` and a missing file is a normal, expected state.
    Every OTHER failure (permission denied, undecodable bytes) is a
    present-but-unreadable file: surfaced via ``warnings.warn`` so it is not
    swallowed (gh #50 fail-loud), then ``None`` so the caller degrades
    gracefully rather than crashing the Frame poll loop.

    ``UnicodeDecodeError`` is a ``ValueError`` (NOT an ``OSError``) — it is
    caught explicitly so an undecodable file warns instead of escaping.
    """
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return None
    except (OSError, UnicodeDecodeError) as exc:
        warnings.warn(f"Failed to read {path.name}: {exc}", stacklevel=2)
        return None


def _read_yaml_file(path: Path) -> Any:
    """Read+parse a YAML file as UTF-8, surfacing present-but-broken files.

    Layers a YAML parse on top of :func:`_read_text_file`: a read failure is
    already warned there; a parse failure (malformed YAML) is warned here.
    Returns the parsed object, or ``None`` on any read/parse failure (and for a
    genuinely empty file, mirroring ``yaml.safe_load("")``). Callers that
    require a mapping should ``isinstance(result, dict)``-guard the return.
    """
    text = _read_text_file(path)
    if text is None:
        return None

    import yaml

    try:
        return yaml.safe_load(text)
    except Exception as exc:
        warnings.warn(f"Failed to parse {path.name}: {exc}", stacklevel=2)
        return None


# Open-PR cache: {repo_path: (monotonic_ts, prs)}. The git channel polls every
# POLL_INTERVAL_S (5s); gh hits the network, so cache for 60s per repo.
_OPEN_PR_TTL_S = 60.0
_open_pr_cache: dict[str, tuple[float, list[dict[str, Any]]]] = {}


def _get_open_prs(repo_path: str) -> list[dict[str, Any]]:
    """Open PRs for a repo via gh, TTL-cached. Empty list on any failure."""
    cached = _open_pr_cache.get(repo_path)
    if cached and (time.monotonic() - cached[0]) < _OPEN_PR_TTL_S:
        return cached[1]

    gh_bin = shutil.which("gh")
    if not gh_bin:
        return []

    prs: list[dict[str, Any]] = []
    try:
        result = subprocess.run(
            [gh_bin, "pr", "list", "--json", "number,title,isDraft", "--limit", "20"],
            cwd=repo_path, capture_output=True, text=True, timeout=10,
        )
        if result.returncode == 0:
            import json

            parsed = json.loads(result.stdout)
            if isinstance(parsed, list):
                prs = [
                    {
                        "number": p.get("number"),
                        "title": p.get("title", ""),
                        "isDraft": bool(p.get("isDraft", False)),
                    }
                    for p in parsed
                    if isinstance(p, dict)
                ]
    except Exception as exc:
        # Fail-loud (gh #50): warn once per failure, degrade to [].
        warnings.warn(f"Failed to list PRs for {repo_path}: {exc}", stacklevel=2)
    _open_pr_cache[repo_path] = (time.monotonic(), prs)
    return prs


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
            "openPrs": _get_open_prs(repo_path),
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

        except Exception as exc:
            # Present-but-broken: this repo's diff subprocess/parse failed. Warn
            # naming the repo (gh #50 fail-loud) rather than silently dropping
            # its diffs from the panel; siblings still contribute.
            warnings.warn(
                f"Failed to fetch diffs for repo {repo['name']}: {exc}",
                stacklevel=2,
            )
        finally:
            os.chdir(old_cwd)

    return {"type": "init", "diffs": diffs}


def _empty_sprint_payload() -> dict[str, Any]:
    """Return a full-shaped empty sprint payload (satisfies the TS type contract)."""
    return {
        "type": "init",
        "sprint": {
            "number": "",
            "name": "",
            "goal": "",
            "done": 0,
            "remaining": 0,
            "inProgress": 0,
            "inReview": 0,
        },
        "epics": [],
        "completedEpics": [],
    }


def fetch_sprint() -> dict[str, Any]:
    """Fetch sprint data in the format expected by SprintPanel."""
    project_dir = _get_project_dir()

    import yaml

    sprint_path = Path(project_dir, "sprint", "current-sprint.yaml")
    if not sprint_path.is_file():
        return _empty_sprint_payload()

    # Split read-vs-parse so the warning names the actual failure. A
    # present-but-undecodable file is surfaced by _read_text_file as
    # "Failed to read {name}"; a decodable-but-malformed file is surfaced below
    # as "Failed to parse {name}" (the prior single try always said "read").
    text = _read_text_file(sprint_path)
    if text is None:
        return _empty_sprint_payload()

    try:
        data = yaml.safe_load(text) or {}
    except Exception as exc:
        warnings.warn(
            f"Failed to parse sprint file {sprint_path.name}: {exc}", stacklevel=2
        )
        return _empty_sprint_payload()

    sprint_info = data.get("sprint", {})

    # Merge epics through the canonical loader so inline-dict epics (legacy
    # monolithic format, keyed by `id` with no `jira`) AND sharded epics
    # (string refs + epic-{ref}.yaml) both arrive as fully-merged dicts.
    # The bespoke shard-only path silently dropped inline epics (gh #50).
    from pf.sprint.shard_merge import is_safe_shard_path, merge_epic_shards

    epics: list[dict[str, Any]] = []
    completed_epics: list[dict[str, Any]] = []
    sprint_dir = Path(project_dir, "sprint")

    def _load_file(path: Path) -> Any:
        try:
            text = path.read_text(encoding="utf-8")
        except FileNotFoundError:
            # Missing file: merge_epic_shards owns the "not found" warning.
            return None
        except (OSError, UnicodeDecodeError) as exc:
            # Present but unreadable/undecodable — surface it; a silent None
            # here is indistinguishable from a deliberately absent shard.
            warnings.warn(
                f"Failed to read sprint shard {path.name}: {exc}",
                stacklevel=2,
            )
            return None
        try:
            loaded = yaml.safe_load(text)
        except Exception as exc:
            warnings.warn(
                f"Failed to parse sprint shard {path.name}: {exc}",
                stacklevel=2,
            )
            return None
        if loaded is None:
            return {}
        if not isinstance(loaded, dict):
            warnings.warn(
                f"Sprint shard {path.name} is not a mapping "
                f"(parsed to {type(loaded).__name__}) — skipping",
                stacklevel=2,
            )
            return None
        return loaded

    # Capture the original index refs BEFORE merge: merge_epic_shards replaces
    # string refs with full shard dicts and loses the original ref string. The
    # ref (e.g. "PROJ-14298") is the TUI Jira column source when the shard has
    # no `jira:` field of its own. Map resolved epic id -> original ref.
    ref_by_id: dict[str, str] = {}
    for ref in data.get("epics", []):
        if isinstance(ref, str):
            candidate = sprint_dir / f"epic-{ref}.yaml"
            if not is_safe_shard_path(candidate, sprint_dir):
                # Path traversal (CWE-22): a crafted ref escapes sprint_dir.
                # merge_epic_shards warns + skips; here we just refuse the read.
                continue
            shard = _load_file(candidate)
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
            # Path traversal (CWE-22): a glob match is a *name* match, so a
            # symlink inside archive_dir pointing outside it is yielded happily.
            if not is_safe_shard_path(archive_path, archive_dir):
                continue
            archive_data = _read_yaml_file(archive_path)
            if not isinstance(archive_data, dict):
                continue
            # Only include current sprint's archive
            if sprint_number and archive_data.get("sprint", {}).get("number") != sprint_number:
                continue
            # Load stories from archived epic shards
            for epic_ref in archive_data.get("completed_epics", []):
                shard_path = archive_dir / f"epic-{epic_ref}.yaml"
                if not is_safe_shard_path(shard_path, archive_dir):
                    # Path traversal (CWE-22): a crafted completed-epic ref
                    # escapes archive_dir — refuse the read.
                    continue
                if not shard_path.is_file():
                    continue
                shard_data = _read_yaml_file(shard_path)
                if not isinstance(shard_data, dict):
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
        from pf.context_window import check_context

        project_dir = _get_project_dir()
        # check_context builds its own config via load_config(project_dir); its
        # first positional is explicit_session, so project_dir is a kwarg. The
        # old ``ContextConfig(project_dir=...)`` raised TypeError on EVERY call
        # (no such field) and the silent swallow hid it — the panel never showed
        # real data (gh #50 root cause, SOUL #1).
        result = check_context(project_dir=project_dir)
        return {
            "type": "init",
            "context": {
                "percent": result.percent,
                "tokens": result.tokens,
                "status": result.status,
            },
        }
    except Exception as exc:
        # Genuine context probe failure (or a degraded result shape): warn, then
        # degrade gracefully rather than blanking the panel with no diagnostic.
        warnings.warn(f"Failed to fetch context: {exc}", stacklevel=2)
        return {"type": "init", "context": {"percent": None, "tokens": None, "status": None}}


def fetch_settings() -> dict[str, Any]:
    """Fetch settings."""
    from pf.frame.routes.state import _load_settings

    project_dir = _get_project_dir()
    settings = _load_settings(project_dir)
    return {"type": "init", "settings": settings}


def build_persona_payload(project_dir: str | Path, full: bool = False) -> dict[str, Any]:
    """Build the persona payload for a project dir (story 162-49).

    Extracted from :func:`fetch_persona` so the ``GET /api/persona`` HTTP routes
    can share it instead of re-deriving agent resolution. ``data_proxy.py`` had
    its own second implementation that called ``load_persona(project_dir,
    session_id=...)`` — every argument wrong against the real
    ``load_persona(agent_name, project_root=None)`` signature, so any request
    reaching it raised TypeError. The caller passes the project dir explicitly,
    which is what keeps the routes independent of ``os.getcwd()``.

    Returns ``{}`` when there is no resolvable active persona; callers decide
    whether that is a blank panel or a 404. ``full=True`` adds the optional
    Persona fields the base TUI contract omits.
    """
    try:
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
                    content = _read_text_file(f)
                    if content is None:
                        continue
                    latest_mtime = mt
                    agent_name = content.strip()

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
        except Exception as exc:
            # AC-3 (160-16): warn IN PLACE then degrade — keep portrait_path=None
            # and fall through to return the full persona. This inner try MUST
            # stay: letting a portrait-resolver failure reach the outer catch-all
            # would blank the entire persona panel (strictly worse than no portrait).
            warnings.warn(f"Failed to resolve portrait for {agent_name}: {exc}", stacklevel=2)

        payload = {
            "character": persona.character,
            "role": agent_name,
            "roleDescription": persona.style,
            "quote": persona.quote or persona.motto or "",
            "theme": theme or "",
            "trait": persona.trait or "",
            "isStreaming": False,
            "portraitPath": portrait_path,
        }
        if full:
            payload.update(
                {
                    "roleTitle": persona.role,
                    "quirk": persona.quirk or "",
                    "motto": persona.motto or "",
                    "helperName": persona.helper_name or "",
                    "helperStyle": persona.helper_style or "",
                }
            )
        return payload
    except Exception as exc:
        # Present-but-broken: persona resolution/load raised. Warn (gh #50
        # fail-loud) rather than silently blanking the persona panel, then
        # degrade to {}. (A resolved-but-empty persona is an in-try early
        # return, not an exception, so the common "no persona yet" state is
        # unaffected.)
        warnings.warn(f"Failed to load persona: {exc}", stacklevel=2)
        return {}


def fetch_persona() -> dict[str, Any]:
    """Fetch active persona using the same agent resolution as statusline."""
    try:
        project_dir = _get_project_dir()
    except OSError as exc:
        # Story 162-49 (rework): resolution must stay INSIDE a try. It used to be
        # the first statement of the try block below; hoisting it into the caller
        # let it escape. ``os.getcwd()`` raises FileNotFoundError once the cwd has
        # been unlinked — reachable, because the launcher sets the server's cwd to
        # the project dir, so a `git worktree remove`, a `mv`, or a tmpdir cleanup
        # while Frame is alive triggers it. The escape landed in
        # ``poll_and_broadcast``'s ``except Exception: pass``, so the persona panel
        # stopped updating with zero diagnostic — the silent swallow epic 160 spent
        # five stories removing. Warn (fail-loud) then degrade to {}, unchanged.
        warnings.warn(f"Failed to load persona: {exc}", stacklevel=2)
        return {}
    return build_persona_payload(project_dir)


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

                score_data = _read_yaml_file(chosen)
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

                # Read pipeline.yaml ONCE — a broken-but-present file is
                # surfaced by _read_yaml_file's warning and degrades to None
                # (the prior code read it twice and left pipeline_data unbound
                # on a parse failure, masking a NameError under except: pass).
                pipeline_data: dict[str, Any] | None = None
                pipeline_file = run_dir / "pipeline.yaml"
                if pipeline_file.exists():
                    loaded = _read_yaml_file(pipeline_file)
                    if isinstance(loaded, dict):
                        pipeline_data = loaded

                # Extract date from pipeline.yaml
                run_date = ""
                if pipeline_data:
                    run_date = pipeline_data.get("completed_at", "") or pipeline_data.get("started_at", "")
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
                if pipeline_data:
                    phases = pipeline_data.get("phases", {})
                    if isinstance(phases, dict):
                        for p_name, p_data in phases.items():
                            if isinstance(p_data, dict):
                                token_usage[p_name] = {
                                    "tokens": p_data.get("input_tokens", 0) + p_data.get("output_tokens", 0),
                                    "cost": p_data.get("cost", 0),
                                }

                # Duration
                duration_s = None
                if pipeline_data:
                    duration_s = pipeline_data.get("duration_s")

                # Narrative excerpt
                narrative_excerpt = ""
                narrative_file = run_dir / "narrative.md"
                if narrative_file.exists():
                    text = _read_text_file(narrative_file)
                    if text is not None:
                        text = text[:300]
                        # Skip frontmatter
                        if text.startswith("---"):
                            end = text.find("---", 3)
                            if end > 0:
                                text = text[end + 3:].strip()
                        narrative_excerpt = text[:150]

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
