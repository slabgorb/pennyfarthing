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

import json
import re
import shutil
import subprocess
import sys
from datetime import date
from pathlib import Path
from typing import TYPE_CHECKING, Any

if TYPE_CHECKING:
    from pf.git.repos import RepoConfig

from pf.sprint.archive_epic import _load_archive_file, _write_archive_file, ensure_archive_file
from pf.sprint.loader import (
    _has_real_jira_key,
    find_story_in_data,
    format_story_not_found_error,
)
from pf.sprint.story_transition import transition_story
from pf.sprint.yaml_io import _get_epic_ref, read_sprint

#: Anchored to line start (155-40). The old unanchored ``search`` let ANY
#: mid-prose mention of a field token parse as the field: the archived 155-33
#: session's deviation prose ("...updating the ``**Branch:**`` field like the
#: gitflow arm") became branch='field like the gitflow arm', finish probed a
#: garbage head, took the silent no-PR arm, and marked the story done while
#: its PR stayed OPEN. The optional list-bullet prefix keeps the sm-setup
#: template's ``- **Branch:** ...`` Story Details shape parsing.
SESSION_FIELD_RE = re.compile(r"^\s*(?:[-*]\s+)?\*\*(\w[\w\s]*):\*\*\s*(.*)")


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
    fields: dict[str, str] = {}
    detail_fields: dict[str, str] = {}
    if not session_path.exists():
        return fields
    section = None
    for line in session_path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            section = line[3:].strip().lower()
            continue
        m = SESSION_FIELD_RE.search(line)
        if not m:
            continue
        key = m.group(1).strip().lower()
        value = m.group(2).strip()
        # First-wins: with anchored matching, a later duplicate field line is
        # a stray record, not a correction — last-wins is what let later
        # sections silently override Story Details (155-33).
        fields.setdefault(key, value)
        if section == "story details":
            detail_fields.setdefault(key, value)
    # Story Details authority for the merge-target fields (155-40).
    for key in ("branch", "pr"):
        if key in detail_fields:
            fields[key] = detail_fields[key]
    return fields


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
_BRANCH_SENTINELS = {"none", "n/a", "na", "null", "-", "—"}


def _extract_branch(fields: dict[str, str]) -> str | None:
    """Get branch name from the shapes agents actually write: trailing
    annotations like ``(pushed)`` and markdown backticks are stripped, and
    no-branch sentinels resolve to None (155-33)."""
    raw = fields.get("branch", "")
    raw = re.sub(r"\s*\(.*\)\s*$", "", raw).strip()
    raw = raw.strip("`").strip()
    if raw.lower() in _BRANCH_SENTINELS:
        return None
    return raw or None


#: Bounded-subprocess envelope for the whole finish ceremony (162-9). The
#: ceremony is not a read-only report: it wedges MID-SEQUENCE, and an unbounded
#: child blocks it forever for entirely ordinary reasons (a stalled TLS
#: handshake, a credential helper prompting on a non-tty, an ssh host-key
#: prompt, a proxy that blackholes instead of resetting). The tiering lives in
#: one reviewable block so the trade-off is visible: every bound must be loose
#: enough that a working-but-slow command is not killed — a tight bound on the
#: irreversible merge trades a rare hang for a routine mid-merge kill.
DEFAULT_TIMEOUT_S = 120.0
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
_TIMEOUT_RETURNCODE = 124


class _TimedOutProcess(subprocess.CompletedProcess):
    """A :func:`_run` result standing in for a child that blew its timeout.

    A distinct TYPE rather than a marker attribute or a magic returncode:
    ``_timed_out`` must answer False for every other result shape, including
    the mocks the finish test suites hand back (a ``getattr`` probe on a
    ``MagicMock`` invents a truthy attribute, which would read every faked call
    as timed out).
    """


