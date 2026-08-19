"""Stack-ready consumer for depends_on (story 162-89, folding 162-45).

The stack-ready gate (``pennyfarthing-dist/gates/stack-ready.md``) previously
resolved a story's parent through a scalar shell capture of
``pf sprint story field <id> depends_on`` — which could not express a
multi-parent (list) dependency. This module is the machine-readable consumer
that replaces that scalar path: it resolves scalar OR list ``depends_on`` into
a per-parent verdict the gate can act on.

A parent is *satisfied* when it is finished or out of the way:
  * an active story with status ``done``, OR
  * an archived/completed story (gh #90 — finishing then archiving is normal
    lifecycle, not a dangling reference), OR
  * a ``canceled`` story — per the 162-83 Client decision, a canceled
    dependency WARNS but does not block (mirrored here so the merge gate and
    ``validate_full_sprint`` agree). The abandoned dep is surfaced in
    ``warnings``, not enforced.

An UNKNOWN story id (not resolvable in the sprint data) is reported as
``found: False, ready: False`` — distinct from a true root — so the gate never
silently auto-passes on a stale/typo'd id (B1).

Returns a result dict (SOUL #10 — no exceptions for control flow).
"""

from __future__ import annotations

from typing import TypedDict

from pf.sprint.validator import (
    ValidationResult,
    _get_archived_story_ids,
    _iter_all_stories,
    _normalize_depends_on,
)


class ParentVerdict(TypedDict):
    """Per-parent resolution: is this dependency satisfied?"""

    id: str
    status: str
    satisfied: bool


class StackReadyVerdict(TypedDict):
    """Machine-readable stack-ready verdict consumed by the gate.

    ``found`` distinguishes an unknown story id from a genuine stack root;
    ``ready`` is the gate's pass/fail signal; ``warnings`` surfaces
    non-blocking notes (e.g. a canceled parent).
    """

    story_id: str
    found: bool
    ready: bool
    is_root: bool
    parents: list[ParentVerdict]
    blocking: list[str]
    warnings: list[str]


def _resolve_depends_on(story: dict) -> list[str]:
    """Expand a story's ``depends_on`` (scalar or list) into a flat id list."""
    dep = story.get("depends_on")
    if dep is None:
        return []
    # Reuse the validator's normalizer for one-truth parsing of scalar/list
    # forms; a throwaway result absorbs its degenerate-form diagnostics (the
    # gate reports readiness, not schema validity).
    return _normalize_depends_on(dep, str(story.get("id", "")), ValidationResult(valid=True))


def evaluate_stack_ready(sprint_data: dict, story_id: str) -> StackReadyVerdict:
    """Resolve the stack-ready status of ``story_id`` from a merged sprint dict.

    Args:
        sprint_data: In-memory merged sprint document (no disk reads here;
            archive resolution honors ``get_project_root`` via the validator).
        story_id: The story whose readiness to evaluate.

    Returns:
        A :class:`StackReadyVerdict`. ``found`` is ``False`` (with
        ``ready: False``) when ``story_id`` resolves to no story — the gate
        must not auto-pass on an unknown id. A true root (story found, no
        ``depends_on``) is ``found: True, is_root: True, ready: True``.
    """
    story: dict | None = None
    for candidate in _iter_all_stories(sprint_data):
        if str(candidate.get("id", "")) == story_id:
            story = candidate
            break

    if story is None:
        # Unknown id — do NOT auto-pass. Distinct from a true root so the gate
        # can surface a stale/typo'd reference instead of silently merging (B1).
        return {
            "story_id": story_id,
            "found": False,
            "ready": False,
            "is_root": False,
            "parents": [],
            "blocking": [],
            "warnings": [
                f"story '{story_id}' not found in sprint data — cannot confirm "
                "its dependencies are merged"
            ],
        }

    parents = _resolve_depends_on(story)
    if not parents:
        return {
            "story_id": story_id,
            "found": True,
            "ready": True,
            "is_root": True,
            "parents": [],
            "blocking": [],
            "warnings": [],
        }

    # Status of every active story, plus the archived-id set for the satisfied
    # check. Archived resolution is lazy — only paid when a parent isn't an
    # active done/canceled story.
    status_by_id = {
        str(s.get("id", "")): str(s.get("status", ""))
        for s in _iter_all_stories(sprint_data)
        if s.get("id")
    }
    archived_ids: set[str] | None = None

    parent_verdicts: list[ParentVerdict] = []
    blocking: list[str] = []
    warnings: list[str] = []
    for ref in parents:
        if ref in status_by_id:
            status = status_by_id[ref]
            if status == "done":
                satisfied = True
            elif status == "canceled":
                # 162-83 (Client): a canceled parent warns but does not block —
                # consistent with validate_full_sprint. Do NOT add to blocking.
                satisfied = True
                warnings.append(
                    f"parent '{ref}' is canceled — dependency abandoned; "
                    "review whether this story still needs it"
                )
            else:
                # Active but unfinished — its status is authoritative; do NOT
                # fall back to the archive (a synthetic active id could
                # false-match a real archived story of the same id).
                satisfied = False
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
        "found": True,
        "ready": not blocking,
        "is_root": False,
        "parents": parent_verdicts,
        "blocking": blocking,
        "warnings": warnings,
    }
