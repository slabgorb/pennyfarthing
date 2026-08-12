"""Finish a completed story: archive, merge PR, update Jira, update YAML.

Replaces finish-story.sh with native Python that correctly handles
sharded epic YAML files via read_sprint/write_sprint.

Steps:
  1. Archive session file to sprint/archive/{jira-key}-session.md
  2. Squash merge PR via gh (handle already-merged)
  3. Transition Jira to Done
  4. Update sprint YAML (status: done, completed date)
  5. Archive completed epics
  6. Git cleanup (checkout develop, pull, delete local branch)
  7. Remove session file
"""

import enum
import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal, NamedTuple

import yaml

if TYPE_CHECKING:
    from pf.git.repos import RepoConfig

from pf.common import bounded_run
from pf.sprint.archive_epic import _load_archive_file, _write_archive_file, ensure_archive_file
from pf.sprint.loader import (
    _has_real_jira_key,
    find_story_in_data,
    format_story_not_found_error,
)
from pf.sprint.session_parse import (  # noqa: F401  # SESSION_FIELD_RE re-export; tests import from here
    SESSION_FIELD_RE,
)
from pf.sprint.session_parse import parse_session as _parse_session_impl
from pf.sprint.shard_merge import safe_ref_path
from pf.sprint.story_transition import transition_story
from pf.sprint.yaml_io import _get_epic_ref, read_sprint


def _resolve_epic_ref(project_root: Path, story_id: str, story: dict) -> str:
    """Resolve a story's parent epic id from *authoritative* sprint data.

    The story->epic link is structural: the story lives inside its epic's
    ``stories`` list. ``find_story_in_data`` returns that containing epic, whose
    ``jira`` (or numeric ``id``) is the canonical reference. Falls back to an
    explicit ``jira_epic``/``epic`` field on the story dict (e.g. standalone
    stories that carry their own epic ref).

    Returns ``""`` when no authoritative epic can be determined. The caller must
    then fail loud rather than fabricate one from the id prefix — a naive prefix
    parse turns ``ghost-99`` into ``ghost``, exactly the silent fabrication this
    fix forbids (gh #16).
    """
    try:
        data = read_sprint(project_root / "sprint" / "current-sprint.yaml")
        epic, _found, _location = find_story_in_data(data, story_id)
    except (FileNotFoundError, ValueError):
        # Sprint index missing or malformed — fall through to the explicit
        # field, then to the fail-loud empty result. We never silently invent
        # an epic here.
        epic = None
    if isinstance(epic, dict):
        # Delegate to the one canonical epic-ref formula (SOUL #2). This rejects
        # truthy jira sentinels (none/null/x) and strips the ``epic-`` prefix
        # (ADR-0022), where the old inline ``jira or id`` chain diverged (155-8).
        ref = _get_epic_ref(epic)
        if ref:
            return ref

    explicit = story.get("jira_epic") or story.get("epic") or ""
    return str(explicit).strip()


def _add_story_to_completed(project_root: Path, story_id: str, story: dict) -> dict[str, Any]:
    """Add a story to the sprint completed file.

    Called during story finish so that findings aggregation can discover
    the story even before its parent epic is fully archived.

    The completed row's ``epic`` is sourced from authoritative sprint data via
    :func:`_resolve_epic_ref` (never from the story dict's absent ``epic`` key,
    which always resolved to ``""`` — gh #16). When the parent epic cannot be
    resolved the write fails loud rather than emitting an empty / fabricated
    epic or silently dropping the row.

    Returns:
        Result dict ``{"success": True, "epic": ...}`` on success, or
        ``{"success": False, "error": ...}`` when the epic is unresolvable or
        the archive guard rejects the write (SOUL #10 — return results, never
        swallow).
    """
    epic_ref = _resolve_epic_ref(project_root, story_id, story)
    if not epic_ref:
        return {
            "success": False,
            "error": (
                f"Cannot resolve parent epic for story {story_id!r}: it is absent "
                "from sprint data and carries no explicit epic field. Refusing to "
                "archive a completed row with an empty epic (gh #16)."
            ),
        }

    # The archive-path guard (155-7) rejects unsafe sprint ids with ValueError;
    # surface it as a result instead of crashing finish at step 4b (SOUL #10).
    try:
        archive_path = ensure_archive_file(project_root)
    except ValueError as exc:
        return {"success": False, "error": str(exc)}
    archive_data = _load_archive_file(archive_path)

    existing_ids = {s.get("id") for s in archive_data["completed_stories"]}
    if story_id in existing_ids:
        return {"success": True, "epic": epic_ref, "skipped": "already-present"}

    archive_data["completed_stories"].append(
        {
            "id": story_id,
            "epic": epic_ref,
            "title": story.get("title", ""),
            "points": story.get("points", 0),
            "completed": story.get("completed", date.today().isoformat()),
        }
    )
    try:
        _write_archive_file(archive_path, archive_data)
    except ValueError as exc:
        # A pre-existing row with an empty epic trips the 151-2 guard. Surface it
        # as a result instead of crashing finish or silently dropping the row;
        # backfill (`backfill_epic_refs`) repairs the historical entries.
        return {"success": False, "error": str(exc)}
    return {"success": True, "epic": epic_ref}


def _parse_session(session_path: Path) -> dict[str, str]:
    """Extract metadata fields from a session markdown file.

    Delegates to ``pf.sprint.session_parse.parse_session`` (164-13).

    Parses lines like ``**Jira:** PROJ-14467`` and
    ``**PR:** #748 - title`` into a dict. Only line-start field lines match
    (``SESSION_FIELD_RE`` is anchored) — prose that merely mentions a token
    is never a field (155-40).

    Resolution order (155-40): the ``## Story Details`` section is
    authoritative for ``branch``/``pr`` — the 155-33 template contract puts
    the real fields there, and a hand-written field line in a later section
    (an agent assessment) must not override them. When Story Details lacks
    the field, the first anchored occurrence elsewhere still resolves: that
    fallback is the shipped 155-33 contract for sessions whose only Branch
    field is Dev's hand-written assessment line (the live 155-32 recovery
    shape).
    """
    return _parse_session_impl(session_path)


def _extract_jira_key(fields: dict[str, str]) -> str | None:
    """Get Jira key from session fields, handling markdown link format."""
    raw = fields.get("jira", "")
    # Strip markdown link: [PROJ-14467](https://...)
    raw = re.sub(r"\[([^\]]+)\].*", r"\1", raw).strip()
    if re.match(r"^PROJ-\d+$", raw):
        return raw
    return None


def _extract_pr_number(fields: dict[str, str]) -> str | None:
    """Get PR number from session fields like ``#748 - title``."""
    raw = fields.get("pr", "")
    m = re.search(r"#(\d+)", raw)
    return m.group(1) if m else None


#: No-branch sentinels agents write into the ``**Branch:**`` field. They must
#: resolve to None — a truthy sentinel reaches ``gh pr list --head none``,
#: whose empty answer silently skips the merge (155-33).
#:
#: The set is the contract, and both of its edges are SILENT failures: a value
#: added here turns a real branch into a no-PR finish, and one removed sends a
#: placeholder to gh. Matching is whole-value (after normalization) and
#: case-insensitive, never a prefix or substring — ``feat/none`` is a branch.
#: The lone dash earns its place as an affirmative "no branch" mark, which is
#: also why dash-LEADING values are refused instead (see below): the sentinel
#: covering only the lone dash is what let ``-evil`` reach git's argv (162-4).
_BRANCH_SENTINELS = {"none", "n/a", "na", "null", "-", "—"}

#: Ceiling on the normalization loop below. The strips shrink the value
#: monotonically, so real sessions converge in two or three passes and this
#: bound is never reached — it is a belt against a pathological value, kept as a
#: reviewable module constant rather than a magic number inside the loop. Read
#: at call time so tests can starve it.
_MAX_BRANCH_STRIP_PASSES = 8

#: Characters that cannot appear in an extracted branch name: markdown/annotation
#: residue the strips exist to remove, plus whitespace, which git's own ref
#: grammar forbids outright.
_BRANCH_RESIDUE_CHARS = ("`", "(", ")")


class InvalidBranchValue(ValueError):
    """A session declares a branch value that cannot BE a git branch (162-10).

    Raising beats returning None: None means "this session records no branch",
    which routes finish into the no-PR arm — a silent, SUCCESSFUL finish off a
    value that was never a ref. A declared-but-impossible branch is the
    unverifiable world, not the no-branch world, and epic 155's rule is that
    finish must not lie. ``ValueError`` subclass so existing broad handlers see
    a bad value rather than an unhandled traceback.
    """


def _normalize_branch_field(raw: str) -> str:
    """Strip trailing annotations and markdown backticks to a FIXED POINT.

    Applying the two strips once, in a fixed order, only handles the annotation
    OUTSIDE the backticks. Agents write the other nesting too, and then the
    annotation regex never matches (the value ends with a backtick), leaving the
    annotation glued to the branch name for every downstream git/gh call. So
    both strips run in a loop until the value stops changing.

    Raises:
        InvalidBranchValue: the value had not stabilized when the pass bound was
            spent. A half-reduced value is exactly what must never reach git, so
            the belt fails loud rather than returning residue.
    """
    value = raw
    for _ in range(_MAX_BRANCH_STRIP_PASSES):
        stripped = re.sub(r"\s*\(.*\)\s*$", "", value).strip()
        stripped = stripped.strip("`").strip()
        if stripped == value:
            return value
        value = stripped
    raise InvalidBranchValue(
        f"branch value {raw!r} did not reduce to a branch name within "
        f"{_MAX_BRANCH_STRIP_PASSES} strip passes"
    )


def _extract_branch(fields: dict[str, str]) -> str | None:
    """Get branch name from the shapes agents actually write: trailing
    annotations like ``(pushed)`` and markdown backticks are stripped to a fixed
    point (162-10), and no-branch sentinels resolve to None (155-33).

    Raises:
        InvalidBranchValue: the session declares a value that cannot be a
            branch — dash-leading (an option in git's argv, 162-4), interior
            whitespace, or residue no strip pass can remove.
    """
    raw = fields.get("branch", "")
    value = _normalize_branch_field(raw)
    # Sentinels are tested against the FIXED POINT, so a nested sentinel like a
    # backtick-quoted "none (no branch)" still means no branch — and the lone
    # dash keeps its sentinel meaning ahead of the dash-leading refusal below.
    if value.lower() in _BRANCH_SENTINELS:
        return None
    if not value:
        return None
    if value.startswith("-"):
        raise InvalidBranchValue(
            f"branch value {raw!r} starts with a dash — git reads it as an "
            f"option, not a ref; fix the session's Branch field"
        )
    if any(char.isspace() for char in value) or any(c in value for c in _BRANCH_RESIDUE_CHARS):
        raise InvalidBranchValue(
            f"branch value {raw!r} is not a usable branch name "
            f"(reduced to {value!r}); fix the session's Branch field"
        )
    return value


