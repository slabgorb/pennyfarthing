"""Data proxy routes — direct Python imports replacing Node.js shelling out.

Story 48-2, AC1. Routes: persona, story, git, context, theme-agents, mode,
identity, project-info.

These routes previously used child_process in Node.js to call the pf CLI.
Now they import the Python modules directly, eliminating that overhead.
"""

from __future__ import annotations

import asyncio
import os
import platform
import sys
import time
import warnings
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from pf.context_window import check_context

# Direct imports — no shelling out
from pf.prime.persona import get_crew_manifest

_start_time = time.time()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_project_dir() -> str:
    """Resolve project directory from env or cwd.

    Story 162-49 (rework): ``FRAME_PROJECT_DIR`` is checked FIRST because it is
    the only project-dir variable production actually sets — ``launcher.py:128``
    exports it when ``pf frame start [--project-dir X]`` spawns the server, and
    nothing in ``pf.frame`` or ``pf.launch`` ever sets ``PF_PROJECT_DIR``.
    Reading only ``PF_PROJECT_DIR`` meant every route here fell through to
    ``os.getcwd()`` in production while ``ws_push._get_project_dir()`` (same
    precedence as below) resolved correctly — two transports, one shared
    builder, two different answers. The persona routes 404'd with "Not a
    Pennyfarthing project" whenever the server's cwd was not the project dir.
    """
    return os.environ.get("FRAME_PROJECT_DIR", os.environ.get("PF_PROJECT_DIR", os.getcwd()))


def _detect_pf_project(project_dir: str) -> bool:
    """Check if directory is a Pennyfarthing project."""
    return Path(project_dir, ".pennyfarthing").is_dir()


def _safe_exc(exc: Exception) -> str:
    """Network-safe exception summary for the warnings sink (story 160-18).

    The fail-loud sweep (160-4..17) added ``warnings.warn(f"...: {exc}")`` calls
    here. A raw ``str(exc)`` can carry file-content fragments, absolute paths
    (with usernames), or tokens — unsafe to expose if Frame ever forwards
    warnings to a network client. Emit only the exception TYPE name, which keeps
    the diagnostic class while leaking nothing. Likewise, ``repo_path`` is
    dropped entirely from the git-info warning below.
    """
    return type(exc).__name__


# ---------------------------------------------------------------------------
# Persona router
# ---------------------------------------------------------------------------

persona_router = APIRouter(prefix="/api/persona", tags=["persona"])


async def _persona_response(full: bool) -> JSONResponse:
    """Shared body for both persona routes (story 162-49).

    Both routes used to build their own persona, calling
    ``load_persona(project_dir, session_id=..., full=...)`` — a signature that
    never existed (``load_persona(agent_name, project_root=None)`` returns a
    ``(Persona, theme)`` tuple), so every request that got past the project
    detection above raised TypeError. ``ws_push.build_persona_payload`` is the
    already-shipped, already-consumed implementation of exactly this: agent
    resolution from ``.session/agents/``, the correct ``load_persona`` call,
    portrait resolution, and the payload shape the TUI header reads. Delegate to
    it rather than keeping a second, broken copy.

    Story 162-49 (rework): the builder is offloaded with ``asyncio.to_thread``
    (the pattern at ``routes/analysis.py:63``) because it is fully synchronous
    and does blocking network I/O — ``resolve_portrait_path`` →
    ``portrait_cdn.fetch_portrait`` tries all four size buckets with
    ``urlopen(timeout=30)`` each, and a miss is not cached, so every request
    retries. Called inline it stalled the whole event loop — WebSocket pushes,
    OTLP ingest, ``/health`` — for the duration. The WebSocket path already
    offloads this same callable via ``run_in_executor``; this was the only
    unoffloaded caller.
    """
    project_dir = _get_project_dir()
    if not _detect_pf_project(project_dir):
        return JSONResponse({"error": "Not a Pennyfarthing project"}, status_code=404)

    from pf.frame.ws_push import build_persona_payload

    persona = await asyncio.to_thread(build_persona_payload, project_dir, full=full)
    if not persona:
        return JSONResponse({"error": "No active persona"}, status_code=404)
    return JSONResponse(persona)


