"""Bounded subprocess execution: every child is timed out, nothing raises.

Extracted from ``pf.sprint.story_finish`` (162-9 / 162-41), which is the only
place in this codebase where "every subprocess is bounded and a hang becomes a
result object" holds — ``pf.patch_mode`` and ``pf.benchmark.pipeline_replay``
still call ``subprocess.run`` unbounded. Living here lets the next caller
inherit the property instead of re-deriving it.

Two design constraints, both load-bearing:

1. **The runner is injected.** Callers pass their own ``subprocess.run``
   (``runner=subprocess.run``) so the patchable seam stays in the CALLER's
   module. Every finish test suite fakes ``story_finish.subprocess``; a helper
   that reached ``subprocess.run`` through its own module global would turn all
   of those fakes into no-ops and let real ``gh``/``git`` run under test.
2. **Stdlib only.** This is a leaf utility any module (hooks, CLI, benchmark)
   may import, so it must not import ``pf`` anything: that is both an import
   cost for every caller and a cycle risk (162-30 hit exactly that with jira).
"""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from typing import Any

#: Default bound, in seconds. A default on the helper rather than a kwarg
#: repeated at every call site, so "bounded" is a property of this function
#: instead of an audit of its callers — the next call site inherits it.
DEFAULT_TIMEOUT_S = 120.0

#: timeout(1)'s conventional exit status, so a timed-out result reads as a
#: failure to every existing ``returncode != 0`` check.
TIMEOUT_RETURNCODE = 124

#: sh's "command not found" status. A child that could not be SPAWNED is a
#: different fact from one that hung, and must not land in the timeout arm:
#: routing it there tells the operator to expect the next call to hang too and
#: hides a missing binary.
SPAWN_FAILURE_RETURNCODE = 127


class TimedOutProcess(subprocess.CompletedProcess):
    """A :func:`run` result standing in for a child that blew its timeout.

    A distinct TYPE rather than a marker attribute or a magic returncode:
    :func:`timed_out` must answer False for every other result shape, including
    the mocks test suites hand back (a ``getattr`` probe on a ``MagicMock``
    invents a truthy attribute, which would read every faked call as timed out).
    """


def timed_out(result: Any) -> bool:
    """True when *result* came from a child that hit its timeout."""
    return isinstance(result, TimedOutProcess)


def run(
    cmd: list[str],
    *,
    timeout: float = DEFAULT_TIMEOUT_S,
    runner: Callable[..., subprocess.CompletedProcess[str]] | None = None,
    **kwargs: Any,
) -> subprocess.CompletedProcess[str]:
    """Run *cmd* bounded and captured, returning a result for every outcome.

    An explicitly passed ``timeout`` wins; that is how per-call tiering is
    expressed. ``runner`` defaults to :func:`subprocess.run` for callers with no
    seam to protect.

    Neither a blown timeout nor a failed spawn is raised: an exception escaping
    here violates the no-throw contract (SOUL #10 / rule 6) exactly as badly as
    the hang it replaced. ``stderr`` carries the exception's own text, which
    names the program, its subcommand and the bound that expired — callers
    surface it verbatim so "something failed" is never the whole story.
    """
    call = runner if runner is not None else subprocess.run
    try:
        return call(cmd, capture_output=True, text=True, timeout=timeout, **kwargs)
    except subprocess.TimeoutExpired as exc:
        return TimedOutProcess(list(cmd), TIMEOUT_RETURNCODE, "", str(exc))
    except OSError as exc:
        # ``gh`` absent from PATH (ENOENT), a fork that cannot allocate
        # (ENOMEM), an exhausted fd table (EMFILE). A plain CompletedProcess,
        # NOT a TimedOutProcess — see SPAWN_FAILURE_RETURNCODE.
        return subprocess.CompletedProcess(list(cmd), SPAWN_FAILURE_RETURNCODE, "", str(exc))
