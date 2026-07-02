"""Advisory model-tier hook (PreToolUse).

Compares the session's actual model (persisted by the statusline hook) to the
active phase's expected tier alias (persisted by ``pf agent start``) and
injects a one-line advisory on mismatch — at most once per
(agent, story, phase, model) key.

ADVISORY ONLY: additionalContext, never a permission decision; exits 0 on
every path. Fail-soft: missing/corrupt state files mean silence.

Spec: docs/superpowers/specs/2026-07-02-model-tiering-design.md (orchestrator).
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from pf.common.config import get_project_root

# alias → substrings that satisfy it in a full model id
_FAMILY: dict[str, tuple[str, ...]] = {
    "fable": ("fable",),
    "opus": ("opus",),
    "sonnet": ("sonnet",),
    "haiku": ("haiku",),
    "best": ("fable", "opus"),  # best = Fable where available, else Opus
}


def _alias_satisfied(alias: str, model_id: str) -> bool:
    if alias == "inherit":
        return True
    families = _FAMILY.get(alias)
    if families is None:
        return True  # unknown alias (e.g. explicit claude-*): never nag
    mid = model_id.lower()
    return any(f in mid for f in families)


def check(project_root: Path) -> str | None:
    """Return advisory text, or None. Never raises."""
    try:
        expected_file = project_root / ".session" / ".expected-model"
        current_file = project_root / ".pennyfarthing" / ".runtime" / "current-model"
        if not expected_file.exists() or not current_file.exists():
            return None
        expected = json.loads(expected_file.read_text())
        alias = str(expected.get("alias") or "")
        current = current_file.read_text().strip()
        if not alias or not current or _alias_satisfied(alias, current):
            return None
        key = f"{expected.get('agent')}|{expected.get('story_id')}|{expected.get('phase')}|{current}"
        advised_file = project_root / ".session" / ".model-advised"
        if advised_file.exists() and advised_file.read_text() == key:
            return None
        advised_file.write_text(key)
        phase = expected.get("phase") or "current"
        agent = expected.get("agent") or "agent"
        return (
            f"[model-tier advisory] {phase} phase ({agent}) expects `{alias}` "
            f"per models.yaml; session is on `{current}`. Consider `/model {alias}` "
            f"— advisory only, carry on if intentional."
        )
    except Exception:
        return None


def main() -> None:
    """PreToolUse entry point — advise (never block) on a model/tier mismatch."""
    try:
        try:
            json.loads(sys.stdin.read())  # payload unused; validate shape only
        except (json.JSONDecodeError, ValueError):
            sys.exit(0)

        message = check(get_project_root())
        if message:
            print(
                json.dumps(
                    {
                        "hookSpecificOutput": {
                            "hookEventName": "PreToolUse",
                            "additionalContext": message,
                        }
                    }
                )
            )
    except SystemExit:
        raise
    except Exception:
        pass  # advisory hook: never break a prompt or a tool call

    sys.exit(0)


if __name__ == "__main__":
    main()