@persona_router.get("/")
async def get_persona() -> JSONResponse:
    return await _persona_response(full=False)


@persona_router.get("/full")
async def get_persona_full() -> JSONResponse:
    return await _persona_response(full=True)


@persona_router.get("/portrait")
async def get_persona_portrait():
    """Serve the active persona's portrait as a file (web GUI).

    /api/persona returns portraitPath as a *filesystem* path; a browser
    cannot load that, so this route streams the file itself.
    """
    from fastapi.responses import FileResponse

    import pf.frame.ws_push as ws_push

    project_dir = _get_project_dir()
    payload = ws_push.build_persona_payload(project_dir)
    path = payload.get("portraitPath")
    if not path or not Path(path).is_file():
        return JSONResponse({"error": "no portrait"}, status_code=404)
    return FileResponse(path)


# ---------------------------------------------------------------------------
# Story router
# ---------------------------------------------------------------------------

story_router = APIRouter(prefix="/api/story", tags=["story"])


def _get_story_info(project_dir: str) -> dict[str, Any]:
    """Parse current story from session file."""
    session_dir = Path(project_dir, ".session")
    if not session_dir.is_dir():
        return {"id": None, "title": None, "phase": None, "workflow": None}

    for f in session_dir.glob("*-session.md"):
        content = f.read_text(encoding="utf-8", errors="replace")
        info: dict[str, Any] = {"id": None, "title": None, "phase": None, "workflow": None}
        for line in content.splitlines():
            if line.startswith("**Story ID:**"):
                info["id"] = line.split(":**", 1)[1].strip()
            elif line.startswith("**Phase:**"):
                info["phase"] = line.split(":**", 1)[1].strip()
            elif line.startswith("**Workflow:**"):
                info["workflow"] = line.split(":**", 1)[1].strip()
            elif line.startswith("# Story"):
                info["title"] = line.lstrip("# ").strip()
        return info

    return {"id": None, "title": None, "phase": None, "workflow": None}


@story_router.get("/")
async def get_story() -> JSONResponse:
    project_dir = _get_project_dir()
    return JSONResponse(_get_story_info(project_dir))


# ---------------------------------------------------------------------------
# Workflow router — phase list for the web GUI (boundary rule: the browser
# never parses workflow YAML; this route does).
# ---------------------------------------------------------------------------

workflow_router = APIRouter(prefix="/api/workflow", tags=["workflow"])


@workflow_router.get("/")
async def get_workflow() -> JSONResponse:
    from pf.frame.ws_push import _read_yaml_file

    project_dir = _get_project_dir()
    story = _get_story_info(project_dir)
    name = story.get("workflow")
    phases: list[dict[str, str]] = []
    if name:
        wf_path = Path(project_dir, ".pennyfarthing", "workflows", f"{name}.yaml")
        data = _read_yaml_file(wf_path)
        if isinstance(data, dict):
            for ph in data.get("phases") or []:
                if isinstance(ph, dict) and ph.get("name"):
                    phases.append(
                        {"name": str(ph["name"]), "agent": str(ph.get("agent", ""))}
                    )
    return JSONResponse(
        {"workflow": name, "phase": story.get("phase"), "phases": phases}
    )


# ---------------------------------------------------------------------------
# Git router
# ---------------------------------------------------------------------------

git_router = APIRouter(prefix="/api/git", tags=["git"])


