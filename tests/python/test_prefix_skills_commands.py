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
SKILLS_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "skills"
COMMANDS_DIR = PROJECT_ROOT / "pennyfarthing-dist" / "commands"
REGISTRY_PATH = SKILLS_DIR / "skill-registry.yaml"

# Files in the skills directory that are NOT skill directories
SKILLS_NON_DIRS = {"skill-registry.yaml", "skill-registry.schema.json"}

# Known built-in skills that MUST exist with pf- prefix after migration
# (These are the 20 directories that exist today without prefix)
EXPECTED_SKILLS = [
    "pf-agentic-patterns",
    "pf-bc",
    "pf-changelog",
    "pf-code-review",
    "pf-context-engineering",
    "pf-cyclist",
    "pf-jira",
    "pf-just",
    "pf-mermaid",
    "pf-otel",
    "pf-sprint",
    "pf-story",
    "pf-systematic-debugging",
    "pf-testing",
    "pf-theme",
    "pf-theme-creation",
    "pf-workflow",
    "pf-yq",
]

# Known built-in commands that MUST exist with pf- prefix after migration
EXPECTED_COMMANDS = [
    "pf-architect.md",
    "pf-ba.md",
    "pf-brainstorming.md",
    "pf-check.md",
    "pf-chore.md",
    "pf-close-epic.md",
    "pf-continue-session.md",
    "pf-create-branches-from-story.md",
    "pf-create-theme.md",
    "pf-dev.md",
    "pf-devops.md",
    "pf-fix-blocker.md",
    "pf-git-cleanup.md",
    "pf-health-check.md",
    "pf-help.md",
    "pf-list-themes.md",
    "pf-new-work.md",
    "pf-orchestrator.md",
    "pf-parallel-work.md",
    "pf-party-mode.md",
    "pf-patch.md",
    "pf-pm.md",
    "pf-prime.md",
    "pf-release.md",
    "pf-repo-status.md",
    "pf-retro.md",
    "pf-reviewer.md",
    "pf-run-ci.md",
    "pf-set-theme.md",
    "pf-setup.md",
    "pf-show-theme.md",
    "pf-sm.md",
    "pf-sprint-planning.md",
    "pf-sprint.md",
    "pf-standalone.md",
    "pf-start-epic.md",
    "pf-sync-epic-to-jira.md",
    "pf-sync-work-with-sprint.md",
    "pf-tea.md",
    "pf-tech-writer.md",
    "pf-theme-maker.md",
    "pf-theme.md",
    "pf-update-domain-docs.md",
    "pf-ux-designer.md",
    "pf-work.md",
    "pf-workflow.md",
]


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

    def test_expected_skills_all_present(self) -> None:
        """All expected pf-prefixed skill directories must exist."""
        skill_dirs = _get_skill_dirs()
        missing = [s for s in EXPECTED_SKILLS if s not in skill_dirs]
        assert missing == [], (
            f"Missing expected skill directories: {missing}"
        )

    def test_skill_count_preserved(self) -> None:
        """The number of skill directories should be at least 20 (original count)."""
        skill_dirs = _get_skill_dirs()
        assert len(skill_dirs) >= 20, (
            f"Expected at least 20 skill directories, found {len(skill_dirs)}"
        )


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

    def test_expected_commands_all_present(self) -> None:
        """All expected pf-prefixed command files must exist."""
        cmd_files = _get_command_files()
        missing = [c for c in EXPECTED_COMMANDS if c not in cmd_files]
        assert missing == [], (
            f"Missing expected command files: {missing}"
        )

    def test_command_count_preserved(self) -> None:
        """The number of command files should be at least 47 (original count)."""
        cmd_files = _get_command_files()
        assert len(cmd_files) >= 47, (
            f"Expected at least 47 command files, found {len(cmd_files)}"
        )


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

    def test_registry_skill_count_preserved(self) -> None:
        """The registry should have at least as many entries as before (22)."""
        registry = _load_registry()
        skills = registry.get("skills", {})
        assert len(skills) >= 22, (
            f"Expected at least 22 registry entries, found {len(skills)}"
        )

    def test_registry_version_unchanged(self) -> None:
        """Registry version field should still be valid semver."""
        registry = _load_registry()
        version = registry.get("version", "")
        assert re.match(r"^\d+\.\d+\.\d+$", version), (
            f"Registry version is not valid semver: '{version}'"
        )

    def test_deprecated_skills_preserved(self) -> None:
        """Deprecated skills (story, theme-creation) should keep deprecated flag."""
        registry = _load_registry()
        skills = registry.get("skills", {})

        # After rename, these should be pf-story and pf-theme-creation
        for old_name in ["story", "theme-creation"]:
            prefixed = f"pf-{old_name}"
            assert prefixed in skills, (
                f"Deprecated skill '{prefixed}' missing from registry"
            )
            assert skills[prefixed].get("deprecated") is True, (
                f"Deprecated skill '{prefixed}' should have deprecated: true"
            )

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