#: Bounded-subprocess envelope for the whole finish ceremony (162-9). The
#: ceremony is not a read-only report: it wedges MID-SEQUENCE, and an unbounded
#: child blocks it forever for entirely ordinary reasons (a stalled TLS
#: handshake, a credential helper prompting on a non-tty, an ssh host-key
#: prompt, a proxy that blackholes instead of resetting). The tiering lives in
#: one reviewable block so the trade-off is visible: every bound must be loose
#: enough that a working-but-slow command is not killed — a tight bound on the
#: irreversible merge trades a rare hang for a routine mid-merge kill.
#: The default bound and the bounded-run machinery now live in the shared
#: stdlib-only helper (162-41) so other modules inherit "every subprocess is
#: bounded and a hang becomes a result object" instead of re-deriving it. The
#: names below are re-exported: regression suites import ``_TimedOutProcess``
#: from here, and the class must be SHARED (not duplicated) or a
#: helper-produced timeout would slip past every timeout arm 162-9 added.
DEFAULT_TIMEOUT_S = bounded_run.DEFAULT_TIMEOUT_S
#: Network-facing gh calls, including the irreversible merge.
GH_TIMEOUT_S = 120.0
#: Purely local git plumbing: ref existence, commit counting, branch delete.
GIT_LOCAL_TIMEOUT_S = 30.0
#: git that reaches origin.
GIT_NETWORK_TIMEOUT_S = 120.0
#: The step-5 re-entrant pf.cli invocation.
SUBCOMMAND_TIMEOUT_S = 120.0

#: timeout(1)'s conventional exit status, so a timed-out result reads as a
#: failure to every existing ``returncode != 0`` check.
_TIMEOUT_RETURNCODE = bounded_run.TIMEOUT_RETURNCODE

_TimedOutProcess = bounded_run.TimedOutProcess
_timed_out = bounded_run.timed_out


def _run(
    cmd: list[str],
    *,
    timeout: float = DEFAULT_TIMEOUT_S,
    **kwargs: Any,
) -> subprocess.CompletedProcess[str]:
    """Run a subprocess with sane defaults, always BOUNDED (162-9).

    The bound is a default on the helper rather than a kwarg repeated at every
    call site, so "every finish subprocess is bounded" is a property of this
    function instead of an audit of its callers — and the next call site added
    inherits it. An explicitly passed ``timeout`` wins; that is how the
    per-site tiering above is expressed.

    A blown timeout is returned as a :class:`_TimedOutProcess`, and a child that
    could not be SPAWNED at all (``gh`` off PATH, ENOMEM, EMFILE) as a plain
    non-zero result — never raised: an exception escaping ``finish_story``
    violates the no-throw contract (SOUL #10) exactly as badly as the hang it
    replaced, and after the irreversible merge it strands the story with a
    traceback instead of a report. ``stderr`` carries the exception's own text,
    which names the program, its subcommand and the bound that expired — the
    callers below surface it verbatim so "something timed out" is never the
    whole story.

    The machinery lives in :mod:`pf.common.bounded_run` (162-41); the runner is
    passed in rather than imported there so the patchable seam stays HERE —
    every finish test suite fakes ``story_finish.subprocess``, and a helper
    owning its own seam would make all of those fakes no-ops.
    """
    return bounded_run.run(cmd, timeout=timeout, runner=subprocess.run, **kwargs)


def _cwd_kwargs(cwd: Path | None) -> dict[str, str]:
    """``{"cwd": str(cwd)}`` when a repo is known, else no kwarg at all.

    Keeps the pre-162-6 "no cwd" behavior for the direct helper callers that
    pass nothing, while every finish-path call site now supplies the story's
    code repo.
    """
    return {"cwd": str(cwd)} if cwd is not None else {}


#: The union of the fields the PR probes read: ``state`` for the merged checks,
#: ``mergeable``/``mergeStateStatus``/``baseRefName`` for the conflict gate, and
#: ``mergedAt`` to corroborate ``state == "MERGED"`` — a non-null timestamp is
#: the second conjunct in :func:`_view_is_merged` (162-18). One field list means
#: the two pre-merge questions share one round trip (155-32).
_PR_VIEW_FIELDS = "state,mergeable,mergeStateStatus,baseRefName,mergedAt"


class _PRVerdict(enum.StrEnum):
    """Precedence-ordered PR disposition from :func:`_classify_pr`.

    Ordering encodes exactly once: MERGED > UNREADABLE > BLOCKED > MERGEABLE.
    """

    MERGED = "merged"
    UNREADABLE = "unreadable"
    BLOCKED = "blocked"
    MERGEABLE = "mergeable"


class _PRClassification(NamedTuple):
    """Result of :func:`_classify_pr`."""

    verdict: _PRVerdict
    message: str | None  # non-None for BLOCKED; may be None for others
    detail: str | None  # e.g. base branch for BLOCKED


def _classify_pr(view: dict[str, Any] | None) -> _PRClassification:
    """Classify a PR snapshot into a single precedence-ordered verdict.

    Precedence: MERGED > BLOCKED > UNREADABLE > MERGEABLE — encoded here ONCE
    so callers do not depend on the order they call the old helpers.

    The BLOCKED conflict-field check intentionally runs BEFORE the non-str
    ``state`` UNREADABLE guard (rules 3 vs 4). Pre-refactor ``_pr_block_reason``
    checked ``mergeable``/``mergeStateStatus`` INDEPENDENTLY of ``state``
    validity, so a view with a malformed/missing ``state`` that carries
    ``CONFLICTING``/``DIRTY`` was still hard-blocked. Placing UNREADABLE first
    would silently drop that block → fail-open. Rule order (option A from 162-19
    Reviewer R1) preserves the old fail-closed semantics exactly.

    Rules (in evaluation order):
    1. ``view is None`` → UNREADABLE (gh error or timeout arm)
    2. ``state == "MERGED"`` AND ``bool(mergedAt)`` → MERGED
       (``==`` is safe on a non-str state: ``42 == "MERGED"`` is always False)
       (162-1: GitHub stops recomputing mergeability after merge, so stale
       CONFLICTING/DIRTY fields are irrelevant for a corroborated merge)
    3. ``mergeable == "CONFLICTING"`` OR ``mergeStateStatus == "DIRTY"``
       (case-folded) → BLOCKED — reachable even when ``state`` is malformed,
       preserving the pre-refactor fail-closed behaviour
    4. ``view["state"]`` is not a ``str`` (or absent) → UNREADABLE
       (malformed state + no conflict → safe fallthrough to merge attempt)
    5. All else → MERGEABLE
    """
    # Rule 1: None view — gh error or timeout arm
    if view is None:
        return _PRClassification(verdict=_PRVerdict.UNREADABLE, message=None, detail=None)

    # Rule 2: corroborated merge — MERGED + non-null mergedAt (162-18)
    # Safe before the str-check: non-str state never equals "MERGED".
    state = view.get("state")
    if state == "MERGED" and bool(view.get("mergedAt")):
        return _PRClassification(verdict=_PRVerdict.MERGED, message=None, detail=None)

    # Rule 3: definitively non-mergeable — checked BEFORE state type validation
    # to preserve pre-refactor fail-closed behaviour on malformed+conflict views.
    mergeable = str(view.get("mergeable", "")).upper()
    state_status = str(view.get("mergeStateStatus", "")).upper()
    if mergeable == "CONFLICTING" or state_status == "DIRTY":
        base = str(view.get("baseRefName") or "the base branch")
        message = f"CONFLICTING — rebase on {base} and resolve the conflicts before finishing"
        return _PRClassification(verdict=_PRVerdict.BLOCKED, message=message, detail=base)

    # Rule 4: state field-type validation — malformed + no conflict → UNREADABLE
    if not isinstance(state, str):
        return _PRClassification(verdict=_PRVerdict.UNREADABLE, message=None, detail=None)

    # Rule 5: everything else is safe to attempt
    return _PRClassification(verdict=_PRVerdict.MERGEABLE, message=None, detail=None)


def _pr_view_probe(
    pr_number: str,
    cwd: Path | None = None,
) -> tuple[dict[str, Any] | None, str | None]:
    """:func:`_pr_view`, plus the one answer it cannot express: ``(view,
    timeout_message)``.

    A timed-out probe is NOT the permissive "unknown" ``_pr_view`` degrades a gh
    error to (162-9). An error is a fact about one call; a timeout predicts the
    next call hangs too. Degrading a hung branch-to-PR or gate probe drops
    finish into an arm that can silently finish a merged-LOOKING branch, and
    degrading a hung post-merge verification reaches an abort message that
    flatly denies a merge which in fact landed. Callers on the finish path take
    the second element and abort on it; the permissive wrapper stays for the
    dry-run preview, which has no side effects to protect.
    """
    result = _run(
        ["gh", "pr", "view", pr_number, "--json", _PR_VIEW_FIELDS],
        timeout=GH_TIMEOUT_S,
        **_cwd_kwargs(cwd),
    )
    if _timed_out(result):
        return None, (result.stderr or "").strip()
    if result.returncode != 0:
        return None, None
    try:
        data = json.loads(result.stdout)
    except (json.JSONDecodeError, ValueError):
        return None, None
    if not isinstance(data, dict):
        return None, None
    return data, None


def _pr_view(pr_number: str, cwd: Path | None = None) -> dict[str, Any] | None:
    """Fetch one snapshot of the PR, or ``None`` when its state cannot be
    established (``gh`` error, unparseable output, or a payload that is not a
    JSON object).

    ``cwd`` is the repo the PR lives in (162-6). ``gh`` resolves the PR number
    against whatever GitHub remote its working directory points at, so an
    omitted ``cwd`` asks the repo the operator happened to invoke ``pf`` from —
    the orchestrator root, which in an inlined-sub-repo workspace is the wrong
    repository entirely. ``None`` keeps the process cwd, for the direct callers
    that predate repo routing.

    ``None`` is the single "unknown" answer both readers below degrade to, and
    both degrade *permissively*: an unknown PR neither blocks the finish nor
    counts as merged, so the flow falls through to the real merge attempt —
    which is itself guarded by the post-merge verification (gh #71/#60).

    The ``isinstance`` check is load-bearing, not defensive padding. ``null``,
    ``[]`` and bare scalars are all valid JSON that ``json.loads`` accepts
    happily and that then raise ``AttributeError`` on ``.get`` — an exception
    escaping ``finish_story`` instead of the ``{success, error}`` result object
    the caller contracts for.

    A timed-out probe also reads as "unknown" here, which is why the finish path
    calls :func:`_pr_view_probe` instead — this wrapper cannot tell its caller to
    abort (162-9). Its remaining caller is the dry-run preview, which has no
    side effects to protect.
    """
    return _pr_view_probe(pr_number, cwd=cwd)[0]


def _view_is_merged(view: dict[str, Any] | None) -> bool:
    """Return ``True`` iff the snapshot is a corroborated merge.

    Thin wrapper over :func:`_classify_pr` — kept for callers that need the
    boolean directly (``_pr_is_merged``, ``_pr_merge_verification``) and for
    regression suites that import it directly.

    The full semantics live in :func:`_classify_pr` (rules 1–3).
    """
    return _classify_pr(view).verdict == _PRVerdict.MERGED


def _pr_is_merged(pr_number: str, cwd: Path | None = None) -> bool:
    """Return True only when ``gh`` reports the PR in the ``MERGED`` state,
    reading a snapshot taken NOW.

    A zero exit from ``gh pr merge`` is not proof the code landed — the merge can
    silently no-op while the PR stays OPEN (gh #71 / #60). Finish must confirm
    the actual PR state before transitioning the story to ``done``.

    This deliberately re-fetches rather than accepting a snapshot argument. It
    runs *after* the merge, and the whole point is to observe the world the
    merge produced; answering it from the pre-merge snapshot would report the
    state finish already knew and verify nothing.

    ``cwd`` is the story's code repo, for the same reason as :func:`_pr_view`'s
    (162-6): a verification aimed at the wrong repo proves nothing about the PR
    that was just merged.
    """
    return _view_is_merged(_pr_view(pr_number, cwd=cwd))