def _get_git_info(repo_path: str) -> dict[str, Any] | None:
    """Get git status for a repo using gitpython-free approach."""
    import shutil

    git_bin = shutil.which("git")
    if not git_bin:
        return None

    if not Path(repo_path, ".git").exists():
        return None

    import subprocess

    def _run(args: list[str]) -> str | None:
        # subprocess.run (posix_spawn) instead of a raw os.fork()/execvp in a
        # multi-threaded server process (Story 161-1, gh #97): per-call os.fork
        # in a threaded process churns kernel-side Mach-port resources on macOS
        # and warns of deadlock risk. posix_spawn avoids both.
        try:
            result = subprocess.run(
                [git_bin, "--no-optional-locks"] + args,
                cwd=repo_path,
                capture_output=True,
                text=True,
                timeout=10,
            )
        except (OSError, subprocess.SubprocessError):
            return None
        if result.returncode == 0:
            return result.stdout.strip()
        return None

    try:
        branch = _run(["rev-parse", "--abbrev-ref", "HEAD"]) or "unknown"

        dirty_files: list[dict[str, str]] = []
        clean = True
        porcelain = _run(["status", "--porcelain"])
        if porcelain:
            clean = False
            for line in porcelain.splitlines():
                status = line[:2].strip() or "?"
                path = line[3:]
                dirty_files.append({"status": status, "path": path})

        ahead: int | None = None
        behind: int | None = None
        a = _run(["rev-list", "--count", "@{u}..HEAD"])
        if a is not None:
            ahead = int(a)
        b = _run(["rev-list", "--count", "HEAD..@{u}"])
        if b is not None:
            behind = int(b)

        develop_behind: int | None = None
        db = _run(["rev-list", "--count", "HEAD..origin/develop"])
        if db is not None:
            develop_behind = int(db)

        return {
            "branch": branch,
            "clean": clean,
            "ahead": ahead,
            "behind": behind,
            "dirtyFiles": dirty_files,
            "developBehind": develop_behind,
        }
    except Exception as exc:
        # AC-1 (160-16): a present-but-broken git probe (e.g. a non-numeric
        # rev-list --count that fails int() parsing) was silently collapsing the
        # whole repo to None -> rendered as "unknown"/clean with zero diagnostics.
        # Warn (fail-loud) then degrade unchanged. Stays a catch-all because this
        # feeds an async route / poll loop that must never raise. Message is
        # sanitised (type name only, no repo_path) per 160-18 — see _safe_exc.
        warnings.warn(f"Failed to parse git info ({_safe_exc(exc)})", stacklevel=2)
        return None


def _get_repos_config(project_dir: str) -> list[dict[str, str]]:
    """Read repos from repos.yaml."""
    import yaml

    candidates = [
        Path(project_dir, ".pennyfarthing", "repos.yaml"),
        Path(project_dir, "repos.yaml"),
    ]
    for p in candidates:
        if p.is_file():
            try:
                config = yaml.safe_load(p.read_text(encoding="utf-8"))
                if config and isinstance(config.get("repos"), dict):
                    return [
                        {
                            "name": name,
                            "path": (rc or {}).get("path", name) if isinstance(rc, dict) else name,
                        }
                        for name, rc in config["repos"].items()
                    ]
            except Exception as exc:
                # AC-2 (160-16): a present-but-broken repos.yaml (malformed YAML,
                # non-UTF-8 bytes, or unreadable) was silently swallowed -> the
                # panel fell back to a single "." repo, hiding the real (broken)
                # topology. Warn (naming the file) then keep the fallback. The
                # explicit encoding="utf-8" (CWE-838) makes the decode
                # deterministic across platforms. Message sanitised (type name
                # only) per 160-18; the fixed filename p.name is non-sensitive.
                warnings.warn(
                    f"Failed to load repos config {p.name} ({_safe_exc(exc)})", stacklevel=2
                )

    dir_name = Path(project_dir).name or "project"
    return [{"name": dir_name, "path": "."}]


@git_router.get("/")
async def get_git() -> JSONResponse:
    project_dir = _get_project_dir()
    if not _detect_pf_project(project_dir):
        return JSONResponse({"error": "Not a Pennyfarthing project"}, status_code=404)

    info = _get_git_info(project_dir)
    if not info:
        return JSONResponse({"error": "Not a git repository"}, status_code=404)
    return JSONResponse(info)


