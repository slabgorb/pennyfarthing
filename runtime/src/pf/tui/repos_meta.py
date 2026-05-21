"""Repo field metadata registry for TUI Repos panel.

Maps each known repo field to a RepoFieldSpec that describes its UI widget type,
group, and options. Used by ReposPanel to render per-repo settings.

Story 147-4.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class RepoFieldSpec:
    """Describes how a single repo field should render in the TUI."""

    field: str
    label: str
    widget_type: str  # "switch" | "select" | "input" | "readonly"
    group: str = "General"
    options: list[tuple[str, Any]] | None = None
    description: str = ""
    read_only: bool = False


# Ordered list of specs — group ordering determines build_repo_field_specs() output
_SPECS: list[RepoFieldSpec] = [
    # --- General ---
    RepoFieldSpec(
        field="description",
        label="Description",
        widget_type="input",
        group="General",
        description="Repository description",
    ),
    RepoFieldSpec(
        field="type",
        label="Type",
        widget_type="select",
        group="General",
        options=[
            ("Orchestrator", "orchestrator"),
            ("Framework", "framework"),
            ("API", "api"),
            ("UI", "ui"),
            ("CLI", "cli"),
            ("Library", "library"),
        ],
        description="Repository type",
        read_only=True,
    ),
    RepoFieldSpec(
        field="branch_strategy",
        label="Branch Strategy",
        widget_type="select",
        group="General",
        options=[
            ("Trunk-Based", "trunk-based"),
            ("Gitflow", "gitflow"),
        ],
        description="Branching strategy",
    ),
    RepoFieldSpec(
        field="default_branch",
        label="Default Branch",
        widget_type="input",
        group="General",
        description="Default branch name",
    ),
    # --- Build ---
    RepoFieldSpec(
        field="test_command",
        label="Test Command",
        widget_type="input",
        group="Build",
        description="Command to run tests",
    ),
    RepoFieldSpec(
        field="build_command",
        label="Build Command",
        widget_type="input",
        group="Build",
        description="Command to build the project",
    ),
    RepoFieldSpec(
        field="lint_command",
        label="Lint Command",
        widget_type="input",
        group="Build",
        description="Command to run linting",
    ),
    RepoFieldSpec(
        field="test_filter_flag",
        label="Test Filter Flag",
        widget_type="input",
        group="Build",
        description="Flag to filter test execution",
    ),
    # --- PR ---
    RepoFieldSpec(
        field="pr_strategy",
        label="PR Strategy",
        widget_type="select",
        group="PR",
        options=[
            ("Standard", "standard"),
            ("Stacked", "stacked"),
        ],
        description="Pull request strategy",
    ),
    RepoFieldSpec(
        field="stack_tool",
        label="Stack Tool",
        widget_type="input",
        group="PR",
        description="Tool for stacked PRs (e.g., graphite)",
    ),
    # --- Quality ---
    RepoFieldSpec(
        field="simplify",
        label="Simplify",
        widget_type="switch",
        group="Quality",
        description="Enable simplify subagents during TEA verify phase",
    ),
    # --- Topology ---
    RepoFieldSpec(
        field="owns",
        label="Owns",
        widget_type="readonly",
        group="Topology",
        description="Glob patterns for directories this repo owns",
        read_only=True,
    ),
    RepoFieldSpec(
        field="never_edit",
        label="Never Edit",
        widget_type="readonly",
        group="Topology",
        description="Off-limits paths (symlinks, build output, dependencies)",
        read_only=True,
    ),
    RepoFieldSpec(
        field="symlinks",
        label="Symlinks",
        widget_type="readonly",
        group="Topology",
        description="Symlink path mappings",
        read_only=True,
    ),
]

# Explicit metadata for known repo fields
REPO_FIELDS_META: dict[str, RepoFieldSpec] = {}

for _spec in _SPECS:
    REPO_FIELDS_META[_spec.field] = _spec

# Global (top-level) repos.yaml fields
GLOBAL_REPO_FIELDS: list[str] = ["pr_title_format", "build_order"]


def build_repo_field_specs() -> list[RepoFieldSpec]:
    """Build the ordered list of RepoFieldSpecs.

    Returns specs in group order: General, Build, PR, Quality, Topology.
    Within each group, fields appear in definition order.
    """
    return list(_SPECS)
