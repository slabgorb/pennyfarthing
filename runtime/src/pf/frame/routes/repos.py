"""Repos routes — expose repo topology from repos.yaml.

Story 147-7. Endpoints: /api/repos (list), /api/repos/{name} (detail),
/api/repos/{name} PATCH (update), /api/repos/pr-title-format (global).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_project_dir() -> str:
    """Resolve project directory from env or cwd."""
    return os.environ.get("PF_PROJECT_DIR", os.getcwd())


def _load_repos_yaml(project_dir: str) -> dict[str, Any] | None:
    """Load and return the full repos.yaml config."""
    candidates = [
        Path(project_dir, ".pennyfarthing", "repos.yaml"),
        Path(project_dir, "repos.yaml"),
    ]
    for p in candidates:
        if p.is_file():
            try:
                config = yaml.safe_load(p.read_text())
                if config and isinstance(config.get("repos"), dict):
                    return config
            except Exception:
                return None
    return None


def _serialize_repo(name: str, repo: dict[str, Any]) -> dict[str, Any]:
    """Serialize a single repo entry for JSON response."""
    return {
        "name": name,
        "path": repo.get("path", name),
        "type": repo.get("type"),
        "description": repo.get("description"),
        "language": repo.get("language"),
        "branch_strategy": repo.get("branch_strategy"),
        "default_branch": repo.get("default_branch"),
        "build_command": repo.get("build_command"),
        "test_command": repo.get("test_command"),
        "lint_command": repo.get("lint_command"),
        "owns": repo.get("owns", []),
        "never_edit": repo.get("never_edit", []),
        "symlinks": repo.get("symlinks", {}),
        "ui_layer": repo.get("ui_layer"),
        "components_path": repo.get("components_path"),
    }


# ---------------------------------------------------------------------------
# Repos router
# ---------------------------------------------------------------------------

repos_router = APIRouter(prefix="/api/repos", tags=["repos"])


@repos_router.get("/")
async def list_repos() -> JSONResponse:
    """List all repos with full topology data."""
    project_dir = _get_project_dir()
    config = _load_repos_yaml(project_dir)
    if not config:
        return JSONResponse({"error": "No repos.yaml found"}, status_code=404)

    repos = [
        _serialize_repo(name, repo_config)
        for name, repo_config in config["repos"].items()
        if isinstance(repo_config, dict)
    ]

    result: dict[str, Any] = {"repos": repos}

    if "pr_title_format" in config:
        result["pr_title_format"] = config["pr_title_format"]

    if "gates" in config:
        result["gates"] = config["gates"]

    return JSONResponse(result)


@repos_router.get("/pr-title-format")
async def get_pr_title_format() -> JSONResponse:
    """Return the global PR title format from repos.yaml."""
    project_dir = _get_project_dir()
    config = _load_repos_yaml(project_dir)
    if not config:
        return JSONResponse({"error": "No repos.yaml found"}, status_code=404)

    return JSONResponse({"pr_title_format": config.get("pr_title_format")})


@repos_router.get("/{name}")
async def get_repo(name: str) -> JSONResponse:
    """Get topology data for a single repo by name."""
    project_dir = _get_project_dir()
    config = _load_repos_yaml(project_dir)
    if not config:
        return JSONResponse({"error": "No repos.yaml found"}, status_code=404)

    repo_config = config["repos"].get(name)
    if not repo_config or not isinstance(repo_config, dict):
        return JSONResponse({"error": f"Repo '{name}' not found"}, status_code=404)

    return JSONResponse(_serialize_repo(name, repo_config))


@repos_router.patch("/{name}")
async def patch_repo(name: str, request: Request) -> JSONResponse:
    """Update fields on a repo entry using set_repo_field."""
    from pf.git.repos import set_repo_field

    body = await request.json()
    if not isinstance(body, dict) or not body:
        return JSONResponse({"error": "Request body must be a non-empty JSON object"}, status_code=400)

    project_dir = _get_project_dir()
    results = {}
    errors = []

    for field, value in body.items():
        result = set_repo_field(name, field, value, project_root=Path(project_dir))
        if result["success"]:
            results[field] = result.get("data")
        else:
            errors.append({"field": field, "error": result["error"]})

    if errors:
        return JSONResponse({"error": "Some fields failed to update", "errors": errors, "updated": results}, status_code=400)

    return JSONResponse({"success": True, "updated": results})


# ---------------------------------------------------------------------------
# All repos routers
# ---------------------------------------------------------------------------

all_repos_routers = [repos_router]
