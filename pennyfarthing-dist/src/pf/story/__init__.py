"""
Story management package for Pennyfarthing scripts.

This package provides:
- size: Story sizing guidelines
- template: Story templates
- create: Story creation

Usage:
    # Use the modules
    from pf.story import get_sizing_guidelines, get_template

    # Use CLI
    python -m pf.story <subcommand> [args]
"""

# Re-export common functions
# Import submodules
# CLI entry point - import module, not function, so "from story import cli" gets the module
from pf.story import (
    cli,
    create,
    size,
    template,
)
from pf.story.cli import main
from pf.story.create import (
    create_story,
    generate_story_yaml,
    validate_points,
)
from pf.story.size import (
    SIZING_GUIDELINES,
    format_size_info,
    get_sizing_guidelines,
)
from pf.story.template import (
    TEMPLATES,
    format_template,
    get_all_templates,
    get_template,
)

__all__ = [
    # Size
    "SIZING_GUIDELINES",
    "format_size_info",
    "get_sizing_guidelines",
    # Template
    "TEMPLATES",
    "format_template",
    "get_all_templates",
    "get_template",
    # Create
    "create_story",
    "generate_story_yaml",
    "validate_points",
    # Submodules
    "create",
    "size",
    "template",
    # CLI
    "cli",
    "main",
]
