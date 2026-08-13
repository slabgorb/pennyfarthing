"""
Tests for Story 98-4: Prefix built-in skills and commands with pf-.

Covers all Acceptance Criteria:
  AC1: All built-in skill directories renamed from {name}/ to pf-{name}/
  AC2: All built-in command files renamed from {name}.md to pf-{name}.md
  AC3: skill-registry.yaml updated with new prefixed names
  AC4: Compatibility symlinks created via migration
  AC5: Migration 007 created with correct structure
  AC6: createCommandsDirectory handles prefixed names
  AC7: createSkillsDirectory handles prefixed names
  AC8: Existing user workflows unbroken (backward compat)

Run with: python -m pytest tests/python/test_prefix_skills_commands.py -v
"""

import re
from pathlib import Path

import yaml

# Project root is pennyfarthing/ (two levels up from tests/python/)
PROJECT_ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = PROJECT_ROOT / "pennyfarthing-dist"
SKILLS_DIR = DIST_DIR / "skills"
COMMANDS_DIR = DIST_DIR / "commands"
AGENTS_DIR = DIST_DIR / "agents"
REGISTRY_PATH = SKILLS_DIR / "skill-registry.yaml"
COMMAND_REGISTRY_PATH = DIST_DIR / "command-registry.yaml"

# Files in the skills directory that are NOT skill directories
SKILLS_NON_DIRS = {"skill-registry.yaml", "skill-registry.schema.json"}

# 162-30: the hardcoded EXPECTED_SKILLS / EXPECTED_COMMANDS rosters that used to
# live here were snapshots of the skill and command sets as they stood at story
# 98-4. They rotted: pf-cyclist, pf-story and pf-theme-creation were retired,
# and roughly a third of the 46 pinned command filenames were renamed or removed
# (pf-close-epic, pf-git-cleanup, pf-new-work, pf-release, ... -> pf-epic,
# pf-git, pf-session, ...). A frozen roster asserts "the content has not
# changed", which is not the AC — the AC is the pf- PREFIX invariant and
# registry/disk agreement. Every expectation below is therefore derived from a
# live source: skills/skill-registry.yaml, command-registry.yaml, or the
# skills/ and commands/ directories themselves.

# Skills retired outright (registry entry AND directory removed). Named so a
# re-introduction under the old identity fails rather than passing silently.
RETIRED_SKILLS = ["pf-cyclist", "pf-story", "pf-theme-creation"]


def _load_command_registry() -> dict:
    """Load and parse command-registry.yaml (the live slash-command roster)."""
    if not COMMAND_REGISTRY_PATH.is_file():
        return {}
    return yaml.safe_load(COMMAND_REGISTRY_PATH.read_text()) or {}


def _registry_agent_names() -> list[str]:
    """Agent roles that command-registry.yaml declares a slash command for."""
    return sorted(_load_command_registry().get("agents", {}).get("commands", {}))


def _get_skill_dirs() -> list[str]:
    """Get all skill directory names (excluding non-directory files)."""
    if not SKILLS_DIR.is_dir():
        return []
    return sorted(
        entry.name
        for entry in SKILLS_DIR.iterdir()
        if entry.is_dir() and not entry.name.startswith(".")
    )


def _get_command_files() -> list[str]:
    """Get all command .md file names."""
    if not COMMANDS_DIR.is_dir():
        return []
    return sorted(
        entry.name
        for entry in COMMANDS_DIR.iterdir()
        if entry.is_file() and entry.suffix == ".md"
    )


def _load_registry() -> dict:
    """Load and parse skill-registry.yaml."""
    if not REGISTRY_PATH.is_file():
        return {}
    return yaml.safe_load(REGISTRY_PATH.read_text()) or {}


# =============================================================================
# AC1: All built-in skill directories renamed to pf-{name}/
# =============================================================================


