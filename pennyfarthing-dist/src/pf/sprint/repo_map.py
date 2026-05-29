"""Map file paths to repos using repos.yaml topology (longest-prefix match)."""

from __future__ import annotations

from pathlib import Path

from pf.git.repos import RepoConfig, load_repos_config


def map_path_to_repo(file_path: str, repos: dict[str, RepoConfig]) -> str | None:
    """Return the repo name owning ``file_path`` by longest path-prefix match.

    A repo whose ``path`` is ``"."`` (orchestrator/standalone) is the fallback
    used only when no more-specific repo prefix matches. Returns None when no
    repo matches and there is no ``"."`` repo.
    """
    norm = file_path.strip()
    if norm.startswith("./"):
        norm = norm[2:]

    best_name: str | None = None
    best_len = -1
    dot_repo: str | None = None

    for name, rc in repos.items():
        rp = rc.path.strip()
        if rp in (".", ""):
            dot_repo = name
            continue
        rp = rp.strip("/")
        if norm == rp or norm.startswith(rp + "/"):
            if len(rp) > best_len:
                best_len = len(rp)
                best_name = name

    return best_name if best_name is not None else dot_repo


def repos_for_files(
    files: list[str], project_root: Path | None = None
) -> list[str]:
    """Return the deduped, order-preserving list of repo names for ``files``."""
    repos = load_repos_config(project_root)
    if not repos:
        return []
    out: list[str] = []
    for f in files:
        name = map_path_to_repo(f, repos)
        if name and name not in out:
            out.append(name)
    return out
