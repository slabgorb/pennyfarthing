"""
XML Schema Migration Tools for Pennyfarthing.

This module provides tools to migrate and validate Pennyfarthing files
to conform to the XML schema definitions:
- Session files -> schemas/session-schema.md
- Skill files -> schemas/skill-schema.md
- Workflow step files -> schemas/workflow-step-schema.md

Usage:
    pf migration [command] [options]

Commands:
    session   Migrate session files to XML format
    skill     Audit/migrate skill files
    step      Audit/migrate workflow step files
    validate  Validate files against schemas
"""

from pf.migration.session import (
    SessionFile,
    convert_session_file,
    parse_markdown_session,
)
from pf.migration.skill import audit_skill_file, audit_skills
from pf.migration.step import audit_step_file, audit_workflow_steps
from pf.migration.validate import validate_all, validate_file

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
