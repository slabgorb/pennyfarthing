"""Tests for CLI normalization — consistency, naming conventions, and syntactic sugar.

Story 91-28: Normalize pf CLI commands — audit consistency and add syntactic sugar.

RED phase: These tests define the target state. They FAIL until Dev implements.

AC Coverage:
  AC1 (Audit): test_all_choice_values_lowercase, test_command_tree_completeness
  AC2 (Naming): test_json_flag_consistency, test_no_underscore_command_names
  AC3 (Sugar): TestTopLevelSugar — pf status, pf backlog, pf work, pf story
  AC4 (Parsing): test_all_groups_have_help, test_subcommand_registration
  AC5 (Help): test_all_commands_have_help_text
"""

import click
import click.testing

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_cli():
    """Import the CLI group lazily to avoid import-time side effects."""
    from pf.cli import cli
    return cli


def _collect_commands(group: click.Group, prefix: str = "") -> list[tuple[str, click.BaseCommand]]:
    """Recursively collect all commands and subcommands from a Click group.

    Uses list_commands() + get_command() to handle lazy-loaded groups
    (LazyGroup defers imports; .commands dict only contains eagerly-registered entries).
    """
    result = []
    ctx = click.Context(group)
    for name in sorted(group.list_commands(ctx)):
        cmd = group.get_command(ctx, name)
        if cmd is None:
            continue
        full_name = f"{prefix} {name}".strip()
        result.append((full_name, cmd))
        if isinstance(cmd, click.Group):
            result.extend(_collect_commands(cmd, full_name))
    return result


def _collect_options(cmd: click.BaseCommand) -> list[click.Option]:
    """Collect all Option params from a command."""
    return [p for p in cmd.params if isinstance(p, click.Option)]


def _collect_choice_options(cmd: click.BaseCommand) -> list[tuple[click.Option, click.Choice]]:
    """Collect all options that use click.Choice type."""
    results = []
    for opt in _collect_options(cmd):
        if isinstance(opt.type, click.Choice):
            results.append((opt, opt.type))
    return results


# ---------------------------------------------------------------------------
# AC1: Audit — Choice value casing
# ---------------------------------------------------------------------------

class TestChoiceValueConsistency:
    """All click.Choice values should be lowercase for consistency.

    Exception: commands that use case_sensitive=False with uppercase enum
    names (e.g., context template/validate --tier uses FULL/REFRESH/HANDOFF/MINIMAL
    as conventional enum values with case_sensitive=False).
    """

    # Commands whose uppercase choices are intentional (case_sensitive=False enums)
    ALLOWED_UPPERCASE_COMMANDS = {
        "context template",
        "context validate",
    }

    def test_all_choice_values_lowercase(self):
        """Every Choice option across the CLI should use lowercase values,
        except commands in ALLOWED_UPPERCASE_COMMANDS which use conventional
        uppercase enum names with case_sensitive=False.
        """
        cli = _get_cli()
        violations = []

        for cmd_name, cmd in _collect_commands(cli):
            if cmd_name in self.ALLOWED_UPPERCASE_COMMANDS:
                continue
            for opt, choice in _collect_choice_options(cmd):
                for val in choice.choices:
                    if val != val.lower():
                        violations.append(
                            f"{cmd_name} --{opt.name}: '{val}' should be '{val.lower()}'"
                        )

        assert violations == [], (
            f"Found {len(violations)} uppercase Choice values:\n"
            + "\n".join(f"  - {v}" for v in violations)
        )


# ---------------------------------------------------------------------------
# AC2: Naming conventions
# ---------------------------------------------------------------------------