class TestAC1SkillDirectoriesRenamed:
    """All built-in skill directories should have pf- prefix."""

    def test_all_skill_dirs_have_pf_prefix(self) -> None:
        """Every skill directory must start with 'pf-'."""
        skill_dirs = _get_skill_dirs()
        assert len(skill_dirs) > 0, "No skill directories found"

        unprefixed = [d for d in skill_dirs if not d.startswith("pf-")]
        assert unprefixed == [], (
            f"Found {len(unprefixed)} skill directories without pf- prefix: "
            f"{unprefixed}"
        )

    def test_no_old_unprefixed_skill_dirs_remain(self) -> None:
        """No old-style unprefixed skill directories should remain."""
        old_names = [
            "agentic-patterns", "bc", "changelog", "code-review",
            "context-engineering", "cyclist", "dev-patterns", "jira",
            "just", "mermaid", "otel", "sprint", "story",
            "systematic-debugging", "testing", "theme", "theme-creation",
            "workflow", "yq",
        ]
        skill_dirs = _get_skill_dirs()
        remaining = [name for name in old_names if name in skill_dirs]
        assert remaining == [], (
            f"Old unprefixed skill directories still exist: {remaining}"
        )

    def test_retired_skills_absent_from_disk_and_registry(self) -> None:
        """Retired skills must be gone from BOTH the registry and skills/.

        Replaces `test_expected_skills_all_present`, whose frozen roster still
        demanded pf-cyclist, pf-story and pf-theme-creation. The forward
        direction (every registry entry has a directory, and vice versa) is
        covered by `TestIntegrationRealCodebase` against live data; what that
        pair cannot catch is a retired skill being resurrected in exactly one of
        the two places, which is what this pins.
        """
        skill_dirs = set(_get_skill_dirs())
        registry_keys = set(_load_registry().get("skills", {}))
        assert registry_keys, "No skills found in registry"

        resurrected = {
            name: {
                "directory": name in skill_dirs,
                "registry": name in registry_keys,
            }
            for name in RETIRED_SKILLS
            if name in skill_dirs or name in registry_keys
        }
        assert resurrected == {}, f"Retired skills are back: {resurrected}"

    # `test_skill_count_preserved` (>= 20 dirs) deleted in 162-30: a count FLOOR
    # is a vacuous guard. It cannot fail while skills are being added, and it
    # says nothing about which skills exist. The real invariant — registry keys
    # and skill directories agree — is asserted from live data by
    # `TestIntegrationRealCodebase` below.


# =============================================================================
# AC2: All built-in command files renamed to pf-{name}.md
# =============================================================================