@git_router.get("/all")
async def get_git_all() -> JSONResponse:
    project_dir = _get_project_dir()
    if not _detect_pf_project(project_dir):
        return JSONResponse({"error": "Not a Pennyfarthing project"}, status_code=404)

    repos = _get_repos_config(project_dir)
    results = []
    for repo in repos:
        repo_path = str(Path(project_dir, repo["path"]))
        info = _get_git_info(repo_path)
        results.append(
            {
                "name": repo["name"],
                # 160-22: basename only — an absolute or ``../parent`` configured
                # path in repos.yaml must not disclose filesystem layout. The
                # ``or repo["path"]`` fallback keeps a bare "." for the default
                # repo, whose ``Path(".").name`` is "".
                "path": Path(repo["path"]).name or repo["path"],
                "branch": info["branch"] if info else "unknown",
                "clean": info["clean"] if info else True,
                "ahead": info.get("ahead") if info else None,
                "behind": info.get("behind") if info else None,
                "developBehind": info.get("developBehind") if info else None,
                "dirtyFiles": info.get("dirtyFiles", []) if info else [],
            }
        )
    return JSONResponse(results)


@git_router.post("/refresh")
async def git_refresh() -> JSONResponse:
    return JSONResponse({"success": True, "message": "Git cache refreshed"})


# ---------------------------------------------------------------------------
# Context router
# ---------------------------------------------------------------------------

context_router = APIRouter(prefix="/api/context", tags=["context"])


@context_router.get("/")
async def get_context() -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        # 160-19: call check_context directly. The prior
        # ``ContextConfig(project_dir=project_dir)`` was a constant bug —
        # ContextConfig has no project_dir field, so it raised TypeError on EVERY
        # request and the silent except below returned an all-None shape; the
        # /api/context panel never showed real data. check_context builds its own
        # config via load_config(project_dir).
        result = check_context(project_dir=project_dir)
        return JSONResponse(
            {
                "percent": result.percent,
                "tokens": result.tokens,
                "status": result.status,
                "error": result.error,
                "baseline": getattr(result, "baseline", None),
                "usableTokens": getattr(result, "usable_tokens", None),
                "usablePercent": getattr(result, "usable_percent", None),
                "available": getattr(result, "available", None),
            }
        )
    except Exception as e:
        # 160-19 (fail-loud sweep part 5): the LAST silent swallow in this file.
        # Warn (fail-loud) then degrade unchanged. Stays a catch-all because this
        # feeds an async route / poll loop that must never raise. Message sanitised
        # (type name only) per 160-18 — see _safe_exc. The response-body
        # ``error`` below is likewise sanitised via _safe_exc (story 160-22): a
        # raw str(e) here was a live network info-leak (could embed absolute
        # paths, tokens, or file fragments).
        warnings.warn(f"Failed to check context ({_safe_exc(e)})", stacklevel=2)
        return JSONResponse(
            {
                "percent": None,
                "tokens": None,
                "status": None,
                "error": _safe_exc(e),
                "baseline": None,
                "usableTokens": None,
                "usablePercent": None,
                "available": None,
            }
        )


# ---------------------------------------------------------------------------
# Theme agents router
# ---------------------------------------------------------------------------

theme_agents_router = APIRouter(prefix="/api/theme-agents", tags=["theme-agents"])


@theme_agents_router.get("/")
async def get_theme_agents() -> JSONResponse:
    project_dir = _get_project_dir()
    try:
        # 160-17 round 2: pass a Path — get_crew_manifest -> get_current_theme does
        # `root / ".pennyfarthing"`, so a str raised TypeError on EVERY call (the
        # round-1 warn fired every request over a constant bug). get_crew_manifest
        # returns list[CrewMember] (role, character); serialize to a {role: character}
        # map so the panel renders real data (the old `isinstance(crew, dict)` check
        # was always False -> {} -> panel never populated).
        crew = get_crew_manifest(Path(project_dir))
        return JSONResponse({member.role: member.character for member in crew})
    except Exception as exc:
        # AC-1 (160-17): a crew-manifest failure was silently swallowed -> the
        # theme-agents panel rendered empty with zero diagnostics. Warn (fail-loud)
        # then degrade to {} unchanged. Stays a catch-all because this is an async
        # route that must never 500. Message sanitised (type name only) per 160-18.
        warnings.warn(f"Failed to load theme agents ({_safe_exc(exc)})", stacklevel=2)
        return JSONResponse({})


