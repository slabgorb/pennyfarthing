"""Advisory never-edit-zone hook (PreToolUse) — ADR-0041 Phase 1.

Fires the instant Claude is about to edit a path inside a repos.yaml
``never_edit`` zone and injects an advisory reminder pointing at the correct
source (e.g. edit the ``pennyfarthing-dist/`` source, not the ``.pennyfarthing/``
symlink).

It is ADVISORY ONLY: it returns ``additionalContext`` via the PreToolUse
HookResponse and NEVER a permission decision, and it exits 0 on every path.
Enforcement stays with ``pre_edit_check`` / ``branch_protection`` — this hook
only informs.

Never-edit zones are read from ``repos.yaml`` (the single source of truth) via
the existing loader ``pf.git.repos.load_repos_config``. Matching is
gitignore-style. Fail-soft: any error, a missing/malformed ``repos.yaml``, or a
bad stdin payload results in no output and exit 0 — never a crash or a block.
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

from pf.git.repos import load_repos_config


def _translate(pattern: str) -> str:
    """Translate a gitignore-style glob into a regex over a repo-relative path.

    - A pattern with no ``/`` matches the basename at any depth.
    - ``**`` spans zero-or-more path segments; ``*`` stays within one segment;
      ``?`` is one non-``/`` char. A ``/`` in the pattern anchors it to the
      repo-relative root.
    """
    p = pattern.strip()
    if p.startswith("/"):
        p = p[1:]
    anchored = "/" in p
    out: list[str] = []
    i, n = 0, len(p)
    while i < n:
        c = p[i]
        if c == "*":
            if i + 1 < n and p[i + 1] == "*":
                i += 2
                if i < n and p[i] == "/":
                    i += 1
                    out.append("(?:[^/]+/)*")  # '**/' -> zero or more segments
                else:
                    out.append(".*")  # trailing/embedded '**' -> anything incl '/'
            else:
                out.append("[^/]*")  # '*' -> within a single segment
                i += 1
        elif c == "?":
            out.append("[^/]")
            i += 1
        else:
            out.append(re.escape(c))
            i += 1
    body = "".join(out)
    return "^" + body + "$" if anchored else "(?:^|/)" + body + "$"


def _matches(pattern: str, rel_path: str) -> bool:
    """True if *rel_path* matches the gitignore-style *pattern*.

    A malformed pattern is skipped (returns False), never raised.
    """
    try:
        return re.search(_translate(pattern), rel_path) is not None
    except re.error:
        return False


def _source_for(rel_path: str, symlinks: dict[str, str]) -> str | None:
    """If *rel_path* lies under a symlink link-path, rewrite it onto the source."""
    best: str | None = None
    for link in symlinks:
        key = link.rstrip("/")
        if rel_path == key or rel_path.startswith(key + "/"):
            if best is None or len(key) > len(best):
                best = key
    if best is None:
        return None
    target = symlinks.get(best) or symlinks.get(best + "/", "")
    return target.rstrip("/") + rel_path[len(best):]


def _advisory_for(rel_path: str, project_root: Path) -> str | None:
    """Return an advisory reminder if *rel_path* is in a never-edit zone, else None."""
    repos = load_repos_config(project_root)
    for repo in repos.values():
        repo_path = repo.path.rstrip("/")
        if repo_path in (".", ""):
            rel_to_repo = rel_path
        elif rel_path == repo_path:
            rel_to_repo = ""
        elif rel_path.startswith(repo_path + "/"):
            rel_to_repo = rel_path[len(repo_path) + 1:]
        else:
            continue  # this file is not inside this repo
        for pattern in repo.never_edit:
            if _matches(pattern, rel_to_repo):
                source = _source_for(rel_path, repo.symlinks)
                if source:
                    return (
                        f"⚠️ `{rel_path}` is a repos.yaml never-edit symlink zone — "
                        f"edit the source at `{source}` instead."
                    )
                return (
                    f"⚠️ `{rel_path}` is in a repos.yaml never-edit zone (`{pattern}`) — "
                    f"do not edit build output / dependencies / symlinks."
                )
    return None


def main() -> None:
    """PreToolUse entry point — advise (never block) on a never-edit-zone edit."""
    try:
        try:
            data = json.loads(sys.stdin.read())
        except (json.JSONDecodeError, ValueError):
            sys.exit(0)

        tool_input = data.get("tool_input", {}) or {}
        file_path = tool_input.get("file_path", "") or tool_input.get("path", "")
        if not file_path:
            sys.exit(0)

        # Honor CLAUDE_PROJECT_DIR (the project Claude is editing) directly, like
        # pre_edit_check does — NOT get_project_root(), which prefers a PROJECT_ROOT
        # override that can point at a different repo.
        project_root = Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).resolve()
        fp = Path(file_path)
        if fp.is_absolute():
            try:
                rel_path = fp.resolve().relative_to(project_root).as_posix()
            except ValueError:
                sys.exit(0)  # edit is outside the project — nothing to say
        else:
            rel_path = fp.as_posix()
        if rel_path.startswith("./"):
            rel_path = rel_path[2:]

        advisory = _advisory_for(rel_path, project_root)
        if advisory:
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "additionalContext": advisory,
                        }
                    }
                )
            )
    except SystemExit:
        raise
    except Exception:
        pass  # advisory hook: never break a prompt or an edit

    sys.exit(0)


if __name__ == "__main__":
    main()
