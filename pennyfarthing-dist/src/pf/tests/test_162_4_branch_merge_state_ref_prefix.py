"""Tests for story 162-4: ``_branch_merge_state`` must probe FULLY REF-PREFIXED
candidates, never bare branch names.

The hole (from the 155-34 review)
---------------------------------
``_branch_merge_state`` resolves the session branch and the base branch by
probing bare names through ``git rev-parse --verify --quiet <name>``:
``(branch, "origin/" + branch)`` for the branch arm and
``("origin/" + base, base)`` for the base arm. A bare name is not a ref — it is
an argument position git is free to read as an option, and a rev name git is
free to DWIM to the WRONG ref. Both halves bite, and both were verified against
the real git binary (2.54.0) while writing these tests:

1. Flag parsing. A branch value starting with a dash reaches this probe intact
   (``_extract_branch`` only sentinels a LONE ``-``), so ``rev-parse --verify
   --quiet --default`` exits 128 with a git usage fatal, and ``rev-parse
   --verify --quiet --local-env-vars`` EXECUTES that option and prints git's
   environment variable names to stdout. The branch name became a git flag.
2. DWIM misresolution. ``rev-parse`` resolves a bare name in refs/, refs/tags/,
   refs/heads/, refs/remotes/ order, so a TAG shadows the branch of the same
   name, and a local branch literally named ``origin/<x>`` (the classic
   ``git checkout -b origin/x`` typo) shadows the real remote-tracking ref.
   Either shadow silently answers the merge question about the WRONG commit —
   and this classifier's ``merged`` answer is what lets a no-PR finish mark a
   story done (155-34). A stale shadow that happens to be an ancestor of the
   base reads as ``merged``: unlanded code reported shipped.
   A dash-leading ref that genuinely EXISTS is the mirror failure: the bare
   probe cannot see ``refs/heads/-evil`` at all, so a real branch reads as
   "not found" and finish aborts on work it could have verified.

Probed fix shape, carried from the 155-34 review (not re-litigated here):
prefix the candidates — ``refs/heads/<name>`` for the local ref,
``refs/remotes/origin/<name>`` for the remote-tracking ref. Both resolve
exactly, and neither can be flag-parsed. The naive ``--`` separator was PROBED
AND REJECTED: ``git rev-parse --verify --quiet -- <ref>`` returns rc=1, so the
separator kills the probe outright. A green-on-arrival guard below pins that
it stays dead.

Acceptance criteria (from the story YAML / SM Assessment)
--------------------------------------------------------
- AC-1: all ``rev-parse --verify`` probe candidates are fully ref-prefixed; no
  bare branch name reaches rev-parse.
- AC-2: dash-leading branch names cannot be interpreted as flags.
- AC-3: classification vocabulary and outcomes are unchanged for canonical
  branch names.

Designed interface for Dev (tests pin behavior, not mechanism)
--------------------------------------------------------------
``_branch_merge_state(project_root, branch)`` keeps its signature and its
return contract: ``{"state": "merged" | "unmerged" | "unknown", ...}`` with
``count`` and ``base`` on a definitive answer and ``reason`` on an unknown one.
Only the candidate STRINGS change. Two arms, two prefixes, and the existing
preference order must survive the change:

- branch arm: ``refs/heads/<branch>`` BEFORE
  ``refs/remotes/origin/<branch>`` (the local ref Step 6 would delete wins).
- base arm: ``refs/remotes/origin/<base>`` BEFORE ``refs/heads/<base>`` (a
  merge that landed upstream must not read as unmerged against a stale local
  base).

Whatever ref string wins a probe is also the string that must appear in the
``rev-list --count <base>..<branch>`` range — resolving a prefixed candidate
and then ranging over the bare name reintroduces both shadows in the very step
that produces the answer.

``base`` in the returned dict is operator-facing prose in ``finish_story``'s
abort message, so these tests only require that it NAMES the base branch; both
``develop`` and ``refs/remotes/origin/develop`` satisfy them. Dev's call.

All probes stay inside ``story_finish._run`` with an explicit
``cwd=str(project_root)`` (the 155-34 hermetic seam and cwd-forcing contract).
The real-git tests here call ``_branch_merge_state`` directly against a
throwaway repo and do NOT patch ``_run``, so a probe that drops ``cwd`` reads
the test runner's own repo and fails these tests outright.

Deliberately unpinned (Delivery Findings, not tests): the multi-remote question
(the candidates hardcode ``origin``, as the current code does); whether
``_extract_branch`` should reject dash-leading branch values at the door
(defense in depth, a different function's contract).

RED on HEAD — 9 failures, all on assertions (verified against git 2.54.0):
  - TestProbeCandidatesAreRefPrefixed (4): candidates are bare in both arms,
    the bare dash token reaches git's argv, and the rev-list range is bare too.
  - TestRealGitRejectsFlagParsing (2 of 3 params): the emitted argv makes real
    git fatal with rc=128 (``--default``) or execute the branch name as an
    option and print its environment (``--local-env-vars``).
  - TestRealGitPrefixSemantics (3): a dash-leading ref that exists reads as
    missing; a tag shadow and an ``origin/<x>`` local-branch shadow each answer
    for the wrong commit, both as a FALSE ``merged`` with count 0.
Green-on-arrival guards (regression pins, intentional):
  - TestProbeCandidatesAreRefPrefixed: the rejected ``--`` separator stays
    dead; probes keep ``--verify``/``--quiet``.
  - TestRealGitRejectsFlagParsing[-evil]: see that test's docstring.
  - TestCanonicalClassificationUnchanged (6): AC-3 vocabulary, outcomes, and
    both preference orders.
  - TestThreatModelReachability (1): a dash-leading branch value really does
    reach the probe.
"""

