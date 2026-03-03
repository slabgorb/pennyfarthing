"""Justfile management for pf init.

Writes framework recipes to .pennyfarthing/justfile.pf (always overwritten)
and ensures the main justfile imports them. Uses `just import` so the user's
justfile always wins for same-named recipes (parent takes precedence).
"""

from __future__ import annotations

import re
from pathlib import Path

# Recipe names that belong to the framework and should be migrated out
# of inline justfiles when the import approach is adopted.
FRAMEWORK_RECIPES: frozenset[str] = frozenset({
    "wheelhub",
    "tui",
    "gui",
    "claude",
    "tmux-dev",
    "tmux",
})

_IMPORT_LINE = "import '.pennyfarthing/justfile.pf'"

_MINIMAL_JUSTFILE = f"""\
# {{project_name}} — project tasks
# Framework recipes imported from .pennyfarthing/justfile.pf

{_IMPORT_LINE}

root := justfile_directory()

default:
    @just --list
"""

# Regex matching a recipe header: name with optional params, then a colon
_RECIPE_HEADER_RE = re.compile(
    r"^([a-zA-Z_][a-zA-Z0-9_-]*)\s*(?:[^:]*)?:\s*$"
)


def update_framework_justfile(
    target_dir: Path,
    dist_root: Path,
    *,
    dry_run: bool = False,
) -> dict:
    """Write framework justfile and ensure main justfile imports it.

    Three operations:
    1. Write .pennyfarthing/justfile.pf from template (always overwrite).
    2. Ensure main justfile has an import line.
    3. Migrate legacy inline framework recipes (comment them out).

    Args:
        target_dir: Project root directory.
        dist_root: Path to pennyfarthing-dist.
        dry_run: Preview without writing.

    Returns:
        Result dict: {success, data: {justfile_pf_written, import_added,
        justfile_created, recipes_migrated}}
    """
    template_path = dist_root / "templates" / "justfile.pf.template"
    if not template_path.is_file():
        return {
            "success": False,
            "error": f"Template not found: {template_path}",
        }

    pf_dest = target_dir / ".pennyfarthing" / "justfile.pf"
    justfile_path = target_dir / "justfile"

    # Read template content
    template_content = template_path.read_text()

    # Check staleness before overwriting
    was_stale = False
    if pf_dest.is_file():
        was_stale = pf_dest.read_text() != template_content

    # Analyze current state
    justfile_exists = justfile_path.is_file()
    has_import = False
    legacy_recipes: list[str] = []

    if justfile_exists:
        existing = justfile_path.read_text()
        has_import = _has_import_line(existing)
        legacy_recipes = _find_legacy_recipes(existing)

    if dry_run:
        actions = []
        actions.append(".pennyfarthing/justfile.pf written (framework recipes)")
        if not justfile_exists:
            actions.append("justfile created with framework import")
        elif not has_import:
            actions.append("justfile updated (import line added)")
            if legacy_recipes:
                actions.append(
                    f"{len(legacy_recipes)} legacy recipes migrated: "
                    + ", ".join(legacy_recipes)
                )
        return {
            "success": True,
            "data": {
                "actions": actions,
                "justfile_pf_written": True,
                "import_added": not has_import,
                "justfile_created": not justfile_exists,
                "recipes_migrated": legacy_recipes,
                "was_stale": was_stale,
            },
        }

    # 1. Write .pennyfarthing/justfile.pf (always overwrite)
    pf_dest.parent.mkdir(parents=True, exist_ok=True)
    pf_dest.write_text(template_content)

    # 2. Ensure import line in main justfile
    justfile_created = False
    import_added = False

    if not justfile_exists:
        # Create minimal justfile with import
        project_name = target_dir.name
        justfile_path.write_text(
            _MINIMAL_JUSTFILE.replace("{project_name}", project_name)
        )
        justfile_created = True
        import_added = True
    elif not has_import:
        # Add import line to existing justfile
        existing = justfile_path.read_text()
        updated, migrated = _add_import_and_migrate(existing, legacy_recipes)
        justfile_path.write_text(updated)
        import_added = True
        legacy_recipes = migrated
    else:
        # Import already present — no-op for the main justfile
        legacy_recipes = []

    return {
        "success": True,
        "data": {
            "justfile_pf_written": True,
            "import_added": import_added,
            "justfile_created": justfile_created,
            "recipes_migrated": legacy_recipes,
            "was_stale": was_stale,
        },
    }


def _has_import_line(content: str) -> bool:
    """Check if the justfile already imports justfile.pf."""
    for line in content.splitlines():
        stripped = line.strip()
        # Match various quoting styles
        if stripped.startswith("import") and "justfile.pf" in stripped:
            return True
    return False


def _find_legacy_recipes(content: str) -> list[str]:
    """Find framework recipe names defined inline in the justfile."""
    found = []
    for line in content.splitlines():
        # Skip already-migrated lines
        if line.strip().startswith("# [pf-migrated]"):
            continue
        match = _RECIPE_HEADER_RE.match(line)
        if match:
            name = match.group(1)
            if name in FRAMEWORK_RECIPES:
                found.append(name)
    return found