def _pr_merge_verification(pr_number: str, cwd: Path | None = None) -> tuple[bool, str | None]:
    """:func:`_pr_is_merged`, plus whether the verification itself timed out.

    ``(merged, timeout_message)``. The second element is what keeps the
    post-merge report truthful (162-9): "could not verify" is a different fact
    from "did not merge", and only the caller can tell them apart.
    """
    view, timeout_message = _pr_view_probe(pr_number, cwd=cwd)
    return _view_is_merged(view), timeout_message


def _pr_block_reason(pr_number: str, view: dict[str, Any] | None) -> str | None:
    """Return an actionable abort message for a definitively non-mergeable PR,
    else ``None``.

    Thin wrapper over :func:`_classify_pr` — kept because call sites need the
    pr-number-qualified message string, and regression suites import it directly.
    The blocking logic lives in :func:`_classify_pr` (rule 4).
    """
    cl = _classify_pr(view)
    if cl.verdict != _PRVerdict.BLOCKED:
        return None
    base = cl.detail or "the base branch"
    return (
        f"PR #{pr_number} is CONFLICTING — rebase on {base} and resolve the "
        "conflicts before finishing"
    )


def _field_is_sentinel(raw: str | None) -> bool:
    """True when a raw session field value is an AFFIRMATIVE no-value sentinel
    (``none``/``n/a``/...), as opposed to empty, a template placeholder, or an
    absent key (155-34).

    ``_extract_branch`` collapses all of those to ``None``, but the no-PR gate
    must tell them apart: a sentinel is an agent's deliberate record that no
    branch exists (the accepted 155-1 world), while an empty or placeholder
    value means the field was never filled in — an unverifiable world that
    must not silently finish. Calls ``_extract_branch``'s own normalization
    (annotation strip, backticks, to a fixed point) so ``none (no branch)`` and
    a backtick-quoted form of it still read as the sentinel they are — one
    helper, so the gate and the extractor cannot drift (162-10).
    """
    if raw is None:
        return False
    try:
        value = _normalize_branch_field(raw)
    except InvalidBranchValue:
        # Not a sentinel, and not this gate's error to raise: the extractor has
        # already refused such a value before finish reaches the gate.
        return False
    return value.lower() in _BRANCH_SENTINELS


def _resolve_base_branch(project_root: Path) -> str:
    """The integration branch the no-PR gate verifies against when the caller
    knows of no repo config: the root repo's ``default_branch``, falling back to
    ``develop`` (the gitflow base this finish flow serves) when no repos.yaml
    resolves.

    Root-scoped BY CONSTRUCTION — which is why the finish path passes
    ``_branch_merge_state``'s ``base`` explicitly from the story repo's own
    config (162-6). A code repo's base is its own ``default_branch``, and the
    dogfood topology has a trunk-based ``main`` orchestrator wrapping a gitflow
    ``develop`` framework repo, so borrowing the root's answer looks for a base
    ref the code repo does not have.

    Local import for the same reason as Step 6's: pf.git.repos must not be a
    top-level dependency of pf.sprint (circular layering).
    """
    from pf.git.repos import load_repos_config

    try:
        configs = load_repos_config(project_root)
    except (yaml.YAMLError, OSError):
        return "develop"
    root_repo = next(
        (rc for rc in configs.values() if rc.path in (".", "")),
        None,
    )
    return root_repo.default_branch if root_repo else "develop"


def _resolve_story_repos(
    project_root: Path,
    story: dict,
) -> dict[str, Any]:
    """Every code repo the story's work lives in, as ``(abs_path, config)``.

    The story's ``repos:`` field names them; ``.pennyfarthing/repos.yaml`` gives
    each one its path and its own ``default_branch``/``branch_strategy``. All
    three shapes seen in the wild parse: a bare name, a comma-separated string,
    and a YAML list (same parse as ``staleness._resolve_repo_path``).

    A ``repos:`` value that is absent, empty, or names nothing in repos.yaml
    degrades to the project root paired with the root repo's config — the
    pre-162-6 behavior, which is what single-repo projects (every project with no
    ``repos:`` field anywhere) rely on.

    The degradation is NOT a typo guard, and this docstring used to claim it was
    (162-33, deliverable 5). Resolution is per NAME, so a PARTIAL typo —
    ``repos: "api, tpyo"`` — resolves ``api``, DROPS ``tpyo`` silently, and
    succeeds: the mistyped repo's verification is skipped and no degradation
    happens. Only an ALL-unknown value degrades. Recorded as a Delivery Finding
    rather than fixed here: making an unknown name a hard abort changes the
    finish outcome of existing stories and belongs in its own story.

    ``repos:`` is read from the STORY dict only — it is never inherited from the
    parent epic (162-33, deliverable 6). The field drives irreversible
    ``gh pr merge`` calls, so the set of repos a finish will touch must be
    visible in the same record the operator/agent is reading; an inherited list
    makes it action-at-a-distance from a field the story's author never saw. The
    degraded root pairing is also a SAFE default — the root repo is either
    verifiable or it aborts loudly — whereas inheritance would hand an all-typo
    story a plausible-but-wrong set of repos to verify. SM writes ``repos:``
    onto each story explicitly instead (``schemas/session-schema.md``).

    Returns a result object (162-32): ``{"success": True, "data": [...]}``, or
    ``{"success": False, "error": ...}`` when a named repo is not cloned. The
    first consumer of a resolved path is ``_run(..., cwd=str(repo_path))``, and
    ``subprocess`` on a ``cwd`` that does not exist RAISES — a traceback out of
    a function whose contract is a result (SOUL #6). ``Path.resolve()`` happily
    produces a path to nothing, so the existence check belongs here, mirroring
    ``pf.git.repos.get_repo_paths``'s ``abs_path.exists()`` precedent — but LOUD
    rather than silently dropping the repo, since dropping it would degrade the
    story to the project root and verify the WRONG repository.

    Repos are deduped by RESOLVED PATH, in order (162-32): the same repo named
    twice — or two repos.yaml entries pointing at one directory — made every
    per-repo loop run twice against it, and the merge loop reads a ``pr_views``
    snapshot taken BEFORE the merge, so the second pass re-ran ``gh pr merge``
    on a PR that had just landed and false-aborted fully-shipped work.

    Local import for the same circular-layering reason as
    :func:`_resolve_base_branch`.
    """
    from pf.git.repos import load_repos_config

    try:
        configs = load_repos_config(project_root)
    except (yaml.YAMLError, OSError):
        return {"success": True, "data": [(project_root, None)]}
    raw = story.get("repos")
    if isinstance(raw, list):
        names = [str(n).strip() for n in raw if str(n).strip()]
    elif raw:
        names = [n.strip() for n in str(raw).split(",") if n.strip()]
    else:
        names = []

    resolved = [configs[name] for name in names if name in configs]
    if not resolved:
        root_repo = next((rc for rc in configs.values() if rc.path in (".", "")), None)
        return {"success": True, "data": [(project_root, root_repo)]}

    # Dedup on the RESOLVED PATH, not the name (162-32 R1): two repos.yaml
    # entries can carry the same `path`, and keying on the name lets both survive
    # so the per-repo loop still runs twice against one directory — re-issuing
    # `gh pr merge` off the pre-merge `pr_views` snapshot, i.e. the exact false
    # abort this guard removes. First occurrence wins, order preserved.
    paths: list[tuple[Path, Any]] = []
    seen: set[Path] = set()
    for rc in resolved:
        path = (project_root / rc.path).resolve()
        if path in seen:
            continue
        seen.add(path)
        paths.append((path, rc))
    missing = [(p, rc) for p, rc in paths if not p.is_dir()]
    if missing:
        detail = ", ".join(f"{rc.name} ({p})" for p, rc in missing)
        return {
            "success": False,
            "error": (
                f"Repo not cloned: {detail} — repos.yaml names it, but that "
                "directory does not exist. Clone it (or fix the story's repos: "
                "field) and re-run finish."
            ),
        }
    return {"success": True, "data": paths}


def _valid_branch_name(value: str, cwd: str) -> subprocess.CompletedProcess:
    """Ask git whether *value* is a branch NAME, before anything resolves it.

    A full ref path closes flag parsing and bare-name DWIM (162-4), but
    ``refs/heads/<value>`` is still parsed as a REVISION, so every
    ``gitrevisions(7)`` suffix operator survives the prefixing: ``feat~3``,
    ``feat^^^``, ``feat@{3}`` and ``feat:`` all resolve rc=0 to an ANCESTOR of
    the real tip (or a tree), the reused rev-list endpoint counts 0, and
    unlanded work reads ``merged`` (162-25).

    The check is ``check-ref-format`` on the PREFIXED refname, not
    ``--branch`` on the bare value. Both refuse every operator form — the
    refname grammar bans ``~ ^ : ? * [``, ``@{`` and control characters — but
    they differ on two values that matter:

    - ``--branch`` refuses a dash-leading name, while ``refs/heads/-evil`` is a
      legal refname that plumbing really does create. 162-4 pins that such a
      ref must still be classified rather than reported missing.
    - ``--branch`` is not a pure validator: it EXPANDS ``@{-N}`` to the
      previously-checked-out branch and answers rc=0, so a caller must be
      careful never to trust its stdout. Refname mode has no DWIM at all.

    Legal-but-awkward names (``release-1.2.3``, ``feat/v1.0``, ``a/b/c``) pass
    both, which is the point of asking git instead of writing a regex. The
    prefix also keeps the value out of argv's flag position.

    Returns the raw ``_run`` result: rc=0 means valid, and a
    :class:`_TimedOutProcess` must be routed to the timeout arm rather than
    read as either answer.
    """
    return _run(
        ["git", "check-ref-format", f"refs/heads/{value}"],
        cwd=cwd,
        timeout=GIT_LOCAL_TIMEOUT_S,
    )


#: The two values git's REFNAME grammar accepts but that name the current
#: checkout rather than a branch. ``git check-ref-format refs/heads/HEAD`` and
#: ``refs/heads/@`` both answer rc=0, while ``git check-ref-format --branch
#: HEAD`` answers 128 and ``git branch HEAD`` refuses outright — so the value
#: sails through the 162-25 guard, resolves nowhere once prefixed, and lands on
#: the branch-not-found diagnosis (162-48 item 4).
_NON_BRANCH_ALIASES = frozenset({"HEAD", "@"})

#: Verdicts from :func:`_classify_branch_name`.
_NAME_OK = "ok"
_NAME_REFUSED = "refused"
_NAME_TIMEOUT = "timeout"