import subprocess
from pathlib import Path
from typing import Any, Callable
from unittest.mock import MagicMock, patch

import pytest

from pf.sprint.story_finish import _branch_merge_state, _extract_branch

#: A branch value git would read as an option if it arrived bare.
DASH_BRANCH = "-evil"

#: Dash-leading values whose flag-parsing is DEMONSTRABLE with real git:
#: ``--default`` makes rev-parse exit 128 with a usage fatal, and
#: ``--local-env-vars`` makes rev-parse print git environment names.
FLAGGISH_BRANCHES = ["-evil", "--default", "--local-env-vars"]

BASE = "develop"

#: Root repo is gitflow on develop, so config-driven base resolution and the
#: fixture's real refs agree (same fixture contract as 155-34).
REPOS_YAML = """\
repos:
  proj:
    path: "."
    type: framework
    default_branch: develop
    branch_strategy: gitflow
"""

_REV_PARSE_FLAGS = {"--verify", "--quiet", "--"}


# =============================================================================
# Fixture helpers — REAL git repos (rev-parse semantics are the whole story)
# =============================================================================


def _git(root: Path, *args: str) -> str:
    """Run git in the fixture repo, loudly. Returns stdout."""
    result = subprocess.run(
        ["git", *args], cwd=str(root), capture_output=True, text=True
    )
    assert result.returncode == 0, (
        f"fixture git {' '.join(args)} failed rc={result.returncode}: {result.stderr}"
    )
    return result.stdout


def _make_project(tmp_path: Path, *, initial_branch: str = BASE) -> Path:
    """A project root that is also a real git repo with one commit.

    Local config pins gpgsign/hooksPath so the host's git identity setup cannot
    leak into the fixture.
    """
    root = tmp_path / "proj"
    root.mkdir()
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir()
    (pf_dir / "repos.yaml").write_text(REPOS_YAML, encoding="utf-8")

    _git(root, "init", "-q", "-b", initial_branch)
    _git(root, "config", "user.email", "tea@162-4.test")
    _git(root, "config", "user.name", "TEA fixture")
    _git(root, "config", "commit.gpgsign", "false")
    _git(root, "config", "core.hooksPath", str(root / ".git" / "hooks"))
    (root / "base.txt").write_text("base\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", "init")
    return root