class TestAC2CommandFilesRenamed:
    """All built-in command files should have pf- prefix."""

    # Deprecated redirect commands that intentionally keep unprefixed names
    LEGACY_UNPREFIXED_COMMANDS = {
        "benchmark-control.md", "benchmark.md", "job-fair.md", "solo.md",
    }

    def test_all_command_files_have_pf_prefix(self) -> None:
        """Every command .md file must start with 'pf-' (except legacy redirects)."""
        cmd_files = _get_command_files()
        assert len(cmd_files) > 0, "No command files found"

        unprefixed = [
            f for f in cmd_files
            if not f.startswith("pf-") and f not in self.LEGACY_UNPREFIXED_COMMANDS
        ]
        assert unprefixed == [], (
            f"Found {len(unprefixed)} command files without pf- prefix: "
            f"{unprefixed}"
        )

    def test_no_old_unprefixed_command_files_remain(self) -> None:
        """No old-style unprefixed command files should remain."""
        old_names = [
            "architect.md", "ba.md", "brainstorming.md", "check.md",
            "chore.md", "dev.md", "devops.md", "help.md", "new-work.md",
            "orchestrator.md", "pm.md", "reviewer.md", "sm.md",
            "sprint.md", "tea.md", "workflow.md", "work.md",
        ]
        cmd_files = _get_command_files()
        remaining = [name for name in old_names if name in cmd_files]
        assert remaining == [], (
            f"Old unprefixed command files still exist: {remaining}"
        )

    def test_every_registry_agent_has_a_prefixed_command_file(self) -> None:
        """Each agent command-registry.yaml declares needs `commands/pf-<agent>.md`.

        Replaces `test_expected_commands_all_present`, which pinned a frozen
        46-filename roster. The roster is derived here from the live
        `command-registry.yaml` `agents.commands` map, so adding or retiring an
        agent updates the expectation automatically while still failing loudly
        if an agent's slash command goes missing or loses its pf- prefix.
        """
        agent_names = _registry_agent_names()
        assert agent_names, "command-registry.yaml declares no agent commands"

        cmd_files = set(_get_command_files())
        missing = [f"pf-{name}.md" for name in agent_names if f"pf-{name}.md" not in cmd_files]
        assert missing == [], (
            f"Agents declared in command-registry.yaml with no pf-prefixed "
            f"command file: {missing}"
        )

    def test_every_registry_agent_has_an_agent_definition(self) -> None:
        """The other half of the pair: the agent definition itself must exist.

        Without this, a `pf-<agent>.md` command could point at a deleted agent
        and the test above would still pass.
        """
        agent_names = _registry_agent_names()
        assert agent_names, "command-registry.yaml declares no agent commands"

        missing = [n for n in agent_names if not (AGENTS_DIR / f"{n}.md").is_file()]
        assert missing == [], (
            f"Agents declared in command-registry.yaml with no agents/<name>.md "
            f"definition: {missing}"
        )

    # `test_command_count_preserved` (>= 47 files) deleted in 162-30. There are
    # 38 command files today — the drop is real and intended (the JS/TS removal
    # in 038d3c6f0 plus the pf-git / pf-session / pf-epic / pf-ci / pf-docs
    # regrouping folded many single-purpose commands into groups). A floor over a
    # deliberately shrinking set can only be satisfied by lowering the number,
    # which proves nothing; the derived set assertions above replace it.


# =============================================================================
# AC3: skill-registry.yaml updated with prefixed names
# =============================================================================


class TestAC3SkillRegistryUpdated:
    """skill-registry.yaml keys and name fields should have pf- prefix."""

    def test_all_registry_keys_have_pf_prefix(self) -> None:
        """Every skill key in the registry must start with 'pf-'."""
        registry = _load_registry()
        skills = registry.get("skills", {})
        assert len(skills) > 0, "No skills found in registry"

        unprefixed = [k for k in skills if not k.startswith("pf-")]
        assert unprefixed == [], (
            f"Found {len(unprefixed)} registry keys without pf- prefix: "
            f"{unprefixed}"
        )

    def test_all_registry_names_match_keys(self) -> None:
        """Each skill's 'name' field must match its key."""
        registry = _load_registry()
        skills = registry.get("skills", {})
        assert len(skills) > 0, "No skills found in registry"

        mismatches = []
        for key, entry in skills.items():
            name = entry.get("name", "")
            if name != key:
                mismatches.append(f"key={key}, name={name}")

        assert mismatches == [], (
            f"Registry key/name mismatches: {mismatches}"
        )

    def test_all_registry_names_have_pf_prefix(self) -> None:
        """Every skill 'name' field must start with 'pf-'."""
        registry = _load_registry()
        skills = registry.get("skills", {})
        assert len(skills) > 0, "No skills found in registry"

        unprefixed = [
            entry.get("name", k)
            for k, entry in skills.items()
            if not entry.get("name", "").startswith("pf-")
        ]
        assert unprefixed == [], (
            f"Found {len(unprefixed)} registry names without pf- prefix: "
            f"{unprefixed}"
        )

    # `test_registry_skill_count_preserved` (>= 22 entries) deleted in 162-30 —
    # same vacuous count-floor pattern as the two deleted above. Registry/disk
    # agreement in `TestIntegrationRealCodebase` is the assertion that actually
    # detects a lost entry.

    def test_registry_version_unchanged(self) -> None:
        """Registry version field should still be valid semver."""
        registry = _load_registry()
        version = registry.get("version", "")
        assert re.match(r"^\d+\.\d+\.\d+$", version), (
            f"Registry version is not valid semver: '{version}'"
        )

    # `test_deprecated_skills_preserved` deleted in 162-30. It required `pf-story`
    # and `pf-theme-creation` to be present in the registry WITH
    # `deprecated: true`. Both have since completed the deprecation cycle and
    # been deleted outright, and NO registry entry carries the `deprecated` flag
    # any more — so there is nothing left for this test to assert. Rewriting it
    # as a forward guard ("any deprecated entry must declare a live redirect")
    # was rejected: with zero deprecated entries the loop body never runs, which
    # is a vacuous pass. Their removal is pinned instead by
    # `TestAC1SkillDirectoriesRenamed::test_retired_skills_absent_from_disk_and_registry`.

    def test_redirect_fields_updated(self) -> None:
        """Redirect fields should point to pf-prefixed names."""
        registry = _load_registry()
        skills = registry.get("skills", {})

        for key, entry in skills.items():
            redirect = entry.get("redirect")
            if redirect is not None:
                assert redirect.startswith("pf-"), (
                    f"Skill '{key}' has unprefixed redirect: '{redirect}'"
                )


