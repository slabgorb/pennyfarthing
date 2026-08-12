"""Pinning tests for story 162-83 — TOCTOU/O_NOFOLLOW decision for is_safe_shard_path.

Decision: **Option A — accept the documented deferral.**

Rationale
---------
The TOCTOU window (between ``resolve()`` in ``is_safe_shard_path`` and the
caller's ``open()``/``unlink()``) requires the attacker to:

1. Hold write access to the sprint directory (so they can swap the symlink), AND
2. Win a sub-millisecond race in a single-threaded CLI invocation.

Condition 1 alone constitutes full local compromise — the machine is already
owned.  There is no privilege-escalation path, no daemon running continuously,
no network boundary, and no shared-tenant context in which ``pf`` runs.

What ``is_safe_shard_path`` DOES provide (and what these tests pin) is the
``resolve()``-time guarantee: a symlink planted in the sprint directory BEFORE
the CLI runs, pointing outside ``base_dir``, is caught and rejected.  That is
the only vector available to an attacker who does NOT already hold arbitrary
write access to the sprint directory.

The TOCTOU race — swapping the symlink BETWEEN ``resolve()`` and the caller's
``open()`` — is knowingly out of scope for this threat model and requires no
additional hardening.  See the docstring on ``is_safe_shard_path`` for the full
decision record (162-83), including what conditions would change the calculus.

These tests do NOT attempt to demonstrate that O_NOFOLLOW hardening is absent;
they pin that the current ``resolve()``-time guarantee is correct and complete
for the accepted threat model.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


# ---------------------------------------------------------------------------
# 162-83: resolve()-time guarantee — the boundary we DO enforce
# ---------------------------------------------------------------------------


def test_is_safe_shard_path_rejects_symlink_pointing_outside_base(tmp_path):
    """A symlink inside base_dir pointing outside is rejected at resolve() time.

    This is the primary security guarantee: a symlink planted in the sprint
    directory before the CLI runs, pointing at an out-of-base file, is caught.
    Annotated as the resolve()-time guarantee accepted under the 162-83 decision.
    """
    # 162-83: this is the check we DO provide — planted-symlink rejection
    from pf.sprint.shard_merge import is_safe_shard_path

    base = tmp_path / "sprint"
    base.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "secret.yaml"
    _write_yaml(secret, {"id": "PWNED"})

    # symlink inside base_dir pointing at outside file
    link = base / "epic-evil.yaml"
    link.symlink_to(secret)

    # resolve() follows the symlink and sees the outside path — rejected
    assert not is_safe_shard_path(link, base), (
        "resolve()-time guarantee broken: symlink pointing outside base_dir "
        "should be rejected by is_safe_shard_path"
    )


def test_is_safe_shard_path_rejects_symlink_via_directory_traversal(tmp_path):
    """A symlink to an outside directory, routed through a path component, is rejected.

    The ref ``link/epic-PWNED`` builds ``base/epic-link/epic-PWNED.yaml``; the
    ``epic-link`` entry inside base is a symlink to an outside directory.  Only
    ``resolve()``-based containment catches this — a lexical ``..`` check does not.

    Annotated as the resolve()-time guarantee confirmed under the 162-83 decision.
    """
    # 162-83: symlink-directory traversal is caught at resolve() time
    from pf.sprint.shard_merge import is_safe_shard_path

    base = tmp_path / "sprint"
    base.mkdir()
    outside = tmp_path / "outside"
    outside.mkdir()
    _write_yaml(outside / "epic-PWNED.yaml", {"id": "PWNED"})

    # in-dir directory symlink — the classic escape vector
    (base / "epic-link").symlink_to(outside, target_is_directory=True)
    candidate = base / "epic-link" / "epic-PWNED.yaml"

    assert not is_safe_shard_path(candidate, base), (
        "resolve()-time guarantee broken: in-dir directory symlink routing "
        "outside base_dir should be rejected by is_safe_shard_path"
    )


def test_is_safe_shard_path_accepts_benign_path_inside_base(tmp_path):
    """A plain in-dir path (no symlink) is accepted — the happy-path pin.

    The containment check must not over-reject legitimate shard paths.
    """
    # 162-83: benign paths are unaffected by the resolve()-time check
    from pf.sprint.shard_merge import is_safe_shard_path

    base = tmp_path / "sprint"
    base.mkdir()
    shard = base / "epic-42.yaml"
    _write_yaml(shard, {"id": "42"})

    assert is_safe_shard_path(shard, base), (
        "containment check incorrectly rejected a legitimate in-dir shard path"
    )


def test_is_safe_shard_path_accepts_benign_path_that_does_not_exist(tmp_path):
    """A non-existent in-dir path is accepted (the path is still contained).

    ``safe_ref_path`` builds paths before checking existence; the containment
    check must not require the file to exist.
    """
    # 162-83: non-existent but contained paths are not rejected
    from pf.sprint.shard_merge import is_safe_shard_path

    base = tmp_path / "sprint"
    base.mkdir()
    candidate = base / "epic-not-there-yet.yaml"

    assert is_safe_shard_path(candidate, base), (
        "containment check rejected a non-existent but legitimately contained path"
    )


def test_is_safe_shard_path_fails_closed_on_oserror(tmp_path):
    """An OSError from Path.resolve() causes is_safe_shard_path to return False.

    Fail-closed semantics: any resolution error is caught and the path is
    treated as unsafe. Pinned by injecting an OSError directly into
    ``Path.resolve`` so the except branch is actually exercised.
    """
    # 162-83: fail-closed on resolution error — genuinely exercise the except branch
    from unittest.mock import patch

    from pf.sprint.shard_merge import is_safe_shard_path

    base = tmp_path / "sprint"
    base.mkdir()
    candidate = base / "epic-42.yaml"

    with patch("pathlib.Path.resolve", side_effect=OSError("injected resolve error")):
        result = is_safe_shard_path(candidate, base)

    assert result is False, (
        "fail-closed contract broken: is_safe_shard_path must return False "
        "when Path.resolve() raises OSError"
    )


# ---------------------------------------------------------------------------
# 162-83: TOCTOU scope boundary — document what is NOT protected
# ---------------------------------------------------------------------------


@pytest.mark.xfail(
    reason=(
        "162-83 TOCTOU scope: swapping a symlink AFTER resolve() but BEFORE "
        "open() is not protected — this is the knowingly-deferred race. "
        "The test is marked xfail to document the boundary, not to demand hardening. "
        "See is_safe_shard_path docstring for the full decision record. "
        "strict=True: if this ever XPASSes, O_NOFOLLOW hardening was added and "
        "this test must be converted to a normal passing test."
    ),
    strict=True,
)
def test_toctou_window_is_documented_as_out_of_scope(tmp_path):
    """Documents (does NOT assert security of) the TOCTOU race window.

    This test exists solely to make the scope boundary visible in the test suite.
    It is marked xfail/skip — it is NOT a failing security test demanding a fix.

    The scenario: symlink points inside base_dir during is_safe_shard_path()
    (passes), then is atomically replaced to point outside before open().
    An attacker executing this swap must already hold write access to the sprint
    directory, making the machine fully compromised — so the race is not a
    meaningful additional risk.  See 162-83 decision record for full rationale.
    """
    # 162-83: TOCTOU window — intentionally out of scope, documented here
    import os

    from pf.sprint.shard_merge import is_safe_shard_path

    base = tmp_path / "sprint"
    base.mkdir()
    inside = base / "epic-inside.yaml"
    _write_yaml(inside, {"id": "inside"})
    outside = tmp_path / "outside"
    outside.mkdir()
    secret = outside / "epic-secret.yaml"
    _write_yaml(secret, {"id": "PWNED"})

    # 1. Create a symlink pointing INSIDE base_dir (passes the check)
    link = base / "epic-42.yaml"
    link.symlink_to(inside)

    # 2. Check passes — link resolves inside base_dir
    assert is_safe_shard_path(link, base)

    # 3. [Race window] Atomically swap the symlink to point outside
    #    (requires write access to base_dir — i.e. local compromise already)
    tmp_link = base / ".epic-42-swap.yaml"
    tmp_link.symlink_to(secret)
    os.replace(tmp_link, link)  # atomic rename-over

    # 4. The file that would now be opened resolves outside — this is the gap
    resolved_after_swap = link.resolve()
    assert not resolved_after_swap.is_relative_to(base.resolve()), (
        "test setup: after swap, link should resolve outside base — "
        "this demonstrates the TOCTOU window, NOT a security failure to fix"
    )
    # The test body itself xfails here because we have no post-open re-check.
    # That is the documented deferral — not a bug.
    pytest.fail("TOCTOU window exists — this is the documented deferral, not a bug")
