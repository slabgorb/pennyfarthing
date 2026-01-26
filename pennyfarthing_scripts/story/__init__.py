"""
Story management package for Pennyfarthing scripts.

This package provides:
- size: Story sizing guidelines
- template: Story templates
- create: Story creation

Usage:
    # Use the modules
    from pennyfarthing_scripts.story import get_sizing_guidelines, get_template

    # Use CLI
    python -m pennyfarthing_scripts.story <subcommand> [args]
"""

# Re-export common functions
from pennyfarthing_scripts.story.size import (
    SIZING_GUIDELINES,
    format_size_info,
    get_sizing_guidelines,
)
from pennyfarthing_scripts.story.template import (
    TEMPLATES,
    format_template,
    get_all_templates,
    get_template,
)
from pennyfarthing_scripts.story.create import (
    create_story,
    generate_story_yaml,
    validate_points,
)

# Import submodules
from pennyfarthing_scripts.story import (
    create,
    size,
    template,
)

# CLI entry point - import module, not function, so "from story import cli" gets the module
from pennyfarthing_scripts.story import cli
from pennyfarthing_scripts.story.cli import main

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
