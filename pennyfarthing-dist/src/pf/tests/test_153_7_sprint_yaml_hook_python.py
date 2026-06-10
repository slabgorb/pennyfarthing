"""Tests for story 153-7: sprint-yaml PostToolUse hook must not depend on Node.

Bug: ``pf.hooks.sprint_yaml_validation.main()`` shelled out to ``node`` with
``import { parse } from 'yaml'`` — an npm package that is not resolvable in
consumer projects nor the orchestrator. Every sprint-YAML Write/Edit therefore
crashed the hook with ``ERR_MODULE_NOT_FOUND`` (or silently no-op'd via the
``FileNotFoundError`` swallow when ``node`` itself is absent).

The framework is Python-first (ADR-0034: Python owns hooks/business logic) and
PyYAML is already a dependency, and an in-tree validator already exists
(``pf.sprint.validator``). The fix is to validate sprint YAML in-process using
that Python validator and NEVER spawn Node.

These tests assert the *behavior* the hook must exhibit:
  - valid sprint YAML  -> silent pass (exit 0, no additionalContext)
  - invalid sprint YAML (bad status enum / malformed YAML) -> reported via the
    PostToolUse additionalContext convention, exit 0 (advisory, never blocks)
  - non-sprint-yaml file paths -> skipped (no validation, no output)
  - robustness: missing file, empty/garbage stdin payload, wrong tool -> no
    crash, graceful exit 0
  - regression guard: the hook must NEVER invoke ``node`` (or any subprocess)

The hook reads a Claude Code PostToolUse payload from stdin and writes any
advisory to stdout as a ``HookResponse`` (``hookSpecificOutput`` with
``additionalContext``). It must call ``sys.exit(0)`` on every path — a
PostToolUse hook is advisory and must not block or crash the originating write.
"""

from __future__ import annotations

import importlib
import io
import json
from pathlib import Path

import pytest

MODULE = "pf.hooks.sprint_yaml_validation"


# -----------------------------------------------------------------------------
# Helpers
# -----------------------------------------------------------------------------