def _add_origin(tmp_path: Path, root: Path, *, push: str = BASE) -> Path:
    """Give the fixture a real bare ``origin`` and push one branch to it."""
    origin = tmp_path / "origin.git"
    subprocess.run(
        ["git", "init", "-q", "--bare", str(origin)],
        capture_output=True,
        text=True,
        check=True,
    )
    _git(root, "remote", "add", "origin", str(origin))
    _git(root, "push", "-q", "origin", push)
    return origin


def _commit(root: Path, name: str) -> str:
    """Add a commit on the current branch. Returns its sha."""
    (root / f"{name}.txt").write_text(f"{name}\n", encoding="utf-8")
    _git(root, "add", "-A")
    _git(root, "commit", "-q", "-m", name)
    return _git(root, "rev-parse", "HEAD").strip()


def _sha(root: Path, rev: str) -> str:
    return _git(root, "rev-parse", rev).strip()


def _set_ref(root: Path, ref: str, sha: str) -> None:
    """Create a ref by plumbing.

    ``git branch`` refuses dash-leading names outright ("not a valid branch
    name"), but ``update-ref`` and ``check-ref-format`` both accept
    ``refs/heads/-evil`` — so such refs DO occur in the wild (any tool writing
    refs by plumbing, or a fetch refspec) and rev-parse resolves them when
    asked with the full path. That asymmetry is exactly the bug.
    """
    _git(root, "update-ref", ref, sha)


# =============================================================================
# Fixture helpers — argv recorder for the no-bare-name property
# =============================================================================


def _candidate_of(argv: list[str]) -> str:
    """The ref token in a ``git rev-parse --verify --quiet <cand>`` argv.

    Only EXACT known flags are stripped — a dash-leading candidate must not be
    filtered out as "a flag", since a candidate that looks like a flag is the
    whole point of this story.
    """
    tokens = [t for t in argv[2:] if t not in _REV_PARSE_FLAGS]
    assert len(tokens) == 1, (
        f"expected exactly one ref token in the rev-parse probe argv, got "
        f"{tokens} from {argv} — a probe that passes both a bare name and a "
        f"prefixed one, or splits the ref across tokens, is not a fixed probe"
    )
    return tokens[0]


def _fake_run(resolve: Callable[[str], bool], *, count: str = "1\n"):
    """Fake ``story_finish._run``: rev-parse answers per *resolve*, rev-list
    answers *count*. Records every argv.
    """
    calls: list[list[str]] = []

    def fake(cmd: list[Any], **kwargs: Any) -> Any:
        argv = [str(c) for c in cmd]
        calls.append(argv)
        if "rev-parse" in argv:
            return MagicMock(
                returncode=0 if resolve(_candidate_of(argv)) else 1,
                stdout="0" * 40 + "\n",
                stderr="",
            )
        if "rev-list" in argv:
            return MagicMock(returncode=0, stdout=count, stderr="")
        return MagicMock(returncode=0, stdout="", stderr="")

    return fake, calls


def _rev_parse_argv(calls: list[list[str]]) -> list[list[str]]:
    return [argv for argv in calls if "rev-parse" in argv]


def _rev_list_argv(calls: list[list[str]]) -> list[list[str]]:
    return [argv for argv in calls if "rev-list" in argv]


def _probe_branch_arm(project: Path, branch: str) -> list[list[str]]:
    """Every rev-parse argv the branch arm emits: nothing resolves, so the arm
    exhausts its candidate list before returning unknown.
    """
    fake, calls = _fake_run(lambda cand: False)
    with patch("pf.sprint.story_finish._run", side_effect=fake):
        _branch_merge_state(project, branch)
    return _rev_parse_argv(calls)