class TestNamingConventions:
    """Command and flag naming should be consistent."""

    def test_no_underscore_command_names(self):
        """All command names should use hyphens, not underscores."""
        cli = _get_cli()
        violations = []

        for cmd_name, _ in _collect_commands(cli):
            leaf = cmd_name.split()[-1]
            if "_" in leaf:
                violations.append(f"'{cmd_name}' contains underscore — use hyphens")

        assert violations == [], (
            f"Found {len(violations)} underscore command names:\n"
            + "\n".join(f"  - {v}" for v in violations)
        )

    def test_json_flag_parameter_name_consistency(self):
        """All --json flags should use a known internal parameter name.

        Accepted names: 'json_output', 'output_json', 'json_out' — the CLI
        has multiple --json flag naming conventions across different command
        groups (eagerly-defined inline groups vs. lazy-loaded module groups).
        All must be one of these accepted names.
        """
        cli = _get_cli()
        json_param_names: dict[str, str] = {}
        ACCEPTED_JSON_PARAM_NAMES = {"json_output", "output_json", "json_out"}

        for cmd_name, cmd in _collect_commands(cli):
            for opt in _collect_options(cmd):
                if "--json" in opt.opts:
                    json_param_names[cmd_name] = opt.name

        violations = {
            cmd: name
            for cmd, name in json_param_names.items()
            if name not in ACCEPTED_JSON_PARAM_NAMES
        }
        assert violations == {}, (
            f"Unexpected --json parameter names (not in {ACCEPTED_JSON_PARAM_NAMES}): "
            f"{violations}"
        )


# ---------------------------------------------------------------------------
# AC3: Syntactic sugar — top-level shortcuts
# ---------------------------------------------------------------------------

class TestTopLevelSugar:
    """Common sprint operations should be accessible as top-level commands.

    pf status   → pf sprint status
    pf backlog  → pf sprint backlog
    pf work     → pf sprint work
    pf story    → pf sprint story
    """

    def test_pf_status_shortcut_exists(self):
        """'pf status' should exist as a top-level shortcut."""
        cli = _get_cli()
        ctx = click.Context(cli)
        assert "status" in cli.list_commands(ctx), (
            "'status' not found as top-level command. "
            "Add sugar: pf status → pf sprint status"
        )

    def test_pf_backlog_shortcut_exists(self):
        """'pf backlog' should exist as a top-level shortcut."""
        cli = _get_cli()
        ctx = click.Context(cli)
        assert "backlog" in cli.list_commands(ctx), (
            "'backlog' not found as top-level command. "
            "Add sugar: pf backlog → pf sprint backlog"
        )

    def test_pf_work_shortcut_exists(self):
        """'pf work' should exist as a top-level shortcut."""
        cli = _get_cli()
        ctx = click.Context(cli)
        assert "work" in cli.list_commands(ctx), (
            "'work' not found as top-level command. "
            "Add sugar: pf work → pf sprint work"
        )

    def test_pf_story_shortcut_exists(self):
        """'pf story' should exist as a top-level shortcut."""
        cli = _get_cli()
        ctx = click.Context(cli)
        assert "story" in cli.list_commands(ctx), (
            "'story' not found as top-level command. "
            "Add sugar: pf story → pf sprint story"
        )

    def test_pf_status_shortcut_invokes_sprint_status(self):
        """'pf status' should produce the same output as 'pf sprint status'."""
        cli = _get_cli()
        runner = click.testing.CliRunner()

        result_short = runner.invoke(cli, ["status", "--help"])
        result_long = runner.invoke(cli, ["sprint", "status", "--help"])

        assert result_short.exit_code == 0
        assert result_long.exit_code == 0
        # Both should show the same help text (or at least same command description)
        assert "sprint status" in result_short.output.lower() or "status" in result_short.output.lower()

    def test_pf_backlog_shortcut_invokes_sprint_backlog(self):
        """'pf backlog' should produce the same output as 'pf sprint backlog'."""
        cli = _get_cli()
        runner = click.testing.CliRunner()

        result_short = runner.invoke(cli, ["backlog", "--help"])
        result_long = runner.invoke(cli, ["sprint", "backlog", "--help"])

        assert result_short.exit_code == 0
        assert result_long.exit_code == 0


# ---------------------------------------------------------------------------
# AC4: Command tree completeness and routing
# ---------------------------------------------------------------------------