def _timed_out(result: Any) -> bool:
    """True when *result* came from a child that hit its timeout."""
    return isinstance(result, _TimedOutProcess)


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

    A blown timeout is returned as a :class:`_TimedOutProcess`, never raised:
    ``TimeoutExpired`` escaping ``finish_story`` violates the no-throw contract
    (SOUL #10) exactly as badly as the hang it replaced, and after the
    irreversible merge it strands the story with a traceback instead of a
    report. ``stderr`` carries the exception's own text, which names the
    program, its subcommand and the bound that expired — the callers below
    surface it verbatim so "something timed out" is never the whole story.
    """
    try:
        return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, **kwargs)
    except subprocess.TimeoutExpired as exc:
        return _TimedOutProcess(list(cmd), _TIMEOUT_RETURNCODE, "", str(exc))


def _cwd_kwargs(cwd: Path | None) -> dict[str, str]:
    """``{"cwd": str(cwd)}`` when a repo is known, else no kwarg at all.

    Keeps the pre-162-6 "no cwd" behavior for the direct helper callers that
    pass nothing, while every finish-path call site now supplies the story's
    code repo.
    """
    return {"cwd": str(cwd)} if cwd is not None else {}


#: The union of the fields the PR probes read: ``state`` for the merged checks,
#: ``mergeable``/``mergeStateStatus``/``baseRefName`` for the conflict gate. One
#: field list means the two pre-merge questions share one round trip (155-32).
_PR_VIEW_FIELDS = "state,mergeable,mergeStateStatus,baseRefName"


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
    """Read "did this land?" off an already-fetched snapshot.

    Callers decide *which* snapshot, and that choice is load-bearing: the
    post-merge verification must pass a FRESH one (see :func:`_pr_is_merged`),
    while the pre-merge short-circuit reuses the gate's.

    The comparison is deliberately strict — no case folding, no stripping, no
    aliases (162-3). ``gh pr view --json state`` emits an uppercase enum, so
    there is no lowercase producer to accommodate, and this boolean authorises
    the story's transition to ``done``. Any spelling other than ``MERGED``
    (including a missing key or an unreadable probe) reads as "not merged",
    which is the safe answer at all four call sites.
    """
    if view is None:
        return False
    return view.get("state") == "MERGED"


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
    """Return an actionable abort message when the PR is definitively NOT cleanly
    mergeable (``mergeable == CONFLICTING`` / ``mergeStateStatus == DIRTY``), else
    ``None``.

    ``None`` ("do not block") also covers MERGEABLE/CLEAN PRs *and* indeterminate
    mergeability — ``UNKNOWN`` (GitHub still computing) or an unreadable probe.
    Those fall through to the merge attempt, which is guarded by the post-merge
    :func:`_pr_is_merged` verification (gh #71/#60). Only a definitively
    conflicting PR is hard-blocked here, before any irreversible finish step
    (gh #113).

    Takes the snapshot rather than fetching one so the conflict gate and the
    already-merged short-circuit share a single ``gh pr view`` (155-32).

    "Did it already land?" is asked FIRST (162-1). GitHub stops recomputing
    mergeability once a PR merges, so a ``state == MERGED`` snapshot can still
    carry stale ``CONFLICTING``/``DIRTY`` fields. Blocking on those would abort
    finish with rebase advice for a branch that is already in the base — so a
    MERGED PR is never blocked, and the caller's already-merged short-circuit
    handles it. Only ``MERGED`` is exempt: a CLOSED-without-merging PR did NOT
    land, so it must still hard-block.
    """
    if view is None:
        return None
    if _view_is_merged(view):
        return None
    mergeable = str(view.get("mergeable", "")).upper()
    state_status = str(view.get("mergeStateStatus", "")).upper()
    if mergeable == "CONFLICTING" or state_status == "DIRTY":
        base = view.get("baseRefName") or "the base branch"
        return (
            f"PR #{pr_number} is CONFLICTING — rebase on {base} and resolve the "
            "conflicts before finishing"
        )
    return None


def _field_is_sentinel(raw: str | None) -> bool:
    """True when a raw session field value is an AFFIRMATIVE no-value sentinel
    (``none``/``n/a``/...), as opposed to empty, a template placeholder, or an
    absent key (155-34).

    ``_extract_branch`` collapses all of those to ``None``, but the no-PR gate
    must tell them apart: a sentinel is an agent's deliberate record that no
    branch exists (the accepted 155-1 world), while an empty or placeholder
    value means the field was never filled in — an unverifiable world that
    must not silently finish. Reuses ``_extract_branch``'s own normalization
    (annotation strip, backticks) so ``none (no branch)`` still reads as the
    sentinel it is.
    """
    if raw is None:
        return False
    value = re.sub(r"\s*\(.*\)\s*$", "", raw).strip().strip("`").strip()
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

    root_repo = next(
        (rc for rc in load_repos_config(project_root).values() if rc.path in (".", "")),
        None,
    )
    return root_repo.default_branch if root_repo else "develop"


def _resolve_story_repos(
    project_root: Path,
    story: dict,
) -> list[tuple[Path, "RepoConfig | None"]]:
    """Every code repo the story's work lives in, as ``(abs_path, config)``.

    The story's ``repos:`` field names them; ``.pennyfarthing/repos.yaml`` gives
    each one its path and its own ``default_branch``/``branch_strategy``. All
    three shapes seen in the wild parse: a bare name, a comma-separated string,
    and a YAML list (same parse as ``staleness._resolve_repo_path``).

    A ``repos:`` value that is absent, empty, or names nothing in repos.yaml
    degrades to the project root paired with the root repo's config — the
    pre-162-6 behavior, so an operator typo cannot silently skip verification.

    Local import for the same circular-layering reason as
    :func:`_resolve_base_branch`.
    """
    from pf.git.repos import load_repos_config

    configs = load_repos_config(project_root)
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
        return [(project_root, root_repo)]
    return [((project_root / rc.path).resolve(), rc) for rc in resolved]


def _branch_merge_state(
    repo_path: Path,
    branch: str,
    base: str | None = None,
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
    never came back and the next one probably will not either. All probes route
    through ``_run`` with an explicit
    ``cwd=repo_path`` — the finish family's test suites fake ``_run`` as
    THE hermetic seam, and a cwd-less git call would interrogate whatever
    repo the process happens to sit in (155-34).

    Every candidate is a FULL ref path — ``refs/heads/<name>`` or
    ``refs/remotes/origin/<name>`` — never a bare name (162-4). A bare name
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

    branch_ref = None
    for candidate in (f"refs/heads/{branch}", f"refs/remotes/origin/{branch}"):
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
            "reason": "branch not found locally or on origin",
        }

    base_ref = None
    for candidate in (f"refs/remotes/origin/{base}", f"refs/heads/{base}"):
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
            "reason": f"base branch {base!r} not found locally or on origin",
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

    Returns the step entries to append to the finish report.
    """
    if repo_config is None or not repo_config.is_gitflow:
        reason = "root-repo-unresolved" if repo_config is None else "trunk-based"
        return [{"step": 6, "action": "git_cleanup", "skipped": reason, "branch": branch}]

    base = repo_config.default_branch
    cleanup: list[tuple[list[str], float]] = [
        (["git", "checkout", base], GIT_LOCAL_TIMEOUT_S),
        (["git", "pull", "origin", base], GIT_NETWORK_TIMEOUT_S),
    ]
    if branch:
        # `--` guards against a branch value that looks like a git flag.
        cleanup.append((["git", "branch", "-d", "--", branch], GIT_LOCAL_TIMEOUT_S))

    entry: dict[str, Any] = {"step": 6, "action": "git_cleanup", "branch": branch}
    for cmd, timeout in cleanup:
        result = _run(cmd, cwd=str(repo_path), timeout=timeout)
        if _timed_out(result):
            # Step 6 runs AFTER the story is done and the YAML is written, so a
            # hung cleanup command is bookkeeping, not a finish failure (162-9):
            # un-reporting a story that genuinely shipped is the same lie as
            # reporting one that did not. Record it and stop the chain — the
            # later commands assume the earlier one landed (a delete aimed at
            # the branch we are still standing on fails anyway), and step 7
            # still removes the session.
            entry["warning"] = (
                f"git cleanup stopped in {repo_path}: {(result.stderr or '').strip()} — "
                "the story is done; finish the branch cleanup by hand"
            )
            break
    return [entry]


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
    session_path = project_root / ".session" / f"{story_id}-session.md"
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

    fields = _parse_session(session_path)
    jira_key = _extract_jira_key(fields)
    branch = _extract_branch(fields)
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
    story_repos = _resolve_story_repos(project_root, story)

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

    # The reported/previewed PR: the single repo's, or the first one resolved.
    pr_number = next((rp for _p, _c, rp in repo_prs if rp), None)
    primary_repo_path = repo_prs[0][0]

    today = date.today().isoformat()
    steps: list[dict[str, Any]] = []
    archive_name = f"{jira_key}-session.md" if jira_key else f"{story_id}-session.md"

    # Check for dialogue file
    dialogue_path = project_root / ".session" / f"{story_id}-dialogue.md"
    dialogue_archive_name = f"{jira_key}-dialogue.md" if jira_key else f"{story_id}-dialogue.md"

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
        if pr_number and get_pr_merge_mode() == "human":
            steps.append(
                {"step": 2, "action": f"PR #{pr_number} — waiting for human review and merge"}
            )
        elif pr_number:
            # Preview/reality parity (155-31): the real Step 2 short-circuits
            # an already-merged PR (155-29), so the plan must not promise a
            # merge the run will skip. The ONE consolidated probe (155-32)
            # answers it; an unreadable state (``_pr_view`` → None) reads as
            # NOT merged and previews the merge, mirroring the real run's
            # permissive fall-through. Human mode and the no-PR arm stay
            # probe-free for the same reason the real pre-merge probe lives
            # inside the auto branch: they need no answer.
            if _view_is_merged(_pr_view(pr_number, cwd=primary_repo_path)):
                steps.append(
                    {
                        "step": 2,
                        "action": f"PR #{pr_number} already merged — will skip merge",
                    }
                )
            else:
                steps.append(
                    {"step": 2, "action": f"Merge PR #{pr_number} (squash, delete branch)"}
                )
        else:
            steps.append({"step": 2, "action": "No PR to merge"})
        if jira_key:
            steps.append({"step": 3, "action": f"Transition {jira_key} to Done"})
        else:
            steps.append({"step": 3, "action": "Skip Jira transition (no key)"})
        steps.append(
            {"step": 4, "action": f"Update sprint YAML (status: done, completed: {today})"}
        )
        steps.append({"step": "4c", "action": "Generate demo artifacts"})
        steps.append({"step": 5, "action": "Archive completed epics"})
        steps.append({"step": 6, "action": f"Delete local branch: {branch}"})
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
    # It stays inside the auto-mode branch on purpose. Human merge mode never
    # auto-merges, so it needs neither answer; hoisting the fetch above this
    # guard would add an API round trip to every human-mode finish and put the
    # hard-blocking conflict gate on a path that is deliberately advisory.
    #
    # Every repo is gated BEFORE any repo is merged (162-6): a multi-repo finish
    # cannot be atomic, so the least it can do is not land repo A's PR and then
    # discover repo B's is conflicting.
    pr_views: dict[Path, dict[str, Any] | None] = {}
    if pr_merge_mode == "auto":
        for repo_path, _repo_config, repo_pr in repo_prs:
            if not repo_pr:
                continue
            view, gate_timeout = _pr_view_probe(repo_pr, cwd=repo_path)
            if gate_timeout:
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
            block_reason = _pr_block_reason(repo_pr, view)
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
                steps.append(
                    {"step": 2, "action": "merge_pr", "mode": "human", "skipped": True}
                )
            continue

        if repo_pr and _view_is_merged(pr_views.get(repo_path)):
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
                    "error": merge_timeout_error,
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
                        f"PR #{repo_pr} merge failed: "
                        f"{stderr or 'gh pr merge returned non-zero'} — "
                        "refusing to mark the story done with unmerged code"
                    ),
                    "steps": steps,
                }
            verified_merged, verify_timeout = _pr_merge_verification(repo_pr, cwd=repo_path)
            if verify_timeout:
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
                    "error": verify_error,
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
                        f"PR #{repo_pr} is not MERGED after the merge step — "
                        "refusing to mark the story done with unmerged code"
                    ),
                    "steps": steps,
                }
            steps.append({"step": 2, "action": "merge_pr", "pr": repo_pr, "merged": True})
            continue

        # --- No-PR verification gate (155-34) ---
        # The last unguarded arm: 155-1 made the merge load-bearing when a PR
        # exists, but a story whose PR resolution comes up empty used to glide
        # through this skip into the full done ceremony — even with real
        # unmerged commits on its branch, and even for a session whose
        # merge-target fields are unfilled placeholders (which 155-40's
        # Story Details authority now correctly refuses to backfill from
        # later sections). The skip is only accepted for worlds finish can
        # affirmatively trust: a branch verified fully merged into the base,
        # or an agent's explicit no-branch sentinel. Everything else —
        # unmerged commits, an unverifiable/missing branch, empty or
        # placeholder fields, or fields absent entirely (the uniform-abort
        # answer to TEA's legacy-shape question: unresolvable is
        # unverifiable, regardless of why) — aborts loudly BEFORE any
        # irreversible step, with the session kept so finish can be retried
        # once the operator records the real Branch/PR (or affirms absence).
        if branch:
            merge_state = _branch_merge_state(
                repo_path,
                branch,
                base=repo_config.default_branch if repo_config else None,
            )
            if merge_state["state"] == "merged":
                # NOT ``skipped: True``: an all-repos abort keeps the already
                # verified repos' step records in the report, and a bare
                # ``skipped`` there reads as the silent skip this epic exists to
                # kill (155-34). The value says what was verified.
                steps.append(
                    {
                        "step": 2,
                        "action": "merge_pr",
                        "skipped": "branch-verified-merged",
                        "branch_verified_merged_into": merge_state["base"],
                    }
                )
                continue
            if merge_state["state"] == "timeout":
                # A hung git probe is not the permissive unknown either (162-9):
                # the no-PR arm has no later verification, so an unbounded-turned
                # -degraded probe is exactly how unlanded work finishes silently.
                error = (
                    f"No PR resolves, and verifying branch {branch!r} timed out: "
                    f"{merge_state['reason']} — refusing to mark the story done on "
                    "the strength of a probe that never came back. Re-run finish "
                    "once git responds."
                )
            elif merge_state["state"] == "unmerged":
                error = (
                    f"No PR resolves, and branch {branch!r} has "
                    f"{merge_state['count']} unmerged commit(s) not in "
                    f"{merge_state['base']} — refusing to mark the story done "
                    "with unlanded code. Record the real PR in Story Details "
                    "(or merge the branch), then re-run finish."
                )
            else:
                error = (
                    f"No PR resolves, and branch {branch!r} cannot be verified "
                    f"({merge_state['reason']}) — refusing to mark the story "
                    "done with unverifiable work. Record the real PR in Story "
                    "Details, or set the Branch field to 'none' if there is "
                    "genuinely no branch, then re-run finish."
                )
            steps.append(
                {
                    "step": 2,
                    "action": "merge_pr",
                    "branch": branch,
                    "success": False,
                    "error": error,
                }
            )
            return {
                "success": False,
                "story_id": story_id,
                "jira_key": jira_key,
                "error": error,
                "steps": steps,
            }
        elif _field_is_sentinel(fields.get("branch")):
            # An agent affirmatively recorded "no branch" — the accepted
            # 155-1 no-PR world. Nothing exists to verify, by declaration.
            steps.append({"step": 2, "action": "merge_pr", "skipped": True})
        else:
            error = (
                "No PR and no branch resolve from the session — the Branch/PR "
                "fields are empty, placeholders, or absent, so finish cannot "
                "verify anything landed. Record the real values in Story "
                "Details (or set them to 'none' to affirm absence), then "
                "re-run finish."
            )
            steps.append(
                {"step": 2, "action": "merge_pr", "success": False, "error": error}
            )
            return {
                "success": False,
                "story_id": story_id,
                "jira_key": jira_key,
                "error": error,
                "steps": steps,
            }

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
    try:
        archive_dest = archive_dir / archive_name
        shutil.copy2(session_path, archive_dest)
        steps.append({"step": 1, "action": "archive_session", "dest": str(archive_dest)})

        if dialogue_path.exists():
            dialogue_dest = archive_dir / dialogue_archive_name
            shutil.copy2(dialogue_path, dialogue_dest)
            steps.append(
                {"step": "1b", "action": "archive_dialogue", "dest": str(dialogue_dest)}
            )
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
                "error": (
                    f"Could not re-read sprint data for completed-row "
                    f"bookkeeping: {exc}"
                ),
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

        demo_result = demo_orchestrator.generate(
            story_id, project_root=project_root
        )
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