def _probe_base_arm(project: Path, branch: str) -> list[list[str]]:
    """Every rev-parse argv the BASE arm emits: the branch arm is satisfied by
    its first candidate (matched by trailing segment, so the assertion works
    whether the candidate is bare or prefixed), then no base candidate
    resolves, so that arm exhausts its list too.
    """
    fake, calls = _fake_run(lambda cand: cand.endswith(branch))
    with patch("pf.sprint.story_finish._run", side_effect=fake):
        _branch_merge_state(project, branch)
    branch_argv = {tuple(a) for a in _probe_branch_arm(project, branch)}
    return [a for a in _rev_parse_argv(calls) if tuple(a) not in branch_argv]


def _assert_all_prefixed(argvs: list[list[str]], *, arm: str) -> list[str]:
    """Every candidate in *argvs* is a full ref path. Returns the candidates."""
    assert argvs, f"the {arm} arm emitted no rev-parse probe at all"
    candidates = [_candidate_of(a) for a in argvs]
    bad = [
        c
        for c in candidates
        if not (c.startswith("refs/heads/") or c.startswith("refs/remotes/origin/"))
    ]
    assert bad == [], (
        f"the {arm} arm probed bare (unprefixed) candidates {bad}: a bare name "
        f"is an option position git may flag-parse and a rev name git may DWIM "
        f"to a tag or a look-alike local branch. Every candidate must be "
        f"refs/heads/<name> or refs/remotes/origin/<name>. All candidates: "
        f"{candidates}"
    )
    return candidates


# =============================================================================
# AC-1 / AC-2 — no bare name reaches rev-parse, in either arm
# =============================================================================


