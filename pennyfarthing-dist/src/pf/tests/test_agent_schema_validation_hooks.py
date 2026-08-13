"""Tests that Write-capable agents declare the schema-validation backstop.

Story 162-42: `agents/sm-setup.md` is the producer of `.session/<id>-session.md`
(the 155-32 defect surface) yet its frontmatter declares no
`hooks.PreToolUse: pf hooks schema-validation` block, while the eleven
top-level agents all do.

This is a DECLARATION-COMPLETENESS invariant, not a runtime assertion: the
dispatcher registers schema-validation globally today, so these tests
deliberately do no runtime/network work. They parse agent frontmatter with the
real parser (`pf.hooks.frontmatter`) and assert every Write-capable agent
honestly declares the hook it depends on. That way (a) collecting hooks from
the producer alone yields the declaration, and (b) if hook scoping ever becomes
per-agent, no Write-capable agent is silently dropped.

Acceptance Criteria:
  AC1: agents/sm-setup.md declares PreToolUse `pf hooks schema-validation`
       with matcher `Write`.
  AC2: Class invariant — every agents/*.md whose frontmatter tools (or
       allowed-tools) permits Write declares that same hook.
  AC3: The declaration does not clobber sm-setup's existing frontmatter keys.
  AC4: Adding the declaration must not duplicate the collected hook entry.

Run with:
  cd pennyfarthing-dist && uv run pytest \
      src/pf/tests/test_agent_schema_validation_hooks.py -q
"""

from __future__ import annotations

from pathlib import Path

import pytest

from pf.hooks.frontmatter import (
    HookDeclaration,
    collect_all_frontmatter_hooks,
    parse_agent_hooks,
    parse_frontmatter,
)

# ---------------------------------------------------------------------------
# Constants / helpers
# ---------------------------------------------------------------------------

SCHEMA_VALIDATION_HOOK = HookDeclaration(
    event="PreToolUse",
    command="pf hooks schema-validation",
    matcher="Write",
)

DIST_ROOT = Path(__file__).resolve().parents[3]
AGENTS_DIR = DIST_ROOT / "agents"


def _tools_tokens(frontmatter: dict) -> list[str]:
    """Normalize a frontmatter `tools` / `allowed-tools` value to a token list.

    Accepts both the comma-string form (`tools: Bash, Read, Write`) and the
    YAML list form (`tools: [Read, Write]`). Returns [] when absent.
    """
    raw = frontmatter.get("tools", frontmatter.get("allowed-tools"))
    if raw is None:
        return []
    if isinstance(raw, str):
        return [t.strip() for t in raw.split(",") if t.strip()]
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    return []


def _permits_write(frontmatter: dict) -> bool:
    """True when the agent may use the Write tool.

    An explicit tools list permits Write only if it names Write (or the `*`
    wildcard). No tools key at all means unrestricted, which includes Write.
    """
    tokens = _tools_tokens(frontmatter)
    if not tokens:
        return True
    return "Write" in tokens or "*" in tokens


def _agent_files() -> list[Path]:
    """Top-level agent definitions, matching collect_all_frontmatter_hooks."""
    return [f for f in sorted(AGENTS_DIR.glob("*.md")) if f.name != "README.md"]


def _write_capable_agents() -> list[Path]:
    return [f for f in _agent_files() if _permits_write(parse_frontmatter(f.read_text()))]


def _declares_schema_validation(content: str) -> bool:
    return SCHEMA_VALIDATION_HOOK in parse_agent_hooks(content)


# ---------------------------------------------------------------------------
# Guard: the fixtures below are only meaningful against the real agents dir
# ---------------------------------------------------------------------------


def test_agents_dir_is_discoverable() -> None:
    """Sanity guard so a path regression cannot make the suite vacuous."""
    assert AGENTS_DIR.is_dir(), f"agents dir not found at {AGENTS_DIR}"
    assert len(_agent_files()) > 10, "expected the full agent roster"


# ===================================================================
# AC1: sm-setup declares the schema-validation hook
# ===================================================================


class TestSmSetupDeclaresSchemaValidation:
    """AC1: the 155-32 producer declares the backstop that guards its Write."""

    def test_sm_setup_declares_schema_validation_hook(self) -> None:
        sm_setup = AGENTS_DIR / "sm-setup.md"
        declarations = parse_agent_hooks(sm_setup.read_text())
        assert SCHEMA_VALIDATION_HOOK in declarations, (
            "sm-setup.md must declare PreToolUse 'pf hooks schema-validation' "
            f"with matcher 'Write'; found {declarations}"
        )

    def test_collecting_sm_setup_alone_yields_the_declaration(self, tmp_path: Path) -> None:
        """collect_all_frontmatter_hooks on a dist containing only sm-setup.md
        must surface the hook — proving the declaration travels with the
        producer rather than being inherited from the other agents."""
        agents = tmp_path / "agents"
        agents.mkdir()
        (agents / "sm-setup.md").write_text((AGENTS_DIR / "sm-setup.md").read_text())

        collected = collect_all_frontmatter_hooks(tmp_path)

        assert SCHEMA_VALIDATION_HOOK in collected.get("PreToolUse", []), (
            "sm-setup.md in isolation yielded no schema-validation hook: "
            f"{collected}"
        )


# ===================================================================
# AC2: Class invariant — every Write-capable agent declares the hook
# ===================================================================


class TestWriteCapableAgentsDeclareSchemaValidation:
    """AC2: the durable pin — catches the next Write-capable agent too."""

    @pytest.mark.parametrize(
        "agent_path",
        _write_capable_agents(),
        ids=lambda p: p.name,
    )
    def test_write_capable_agent_declares_schema_validation(self, agent_path: Path) -> None:
        assert _declares_schema_validation(agent_path.read_text()), (
            f"{agent_path.name} permits the Write tool but declares no "
            "PreToolUse 'pf hooks schema-validation' (matcher 'Write') hook"
        )

    def test_no_write_capable_agent_is_missing_the_hook(self) -> None:
        """Aggregate form: reports the whole offending set in one failure."""
        missing = [
            f.name for f in _write_capable_agents() if not _declares_schema_validation(f.read_text())
        ]
        assert missing == [], f"Write-capable agents missing schema-validation: {missing}"

    def test_invariant_covers_a_meaningful_population(self) -> None:
        """The invariant must not be trivially satisfiable by an empty set."""
        assert len(_write_capable_agents()) >= 12


# ===================================================================
# AC3: existing frontmatter keys survive the edit
# ===================================================================


class TestSmSetupFrontmatterPreserved:
    """AC3: adding hooks must not clobber name/description/tools/model."""

    def test_sm_setup_keeps_identity_and_tool_keys(self) -> None:
        frontmatter = parse_frontmatter((AGENTS_DIR / "sm-setup.md").read_text())
        assert frontmatter.get("name") == "sm-setup"
        assert frontmatter.get("model") == "haiku"
        assert frontmatter.get("description")
        assert set(_tools_tokens(frontmatter)) == {"Bash", "Read", "Edit", "Write"}


# ===================================================================
# AC4: no duplication in collected hooks
# ===================================================================


class TestNoDuplicateCollectedHook:
    """AC4: de-dup must keep the real dist at exactly one declaration."""

    def test_real_dist_collects_schema_validation_exactly_once(self) -> None:
        collected = collect_all_frontmatter_hooks(DIST_ROOT).get("PreToolUse", [])
        matches = [h for h in collected if h.command == "pf hooks schema-validation"]
        assert len(matches) == 1, f"expected 1 schema-validation entry, got {matches}"
