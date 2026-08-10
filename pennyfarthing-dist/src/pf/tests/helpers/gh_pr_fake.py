"""Shared callable-dataclass fake for ``story_finish._run`` gh-PR operations.

Consolidates the four divergent ``_make_fake_run`` implementations from
test_155_1, test_155_12, test_155_15, and test_162_1 into one authoritative
``GhPrFake``.  Also re-exports the shared ``Literal`` type aliases that
production code (``story_finish.py``) and the fakes both depend on.

Usage::

    from pf.tests.helpers.gh_pr_fake import GhPrFake, GhPrState

    fake = GhPrFake(merge_rc=0, pr_state="MERGED")
    with patch("pf.sprint.story_finish._run", fake):
        result = finish_story(project, "155-1")
    assert len(fake.merge_calls) == 1
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any
from unittest.mock import MagicMock

# Re-exported so callers can ``from pf.tests.helpers.gh_pr_fake import GhPrState``
from pf.sprint.pr_types import GhMergeable, GhMergeStateStatus, GhPrState

__all__ = [
    "GhPrFake",
    "GhPrState",
    "GhMergeable",
    "GhMergeStateStatus",
]


@dataclass
class GhPrFake:
    """Callable dataclass that dispatches fake ``gh pr`` command responses.

    Dispatch key is ``parts[:3] == ["gh", "pr", "merge"]`` — precise, not
    the old ``"merge" in parts`` which would accidentally trip on ``git merge``.

    State machine
    -------------
    ``_landed`` starts ``False``.  A successful (``merge_rc == 0``) merge call
    flips it to ``True``.  ``gh pr view`` returns ``pre_merge_state`` until
    landed, then ``pr_state``.  A denied merge (rc != 0) does NOT advance state.

    Ledger
    ------
    Every ``gh pr merge`` invocation is appended to ``merge_calls`` as a
    ``list[str]`` of the full argv — typed, no ``type: ignore`` required.
    """

    merge_rc: int = 0
    merge_stderr: str = ""
    pr_state: GhPrState = "MERGED"
    pre_merge_state: GhPrState = "OPEN"
    mergeable: GhMergeable = "MERGEABLE"
    merge_state_status: GhMergeStateStatus = "CLEAN"
    base_ref: str = "develop"
    list_stdout: str = ""
    merge_calls: list[list[str]] = field(default_factory=list)

    def __post_init__(self) -> None:
        self._landed: bool = False

    def __call__(self, cmd: list[Any], **kwargs: Any) -> MagicMock:
        parts = [str(c) for c in cmd]

        if parts[:3] == ["gh", "pr", "merge"]:
            self.merge_calls.append(parts)
            if self.merge_rc == 0:
                self._landed = True
            return MagicMock(
                returncode=self.merge_rc,
                stdout="",
                stderr=self.merge_stderr,
            )

        if "view" in parts:
            current_state: str = self.pr_state if self._landed else self.pre_merge_state
            merged_at: str | None = (
                "2026-08-04T00:00:00Z" if current_state == "MERGED" else None
            )
            return MagicMock(
                returncode=0,
                stdout=json.dumps(
                    {
                        "state": current_state,
                        "mergedAt": merged_at,
                        "mergeable": self.mergeable,
                        "mergeStateStatus": self.merge_state_status,
                        "baseRefName": self.base_ref,
                    }
                ),
                stderr="",
            )

        if "list" in parts:
            return MagicMock(returncode=0, stdout=self.list_stdout, stderr="")

        return MagicMock(returncode=0, stdout="", stderr="")