class TestProbeCandidatesAreRefPrefixed:
    def test_branch_arm_candidates_are_fully_ref_prefixed(self, tmp_path: Path) -> None:
        """RED (AC-1): the branch arm probes ``-evil`` and ``origin/-evil``
        bare today. Both must be full ref paths, and the local ref must still
        be tried first (it is the ref Step 6 deletes).
        """
        project = _make_project(tmp_path)
        candidates = _assert_all_prefixed(
            _probe_branch_arm(project, DASH_BRANCH), arm="branch"
        )

        local = f"refs/heads/{DASH_BRANCH}"
        remote = f"refs/remotes/origin/{DASH_BRANCH}"
        assert local in candidates and remote in candidates, (
            f"the branch arm must probe both the local ref {local!r} and the "
            f"remote-tracking ref {remote!r}; got {candidates}"
        )
        assert candidates.index(local) < candidates.index(remote), (
            f"local-ref-first preference lost: {candidates}. The local ref is "
            f"the one Step 6 would delete, so it answers the merge question "
            f"about the branch actually in hand (155-34)."
        )

    def test_base_arm_candidates_are_fully_ref_prefixed(self, tmp_path: Path) -> None:
        """RED (AC-1): the base arm probes ``origin/develop`` and ``develop``
        bare today. Both must be full ref paths, and the upstream ref must
        still win so a merge that landed upstream is not misread as unmerged
        against a stale local base.
        """
        project = _make_project(tmp_path)
        candidates = _assert_all_prefixed(
            _probe_base_arm(project, DASH_BRANCH), arm="base"
        )

        remote = f"refs/remotes/origin/{BASE}"
        local = f"refs/heads/{BASE}"
        assert remote in candidates and local in candidates, (
            f"the base arm must probe both {remote!r} and {local!r}; got "
            f"{candidates}"
        )
        assert candidates.index(remote) < candidates.index(local), (
            f"upstream-base-first preference lost: {candidates}. A stale local "
            f"base would report landed work as unmerged (155-34)."
        )

    def test_no_bare_dash_leading_name_appears_in_any_probe_argv(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-2): the literal ``-evil`` token must never appear as its own
        argv element anywhere in the probe sequence, and no probed candidate
        may begin with a dash. Those are the two shapes git can read as an
        option.
        """
        project = _make_project(tmp_path)
        argvs = _probe_branch_arm(project, DASH_BRANCH) + _probe_base_arm(
            project, DASH_BRANCH
        )

        offenders = [a for a in argvs if DASH_BRANCH in a]
        assert offenders == [], (
            f"the bare branch token {DASH_BRANCH!r} reached git as its own "
            f"argv element: {offenders}"
        )
        dashed = [c for c in (_candidate_of(a) for a in argvs) if c.startswith("-")]
        assert dashed == [], (
            f"probe candidates still start with a dash and can be flag-parsed: "
            f"{dashed}"
        )

    def test_rev_list_range_endpoints_are_fully_ref_prefixed(
        self, tmp_path: Path
    ) -> None:
        """RED (AC-1): whatever candidate wins a probe must also be the string
        used in the ``rev-list --count <base>..<branch>`` range. Resolving a
        prefixed candidate and then ranging over the bare name puts the tag /
        look-alike-branch shadow right back into the step that produces the
        answer.
        """
        project = _make_project(tmp_path)
        fake, calls = _fake_run(lambda cand: True, count="1\n")
        with patch("pf.sprint.story_finish._run", side_effect=fake):
            _branch_merge_state(project, DASH_BRANCH)

        ranges = [
            tok
            for argv in _rev_list_argv(calls)
            for tok in argv
            if ".." in tok
        ]
        assert ranges, f"no rev-list range was emitted at all: {calls}"
        endpoints = [end for spec in ranges for end in spec.split("..")]
        bad = [
            e
            for e in endpoints
            if not (
                e.startswith("refs/heads/") or e.startswith("refs/remotes/origin/")
            )
        ]
        assert bad == [], (
            f"rev-list range endpoints {bad} are not full ref paths (ranges: "
            f"{ranges}) — the counting step must range over the same prefixed "
            f"refs the probes verified"
        )

    def test_double_dash_separator_not_used(self, tmp_path: Path) -> None:
        """Green guard: the ``--`` separator was PROBED AND REJECTED in the
        155-34 review — ``git rev-parse --verify --quiet -- <ref>`` returns
        rc=1, so the separator kills the probe and every branch would read as
        "not found". Prefixing is the fix; ``--`` must not come back here.
        """
        project = _make_project(tmp_path)
        argvs = _probe_branch_arm(project, DASH_BRANCH) + _probe_base_arm(
            project, DASH_BRANCH
        )
        offenders = [a for a in argvs if "--" in a]
        assert offenders == [], (
            f"a rev-parse probe uses the rejected `--` separator: {offenders}. "
            f"Real git returns rc=1 for `rev-parse --verify --quiet -- <ref>`, "
            f"which would turn every branch into 'not found'."
        )

    def test_probes_still_verify_quietly(self, tmp_path: Path) -> None:
        """Green guard: prefixing must not drop ``--verify``/``--quiet``.
        Without ``--verify`` the probe's exit code stops meaning "this ref
        exists"; without ``--quiet`` a missing ref writes noise to stderr.
        """
        project = _make_project(tmp_path)
        argvs = _probe_branch_arm(project, DASH_BRANCH)
        for argv in argvs:
            assert "--verify" in argv and "--quiet" in argv, (
                f"probe lost --verify/--quiet: {argv}"
            )


# =============================================================================
# AC-2 — the emitted argv, replayed against the REAL git binary
# =============================================================================


class TestRealGitRejectsFlagParsing:
    @pytest.mark.parametrize("branch", FLAGGISH_BRANCHES)
    def test_probe_argv_is_never_flag_parsed_by_real_git(
        self, tmp_path: Path, branch: str
    ) -> None:
        """RED (AC-2): take the exact argv the code emits and hand it to the
        real git binary in a real repo. A ref probe may answer "yes" (rc 0) or
        "no" (rc 1) — nothing else. Today git instead:
          - ``--default``: exits 128, "fatal: --default requires an argument";
          - ``--local-env-vars``: exits 1 but EXECUTES the option, printing
            git's environment variable names to stdout.
        A probe whose meaning depends on the branch name's spelling is not a
        probe. Verified against git 2.54.0.

        The ``-evil`` case is a green-on-arrival parametrization: git happens to
        swallow that unknown option quietly (rc 1), which is precisely why it is
        the DANGEROUS shape — it is invisible here and only the argv-shape tests
        above catch it. Keeping it in the replay set pins that the fixed
        candidate is still a lookup, not a silent shrug.
        """
        project = _make_project(tmp_path)
        argvs = _probe_branch_arm(project, branch) + _probe_base_arm(project, branch)
        assert argvs, "no probe argv captured to replay"

        for argv in argvs:
            real = subprocess.run(
                argv, cwd=str(project), capture_output=True, text=True
            )
            assert real.returncode in (0, 1), (
                f"real git rejected the probe argv {argv} with rc="
                f"{real.returncode}: {real.stderr.strip()!r} — the branch name "
                f"was parsed as a git option, not looked up as a ref"
            )
            assert "fatal" not in real.stderr.lower(), (
                f"real git emitted a fatal for probe argv {argv}: "
                f"{real.stderr.strip()!r}"
            )
            assert "GIT_" not in real.stdout, (
                f"probe argv {argv} made git EXECUTE the branch name as an "
                f"option and leak its environment: {real.stdout.strip()!r}"
            )


# =============================================================================
# AC-1/AC-2 — prefix semantics against the REAL git binary
# =============================================================================


class TestRealGitPrefixSemantics:
    def test_dash_leading_ref_that_exists_is_found_not_reported_missing(
        self, tmp_path: Path
    ) -> None:
        """RED: ``refs/heads/-evil`` exists (written by plumbing, as tools do)
        and carries one commit develop lacks. A bare ``rev-parse -evil`` cannot
        see it — real git returns rc=1 — so finish reports "branch not found
        locally or on origin" and aborts on work it could have classified.
        With the prefix, the ref resolves and the answer is ``unmerged``.
        """
        project = _make_project(tmp_path)
        base_sha = _sha(project, "HEAD")
        _git(project, "checkout", "-q", "-b", "tmp-carrier")
        work = _commit(project, "story-work")
        _git(project, "checkout", "-q", BASE)
        _git(project, "branch", "-q", "-D", "tmp-carrier")
        _set_ref(project, f"refs/heads/{DASH_BRANCH}", work)
        assert _sha(project, f"refs/heads/{DASH_BRANCH}") == work
        assert _sha(project, f"refs/heads/{BASE}") == base_sha

        state = _branch_merge_state(project, DASH_BRANCH)

        assert state["state"] == "unmerged", (
            f"a dash-leading ref that really exists was misclassified as "
            f"{state} — the bare probe cannot see refs/heads/{DASH_BRANCH}, so "
            f"real work reads as unverifiable"
        )
        assert state["count"] == 1, f"expected the one unmerged commit: {state}"

    def test_tag_shadow_does_not_answer_for_the_branch(self, tmp_path: Path) -> None:
        """RED: no local branch ``widget``, but a TAG named ``widget`` points at
        an ancestor of develop while ``origin/widget`` holds one unmerged
        commit. rev-parse DWIMs bare names through refs/tags/ BEFORE
        refs/remotes/, so the bare probe answers with the tag: zero commits
        ahead, ``merged`` — finish would mark the story done while the real
        remote branch has unlanded code. The prefixed probes skip the tag
        entirely: refs/heads/widget misses, refs/remotes/origin/widget hits.
        """
        project = _make_project(tmp_path)
        old = _sha(project, "HEAD")
        _add_origin(tmp_path, project)
        _git(project, "checkout", "-q", "-b", "widget")
        _commit(project, "widget-work")
        _git(project, "push", "-q", "origin", "widget")
        _git(project, "checkout", "-q", BASE)
        _commit(project, "base-moves-on")
        _git(project, "push", "-q", "origin", BASE)
        _git(project, "branch", "-q", "-D", "widget")
        _set_ref(project, "refs/tags/widget", old)

        state = _branch_merge_state(project, "widget")

        assert state["state"] == "unmerged", (
            f"a tag shadowed the branch and produced {state} — the classifier "
            f"answered the merge question about refs/tags/widget instead of "
            f"refs/remotes/origin/widget, and a false 'merged' here is exactly "
            f"how a no-PR finish marks unlanded code done (155-34)"
        )
        assert state["count"] == 1, (
            f"expected the one commit origin/widget holds beyond the base: {state}"
        )

    def test_local_lookalike_branch_does_not_shadow_remote_tracking_ref(
        self, tmp_path: Path
    ) -> None:
        """RED: a local branch literally named ``origin/widget`` (the classic
        ``git checkout -b origin/widget`` typo) sits at an ancestor of develop,
        while the real ``refs/remotes/origin/widget`` holds one unmerged
        commit. The bare second candidate ``origin/widget`` resolves through
        refs/heads/ first, so the typo branch answers: ``merged``. The
        prefixed candidate ``refs/remotes/origin/widget`` is unambiguous.
        """
        project = _make_project(tmp_path)
        old = _sha(project, "HEAD")
        _add_origin(tmp_path, project)
        _git(project, "checkout", "-q", "-b", "widget")
        _commit(project, "widget-work")
        _git(project, "push", "-q", "origin", "widget")
        _git(project, "checkout", "-q", BASE)
        _commit(project, "base-moves-on")
        _git(project, "push", "-q", "origin", BASE)
        _git(project, "branch", "-q", "-D", "widget")
        _set_ref(project, "refs/heads/origin/widget", old)

        state = _branch_merge_state(project, "widget")

        assert state["state"] == "unmerged", (
            f"the look-alike local branch refs/heads/origin/widget shadowed "
            f"the remote-tracking ref and produced {state} — a false 'merged' "
            f"on a branch with unlanded commits"
        )
        assert state["count"] == 1, f"expected one unmerged commit: {state}"


# =============================================================================
# AC-3 — classification vocabulary and outcomes unchanged for canonical names
# =============================================================================


class TestCanonicalClassificationUnchanged:
    def test_fully_merged_branch_is_merged(self, tmp_path: Path) -> None:
        """Green guard: a canonical branch merged into the base still answers
        ``merged`` with count 0 and no ``reason`` — this is the outcome that
        lets the accepted no-PR finish path proceed (155-1/155-34), so the
        prefix change must not disturb it.
        """
        project = _make_project(tmp_path)
        _add_origin(tmp_path, project)
        _git(project, "checkout", "-q", "-b", "feat/162-4-merged")
        _commit(project, "landed")
        _git(project, "push", "-q", "origin", "feat/162-4-merged")
        _git(project, "checkout", "-q", BASE)
        _git(project, "merge", "-q", "--no-ff", "feat/162-4-merged", "-m", "land")
        _git(project, "push", "-q", "origin", BASE)

        state = _branch_merge_state(project, "feat/162-4-merged")

        assert state["state"] == "merged", state
        assert state["count"] == 0, state
        assert "reason" not in state, (
            f"a definitive answer must not carry a 'reason': {state}"
        )
        assert BASE in state["base"], (
            f"the base field must name the base branch for the operator-facing "
            f"abort prose: {state}"
        )

    def test_unmerged_branch_is_unmerged_with_count(self, tmp_path: Path) -> None:
        """Green guard: two commits the base lacks still answer ``unmerged``
        with the exact count that finish quotes to the operator.
        """
        project = _make_project(tmp_path)
        _add_origin(tmp_path, project)
        _git(project, "checkout", "-q", "-b", "feat/162-4-unmerged")
        _commit(project, "wip-one")
        _commit(project, "wip-two")

        state = _branch_merge_state(project, "feat/162-4-unmerged")

        assert state["state"] == "unmerged", state
        assert state["count"] == 2, state
        assert BASE in state["base"], state

    def test_missing_branch_is_unknown_with_reason(self, tmp_path: Path) -> None:
        """Green guard: a branch absent locally and on origin stays ``unknown``
        with the not-found reason. Unknown is not merged (rule #1) — this is the
        arm 155-34 turned into a loud abort, so its vocabulary is load-bearing.
        """
        project = _make_project(tmp_path)
        _add_origin(tmp_path, project)

        state = _branch_merge_state(project, "feat/162-4-ghost")

        assert state["state"] == "unknown", state
        assert "not found" in state["reason"].lower(), state
        assert "count" not in state, (
            f"an unknown answer must not carry a count finish would quote: {state}"
        )
        assert BASE in state["base"], state

    def test_missing_base_is_unknown_and_names_the_base(self, tmp_path: Path) -> None:
        """Green guard: the branch resolves but the configured base exists
        neither locally nor on origin — ``unknown``, with a reason that names
        the base so the operator can act.
        """
        project = _make_project(tmp_path, initial_branch="feat/162-4-only")

        state = _branch_merge_state(project, "feat/162-4-only")

        assert state["state"] == "unknown", state
        assert BASE in state["reason"], (
            f"the unknown reason must name the missing base branch: {state}"
        )
        assert "base" in state["reason"].lower(), state

    def test_upstream_base_wins_over_stale_local_base(self, tmp_path: Path) -> None:
        """Green guard (base preference, 155-34): the merge landed upstream but
        the local base is stale. Probing the upstream base first is what keeps
        that from reading as ``unmerged``; the prefix change must preserve the
        order.
        """
        project = _make_project(tmp_path)
        _add_origin(tmp_path, project)
        stale_base = _sha(project, "HEAD")
        _git(project, "checkout", "-q", "-b", "feat/162-4-upstream")
        _commit(project, "landed-upstream")
        _git(project, "push", "-q", "origin", "feat/162-4-upstream")
        _git(project, "checkout", "-q", BASE)
        _git(project, "merge", "-q", "--no-ff", "feat/162-4-upstream", "-m", "land")
        _git(project, "push", "-q", "origin", BASE)
        _git(project, "reset", "-q", "--hard", stale_base)
        assert _sha(project, f"refs/heads/{BASE}") == stale_base
        assert _sha(project, f"refs/remotes/origin/{BASE}") != stale_base

        state = _branch_merge_state(project, "feat/162-4-upstream")

        assert state["state"] == "merged", (
            f"the stale LOCAL base answered instead of origin's: {state}. Work "
            f"that landed upstream must not read as unmerged."
        )

    def test_local_branch_wins_over_stale_origin_branch(self, tmp_path: Path) -> None:
        """Green guard (branch preference, 155-34): the local branch has two
        commits beyond the base while origin only has the first push. The local
        ref — the one Step 6 would delete — must answer, so the count reflects
        the branch actually in hand.
        """
        project = _make_project(tmp_path)
        _add_origin(tmp_path, project)
        _git(project, "checkout", "-q", "-b", "feat/162-4-ahead")
        _commit(project, "pushed")
        _git(project, "push", "-q", "origin", "feat/162-4-ahead")
        _commit(project, "not-pushed")

        state = _branch_merge_state(project, "feat/162-4-ahead")

        assert state["state"] == "unmerged", state
        assert state["count"] == 2, (
            f"the stale remote-tracking ref answered instead of the local "
            f"branch: {state}"
        )


# =============================================================================
# Threat model — a dash-leading branch value really does reach the probe
# =============================================================================


class TestThreatModelReachability:
    def test_dash_leading_branch_value_survives_session_extraction(self) -> None:
        """Green guard: ``_extract_branch`` sentinels only a LONE ``-``, so a
        session field ``**Branch:** -evil`` (or a fetched/plumbing-written ref)
        arrives at ``_branch_merge_state`` with its dash intact. This is why
        the probe, not the extractor, has to be safe.
        """
        assert _extract_branch({"branch": DASH_BRANCH}) == DASH_BRANCH
        assert _extract_branch({"branch": f"`{DASH_BRANCH}` (pushed)"}) == DASH_BRANCH
