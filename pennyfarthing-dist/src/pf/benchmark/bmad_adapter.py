"""BMAD Simulator adapter — build CLAUDE.md templates from BMAD source.

Story 142-2: Reads verbatim BMAD source files and assembles them into
CLAUDE.md templates for dev and reviewer agents, plus a story file
translator that converts PF context docs into BMAD story format.

No Pennyfarthing-specific content is injected into the output.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml


# ---------------------------------------------------------------------------
# BmadConfig — validated pointers to BMAD source files
# ---------------------------------------------------------------------------

@dataclass
class BmadConfig:
    """Validated configuration pointing at a BMAD source directory."""

    bmad_root: Path
    _dev_agent_path: Path = field(init=False)
    _dev_workflow_path: Path = field(init=False)
    _dev_checklist_path: Path = field(init=False)
    _review_workflow_path: Path = field(init=False)
    _review_checklist_path: Path = field(init=False)
    _story_template_path: Path = field(init=False)

    def __post_init__(self) -> None:
        if not self.bmad_root.is_dir():
            raise FileNotFoundError(f"BMAD root not found: {self.bmad_root}")

        base = self.bmad_root / "src" / "bmm"
        impl = base / "workflows" / "4-implementation"

        self._dev_agent_path = base / "agents" / "dev.agent.yaml"
        self._dev_workflow_path = impl / "dev-story" / "workflow.md"
        self._dev_checklist_path = impl / "dev-story" / "checklist.md"
        self._review_workflow_path = impl / "code-review" / "workflow.md"
        self._review_checklist_path = impl / "code-review" / "checklist.md"
        self._story_template_path = impl / "create-story" / "template.md"

        required = [
            self._dev_agent_path,
            self._dev_workflow_path,
            self._dev_checklist_path,
            self._review_workflow_path,
            self._review_checklist_path,
            self._story_template_path,
        ]
        for p in required:
            if not p.is_file():
                raise FileNotFoundError(f"Required BMAD file missing: {p}")

    def dev_agent_yaml(self) -> dict:
        return yaml.safe_load(self._dev_agent_path.read_text())

    def dev_workflow(self) -> str:
        return self._dev_workflow_path.read_text()

    def dev_checklist(self) -> str:
        return self._dev_checklist_path.read_text()

    def review_workflow(self) -> str:
        return self._review_workflow_path.read_text()

    def review_checklist(self) -> str:
        return self._review_checklist_path.read_text()

    def story_template(self) -> str:
        return self._story_template_path.read_text()


# ---------------------------------------------------------------------------
# AC1: Dev CLAUDE.md builder
# ---------------------------------------------------------------------------

def build_bmad_dev_claude_md(
    config: BmadConfig,
    *,
    story_content: str,
    project_context: str,
) -> str:
    """Build a BMAD dev agent CLAUDE.md from source files.

    Output contains verbatim BMAD content — no framework-specific terms.
    """
    agent = config.dev_agent_yaml()
    persona = agent["agent"]["persona"]
    critical_actions = agent["agent"]["critical_actions"]
    workflow = config.dev_workflow()
    checklist = config.dev_checklist()

    actions_list = "\n".join(f"- {a}" for a in critical_actions)

    return f"""\
# Dev Agent CLAUDE.md

## Persona

**Role:** {persona['role']}
**Identity:** {persona['identity']}
**Communication Style:** {persona['communication_style']}

### Principles

{persona['principles']}

## Critical Actions

{actions_list}

## Workflow

{workflow}

## Checklist

{checklist}

## Story

{story_content}

## Project Context

{project_context}
"""


# ---------------------------------------------------------------------------
# AC2: Reviewer CLAUDE.md builder
# ---------------------------------------------------------------------------

def build_bmad_reviewer_claude_md(
    config: BmadConfig,
    *,
    dev_output: str,
) -> str:
    """Build a BMAD reviewer agent CLAUDE.md from source files.

    Output contains verbatim BMAD content — no framework-specific terms.
    """
    workflow = config.review_workflow()
    checklist = config.review_checklist()

    return f"""\
# Code Review CLAUDE.md

## Review Workflow

{workflow}

## Review Checklist

{checklist}

## Dev Output

{dev_output}
"""


# ---------------------------------------------------------------------------
# AC3: Story file translator
# ---------------------------------------------------------------------------

def translate_story_file(
    config: BmadConfig,
    *,
    epic_context: str,
    story_context: str,
    story_title: str,
    acceptance_criteria: str,
) -> str:
    """Translate PF context docs into a BMAD-format story file.

    Reads the BMAD story template from config, substitutes placeholders,
    and injects acceptance criteria and dev notes from PF context docs.
    Tasks/Subtasks left empty per ADR-0035 to avoid bias.
    """
    template = config.story_template()

    # Substitute BMAD template placeholders
    result = template.replace("{{story_title}}", story_title)
    result = result.replace("{{epic_num}}.{{story_num}}", story_title)
    result = result.replace("{{role}}", "developer")
    result = result.replace("{{action}}", f"implement {story_title}")
    result = result.replace("{{benefit}}", "the acceptance criteria are satisfied")

    # Inject content into empty template sections
    result = result.replace(
        "## Acceptance Criteria\n",
        f"## Acceptance Criteria\n\n{acceptance_criteria}\n",
    )
    result = result.replace(
        "## Dev Notes\n",
        f"## Dev Notes\n\n### Epic Context\n\n{epic_context}\n\n### Story Context\n\n{story_context}\n",
    )

    return result