# =============================================================================
# AC4-AC8 REMOVED (162-30): the JavaScript/TypeScript layer was deleted in
# 038d3c6f0 (React GUI + all JS/TS removed; repo is Python-only). The deleted
# classes pinned genuinely-removed artifacts:
#   - TestAC4MigrationExists / TestAC8BackwardCompatibility ->
#     pennyfarthing-dist/migrations/007-prefix-skills-commands.js (the whole
#     migrations/ directory no longer exists)
#   - TestAC6SymlinksHandlePrefixedNames ->
#     packages/core/src/cli/utils/symlinks.ts (npm workspace removed)
# The pf- prefix invariant they guarded is still covered by TestAC1/AC2/AC3
# and TestIntegrationRealCodebase below, against the live Python surface.
# =============================================================================


# =============================================================================
# Integration: Zero false positives against real codebase
# =============================================================================


class TestIntegrationRealCodebase:
    """Validate the real codebase after migration."""

    def test_skill_registry_schema_still_valid(self) -> None:
        """skill-registry.yaml should still pass its JSON schema validation."""
        # Import the existing validator to verify no regressions
        from pf.validate.adapters.skill_command import (
            validate_skill_registry,
        )

        errors, warnings = validate_skill_registry(PROJECT_ROOT)
        assert errors == [], (
            "skill-registry.yaml has validation errors after rename:\n"
            + "\n".join(errors)
        )

    def test_no_orphaned_registry_entries(self) -> None:
        """Every registry skill with a directory should have a matching pf-prefixed dir."""
        registry = _load_registry()
        skills = registry.get("skills", {})
        skill_dirs = set(_get_skill_dirs())

        # Only check skills that are expected to have directories
        # (finalize-run, judge, persona-benchmark are registry-only)
        REGISTRY_ONLY_SKILLS = {
            "pf-finalize-run", "pf-judge", "pf-persona-benchmark",
        }

        orphaned = []
        for key in skills:
            if key in REGISTRY_ONLY_SKILLS:
                continue
            if key not in skill_dirs:
                orphaned.append(key)

        assert orphaned == [], (
            f"Registry entries without matching directories: {orphaned}"
        )

    def test_no_unregistered_skill_dirs(self) -> None:
        """Every skill directory should have a registry entry (except bc)."""
        registry = _load_registry()
        skills = set(registry.get("skills", {}).keys())
        skill_dirs = set(_get_skill_dirs())

        # bc is a known exception (unlisted utility)
        UNLISTED_SKILLS = {"pf-bc"}

        unregistered = skill_dirs - skills - UNLISTED_SKILLS
        assert unregistered == set(), (
            f"Skill directories without registry entries: {unregistered}"
        )