def _add_import_and_migrate(content: str, legacy_recipes: list[str]) -> tuple[str, list[str]]:
    """Add import line and comment out legacy framework recipes.

    The import line is placed after variable declarations (lines with `:=`)
    and before the first recipe definition.

    Returns:
        Tuple of (updated content, list of migrated recipe names).
    """
    lines = content.splitlines(keepends=True)

    # Find insertion point: after last variable line, before first recipe
    insert_idx = 0
    for i, line in enumerate(lines):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if ":=" in stripped:
            insert_idx = i + 1
        elif _RECIPE_HEADER_RE.match(stripped) or stripped.startswith("import"):
            break
        else:
            # Some other content — insert before it
            break

    # If we haven't moved past comments at top, find first blank line
    if insert_idx == 0:
        for i, line in enumerate(lines):
            if line.strip() == "":
                insert_idx = i + 1
                break

    # Insert import line
    import_block = f"\n{_IMPORT_LINE}\n\n"
    lines.insert(insert_idx, import_block)

    # Migrate legacy recipes (comment out entire recipe blocks)
    migrated = []
    if legacy_recipes:
        result = "".join(lines)
        result, migrated = _comment_out_recipes(result, legacy_recipes)
        return result, migrated

    return "".join(lines), migrated


def check_justfile_pf_staleness(
    target_dir: Path,
    dist_root: Path,
) -> dict:
    """Check if deployed justfile.pf matches the template.

    Returns:
        Result dict: {success, stale, deployed}
    """
    template_path = dist_root / "templates" / "justfile.pf.template"
    if not template_path.is_file():
        return {"success": False, "error": f"Template not found: {template_path}"}

    pf_dest = target_dir / ".pennyfarthing" / "justfile.pf"
    if not pf_dest.is_file():
        return {"success": True, "stale": True, "deployed": False}

    template_content = template_path.read_text()
    deployed_content = pf_dest.read_text()

    return {
        "success": True,
        "stale": template_content != deployed_content,
        "deployed": True,
    }


def _comment_out_recipes(content: str, recipe_names: list[str]) -> tuple[str, list[str]]:
    """Comment out recipe blocks for the given recipe names.

    A recipe block starts at a comment line preceding the recipe header
    (or the header itself) and ends at the next recipe header or EOF.

    Returns:
        Tuple of (updated content, list of actually migrated recipe names).
    """
    lines = content.splitlines(keepends=True)
    migrated = []
    i = 0
    result_lines = []

    while i < len(lines):
        line = lines[i]
        stripped = line.rstrip("\n").rstrip("\r")

        match = _RECIPE_HEADER_RE.match(stripped)
        if match and match.group(1) in recipe_names:
            recipe_name = match.group(1)

            # Look back for comment lines that belong to this recipe
            # (contiguous comment block immediately before)
            comment_start = len(result_lines)
            while (
                comment_start > 0
                and result_lines[comment_start - 1].strip().startswith("#")
            ):
                comment_start -= 1
            # Also absorb blank lines between comments and recipe
            while (
                comment_start > 0
                and result_lines[comment_start - 1].strip() == ""
            ):
                comment_start -= 1

            # Comment out the preceding comment/blank lines
            for j in range(comment_start, len(result_lines)):
                old = result_lines[j]
                if old.strip():  # Don't prefix blank lines
                    result_lines[j] = f"# [pf-migrated] {old}"

            # Comment out the recipe header
            result_lines.append(f"# [pf-migrated] {line}")
            i += 1

            # Comment out the recipe body (indented lines or shebang blocks)
            while i < len(lines):
                body_line = lines[i]
                body_stripped = body_line.rstrip("\n").rstrip("\r")

                # Recipe body ends at next non-indented, non-blank line
                # that looks like a new recipe, variable, or import
                if body_stripped and not body_stripped[0].isspace():
                    # Check if this is a new recipe or section
                    if (
                        _RECIPE_HEADER_RE.match(body_stripped)
                        or ":=" in body_stripped
                        or body_stripped.startswith("import")
                        or body_stripped.startswith("# =")
                    ):
                        break
                    # Comment header for next recipe
                    if body_stripped.startswith("#"):
                        # Could be next recipe's comment — peek ahead
                        # If the next non-blank, non-comment line is a recipe
                        # header, stop here
                        peek = i + 1
                        while peek < len(lines) and (
                            not lines[peek].strip()
                            or lines[peek].strip().startswith("#")
                        ):
                            peek += 1
                        if peek < len(lines) and _RECIPE_HEADER_RE.match(
                            lines[peek].strip()
                        ):
                            break

                if body_stripped:
                    result_lines.append(f"# [pf-migrated] {body_line}")
                else:
                    result_lines.append(body_line)
                i += 1

            migrated.append(recipe_name)
        else:
            result_lines.append(line)
            i += 1

    return "".join(result_lines), migrated