def _run_hook(
    payload: dict | str,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> tuple[str, int]:
    """Run the hook's ``main()`` with *payload* on stdin.

    Returns ``(stdout, exit_code)``. ``payload`` may be a dict (json-encoded)
    or a raw string (to exercise the malformed-stdin path).
    """
    mod = importlib.import_module(MODULE)

    raw = payload if isinstance(payload, str) else json.dumps(payload)
    monkeypatch.setattr("sys.stdin", io.StringIO(raw))

    code = 0
    try:
        mod.main()
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 0

    out = capsys.readouterr().out
    return out, code


def _extract_context(stdout: str) -> str | None:
    """Pull ``hookSpecificOutput.additionalContext`` out of hook stdout."""
    for line in stdout.strip().splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        return data.get("hookSpecificOutput", {}).get("additionalContext")
    return None


def _write_sprint_file(tmp_path: Path, body: str, name: str = "current-sprint.yaml") -> Path:
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir(parents=True, exist_ok=True)
    f = sprint_dir / name
    f.write_text(body, encoding="utf-8")
    return f


_VALID_SPRINT = """\
sprint:
  number: 12
  goal: "Ship the thing"
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: active
epics:
  - id: "153"
    title: "Reliability fixes"
    stories:
      - id: "153-7"
        title: "Fix the hook"
        points: 2
        status: in_progress
"""

# status: bogus is not in VALID_SPRINT_STATUSES {active, closed}
_INVALID_STATUS_SPRINT = """\
sprint:
  number: 12
  goal: "Ship the thing"
  start_date: 2026-01-20
  end_date: 2026-02-02
  status: bogus
epics: []
"""

# unterminated flow mapping -> yaml.YAMLError on parse
_MALFORMED_YAML = """\
sprint:
  number: 12
  goal: "Ship the thing"
  status: active
  broken: {unterminated: [1, 2, 3
"""


# -----------------------------------------------------------------------------
# Regression guard: the hook must never reach for Node
# -----------------------------------------------------------------------------


def test_hook_never_spawns_node_subprocess(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """The core bug: validation must happen in-process, never via ``node``.

    Any call to ``subprocess.run``/``Popen`` from the hook fails the test. This
    is the regression that broke every consumer project (npm ``yaml`` package
    unresolvable -> ERR_MODULE_NOT_FOUND).
    """
    sprint_file = _write_sprint_file(tmp_path, _VALID_SPRINT)

    import subprocess

    # The hook wraps its body in a broad ``except Exception: pass``, so raising
    # from the patched subprocess would be silently swallowed. Record the call
    # in a mutable sentinel instead and assert on it AFTER the hook returns.
    spawned: list[tuple] = []

    def _record_run(*args, **kwargs):  # noqa: ANN002, ANN003
        spawned.append(args)

        class _R:
            returncode = 0
            stdout = ""
            stderr = ""

        return _R()

    def _record_popen(*args, **kwargs):  # noqa: ANN002, ANN003
        spawned.append(args)
        raise RuntimeError("Popen should not be used")

    monkeypatch.setattr(subprocess, "run", _record_run)
    monkeypatch.setattr(subprocess, "Popen", _record_popen)

    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(sprint_file)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert spawned == [], (
        f"Hook spawned a subprocess (Node?) — must validate in-process. "
        f"calls={spawned!r}"
    )
    assert code == 0


# -----------------------------------------------------------------------------
# Valid sprint YAML -> silent pass
# -----------------------------------------------------------------------------


def test_valid_sprint_yaml_passes_silently(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A valid sprint YAML write produces exit 0 and no advisory context."""
    sprint_file = _write_sprint_file(tmp_path, _VALID_SPRINT)
    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(sprint_file)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0
    assert _extract_context(out) is None, (
        f"Valid sprint YAML must not emit an advisory, got: {out!r}"
    )


# -----------------------------------------------------------------------------
# Invalid sprint YAML -> reported, but never blocks
# -----------------------------------------------------------------------------


def test_invalid_status_enum_is_reported(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A bad sprint status enum must surface in additionalContext."""
    sprint_file = _write_sprint_file(tmp_path, _INVALID_STATUS_SPRINT)
    payload = {
        "tool_name": "Edit",
        "tool_input": {"file_path": str(sprint_file)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    ctx = _extract_context(out)
    assert ctx is not None, (
        f"Invalid sprint status must produce an advisory, got: {out!r}"
    )
    # Must be a real validation message, not a Node crash dressed up as one.
    assert "ERR_MODULE_NOT_FOUND" not in ctx and "node:internal" not in ctx, (
        f"Advisory must come from the Python validator, not a Node crash: {ctx!r}"
    )
    # The Python validator names the bad enum and lists the valid choices.
    assert "bogus" in ctx, (
        f"Advisory should name the offending status value 'bogus', got: {ctx!r}"
    )


def test_malformed_yaml_is_reported(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Syntactically broken YAML must be reported, not crash the hook."""
    sprint_file = _write_sprint_file(tmp_path, _MALFORMED_YAML)
    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(sprint_file)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0
    ctx = _extract_context(out)
    assert ctx is not None, (
        f"Malformed YAML must produce an advisory, got: {out!r}"
    )
    # The advisory must come from the Python YAML parser, not a Node crash.
    assert "ERR_MODULE_NOT_FOUND" not in ctx and "node:internal" not in ctx, (
        f"Advisory must come from the Python validator, not a Node crash: {ctx!r}"
    )


def test_invalid_sprint_yaml_does_not_block_write(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """PostToolUse is advisory: even invalid YAML must exit 0 (never block/2)."""
    sprint_file = _write_sprint_file(tmp_path, _INVALID_STATUS_SPRINT)
    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(sprint_file)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0, (
        f"PostToolUse hook must never block the write (exit 0), got exit {code}"
    )


# -----------------------------------------------------------------------------
# Non-sprint-yaml paths -> skipped
# -----------------------------------------------------------------------------


def test_non_sprint_yaml_path_is_skipped(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A YAML file outside ``sprint/`` must not be validated."""
    other = tmp_path / "config" / "settings.yaml"
    other.parent.mkdir(parents=True, exist_ok=True)
    # Bad status — would be flagged IF this were a sprint file.
    other.write_text(_INVALID_STATUS_SPRINT, encoding="utf-8")

    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(other)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0
    assert _extract_context(out) is None, (
        f"Non-sprint YAML must be skipped, got advisory: {out!r}"
    )


def test_non_yaml_sprint_path_is_skipped(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A non-YAML file under sprint/ (e.g. a .md) must not be validated."""
    sprint_dir = tmp_path / "sprint"
    sprint_dir.mkdir(parents=True, exist_ok=True)
    md = sprint_dir / "notes.md"
    md.write_text("# not yaml\n", encoding="utf-8")

    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(md)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0
    assert _extract_context(out) is None


def test_non_edit_write_tool_is_skipped(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Only Edit/Write trigger validation; Read/Bash/etc. are ignored."""
    sprint_file = _write_sprint_file(tmp_path, _INVALID_STATUS_SPRINT)
    payload = {
        "tool_name": "Read",
        "tool_input": {"file_path": str(sprint_file)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0
    assert _extract_context(out) is None


# -----------------------------------------------------------------------------
# Robustness: never crash on bad input
# -----------------------------------------------------------------------------


def test_missing_file_exits_cleanly(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A sprint path that does not exist on disk must not crash the hook."""
    missing = tmp_path / "sprint" / "ghost.yaml"
    payload = {
        "tool_name": "Write",
        "tool_input": {"file_path": str(missing)},
    }
    out, code = _run_hook(payload, monkeypatch, capsys)

    assert code == 0
    assert _extract_context(out) is None


def test_empty_stdin_payload_exits_cleanly(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Empty stdin must be handled gracefully (exit 0, no output)."""
    out, code = _run_hook("", monkeypatch, capsys)
    assert code == 0
    assert _extract_context(out) is None


def test_garbage_stdin_payload_exits_cleanly(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """Non-JSON stdin must not raise — graceful exit 0."""
    out, code = _run_hook("this is not json {[", monkeypatch, capsys)
    assert code == 0
    assert _extract_context(out) is None


def test_payload_missing_tool_input_exits_cleanly(
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    """A payload with no ``tool_input`` must not raise a KeyError."""
    out, code = _run_hook({"tool_name": "Write"}, monkeypatch, capsys)
    assert code == 0
    assert _extract_context(out) is None