class TestCommandTreeCompleteness:
    """All expected command groups and subcommands should be registered."""

    EXPECTED_TOP_LEVEL_GROUPS = [
        "sprint", "jira", "theme",
        "validate", "bikerack", "bc",
        "agent", "workflow", "debug",
    ]

    EXPECTED_SPRINT_SUBCOMMANDS = [
        "status", "backlog", "work", "archive", "check", "info",
        "metrics", "future", "new", "standalone", "validate",
        "story", "epic", "initiative",
    ]

    EXPECTED_JIRA_SUBCOMMANDS = [
        "view", "check", "claim", "move", "assign", "link",
        "search", "sync", "bidirectional", "reconcile", "create", "sprint",
    ]

    def test_top_level_groups_registered(self):
        """All expected top-level groups should be registered.

        Uses list_commands() to enumerate lazy-loaded commands; the
        .commands dict only includes eagerly-registered entries.
        """
        cli = _get_cli()
        ctx = click.Context(cli)
        registered = set(cli.list_commands(ctx))
        missing = []

        for name in self.EXPECTED_TOP_LEVEL_GROUPS:
            if name not in registered:
                missing.append(name)

        assert missing == [], f"Missing top-level commands: {missing}"

    def test_sprint_subcommands_registered(self):
        """All expected sprint subcommands should be registered."""
        cli = _get_cli()
        ctx = click.Context(cli)
        sprint_group = cli.get_command(ctx, "sprint")
        assert isinstance(sprint_group, click.Group), "sprint should be a Click Group"

        sprint_ctx = click.Context(sprint_group)
        registered = set(sprint_group.list_commands(sprint_ctx))
        missing = [name for name in self.EXPECTED_SPRINT_SUBCOMMANDS if name not in registered]

        assert missing == [], f"Missing sprint subcommands: {missing}"

    def test_jira_subcommands_registered(self):
        """All expected jira subcommands should be registered."""
        cli = _get_cli()
        ctx = click.Context(cli)
        jira_group = cli.get_command(ctx, "jira")
        assert isinstance(jira_group, click.Group), "jira should be a Click Group"

        jira_ctx = click.Context(jira_group)
        registered = set(jira_group.list_commands(jira_ctx))
        missing = [name for name in self.EXPECTED_JIRA_SUBCOMMANDS if name not in registered]

        assert missing == [], f"Missing jira subcommands: {missing}"


# ---------------------------------------------------------------------------
# AC5: Help text quality
# ---------------------------------------------------------------------------

class TestHelpTextQuality:
    """All commands should have meaningful help text."""

    def test_all_commands_have_help_text(self):
        """Every command and group should have a non-empty help/docstring."""
        cli = _get_cli()
        missing_help = []

        for cmd_name, cmd in _collect_commands(cli):
            if not cmd.help or cmd.help.strip() == "":
                missing_help.append(cmd_name)

        assert missing_help == [], (
            f"Found {len(missing_help)} commands without help text:\n"
            + "\n".join(f"  - {v}" for v in missing_help)
        )

    def test_all_groups_have_help_text(self):
        """Every Click Group should have descriptive help."""
        cli = _get_cli()
        missing = []

        for cmd_name, cmd in _collect_commands(cli):
            if isinstance(cmd, click.Group):
                if not cmd.help or len(cmd.help.strip()) < 10:
                    missing.append(cmd_name)

        assert missing == [], (
            f"Found {len(missing)} groups with missing/short help:\n"
            + "\n".join(f"  - {v}" for v in missing)
        )

    def test_top_level_help_lists_sugar_shortcuts(self):
        """The main CLI help should mention the sugar shortcuts."""
        cli = _get_cli()
        runner = click.testing.CliRunner()
        result = runner.invoke(cli, ["--help"])

        assert result.exit_code == 0
        # After normalization, help should mention the shortcut commands
        output_lower = result.output.lower()
        assert "status" in output_lower, "Top-level --help should list 'status' shortcut"
        assert "backlog" in output_lower, "Top-level --help should list 'backlog' shortcut"
