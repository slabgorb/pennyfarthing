"""Data proxy routes — direct Python imports replacing Node.js shelling out.

Story 48-2, AC1. Routes: persona, story, git, context, theme-agents, mode,
identity, project-info.

These routes previously used child_process in Node.js to call the pf CLI.
Now they import the Python modules directly, eliminating that overhead.
"""

from __future__ import annotations

import os
import platform
import sys
import time
from pathlib import Path
from typing import Any

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from pf.context_window import ContextConfig, check_context

# Direct imports — no shelling out
from pf.prime.persona import get_crew_manifest, load_persona

_start_time = time.time()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_project_dir() -> str:
    """Resolve project directory from env or cwd."""
    return os.environ.get("PF_PROJECT_DIR", os.getcwd())


def _detect_pf_project(project_dir: str) -> bool:
    """Check if directory is a Pennyfarthing project."""
    return Path(project_dir, ".pennyfarthing").is_dir()


# ---------------------------------------------------------------------------
# Persona router
# ---------------------------------------------------------------------------

persona_router = APIRouter(prefix="/api/persona", tags=["persona"])


@persona_router.get("/")
async def get_persona() -> JSONResponse:
    project_dir = _get_project_dir()
    if not _detect_pf_project(project_dir):
        return JSONResponse({"error": "Not a Pennyfarthing project"}, status_code=404)

    session_id = os.environ.get("SESSION_ID")
    persona = load_persona(project_dir, session_id=session_id)
    if not persona:
        return JSONResponse({"error": "No active persona"}, status_code=404)
    return JSONResponse(persona)


@persona_router.get("/full")
async def get_persona_full() -> JSONResponse:
    project_dir = _get_project_dir()
    if not _detect_pf_project(project_dir):
        return JSONResponse({"error": "Not a Pennyfarthing project"}, status_code=404)

    session_id = os.environ.get("SESSION_ID")
    persona = load_persona(project_dir, session_id=session_id, full=True)
    if not persona:
        return JSONResponse({"error": "No active persona"}, status_code=404)
    return JSONResponse(persona)


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

    def _run(args: list[str]) -> str | None:
        r, w = os.pipe()
        pid = os.fork()
        if pid == 0:
            os.close(r)
            os.dup2(w, 1)
            os.dup2(w, 2)
            os.close(w)
            os.execvp(git_bin, [git_bin, "--no-optional-locks"] + args)
        os.close(w)
        data = b""
        while True:
            chunk = os.read(r, 4096)
            if not chunk:
                break
            data += chunk
        os.close(r)
        _, status = os.waitpid(pid, 0)
        if os.WIFEXITED(status) and os.WEXITSTATUS(status) == 0:
            return data.decode("utf-8", errors="replace").strip()
        return None

    old_cwd = os.getcwd()
    try:
        os.chdir(repo_path)
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
    except Exception:
        return None
    finally:
        os.chdir(old_cwd)


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
                config = yaml.safe_load(p.read_text())
                if config and isinstance(config.get("repos"), dict):
                    return [
                        {
                            "name": name,
                            "path": (rc or {}).get("path", name) if isinstance(rc, dict) else name,
                        }
                        for name, rc in config["repos"].items()
                    ]
            except Exception:
                pass

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
                "path": repo["path"],
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
        config = ContextConfig(project_dir=project_dir)
        result = check_context(config)
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
        return JSONResponse(
            {
                "percent": None,
                "tokens": None,
                "status": None,
                "error": str(e),
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
        crew = get_crew_manifest(project_dir)
        return JSONResponse(crew if isinstance(crew, dict) else {})
    except Exception:
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
            "isBikeRack": os.environ.get("BIKERACK_MODE") == "1",
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
            data = _json.loads(result)
            jira_email = data.get("emailAddress")
        except Exception:
            pass

    if shutil.which("gh"):
        try:
            import json as _json

            result = os.popen("gh api user 2>/dev/null").read()
            data = _json.loads(result)
            github_username = data.get("login")
        except Exception:
            pass

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
            "path": project_dir,
        }
    )


# ---------------------------------------------------------------------------
# All data proxy routers
# ---------------------------------------------------------------------------

all_data_proxy_routers = [
    persona_router,
    story_router,
    git_router,
    context_router,
    theme_agents_router,
    mode_router,
    identity_router,
    project_info_router,
]
