"""Stack-ready consumer for depends_on (story 162-89, folding 162-45).

The stack-ready gate (``pennyfarthing-dist/gates/stack-ready.md``) previously
resolved a story's parent through a scalar shell capture of
``pf sprint story field <id> depends_on`` — which could not express a
multi-parent (list) dependency. This module is the machine-readable consumer
that replaces that scalar path: it resolves scalar OR list ``depends_on`` into
a per-parent verdict the gate can act on.

A parent is *satisfied* when it is finished:
  * an active story with status ``done``, OR
  * an archived/completed story (gh #90 — finishing then archiving is normal
    lifecycle, not a dangling reference).

Returns a result dict (SOUL #10 — no exceptions for control flow).
"""

from __future__ import annotations

from typing import Any

from pf.sprint.validator import (
    ValidationResult,
    _get_archived_story_ids,
    _iter_all_stories,
    _normalize_depends_on,
)


def _resolve_depends_on(story: dict[str, Any]) -> list[str]:
    """Expand a story's ``depends_on`` (scalar or list) into a flat id list."""
    dep = story.get("depends_on")
    if dep is None:
        return []
    # Reuse the validator's normalizer for one-truth parsing of scalar/list
    # forms; a throwaway result absorbs its degenerate-form diagnostics (the
    # gate reports readiness, not schema validity).
    return _normalize_depends_on(dep, str(story.get("id", "")), ValidationResult(valid=True))


def evaluate_stack_ready(sprint_data: dict[str, Any], story_id: str) -> dict[str, Any]:
    """Resolve the stack-ready status of ``story_id`` from a merged sprint dict.

    Args:
        sprint_data: In-memory merged sprint document (no disk reads here;
            archive resolution honors ``get_project_root`` via the validator).
        story_id: The story whose readiness to evaluate.

    Returns:
        Machine-readable verdict::

            {
              "story_id": str,
              "ready": bool,          # every parent satisfied (True for a root)
              "is_root": bool,        # no depends_on
              "parents": [ {"id": str, "status": str, "satisfied": bool}, ... ],
              "blocking": [ str, ... ],   # ids of unsatisfied parents
            }

        A story that resolves to nothing (unknown id) is reported as an
        unknown root — ``ready`` True with an empty parent set — so a caller
        that lost the story never hard-fails here; schema validity is the
        validator's job, not the gate's.
    """
    story: dict[str, Any] | None = None
    for candidate in _iter_all_stories(sprint_data):
        if str(candidate.get("id", "")) == story_id:
            story = candidate
            break

    parents = _resolve_depends_on(story) if story is not None else []
    if not parents:
        return {
            "story_id": story_id,
            "ready": True,
            "is_root": True,
            "parents": [],
            "blocking": [],
        }

    # Status of every active story, plus the archived-id set for the satisfied
    # check. Archived resolution is lazy — only paid when a parent isn't an
    # active done story.
    status_by_id = {
        str(s.get("id", "")): str(s.get("status", ""))
        for s in _iter_all_stories(sprint_data)
        if s.get("id")
    }
    archived_ids: set[str] | None = None

    parent_verdicts: list[dict[str, Any]] = []
    blocking: list[str] = []
    for ref in parents:
        if ref in status_by_id:
            # Active story — its status is authoritative; satisfied iff done.
            # Do NOT fall back to the archive here, or a synthetic active id
            # could false-match a real archived story of the same id.
            status = status_by_id[ref]
            satisfied = status == "done"
        else:
            # Not an active story — a finished-and-archived parent satisfies
            # (gh #90); anything else is an unknown/dangling ref -> blocks.
            if archived_ids is None:
                archived_ids = _get_archived_story_ids()
            if ref in archived_ids:
                status, satisfied = "archived", True
            else:
                status, satisfied = "", False
        parent_verdicts.append({"id": ref, "status": status, "satisfied": satisfied})
        if not satisfied:
            blocking.append(ref)

    return {
        "story_id": story_id,
        "ready": not blocking,
        "is_root": False,
        "parents": parent_verdicts,
        "blocking": blocking,
    }