def _classify_branch_name(
    value: str,
    cwd: str,
    *,
    allow_dash_leading: bool = True,
) -> tuple[Literal["ok", "refused", "timeout"], str]:
    """The one gate every operator-supplied branch-ish value passes through.

    Returns ``(verdict, detail)``: ``_NAME_OK`` with an empty detail,
    ``_NAME_REFUSED`` with the *family-specific* explanation of why the value is
    not a branch name, or ``_NAME_TIMEOUT`` with git's own timeout text. Callers
    compose the operator-facing prose around ``detail`` — the quoting of the
    value lives at the call site, which knows what the value IS (a branch, a
    base, a remote), so the refusal never quotes an internally prefixed form.

    Beyond :func:`_valid_branch_name`'s refname grammar (unchanged, and still
    the only rule that needs git), three families are refused HERE, in-process
    and before any subprocess runs:

    - ``HEAD``/``@`` — see :data:`_NON_BRANCH_ALIASES`.
    - a value whose first path component is ``refs`` — a field that carries its
      own prefix (``refs/heads/feat``, ``refs/tags/v1.0``). Prefixing it again
      yields ``refs/heads/refs/heads/feat``, a legal refname that resolves
      nowhere. In cleanup it is worse than imprecise: ``git checkout
      refs/remotes/origin/develop`` lands a detached HEAD.
    - a dash-leading value, when *allow_dash_leading* is False.

    The dash asymmetry is deliberate. The READ path keeps classifying
    dash-leading names (162-4: ``refs/heads/-evil`` is a legal ref plumbing
    really does create, and a probe prefixes it out of argv's flag position),
    while cleanup refuses them, because no ``git checkout`` argv reaches one
    safely — ``git checkout -f`` discards every uncommitted modification in the
    repo. One validator, one strictness knob, so the two rules cannot drift.

    The in-process checks run FIRST. A value they refuse costs zero
    subprocesses. A value that passes them costs exactly one read-only
    subprocess — ``git check-ref-format refs/heads/<value>`` via
    :func:`_valid_branch_name` — before any verdict is returned. That single
    read-only check is what lets cleanup promise it emits no MUTATING git at
    all for an unusable value (162-25's AC-3, extended to the mutating path).
    """
    if value in _NON_BRANCH_ALIASES:
        return _NAME_REFUSED, "git's own alias for the current checkout, not a branch"
    if value.split("/", 1)[0] == "refs":
        return _NAME_REFUSED, "this field must hold a bare branch name, not a full ref path"
    if not allow_dash_leading and value.startswith("-"):
        return _NAME_REFUSED, "a dash-leading value reaches git's argv as a flag"

    check = _valid_branch_name(value, cwd)
    if _timed_out(check):
        return _NAME_TIMEOUT, (check.stderr or "").strip()
    if check.returncode != 0:
        return _NAME_REFUSED, "git check-ref-format rejected it"
    return _NAME_OK, ""


def _classify_remote_name(value: str, cwd: str) -> tuple[Literal["ok", "refused", "timeout"], str]:
    """Like :func:`_classify_branch_name`, but for a remote NAME slot.

    A remote name is a single argv token in ``git pull <name> <refspec>``. Git
    resolves a name it does not recognise as a repository URL, and a
    slash-bearing value like ``subdir/evil`` is a legal refname (so
    :func:`_classify_branch_name` accepts it) that git then reads as a LOCAL
    PATH: ``git pull subdir/evil <ref>`` fetches from ``./subdir/evil`` if that
    is a repo, running its client-side hooks (162-48 review F2). Conventional
    remote names are a single path component, so a slash is never needed here
    and is always dangerous — refuse it before the shared branch-name grammar
    runs, then defer to that grammar for everything else (flags, control
    characters, ``refs/``-prefixes, the refname rules).
    """
    if "/" in value:
        return _NAME_REFUSED, (
            "a slash-bearing remote name is read by git as a local path, not a remote"
        )
    return _classify_branch_name(value, cwd, allow_dash_leading=False)


def _branch_merge_state(
    repo_path: Path,
    branch: str,
    base: str | None = None,
    *,
    remote: str | None = None,
) -> dict[str, Any]:
    """Classify a session branch against the base branch: did its work land?

    ``repo_path`` is the repo that OWNS the branch — the story's code repo, not
    necessarily the orchestrator project root (162-6). ``base`` is that repo's
    own integration branch; when omitted it falls back to
    :func:`_resolve_base_branch`, which answers for the root repo.

    Returns ``{"state": "merged" | "unmerged" | "unknown" | "timeout", ...}``
    with ``count``/``base`` on a definitive answer and ``reason`` on an unknown
    or timed-out one. ``timeout`` is kept distinct from ``unknown`` (162-9)
    because the two say different things to the operator: unknown is a fact
    about this repo's refs, while a timed-out probe says the git call itself
    never came back and the next one probably will not either.

    ``base`` in the result has TWO shapes, deliberately (162-26): on every arm
    that reached ref resolution it is the winning FULL ref
    (``refs/remotes/<remote>/<base>``, or ``refs/heads/<base>`` when the remote
    one is absent) — the definitive answers and the rev-list failure arms alike,
    so the operator sees which ref was actually counted against. On every arm
    that returns BEFORE a base ref resolves — a refused name, a branch or base
    that was not found — it is the BARE declared value, echoed back verbatim,
    because no ref was chosen to report.

    All probes route
    through ``_run`` with an explicit
    ``cwd=repo_path`` — the finish family's test suites fake ``_run`` as
    THE hermetic seam, and a cwd-less git call would interrogate whatever
    repo the process happens to sit in (155-34).

    Both ``branch`` and ``base`` are validated as branch NAMES before anything
    resolves them (:func:`_valid_branch_name`); a refused value returns
    ``unknown`` with a reason that quotes it verbatim and calls it invalid, and
    carries no ``count`` — there is no merged/unmerged claim to make about a
    value that is not a branch (162-25).

    ``remote`` is the story repo's configured remote NAME (``RepoConfig.
    remote_name``); ``None``/empty means ``origin``, so every existing repos.yaml
    behaves exactly as before. It is threaded from the call site rather than
    resolved here for the same reason ``base`` is (162-6). Hardcoding ``origin``
    made ``refs/remotes/origin/<base>`` unresolvable in a repo whose remote is
    named anything else, so the base arm fell back to the possibly-stale local
    base and work that had landed upstream read ``unmerged`` — a loud false
    abort on a story that is done.

    Every candidate is a FULL ref path — ``refs/heads/<name>`` or
    ``refs/remotes/<remote>/<name>`` — never a bare name (162-4). A bare name
    is an argv position git may flag-parse (a dash-leading branch reaches
    here intact: ``rev-parse --verify --quiet --local-env-vars`` executes
    the option and prints git's environment) and a rev name git may DWIM to
    the wrong ref (a TAG, or the ``git checkout -b origin/x`` typo branch,
    shadows the intended one and answers ``merged`` for unlanded work). The
    ``--`` separator is NOT the fix: ``rev-parse --verify --quiet -- <ref>``
    returns rc=1. The winning candidate is also the rev-list range endpoint,
    so the counting step cannot fall back into either shadow.

    Ref resolution tries the local branch first (the ref Step 6 would
    delete), then the remote-tracking ref; the base prefers origin's ref
    over the possibly-stale local base so a merge that landed upstream is
    not misread as unmerged. ``unknown`` is deliberately NOT permissive
    here: unlike the PR probes above (which fall through to a merge attempt
    that is itself verified), the no-PR arm has no later verification —
    unknown must abort, never silently finish (rule #1: unknown is not
    merged).
    """
    cwd = str(repo_path)
    base = base or _resolve_base_branch(repo_path)
    remote = (remote or "").strip() or "origin"

    for label, value in (("branch value", branch), ("base branch", base)):
        verdict, detail = _classify_branch_name(value, cwd)
        if verdict == _NAME_TIMEOUT:
            return {"state": "timeout", "base": base, "reason": detail}
        if verdict == _NAME_REFUSED:
            return {
                "state": "unknown",
                "base": base,
                "reason": f"{label} '{value}' is not a valid branch name ({detail})",
            }

    branch_ref = None
    candidates = [f"refs/heads/{branch}", f"refs/remotes/{remote}/{branch}"]
    # 162-26: a remote-qualified value ('<remote>/<name>', the shape a human
    # copies out of 'git branch -a') double-prefixes into
    # 'refs/remotes/<remote>/<remote>/<name>' and resolved nothing, so a story
    # whose work HAD landed aborted as not-found. Widen rather than strip: the
    # correctly-interpreted remote-tracking ref is APPENDED, so the literal
    # candidates keep first-probe priority and the 162-4 look-alike branch at
    # 'refs/heads/<remote>/<name>' (the 'git checkout -b origin/x' typo) still
    # wins and answers for its OWN commits. Stripping instead would let the
    # merged remote-tracking ref speak for the typo branch's unlanded work.
    # Keyed off the CONFIGURED remote (162-6), never a hardcoded 'origin'; a
    # value qualified with some OTHER remote's name stays not-found, which is
    # the same loud abort as any unresolvable branch. ``refs/``-prefixed values
    # are NOT widened — the name gate above refuses them (162-25).
    qualifier = f"{remote}/"
    if branch.startswith(qualifier) and branch[len(qualifier) :]:
        widened = f"refs/remotes/{remote}/{branch[len(qualifier) :]}"
        if widened not in candidates:
            candidates.append(widened)
    for candidate in candidates:
        probe = _run(
            ["git", "rev-parse", "--verify", "--quiet", candidate],
            cwd=cwd,
            timeout=GIT_LOCAL_TIMEOUT_S,
        )
        if _timed_out(probe):
            return {"state": "timeout", "base": base, "reason": (probe.stderr or "").strip()}
        if probe.returncode == 0:
            branch_ref = candidate
            break
    if branch_ref is None:
        return {
            "state": "unknown",
            "base": base,
            "reason": f"branch not found locally or on {remote}",
        }

    base_ref = None
    for candidate in (f"refs/remotes/{remote}/{base}", f"refs/heads/{base}"):
        probe = _run(
            ["git", "rev-parse", "--verify", "--quiet", candidate],
            cwd=cwd,
            timeout=GIT_LOCAL_TIMEOUT_S,
        )
        if _timed_out(probe):
            return {"state": "timeout", "base": base, "reason": (probe.stderr or "").strip()}
        if probe.returncode == 0:
            base_ref = candidate
            break
    if base_ref is None:
        return {
            "state": "unknown",
            "base": base,
            "reason": f"base branch {base!r} not found locally or on {remote}",
        }

    result = _run(
        ["git", "rev-list", "--count", f"{base_ref}..{branch_ref}"],
        cwd=cwd,
        timeout=GIT_LOCAL_TIMEOUT_S,
    )
    if _timed_out(result):
        return {"state": "timeout", "base": base_ref, "reason": (result.stderr or "").strip()}
    if result.returncode != 0:
        reason = (result.stderr or "").strip() or "git rev-list failed"
        return {"state": "unknown", "base": base_ref, "reason": reason}
    try:
        count = int(result.stdout.strip())
    except ValueError:
        return {
            "state": "unknown",
            "base": base_ref,
            "reason": "unparseable rev-list output",
        }
    return {
        "state": "unmerged" if count else "merged",
        "count": count,
        "base": base_ref,
    }


#: ``scheme://userinfo@`` — the only place a git remote URL carries a secret.
_CREDENTIAL_URL_RE = re.compile(r"(https?://)[^@/\s]+@")


def _scrub_credentials(text: str) -> str:
    """Redact the userinfo of any URL in *text* (162-32 R1).

    Step 6 now reports a failing ``git pull``'s stderr verbatim, and with an
    HTTPS-with-token remote that stderr reads
    ``fatal: repository 'https://oauth2:<TOKEN>@github.com/...' not found`` —
    so the token would land in the operator's terminal (``cli.py`` prints the
    warning as-is) on a path that previously discarded the stderr entirely.
    """
    return _CREDENTIAL_URL_RE.sub(r"\1<credentials>@", text)


