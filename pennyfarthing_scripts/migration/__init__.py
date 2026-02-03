"""
XML Schema Migration Tools for Pennyfarthing.

This module provides tools to migrate and validate Pennyfarthing files
to conform to the XML schema definitions:
- Session files -> guides/session-schema.md
- Skill files -> guides/skill-schema.md
- Workflow step files -> guides/workflow-step-schema.md

Usage:
    python -m pennyfarthing_scripts.migration [command] [options]

Commands:
    session   Migrate session files to XML format
    skill     Audit/migrate skill files
    step      Audit/migrate workflow step files
    validate  Validate files against schemas
"""

from pennyfarthing_scripts.migration.session import (
    SessionFile,
    convert_session_file,
    parse_markdown_session,
)
from pennyfarthing_scripts.migration.skill import audit_skill_file, audit_skills
from pennyfarthing_scripts.migration.step import audit_step_file, audit_workflow_steps
from pennyfarthing_scripts.migration.validate import validate_all, validate_file

__all__ = [
    "SessionFile",
    "convert_session_file",
    "parse_markdown_session",
    "audit_skill_file",
    "audit_skills",
    "audit_step_file",
    "audit_workflow_steps",
    "validate_file",
    "validate_all",
]
