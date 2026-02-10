"""
Story templates.

Provides templates for different story types.
"""

from typing import Any

# Story templates
TEMPLATES = {
    "feature": {
        "type": "feature",
        "template": """- id: {id}
  title: "{title}"
  status: backlog
  points: {points}
  priority: {priority}
  workflow: {workflow}
  acceptance_criteria:
    - [ ] Feature is implemented
    - [ ] Tests pass
    - [ ] Documentation updated
""",
        "description": "New feature implementation",
    },
    "bug": {
        "type": "bug",
        "template": """- id: {id}
  title: "[BUG] {title}"
  status: backlog
  points: {points}
  priority: {priority}
  workflow: {workflow}
  acceptance_criteria:
    - [ ] Bug is fixed
    - [ ] Root cause identified
    - [ ] Regression test added
""",
        "description": "Bug fix",
    },
    "refactor": {
        "type": "refactor",
        "template": """- id: {id}
  title: "[REFACTOR] {title}"
  status: backlog
  points: {points}
  priority: {priority}
  workflow: {workflow}
  acceptance_criteria:
    - [ ] Code is refactored
    - [ ] Tests still pass
    - [ ] No behavior change
""",
        "description": "Code refactoring",
    },
    "chore": {
        "type": "chore",
        "template": """- id: {id}
  title: "[CHORE] {title}"
  status: backlog
  points: {points}
  priority: {priority}
  workflow: trivial
  acceptance_criteria:
    - [ ] Task completed
""",
        "description": "Maintenance task",
    },
}


def get_template(template_type: str) -> dict[str, Any] | None:
    """Get a specific template.

    Args:
        template_type: Template type (feature, bug, refactor, chore)

    Returns:
        Template dict or None if not found
    """
    return TEMPLATES.get(template_type)


def get_all_templates() -> dict[str, dict[str, Any]]:
    """Get all available templates.

    Returns:
        Dict of all templates
    """
    return TEMPLATES


def format_template(template_type: str, **kwargs: Any) -> str:
    """Format a template with provided values.

    Args:
        template_type: Template type
        **kwargs: Values to fill in template

    Returns:
        Formatted template string
    """
    template = get_template(template_type)
    if not template:
        template = get_template("feature")  # Default

    template_str = template["template"]
    return template_str.format(**kwargs)


def main(args: list[str] | None = None) -> int:
    """CLI entry point for story template.

    Args:
        args: Command line arguments

    Returns:
        Exit code
    """
    import argparse

    parser = argparse.ArgumentParser(description="Story templates")
    parser.add_argument(
        "type",
        nargs="?",
        choices=list(TEMPLATES.keys()),
        help="Template type",
    )

    parsed = parser.parse_args(args)

    if parsed.type:
        template = get_template(parsed.type)
        if template:
            print(f"Type: {template['type']}")
            print(f"Description: {template['description']}")
            print("")
            print("Template:")
            print(template["template"])
    else:
        print("Available templates:")
        for name, template in TEMPLATES.items():
            print(f"  {name}: {template['description']}")

    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