def _git_cleanup(
    repo_path: Path,
    branch: str | None,
    repo_config: "RepoConfig | None",
) -> list[dict[str, Any]]:
    """Step 6: for gitflow repos, return to the base branch and delete the
    merged feature branch; for trunk-based or unidentified repos, record a skip.

    ``repo_path``/``repo_config`` describe the repo that OWNS the feature branch
    — the story's code repo (162-6). Keying the gitflow decision off the root
    repo instead strands every merged branch in an inlined sub-repo (the root is
    trunk-based, so cleanup "skipped") and, in a gitflow-root workspace, runs
    ``git checkout`` against a repo that has nothing to do with the story.

    Cleanup runs only for a *known gitflow* repo. Trunk-based repos have no
    feature-branch workflow, and an unresolved repo (``repo_config is None``)
    must not be guessed at — running ``git checkout develop`` on a main-only
    repo is exactly the failure this story removes. In both cases cleanup is
    skipped, using the repo's own ``default_branch`` (never a hardcoded guess).

    The repo's ``remote_name`` supplies the pull's remote; empty means
    ``origin``, so every existing repos.yaml is unchanged. Making it
    configurable opens a new argv position, so it is validated exactly like the
    base is (``git pull --upload-pack=<cmd> <ref>`` runs an arbitrary program).

    A ``base`` or ``remote`` this function refuses, and a validation probe that
    times out, both return a single entry carrying a ``warning`` that quotes the
    offending value verbatim. Values refused by an in-process check (``HEAD``,
    ``@``, dash-leading, ``refs/``-prefixed) cost zero subprocesses; all other
    values cost at most one read-only ``git check-ref-format`` probe before any
    mutating command runs (162-69).

    Returns the step entries to append to the finish report.
    """
    if repo_config is None or not repo_config.is_gitflow:
        reason = "root-repo-unresolved" if repo_config is None else "trunk-based"
        return [{"step": 6, "action": "git_cleanup", "skipped": reason, "branch": branch}]

    cwd = str(repo_path)
    base = repo_config.default_branch
    remote = (repo_config.remote_name or "").strip() or "origin"
    entry: dict[str, Any] = {"step": 6, "action": "git_cleanup", "branch": branch}

    def stopped(reason: str) -> list[dict[str, Any]]:
        """The single output shape for "step 6 did not run, and here is why".

        Step 6 runs AFTER the story is done and the YAML is written, so a
        cleanup that cannot proceed is bookkeeping, not a finish failure
        (162-9): un-reporting a story that genuinely shipped is the same lie as
        reporting one that did not. But it must never read as a clean step 6
        either — a silent skip is the failure this epic exists to kill, so the
        report always carries the reason and the operator finishes by hand.
        """
        entry["warning"] = (
            f"git cleanup stopped in {repo_path}: {_scrub_credentials(reason)} — "
            "the story is done; finish the branch cleanup by hand"
        )
        return [entry]

    # Validate BEFORE any git runs. `base` and `remote_name` are hand-edited
    # repos.yaml values reaching argv positions git will flag-parse or DWIM, and
    # step 6 is the one place in this file that MUTATES a working tree: a
    # `default_branch: -f` makes the first command `git checkout -f`, which
    # silently discards every uncommitted modification in the repo. Stricter
    # than the read path by design — see :func:`_classify_branch_name`.
    for classify, describe, value in (
        (
            lambda v: _classify_branch_name(v, cwd, allow_dash_leading=False),
            lambda v, d: f"base branch '{v}' is not a valid branch name ({d})",
            base,
        ),
        (
            # The remote slot has a stricter grammar than a branch name: a
            # slash-bearing value git reads as a local-path URL (162-48 F2).
            lambda v: _classify_remote_name(v, cwd),
            lambda v, d: f"remote name '{v}' is not usable ({d})",
            remote,
        ),
    ):
        verdict, detail = classify(value)
        if verdict == _NAME_TIMEOUT:
            return stopped(detail)
        if verdict == _NAME_REFUSED:
            return stopped(describe(value, detail))

    # A legal name is not an existing branch: `default_branch: develp` is a
    # typo no validator can catch. Confirm it with a read-only probe first, so
    # the chain never runs three mutations off a checkout that could not work —
    # and so a hung git is discovered by this probe rather than by the checkout.
    probe = _run(
        ["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{base}"],
        cwd=cwd,
        timeout=GIT_LOCAL_TIMEOUT_S,
    )
    if _timed_out(probe):
        return stopped((probe.stderr or "").strip())
    if probe.returncode != 0:
        return stopped(
            f"base branch '{base}' does not exist in this repo, so it is not "
            f"usable as a checkout target"
        )

    cleanup: list[tuple[list[str], float]] = [
        # `--` ends the rev list, so git cannot fall back to pathspec mode: a
        # base that happens to name a tracked file would otherwise restore the
        # indexed copy over the operator's uncommitted edit and answer rc=0.
        (["git", "checkout", base, "--"], GIT_LOCAL_TIMEOUT_S),
        # Fully-qualified refspec for the same reason every read-path candidate
        # is (162-4): a bare name is resolved on the remote with the same DWIM,
        # so a tag or an `origin/x`-shaped branch can shadow the intended base.
        (["git", "pull", remote, f"refs/heads/{base}"], GIT_NETWORK_TIMEOUT_S),
    ]
    if branch:
        # Step 2 merges with `gh pr merge --squash --delete-branch`, and `-d`
        # deletes the LOCAL branch too, so on the normal happy path the branch is
        # already gone by the time step 6 runs. `git branch -d` then exits rc=1
        # ("branch 'X' not found"), which — now that every rc is read (162-32) —
        # would report a cleanup failure on EVERY healthy finish. Probe for the
        # branch first (same read-only shape as the base probe above) and skip
        # the delete cleanly when it is absent; the rc that survives this guard
        # is a REFUSED delete, which is exactly the case worth warning about.
        exists = _run(
            ["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
            cwd=cwd,
            timeout=GIT_LOCAL_TIMEOUT_S,
        )
        if _timed_out(exists):
            return stopped((exists.stderr or "").strip())
        if exists.returncode == 0:
            # `--` guards against a branch value that looks like a git flag.
            cleanup.append((["git", "branch", "-d", "--", branch], GIT_LOCAL_TIMEOUT_S))

    for cmd, timeout in cleanup:
        result = _run(cmd, cwd=cwd, timeout=timeout)
        if _timed_out(result):
            # Stop the chain: the later commands assume the earlier one landed
            # (a delete aimed at the branch we are still standing on fails
            # anyway), and step 7 still removes the session.
            return stopped((result.stderr or "").strip())
        if result.returncode != 0:
            # EVERY command's return code is read, not just the checkout's
            # (162-32). Reading the pull's and the delete's rc and discarding
            # them returned the bare `entry` — a step 6 that reads exactly like
            # a clean cleanup — so a failed pull (no network, diverged base) or
            # a refused `branch -d` (git does not consider the branch merged:
            # precisely the case where the operator must look) was reported as
            # success. That is the silent skip this epic exists to kill.
            #
            # Stopping the chain is also the only safe route: a checkout that
            # failed (a conflicting local modification) leaves the feature
            # branch checked out and the pull would land the base's commits ON
            # it, and a delete aimed off a base the pull never updated is
            # refused anyway. Step 6 runs after the story is done, so this is a
            # warning, not a finish failure (162-9), and step 7 still runs.
            return stopped((result.stderr or "").strip() or f"{' '.join(cmd)} failed")
    return [entry]


def _repo_label(repo_path: Path, repo_config: "RepoConfig | None") -> str:
    """The name an operator recognises a repo by: its repos.yaml name, else the
    directory name.

    Used wherever a multi-repo report has to say WHICH repo it is talking about
    (162-33): a half-landed finish that reports only a PR number sends the
    operator hunting for which repository that number belongs to.
    """
    name = str(getattr(repo_config, "name", "") or "").strip()
    return name or repo_path.name


def _verify_no_pr_repo(
    repo_path: Path,
    repo_config: "RepoConfig | None",
    branch: str | None,
    branch_field: str | None,
) -> dict[str, Any]:
    """The no-PR verification gate for ONE repo — read-only, no side effects.

    Returns ``{"success": bool, "step": <step-2 entry>, "error": str | None}``.

    Extracted from the step-2 merge loop (162-33/M4) so it can run BEFORE any
    ``gh pr merge`` does. A multi-repo finish cannot be atomic, so the only safe
    ordering is verify-everything-then-merge: while this check lived inside the
    merge loop, a story whose repo A had a mergeable PR and whose repo B had
    nothing verifiable MERGED A irreversibly and only then refused to mark the
    story done — a partial landing plus a false abort. Being pure and
    side-effect-free is what lets both the real run and the dry-run preview call
    it, which is also how the preview stays honest (155-31 parity).

    The gate itself is unchanged (155-34): the skip is accepted only for worlds
    finish can affirmatively trust — a branch verified fully merged into this
    repo's own base, or an agent's explicit no-branch sentinel. Everything else
    (unmerged commits, an unverifiable/missing branch, empty or placeholder
    fields, or fields absent entirely) is a refusal.
    """
    if branch:
        merge_state = _branch_merge_state(
            repo_path,
            branch,
            base=repo_config.default_branch if repo_config else None,
            remote=repo_config.remote_name if repo_config else None,
        )
        if merge_state["state"] == "merged":
            # NOT ``skipped: True``: this record reaches the report whenever the
            # merge loop runs (it replays the recorded verdicts), and a bare
            # ``skipped`` there reads as the silent skip this epic exists to
            # kill (155-34). The value says what was verified. Note the pre-merge
            # pass holds successful verdicts until that replay, so a repo that
            # aborts the pre-pass suppresses the earlier repos' records too —
            # the abort's own error names the failing repo instead.
            return {
                "success": True,
                "error": None,
                "step": {
                    "step": 2,
                    "action": "merge_pr",
                    "skipped": "branch-verified-merged",
                    "branch_verified_merged_into": merge_state["base"],
                    "repo": _repo_label(repo_path, repo_config),
                },
            }
        if merge_state["state"] == "timeout":
            # A hung git probe is not the permissive unknown either (162-9):
            # the no-PR arm has no later verification, so an unbounded-turned
            # -degraded probe is exactly how unlanded work finishes silently.
            error = (
                f"No PR resolves in {_repo_label(repo_path, repo_config)}, and "
                f"verifying branch {branch!r} timed out: "
                f"{merge_state['reason']} — refusing to mark the story done on "
                "the strength of a probe that never came back. Re-run finish "
                "once git responds."
            )
        elif merge_state["state"] == "unmerged":
            error = (
                f"No PR resolves in {_repo_label(repo_path, repo_config)}, and "
                f"branch {branch!r} has "
                f"{merge_state['count']} unmerged commit(s) not in "
                f"{merge_state['base']} — refusing to mark the story done "
                "with unlanded code. Record the real PR in Story Details "
                "(or merge the branch), then re-run finish."
            )
        else:
            error = (
                f"No PR resolves in {_repo_label(repo_path, repo_config)}, and "
                f"branch {branch!r} cannot be verified "
                f"({merge_state['reason']}) — refusing to mark the story "
                "done with unverifiable work. Record the real PR in Story "
                "Details, or set the Branch field to 'none' if there is "
                "genuinely no branch, then re-run finish."
            )
        return {
            "success": False,
            "error": error,
            "step": {
                "step": 2,
                "action": "merge_pr",
                "branch": branch,
                "repo": _repo_label(repo_path, repo_config),
                "success": False,
                "error": error,
            },
        }
    if _field_is_sentinel(branch_field):
        # An agent affirmatively recorded "no branch" — the accepted
        # 155-1 no-PR world. Nothing exists to verify, by declaration.
        return {
            "success": True,
            "error": None,
            "step": {
                "step": 2,
                "action": "merge_pr",
                "skipped": True,
                "repo": _repo_label(repo_path, repo_config),
            },
        }
    error = (
        "No PR and no branch resolve from the session — the Branch/PR "
        "fields are empty, placeholders, or absent, so finish cannot "
        "verify anything landed. Record the real values in Story "
        "Details (or set them to 'none' to affirm absence), then "
        "re-run finish."
    )
    return {
        "success": False,
        "error": error,
        "step": {
            "step": 2,
            "action": "merge_pr",
            "repo": _repo_label(repo_path, repo_config),
            "success": False,
            "error": error,
        },
    }


def finish_story(
    project_root: Path,
    story_id: str,
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """Finish a story: archive, merge, update Jira, update YAML, clean up.

    Args:
        project_root: Project root directory.
        story_id: Story ID (e.g., "83-2").
        dry_run: If True, report what would happen without side-effects.

    Returns:
        Result dict ``{success, data?, error?, steps?}``.
    """
    # 162-82: guard session path against charset + symlink traversal (CWE-22).
    # A story_id containing '..' or a symlink inside .session/ that escapes the
    # directory are both caught by safe_ref_path before any file I/O.
    try:
        session_path = safe_ref_path(
            project_root / ".session", story_id, prefix="", suffix="-session.md"
        )
    except ValueError as exc:
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Invalid story_id {story_id!r}: path traversal detected — {exc}",
        }
    sprint_path = project_root / "sprint" / "current-sprint.yaml"
    archive_dir = project_root / "sprint" / "archive"
    archive_dir.mkdir(parents=True, exist_ok=True)

    # --- Validate session ---
    if not session_path.exists():
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Session file not found: {session_path}",
        }

    # --- Validate story exists in sprint YAML (155-6) ---
    # An unknown/typo'd id must abort loudly and list candidate IDs, exactly like
    # update/remove — and BEFORE any irreversible step (archive, merge, cleanup)
    # or the dry-run preview. Previously finish only tripped a LATE yaml-update
    # failure via transition_story, after the session was already archived, while
    # the dry-run path reported a clean plan for a story that does not exist
    # (epic 155: finish must not lie). Reuse this single read below.
    #
    # read_sprint raises FileNotFoundError/ValueError on a missing or malformed
    # sprint YAML; keep finish_story's no-throw contract (SOUL #10) by turning
    # that into a result dict rather than letting a raw traceback escape.
    try:
        data = read_sprint(sprint_path)
    except (FileNotFoundError, ValueError) as exc:
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Could not read sprint data: {exc}",
        }
    _epic, story, _location = find_story_in_data(data, story_id)
    if story is None:
        return {
            "success": False,
            "story_id": story_id,
            "error": format_story_not_found_error(data, story_id),
        }

    try:
        fields = _parse_session(session_path)
    except (OSError, UnicodeDecodeError) as exc:
        return {
            "success": False,
            "story_id": story_id,
            "error": (
                f"Cannot read session file `.session/{story_id}-session.md`: {exc}. "
                "To fix: Check file permissions and encoding, then retry."
            ),
        }
    jira_key = _extract_jira_key(fields)
    # A declared-but-impossible branch aborts here: before any subprocess, any
    # transition, and any archive, in dry run too (155-31 preview/reality
    # parity). Converted to a result rather than propagated, per the no-throw
    # contract (SOUL #10).
    try:
        branch = _extract_branch(fields)
    except InvalidBranchValue as exc:
        return {
            "success": False,
            "story_id": story_id,
            "error": f"Cannot finish {story_id}: {exc}",
        }
    pr_number = _extract_pr_number(fields)

    # Resolve Jira key from sprint YAML when the session omits it, reusing the
    # story resolved above. Sentinel jira values ("none"/"null"/"x") are truthy
    # strings but mean "no Jira"; only adopt a real key so archive name, jira
    # step, and the reported jira_key all behave as no-Jira (story 160-3).
    if not jira_key and _has_real_jira_key(story):
        jira_key = story.get("jira")

    # --- Resolve the story's code repo(s) (162-6) ---
    # Every gh/git probe below runs in the repo the story's work actually lives
    # in. ``gh`` answers a PR number against its working directory's remote, so
    # a probe left at the orchestrator root reads a DIFFERENT repository: a
    # number collision merges an unrelated PR, and a miss aborts a finish whose
    # work landed. Step 5 (the epic archive) is the one deliberate exception —
    # it reads the orchestrator's own ``sprint/`` tree.
    # An unresolvable repo (162-32: named in repos.yaml, never cloned) aborts
    # BEFORE any irreversible step — the session stays, nothing is archived —
    # and is REPORTED, not raised: every probe below would otherwise run with a
    # cwd that does not exist and subprocess would throw out of this function.
    repos_result = _resolve_story_repos(project_root, story)
    if not repos_result.get("success"):
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": repos_result.get("error"),
        }
    story_repos = repos_result["data"]

    # PR-field semantics for a multi-repo story: the session carries a single
    # ``**PR:** #N`` line, which can only describe ONE repo, so it is honored
    # only when the story resolves to exactly one repo. A multi-repo story
    # resolves each repo's PR from the shared feature branch, in that repo.
    # (Recorded as a Delivery Finding: a per-repo session syntax belongs in the
    # session schema before multi-repo stories rely on a recorded PR number.)
    session_pr = pr_number if len(story_repos) == 1 else None
    repo_prs: list[tuple[Path, RepoConfig | None, str | None]] = []
    for repo_path, repo_config in story_repos:
        resolved_pr = session_pr
        if not resolved_pr and branch:
            probe = _run(
                [
                    "gh",
                    "pr",
                    "list",
                    "--head",
                    branch,
                    "--json",
                    "number",
                    "--jq",
                    ".[0].number",
                ],
                cwd=str(repo_path),
                timeout=GH_TIMEOUT_S,
            )
            if _timed_out(probe):
                # A timed-out probe must NOT degrade to "no PR resolves" (162-9):
                # that drops finish into the no-PR arm, where a branch that
                # merely LOOKS merged finishes silently. Abort before any
                # irreversible step, naming the command that hung.
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": (
                        f"Timed out resolving the PR for branch {branch!r} in "
                        f"{repo_path}: {(probe.stderr or '').strip()} — refusing to "
                        "treat a hung probe as 'no PR exists'. Re-run finish, or "
                        "record the real PR in Story Details."
                    ),
                }
            if probe.returncode == 0 and probe.stdout.strip():
                resolved_pr = probe.stdout.strip()
        repo_prs.append((repo_path, repo_config, resolved_pr))

    today = date.today().isoformat()
    steps: list[dict[str, Any]] = []
    # 162-82: guard all four path builds (archive name + dialogue paths) against
    # charset + symlink traversal (CWE-22). jira_key is already PROJ-\d+ or None;
    # story_id is the raw CLI arg — a symlink in .session/ or sprint/archive/
    # pointing outside the directory is caught by safe_ref_path before any I/O.
    try:
        _arc_ref = jira_key if jira_key else story_id
        archive_name = safe_ref_path(
            archive_dir, _arc_ref, prefix="", suffix="-session.md"
        ).name
        dialogue_path = safe_ref_path(
            project_root / ".session", story_id, prefix="", suffix="-dialogue.md"
        )
        dialogue_archive_name = safe_ref_path(
            archive_dir, _arc_ref, prefix="", suffix="-dialogue.md"
        ).name
    except ValueError as exc:
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": (
                f"Path traversal detected in archive path for {story_id!r}: {exc}"
            ),
        }

    if dry_run:
        from pf.common.pr_config import get_pr_merge_mode

        steps.append({"step": 1, "action": f"Archive session → {archive_dir / archive_name}"})
        if dialogue_path.exists():
            steps.append(
                {
                    "step": "1b",
                    "action": f"Archive dialogue → {archive_dir / dialogue_archive_name}",
                }
            )
        # ONE step-2 entry per repo, each describing that repo's OWN PR (162-33
        # /M6). The preview used to pair the FIRST resolved PR with the FIRST
        # repo — the positional pairing 162-6 removed from the real run but left
        # here — so for two repos with different PRs the second merge the run
        # will actually attempt was missing from the plan entirely, and when the
        # first repo had no PR the second repo's PR NUMBER was probed in the
        # first repo, where that number means some other PR. A preview of an
        # irreversible merge that names the wrong repo, or hides one, is finish
        # lying (155-31 parity).
        preview_mode = get_pr_merge_mode()
        for repo_path, repo_config, repo_pr in repo_prs:
            if repo_pr and preview_mode == "human":
                steps.append(
                    {
                        "step": 2,
                        "action": f"PR #{repo_pr} — waiting for human review and merge",
                        "repo": _repo_label(repo_path, repo_config),
                    }
                )
            elif repo_pr:
                # 162-19/162-20: Mirror the real-run gate path (155-32 / 162-9 / gh #113).
                # _classify_pr encodes the precedence order ONCE; the verdict routes
                # the dry-run step without positional dependence on call order.
                view, gate_timeout = _pr_view_probe(repo_pr, cwd=repo_path)
                # ``is not None``, never truthiness (162-41): the second element
                # answers "did the probe HANG?" — a presence, carried as a
                # string. An empty message would read as "no timeout" and make
                # the preview promise a merge for a hung probe.
                if gate_timeout is not None:
                    action = (
                        f"Timed out reading the state of PR #{repo_pr} in "
                        f"{repo_path}: {gate_timeout} — refusing to attempt "
                        "the merge without knowing whether the PR conflicts or already "
                        "landed. Re-run finish."
                    )
                else:
                    cl = _classify_pr(view)
                    if cl.verdict == _PRVerdict.MERGED:
                        action = f"PR #{repo_pr} already merged — will skip merge"
                    elif cl.verdict == _PRVerdict.BLOCKED:
                        action = f"PR #{repo_pr} is {cl.message}"
                    else:
                        action = f"Merge PR #{repo_pr} (squash, delete branch)"
                steps.append(
                    {
                        "step": 2,
                        "action": action,
                        "repo": _repo_label(repo_path, repo_config),
                    }
                )
            else:
                # No PR resolves in THIS repo — mirror the real-run no-PR gate
                # (155-34 parity, 164-9), in this repo and against this repo's
                # own base/remote, exactly as the hoisted verification does.
                preview_step = _verify_no_pr_repo(
                    repo_path,
                    repo_config,
                    branch,
                    fields.get("branch"),
                )["step"]
                steps.append(preview_step)
        if jira_key:
            steps.append({"step": 3, "action": f"Transition {jira_key} to Done"})
        else:
            steps.append({"step": 3, "action": "Skip Jira transition (no key)"})
        steps.append(
            {"step": 4, "action": f"Update sprint YAML (status: done, completed: {today})"}
        )
        steps.append({"step": "4c", "action": "Generate demo artifacts"})
        steps.append({"step": 5, "action": "Archive completed epics"})
        if branch:
            steps.append({"step": 6, "action": f"Delete local branch: {branch}"})
        else:
            steps.append({"step": 6, "action": "Skip git cleanup (no branch)"})
        steps.append({"step": 7, "action": "Remove session file"})
        return {"success": True, "dry_run": True, "jira_key": jira_key, "steps": steps}

    # --- Pre-merge gate (gh #113): a definitively non-mergeable PR aborts finish
    # BEFORE any irreversible step. 155-1 made the merge load-bearing; this stops
    # the ceremony even earlier — ahead of archive_session — so a CONFLICTING PR
    # leaves the session, the YAML, and the archive untouched and reports an
    # actionable rebase message instead of a generic merge failure. Indeterminate
    # mergeability (UNKNOWN / gh error) is NOT blocked here: it falls through to
    # the merge + post-merge _pr_is_merged verification.
    from pf.common.pr_config import get_pr_merge_mode

    pr_merge_mode = get_pr_merge_mode()

    # The ONE pre-merge probe (155-32). Both pre-merge questions — "is it
    # conflicting?" and "did it already land?" — are questions about the same
    # snapshot of the same PR, so they share one ``gh pr view``.
    #
    # It is skipped for HUMAN merge mode on purpose. Human merge mode never
    # auto-merges, so it needs neither answer; hoisting the fetch above this
    # guard would add an API round trip to every human-mode finish and put the
    # hard-blocking conflict gate on a path that is deliberately advisory. The
    # condition is "not human" rather than "== auto" so this pass covers exactly
    # the modes the merge loop below MERGES in: the loop now replays the verdicts
    # recorded here, and a mode that merged without visiting this pass would find
    # no verdict to replay.
    #
    # EVERY repo is gated BEFORE any repo is merged (162-6, completed in
    # 162-33/M4): a multi-repo finish cannot be atomic, so the least it can do is
    # not land repo A's PR and then discover repo B's is conflicting — or, the
    # half this pass adds, that repo B has no PR and nothing verifiable either.
    # Both questions are read-only, so both belong here; the merge loop below
    # only replays the verdicts this pass recorded.
    pr_views: dict[Path, dict[str, Any] | None] = {}
    no_pr_steps: dict[Path, dict[str, Any]] = {}
    if pr_merge_mode != "human":
        for repo_path, repo_config, repo_pr in repo_prs:
            if not repo_pr:
                verification = _verify_no_pr_repo(
                    repo_path,
                    repo_config,
                    branch,
                    fields.get("branch"),
                )
                if not verification["success"]:
                    steps.append(verification["step"])
                    return {
                        "success": False,
                        "story_id": story_id,
                        "jira_key": jira_key,
                        "error": verification["error"],
                        "steps": steps,
                    }
                # Keyed by path — ``_resolve_story_repos`` dedupes on resolved
                # path (162-32), so one entry per repo is exactly one step record.
                no_pr_steps[repo_path] = verification["step"]
                continue
            view, gate_timeout = _pr_view_probe(repo_pr, cwd=repo_path)
            # ``is not None``, never truthiness (162-41): the probe's second
            # element is the PRESENCE of a timeout, carried as a string. Testing
            # its content makes an empty message indistinguishable from "the
            # call came back fine" and collapses the hang into the permissive
            # arm below — the one arm this gate exists to keep it out of.
            if gate_timeout is not None:
                # Unlike a gh ERROR, a hung gate probe is not permissively
                # indeterminate (162-9): the process that just hung will hang on
                # the merge call too, and falling through would attempt the
                # irreversible step with no idea whether the PR conflicts or
                # already landed. Abort before anything irreversible runs.
                gate_error = (
                    f"Timed out reading the state of PR #{repo_pr} in {repo_path}: "
                    f"{gate_timeout} — refusing to attempt the merge without knowing "
                    "whether the PR conflicts or already landed. Re-run finish."
                )
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "success": False,
                        "error": gate_error,
                    }
                )
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": gate_error,
                    "steps": steps,
                }
            pr_views[repo_path] = view
            cl = _classify_pr(view)
            block_reason: str | None = None
            if cl.verdict == _PRVerdict.BLOCKED:
                # Prefix the classifier's message with the PR number so the
                # abort reason is fully qualified (callers expect "PR #N is…").
                block_reason = f"PR #{repo_pr} is {cl.message}"
            if block_reason:
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "success": False,
                        "error": block_reason,
                    }
                )
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": block_reason,
                    "steps": steps,
                }

    # --- Step 2: Merge PR (runs BEFORE archive) ---
    # The merge is verified here, ahead of the (irreversible) session archive, so
    # a blocked/denied or un-landed merge aborts finish leaving NO stray archive
    # copy in sprint/archive/ (155-15). 155-1 already made the merge load-bearing
    # for the ``done`` transition + session removal; this ordering extends the
    # same guarantee to archiving. The pre-merge CONFLICTING gate above still
    # short-circuits definitively-conflicting PRs even earlier. A review-required
    # guardrail (mergeable=MERGEABLE, mergeStateStatus=BLOCKED) is not detectable
    # as CONFLICTING; it surfaces as a non-zero ``gh pr merge`` (or a merge that
    # never reaches MERGED) and is caught by the two abort branches below —
    # before Step 1 archives anything.
    #
    # EVERY repo the story touches must clear this gate before the story can go
    # done (162-6/AC2): one repo merged and another still open is half-shipped
    # work, and the abort names the PR that did not land so the operator knows
    # which repo to chase.
    #
    # Every read-only check now runs in the pass above, so the residual
    # non-atomic case is narrow: a merge GitHub itself refuses (a review
    # requirement, a race) after an earlier repo's merge already landed. That
    # case cannot be prevented, so it is REPORTED — ``landed_repos`` plus a note
    # on the error names what shipped, because an operator told only "PR #B merge
    # failed" has no way to know half the story is already on the base branch
    # (162-33/M5).
    landed_repos: list[str] = []

    def _half_landed_note() -> str:
        if not landed_repos:
            return ""
        return (
            " — WARNING: this run ALREADY MERGED the PR(s) for: "
            f"{', '.join(landed_repos)}. That code is on the base branch while "
            "this story is NOT done. Revert those merges, or fix the failure "
            "above and re-run finish (an already-landed merge is skipped on the "
            "retry)."
        )

    for repo_path, repo_config, repo_pr in repo_prs:
        if pr_merge_mode == "human":
            # Human merge mode never auto-merges; the story is left in_review
            # below for a human to merge. Nothing here is load-bearing.
            if repo_pr:
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "mode": "human",
                        "message": f"PR #{repo_pr} ready for human review and merge",
                    }
                )
            else:
                steps.append({"step": 2, "action": "merge_pr", "mode": "human", "skipped": True})
            continue

        if repo_pr and _classify_pr(pr_views.get(repo_path)).verdict == _PRVerdict.MERGED:
            # Already-merged short-circuit (155-29): a prior finish run landed
            # the merge and then aborted on a later step (archive OSError,
            # status-read guard, transition failure) — all of which keep the
            # session so finish can be retried. The retry must NOT re-attempt
            # ``gh pr merge``: gh exits non-zero on a merged PR ("already
            # merged"), which would trip the rc!=0 abort below and wedge every
            # retry.
            #
            # This reads the pre-merge snapshot taken by the conflict gate above
            # — correct here precisely because nothing has happened since: no
            # merge was attempted, so the snapshot still describes the current
            # PR. The post-merge verification below must NOT do this. An
            # unreadable probe leaves the snapshot None, which reads as NOT
            # merged and falls through to the real merge attempt — never
            # silently skips it.
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "pr": repo_pr,
                    "merged": True,
                    "already_merged": True,
                }
            )
            continue

        if repo_pr:
            # Auto merge mode: the merge is load-bearing. A non-zero merge OR a
            # merge that did not actually land must abort finish BEFORE the story
            # is flipped to ``done`` AND before the session is archived —
            # otherwise we mark a story shipped whose code never reached the base
            # branch (gh #71 / #60) or leave a stray archive that lies about
            # completion (155-15). Return loud, run no irreversible step (no
            # archive, no transition, no session removal).
            merge_result = _run(
                ["gh", "pr", "merge", repo_pr, "--squash", "--delete-branch"],
                cwd=str(repo_path),
                timeout=GH_TIMEOUT_S,
            )
            if _timed_out(merge_result):
                # The irreversible step hung. Whether it landed server-side is
                # genuinely unknown, so the report says exactly that and nothing
                # more (162-9) — it must not blame unmerged code, which would
                # send an operator to re-merge or revert a PR that may be fine.
                # 155-29's already-merged short-circuit makes the re-run safe.
                merge_timeout_error = (
                    f"Timed out merging PR #{repo_pr}: "
                    f"{(merge_result.stderr or '').strip()} — whether the merge "
                    "landed on GitHub is unknown, so the story is not being marked "
                    "done. Check the PR and re-run finish; an already-landed merge "
                    "is skipped on the retry."
                )
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "success": False,
                        "error": merge_timeout_error,
                    }
                )
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": merge_timeout_error + _half_landed_note(),
                    "landed_repos": list(landed_repos),
                    "steps": steps,
                }
            if merge_result.returncode != 0:
                stderr = (merge_result.stderr or "").strip()
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "success": False,
                        "error": stderr or "gh pr merge returned non-zero",
                    }
                )
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": (
                        f"PR #{repo_pr} ({_repo_label(repo_path, repo_config)}) "
                        f"merge failed: {stderr or 'gh pr merge returned non-zero'} — "
                        "refusing to mark the story done with unmerged code"
                    )
                    + _half_landed_note(),
                    "landed_repos": list(landed_repos),
                    "steps": steps,
                }
            verified_merged, verify_timeout = _pr_merge_verification(repo_pr, cwd=repo_path)
            # ``is not None``, never truthiness (162-41): an empty message would
            # skip this arm for the one below, which flatly states the PR is not
            # MERGED — about a merge that landed.
            if verify_timeout is not None:
                # The merge command completed; the VERIFICATION hung. Finish
                # still cannot mark the story done — it has no confirmation —
                # but the report must say "could not verify", never "the PR did
                # not land" (162-9). That state is un-observed, and in the case
                # this guards it is false: routing this into the abort below
                # would tell an operator to chase unmerged code for a merge that
                # went through. The step record keeps the merge attempt visible
                # so a retry (and 155-29's short-circuit) can reason about it.
                verify_error = (
                    f"PR #{repo_pr}: the merge command completed, but confirming the "
                    f"result timed out: {verify_timeout} — refusing to mark the story "
                    "done without confirmation. Check the PR's state and re-run "
                    "finish; an already-landed merge is skipped on the retry."
                )
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "merge_command_completed": True,
                        "success": False,
                        "error": verify_error,
                    }
                )
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": verify_error + _half_landed_note(),
                    "landed_repos": list(landed_repos),
                    "steps": steps,
                }
            if not verified_merged:
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "pr": repo_pr,
                        "success": False,
                        "error": "PR is not in MERGED state after the merge step",
                    }
                )
                return {
                    "success": False,
                    "story_id": story_id,
                    "jira_key": jira_key,
                    "error": (
                        f"PR #{repo_pr} ({_repo_label(repo_path, repo_config)}) is not "
                        "MERGED after the merge step — refusing to mark the story done "
                        "with unmerged code"
                    )
                    + _half_landed_note(),
                    "landed_repos": list(landed_repos),
                    "steps": steps,
                }
            landed_repos.append(_repo_label(repo_path, repo_config))
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "pr": repo_pr,
                    "repo": _repo_label(repo_path, repo_config),
                    "merged": True,
                }
            )
            continue

        # --- No-PR verification: already decided, before any merge ran ---
        # The gate itself is 155-34's and lives in :func:`_verify_no_pr_repo`; it
        # ran for EVERY repo in the hoisted pre-merge pass above (162-33/M4).
        # Running it here — interleaved with the merges — is what let a mixed
        # multi-repo story land repo A's PR and only then refuse on repo B, so
        # this arm now only replays the verdict recorded for this repo. A repo
        # that failed verification never reaches this loop at all.
        steps.append(no_pr_steps[repo_path])

    # --- Step 1 / 1b: Archive session + dialogue (only after the merge is verified) ---
    # Kept labelled "step 1"/"1b" for report stability, but executed after Step 2 so a
    # blocked/denied merge never leaves a stray archive behind (155-15). Reached only
    # when the merge landed, was skipped (no PR), or is a human-merge hold.
    #
    # The copy now sits AFTER the irreversible merge (gh pr merge --delete-branch), so
    # an OSError here (disk full, permission, session file vanished) must NOT propagate
    # past finish_story's no-throw contract (SOUL #10) into an unhandled traceback at
    # the CLI boundary — that would leave a merged/branch-deleted PR with the story
    # stuck in_review and the session unremoved. Abort loud-but-clean, exactly like the
    # merge/verify/transition failures above: return a result dict, run no further
    # irreversible step (no done transition, no session removal).
    archive_dest = archive_dir / archive_name
    try:
        shutil.copy2(session_path, archive_dest)
    except OSError as exc:
        steps.append(
            {
                "step": 1,
                "action": "archive_session",
                "success": False,
                "error": str(exc),
            }
        )
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": (
                f"Failed to archive session for {story_id}: {exc} — refusing to "
                "mark the story done with an un-archived session"
            ),
            "steps": steps,
        }
    steps.append({"step": 1, "action": "archive_session", "dest": str(archive_dest)})

    if dialogue_path.exists():
        dialogue_dest = archive_dir / dialogue_archive_name
        try:
            shutil.copy2(dialogue_path, dialogue_dest)
        except OSError as exc:
            # Step 1 already landed — remove the partial session archive before
            # returning so no stray file is left behind (SOUL #14).
            try:
                archive_dest.unlink()
            except OSError:
                pass
            steps.append(
                {
                    "step": "1b",
                    "action": "archive_dialogue",
                    "success": False,
                    "error": str(exc),
                }
            )
            return {
                "success": False,
                "story_id": story_id,
                "jira_key": jira_key,
                "error": (
                    f"Failed to archive dialogue for {story_id}: {exc} — refusing to "
                    "mark the story done with an un-archived session"
                ),
                "steps": steps,
            }
        steps.append({"step": "1b", "action": "archive_dialogue", "dest": str(dialogue_dest)})

    # --- Steps 3 & 4: Transition via state machine (Jira + YAML atomically) ---
    # Story should already be in_review (transitioned at review phase entry).
    # If still in_progress (legacy/edge case), do the two-step.
    #
    # read_sprint raises FileNotFoundError/ValueError on a missing or malformed
    # sprint YAML (155-16, same taxonomy as the primary-read guard above). A
    # sprint index that became unreadable since that first read must abort the
    # ceremony loudly HERE — before any status transition — not proceed on a
    # silently assumed in_progress and surface later as a generic yaml-update
    # failure (or, worse, complete the full done ceremony against a broken
    # index). The merge has already landed at this point, so this abort leaves
    # the same merged-but-not-done state as the transition-failure abort below:
    # session kept, no done transition, no irreversible cleanup.
    #
    # The trailing broad fallback is the PRE-EXISTING behavior for exotic
    # exceptions, deliberately retained (155-16): this read runs after the
    # irreversible merge, so an unexpected exception type escaping
    # finish_story's no-throw contract (SOUL #10) would strand a merged story
    # with a raw traceback — strictly worse than degrading to the transition
    # path, which fails loudly on a genuinely broken index anyway.
    try:
        data = read_sprint(sprint_path)
        _epic, current_story, _location = find_story_in_data(data, story_id)
        current_status = (
            current_story.get("status", "in_progress") if current_story else "in_progress"
        )
    except (FileNotFoundError, ValueError) as exc:
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": (
                f"Could not read sprint data for the status transition: {exc} — "
                "refusing to transition against an unreadable sprint index"
            ),
            "steps": steps,
        }
    except Exception as exc:
        # The broad fallback is deliberately kept (155-16, above) but must not be
        # SILENT (162-9/AC1). It fires after the irreversible merge and rewrites
        # the story's real status to an ASSUMED in_progress, which then drives two
        # bridge transitions against a sprint index we have just proven
        # unreadable — and the operator saw a clean finish. Name the error on
        # stderr and in the report; degrading loudly is the point, so this still
        # must not raise.
        status_read_warning = (
            f"Could not read sprint data for the status transition: {exc!r} — "
            "assuming status 'in_progress' and continuing after the merge. The "
            "sprint index may be broken; verify this story's status by hand."
        )
        print(f"WARNING: {status_read_warning}", file=sys.stderr)
        steps.append(
            {
                "step": "3a",
                "action": "status_read",
                "success": False,
                "warning": status_read_warning,
            }
        )
        current_status = "in_progress"

    # Bridge through intermediate states to reach in_review (or done).
    # Stories may be stuck in backlog if work.py:start_work() never ran.
    if current_status == "backlog":
        transition_story(project_root, story_id, "in_progress")
        current_status = "in_progress"
    if current_status == "in_progress":
        transition_story(project_root, story_id, "in_review")

    if pr_merge_mode == "auto":
        t_result = transition_story(project_root, story_id, "done")
    else:
        # Human merge mode: leave in in_review until human merges
        t_result = {"success": True, "to_status": "in_review"}
    if t_result.get("success"):
        if jira_key:
            steps.append({"step": 3, "action": "jira_done", "key": jira_key})
        else:
            steps.append({"step": 3, "action": "jira_done", "skipped": True})
        steps.append({"step": 4, "action": "yaml_update", "status": "done", "completed": today})
    else:
        # Loud fail: a yaml-update failure during the final transition leaves
        # the sprint in inconsistent state. Stop now — do NOT run irreversible
        # cleanup (epic archive, branch delete, session removal).
        transition_error = t_result.get("error", "Transition failed")
        if jira_key:
            steps.append(
                {
                    "step": 3,
                    "action": "jira_done",
                    "key": jira_key,
                    "success": False,
                    "error": transition_error,
                }
            )
        else:
            steps.append(
                {
                    "step": 3,
                    "action": "jira_done",
                    "skipped": True,
                    "success": False,
                    "error": "No Jira key available",
                }
            )
        steps.append(
            {
                "step": 4,
                "action": "yaml_update",
                "success": False,
                "error": transition_error,
            }
        )
        return {
            "success": False,
            "story_id": story_id,
            "jira_key": jira_key,
            "error": f"yaml-update step failed during finish: {transition_error}",
            "steps": steps,
        }

    # --- Step 4b: Add story to completed file ---
    # Surface the add-result as a step rather than swallowing it: an unresolved
    # epic must not silently drop the completed row (gh #16). This bookkeeping
    # add is non-fatal to finish, but the failure is recorded, never hidden.
    #
    # The re-read is guarded (155-9): it runs AFTER the irreversible merge and
    # done-transition, so an unexpected I/O/parse error here must degrade to a
    # RECORDED 4b failure and let steps 4c-7 run — never escape finish_story's
    # no-throw contract and strand a merged story with its session in place
    # (SOUL #10). Broad catch is deliberate: any exception at this point is
    # strictly bookkeeping, and the failure is surfaced in the step entry.
    try:
        data_step4b = read_sprint(sprint_path)
        _epic, completed_story, _location = find_story_in_data(data_step4b, story_id)
    except Exception as exc:
        completed_story = None
        steps.append(
            {
                "step": "4b",
                "action": "add_completed_story",
                "success": False,
                "error": (f"Could not re-read sprint data for completed-row bookkeeping: {exc}"),
            }
        )
    else:
        if not completed_story:
            steps.append(
                {
                    "step": "4b",
                    "action": "add_completed_story",
                    "success": False,
                    "error": (
                        f"Story {story_id} not found in re-read sprint data; "
                        "completed row not recorded"
                    ),
                }
            )
    if completed_story:
        add_result = _add_story_to_completed(project_root, story_id, completed_story)
        if add_result.get("success"):
            steps.append(
                {"step": "4b", "action": "add_completed_story", "epic": add_result.get("epic")}
            )
        else:
            steps.append(
                {
                    "step": "4b",
                    "action": "add_completed_story",
                    "success": False,
                    "error": add_result.get("error"),
                }
            )

    # --- Step 4c: Generate demo artifacts (non-fatal) ---
    try:
        from pf.demo import orchestrator as demo_orchestrator

        demo_result = demo_orchestrator.generate(story_id, project_root=project_root)
        if demo_result.get("success"):
            steps.append({"step": "4c", "action": "demo_generate"})
        else:
            steps.append(
                {
                    "step": "4c",
                    "action": "demo_generate",
                    "warning": demo_result.get("error", "Demo generation failed"),
                }
            )
    except Exception as exc:
        steps.append(
            {
                "step": "4c",
                "action": "demo_generate",
                "warning": f"Demo generation error: {exc}",
            }
        )

    # --- Step 5: Archive completed epics ---
    # Deliberately NOT routed into the story's code repo (162-6 over-reach
    # guard): this reads the ORCHESTRATOR's ``sprint/`` tree, which no code repo
    # has — re-routing it would make the epic archive a silent no-op.
    archive_result = _run(
        [sys.executable, "-m", "pf.cli", "sprint", "epic", "archive"],
        cwd=str(project_root),
        timeout=SUBCOMMAND_TIMEOUT_S,
    )
    if _timed_out(archive_result):
        # Post-done bookkeeping: recorded, not fatal (162-9). The story shipped.
        steps.append(
            {
                "step": 5,
                "action": "archive_epics",
                "ran": False,
                "warning": (
                    f"Timed out: {(archive_result.stderr or '').strip()} — the story "
                    "is done; re-run the epic archive by hand"
                ),
            }
        )
    elif archive_result.returncode != 0:
        # A timeout is not the only way this command can fail to happen
        # (162-41). A non-zero exit reported as ``ran: True`` is the silent skip
        # epic 162 exists to kill: the epics are still open and the operator is
        # told the archive completed. Not fatal — the story is already done —
        # but the step must carry the reason, verbatim from the subcommand.
        steps.append(
            {
                "step": 5,
                "action": "archive_epics",
                "ran": False,
                "warning": (
                    f"Epic archive exited {archive_result.returncode}: "
                    f"{(archive_result.stderr or '').strip() or 'no output'} — the "
                    "story is done; re-run the epic archive by hand"
                ),
            }
        )
    else:
        steps.append({"step": 5, "action": "archive_epics", "ran": True})

    # --- Step 6: Git cleanup ---
    # Cleanup runs in each of the story's code repos — those are where the
    # feature branch exists (162-6). Only a known gitflow repo gets branch
    # cleanup; trunk-based or an unresolved repo is skipped by _git_cleanup.
    for repo_path, repo_config in story_repos:
        steps.extend(_git_cleanup(repo_path, branch, repo_config))

    # --- Step 7: Remove session file ---
    if session_path.exists():
        session_path.unlink()
    steps.append({"step": 7, "action": "remove_session"})

    return {
        "success": True,
        "story_id": story_id,
        "jira_key": jira_key,
        "steps": steps,
    }