# ---------------------------------------------------------------------------
# Mode router
# ---------------------------------------------------------------------------

mode_router = APIRouter(prefix="/api/mode", tags=["mode"])


@mode_router.get("/")
async def get_mode() -> JSONResponse:
    return JSONResponse(
        {
            "mode": "web",
            "isFrame TUI": os.environ.get("FRAME_MODE") == "1",
            "version": "N/A",
            "nodeVersion": "N/A",
            "platform": sys.platform,
            "arch": platform.machine(),
            "pid": os.getpid(),
            "uptime": time.time() - _start_time,
            "startTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(_start_time)),
        }
    )


# ---------------------------------------------------------------------------
# Identity router
# ---------------------------------------------------------------------------

identity_router = APIRouter(prefix="/api/identity", tags=["identity"])

_identity_cache: dict[str, Any] | None = None
_identity_cache_time: float = 0
_IDENTITY_TTL = 300  # 5 minutes


def _get_identity() -> dict[str, Any]:
    """Get user identity with caching."""
    global _identity_cache, _identity_cache_time
    now = time.time()
    if _identity_cache and now - _identity_cache_time < _IDENTITY_TTL:
        return _identity_cache

    import shutil

    jira_email: str | None = None
    github_username: str | None = None

    if shutil.which("jira"):
        try:
            import json as _json

            result = os.popen("jira me --raw 2>/dev/null").read()
            # AC-2 (160-17): an installed-but-broken jira whose probe returns
            # non-empty UNPARSEABLE output was swallowed silently. Warn (naming the
            # probe) then degrade in place. EMPTY output (the common not-authed
            # case, 2>/dev/null ate the error) is the normal not-configured state
            # and stays silent.
            if result.strip():
                data = _json.loads(result)
                jira_email = data.get("emailAddress")
        except Exception as exc:
            warnings.warn(f"Failed to parse jira identity probe ({_safe_exc(exc)})", stacklevel=2)

    if shutil.which("gh"):
        try:
            import json as _json

            result = os.popen("gh api user 2>/dev/null").read()
            # AC-2 (160-17): an installed-but-broken gh whose probe returns
            # non-empty UNPARSEABLE output was swallowed silently. Warn (naming the
            # probe) then degrade in place. EMPTY output (the common not-authed
            # case) stays silent — the normal not-configured state.
            if result.strip():
                data = _json.loads(result)
                github_username = data.get("login")
        except Exception as exc:
            warnings.warn(f"Failed to parse gh identity probe ({_safe_exc(exc)})", stacklevel=2)

    _identity_cache = {
        "jiraEmail": jira_email,
        "githubUsername": github_username,
        "avatarUrl": f"https://avatars.githubusercontent.com/{github_username}"
        if github_username
        else None,
    }
    _identity_cache_time = now
    return _identity_cache


@identity_router.get("/")
async def get_identity() -> JSONResponse:
    return JSONResponse(_get_identity())


# ---------------------------------------------------------------------------
# Project info router
# ---------------------------------------------------------------------------

project_info_router = APIRouter(prefix="/api/project-info", tags=["project-info"])


@project_info_router.get("/")
async def get_project_info() -> JSONResponse:
    project_dir = _get_project_dir()
    return JSONResponse(
        {
            "name": Path(project_dir).name,
            # 160-22: never expose the raw absolute project_dir (OS username +
            # on-disk layout) in the response body. Basename only — keeps the
            # Node.js response shape (``path`` present, story 48-2 AC5) while
            # disclosing nothing beyond the project's own folder name.
            "path": Path(project_dir).name,
        }
    )


# ---------------------------------------------------------------------------
# All data proxy routers
# ---------------------------------------------------------------------------

all_data_proxy_routers = [
    persona_router,
    story_router,
    workflow_router,
    git_router,
    context_router,
    theme_agents_router,
    mode_router,
    identity_router,
    project_info_router,
]
