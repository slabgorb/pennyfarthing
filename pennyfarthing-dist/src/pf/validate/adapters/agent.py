"""Agent definition structural validator adapter.

Validates agent definition files in pennyfarthing-dist/agents/.
Checks required sections, model values, and subagent references.

Story: PROJ-14710 (91-12)
"""

from __future__ import annotations

import re
from pathlib import Path

import yaml

from pf.common.config import get_dist_root
from pf.validate import ValidateReport

VALID_MODELS = {"haiku", "sonnet", "opus"}
BUILTIN_AGENTS = {"Explore", "Plan"}

# Valid tools that can appear in native agent allowed-tools
VALID_TOOLS = {"Read", "Write", "Edit", "Bash", "Glob", "Grep", "Agent", "Skill"}

# Read-only roles: CANNOT have Write or Edit in allowed-tools
READ_ONLY_ROLES = {"reviewer", "architect", "pm", "ba", "ux-designer"}

# Write-capable roles: MUST have Write and Edit in allowed-tools
WRITE_ROLES = {"dev", "tea", "devops", "orchestrator", "tech-writer"}

# Mindset tag required per primary agent (shell script lines 85-96)
MINDSET_TAGS: dict[str, str] = {
    "sm": "coordination-discipline",
    "tea": "test-paranoia",
    "dev": "minimalist-discipline",
    "reviewer": "adversarial-mindset",
    "orchestrator": "systems-thinking",
    "architect": "pragmatic-restraint",
    "pm": "ruthless-prioritization",
    "devops": "automation-discipline",
    "tech-writer": "clarity-obsession",
    "ux-designer": "consistency-guardian",
}

# Tags that contain checklists requiring format validation
_CHECKLIST_TAGS = {"gate", "handoff-gate", "self-review", "review-checklist"}

# Regex to find XML-like tags in markdown: <tagname> or <tag-name>
_TAG_RE = re.compile(r"<([a-zA-Z][a-zA-Z0-9_-]*)(?:\s[^>]*)?>", re.MULTILINE)
_OPEN_TAG_RE = re.compile(r"<([a-zA-Z][a-zA-Z0-9_-]*)(?:\s[^>]*)?>")
_CLOSE_TAG_RE = re.compile(r"</([a-zA-Z][a-zA-Z0-9_-]*)>")

# Regex to extract **Model:** value from helpers section
_MODEL_RE = re.compile(r"\*\*Model:\*\*\s+(\S+)", re.IGNORECASE)

# Regex to extract subagent names from markdown table rows: | `name` | purpose |
_HELPER_TABLE_RE = re.compile(r"^\s*\|\s*`?([^`|]+)`?\s*\|", re.MULTILINE)


def _has_frontmatter(content: str) -> bool:
    """Check if content starts with YAML frontmatter (--- delimited)."""
    return content.startswith("---\n")


def _parse_frontmatter(content: str) -> dict:
    """Extract YAML frontmatter from content."""
    if not _has_frontmatter(content):
        return {}
    end = content.find("\n---", 3)
    if end == -1:
        return {}
    fm_text = content[4:end]
    try:
        return yaml.safe_load(fm_text) or {}
    except yaml.YAMLError:
        return {}


def _find_tags(content: str) -> set[str]:
    """Find all XML-like tag names in content."""
    return {m.group(1) for m in _TAG_RE.finditer(content)}


def _extract_section(content: str, tag: str) -> str | None:
    """Extract content between <tag> and </tag>."""
    pattern = re.compile(rf"<{re.escape(tag)}[^>]*>(.*?)</{re.escape(tag)}>", re.DOTALL)
    m = pattern.search(content)
    return m.group(1) if m else None


def _is_subagent_frontmatter(fm: dict) -> bool:
    """Check if frontmatter indicates a subagent (has name + tools fields)."""
    return "name" in fm and "tools" in fm


def _find_line_of_tag(content: str, tag: str) -> int | None:
    """Find the 1-based line number of the first occurrence of <tag>."""
    for i, line in enumerate(content.splitlines(), 1):
        if f"<{tag}" in line:
            return i
    return None


def _skip_frontmatter(content: str) -> int:
    """Return the number of lines consumed by YAML frontmatter (0 if none).

    Frontmatter is ``---\\n...\\n---\\n``. Returns the line count including
    both delimiter lines so callers can skip past them entirely.
    """
    if not content.startswith("---\n"):
        return 0
    end = content.find("\n---", 3)
    if end == -1:
        return 0
    # +1 for the closing --- line itself, +1 because splitlines is 0-indexed
    fm_block = content[: end + 4]
    # If the closing --- is followed by a newline, include that line
    if len(content) > end + 4 and content[end + 4] == "\n":
        return fm_block.count("\n") + 1
    return fm_block.count("\n")


def _check_orphan_content(content: str) -> list[int]:
    """Find lines with content outside XML tags (depth 0).

    Frontmatter lines, line 1 heading (after frontmatter), and blank lines are exempt.
    Returns list of 1-based line numbers with orphan content.
    """
    lines = content.splitlines()
    fm_lines = _skip_frontmatter(content)
    depth = 0
    orphan_lines: list[int] = []

    for i, line in enumerate(lines):
        lineno = i + 1
        stripped = line.strip()

        # Skip frontmatter lines
        if lineno <= fm_lines:
            continue

        # Skip blank lines
        if not stripped:
            continue

        # First content line (after frontmatter) heading exempt
        if lineno == fm_lines + 1 and stripped.startswith("# "):
            continue

        # Count tag opens/closes on this line
        opens = _OPEN_TAG_RE.findall(line)
        closes = _CLOSE_TAG_RE.findall(line)

        # A line that opens a tag at depth 0 is a tag-opening line, not orphan
        has_open = len(opens) > 0
        was_at_depth_zero = depth == 0

        for _ in opens:
            depth += 1
        for _ in closes:
            depth -= 1
            if depth < 0:
                depth = 0

        # If we were at depth 0 and this line has no opening tag, it's orphan
        if was_at_depth_zero and not has_open:
            orphan_lines.append(lineno)

    return orphan_lines


def _find_last_closing_tag_line(content: str) -> int | None:
    """Find the 1-based line number of the last closing </tag> in the file."""
    last_line = None
    for i, line in enumerate(content.splitlines(), 1):
        if _CLOSE_TAG_RE.search(line):
            last_line = i
    return last_line


def _check_checklist_format(content: str, tag: str) -> bool:
    """Check if checklist items inside a tag are well-formed.

    Returns True if all checklist items match the expected pattern, False if any are malformed.
    """
    section = _extract_section(content, tag)
    if section is None:
        return True

    valid_pattern = re.compile(r"^\s*-\s*\[\s*[x ]?\s*\]")
    checklist_pattern = re.compile(r"^\s*-\s*\[")

    for line in section.splitlines():
        if checklist_pattern.match(line):
            if not valid_pattern.match(line):
                return False
    return True


def classify_agent_files(
    agents_dir: Path,
) -> tuple[list[Path], list[Path], list[Path]]:
    """Classify agent files into main agents, subagents, and skipped.

    Main agents may have frontmatter with only a `hooks:` key.
    Subagents have frontmatter with `name`, `tools`, and `model` fields.

    Returns:
        (main_agents, subagents, skipped) — three lists of Path objects.
    """
    main: list[Path] = []
    sub: list[Path] = []
    skipped: list[Path] = []

    for f in sorted(agents_dir.glob("*.md")):
        if f.name == "README.md":
            skipped.append(f)
            continue

        content = f.read_text()
        if _has_frontmatter(content):
            fm = _parse_frontmatter(content)
            if _is_subagent_frontmatter(fm):
                sub.append(f)
            else:
                main.append(f)
        else:
            main.append(f)

    return main, sub, skipped


def validate_main_agent(path: Path, agents_dir: Path) -> tuple[list[str], list[str]]:
    """Validate a main agent definition file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()
    tags = _find_tags(content)

    # Required sections
    if "role" not in tags:
        errors.append("Missing required <role> section")
    if "critical" not in tags:
        errors.append("Missing required <critical> section")
    if "helpers" not in tags:
        errors.append("Missing required <helpers> section")
    if "skills" not in tags:
        errors.append("Missing required <skills> section")

    # Model validation (only if helpers exists)
    if "helpers" in tags:
        helpers_content = _extract_section(content, "helpers")
        if helpers_content:
            model_match = _MODEL_RE.search(helpers_content)
            if model_match:
                model_val = model_match.group(1).lower()
                if model_val not in VALID_MODELS:
                    errors.append(
                        f"Invalid model '{model_match.group(1)}' in <helpers> "
                        f"(must be one of: {', '.join(sorted(VALID_MODELS))})"
                    )

            # Subagent reference validation
            existing_files = {f.stem for f in agents_dir.glob("*.md") if f.name != "README.md"}
            # Parse table rows — skip header/separator rows
            for line in helpers_content.splitlines():
                m = _HELPER_TABLE_RE.match(line)
                if not m:
                    continue
                name = m.group(1).strip().strip("`")
                # Skip table header and separator
                if name.lower() in ("subagent", "---", "") or name.startswith("-"):
                    continue
                if name in BUILTIN_AGENTS:
                    continue
                if name not in existing_files:
                    warnings.append(
                        f"Helper references '{name}' but no matching agent file not found in agents/"
                    )

    # Check 1: Mindset tag enforcement
    agent_stem = path.stem
    if agent_stem in MINDSET_TAGS:
        required_tag = MINDSET_TAGS[agent_stem]
        if f"<{required_tag}>" not in content:
            errors.append(f"Missing mindset tag: <{required_tag}>")
        elif f"</{required_tag}>" not in content:
            errors.append(f"Unclosed mindset tag: <{required_tag}>")

    # Check 2: Line-position check for <critical> (warning)
    if "critical" in tags:
        crit_line = _find_line_of_tag(content, "critical")
        if crit_line is not None and crit_line > 30:
            warnings.append(f"First <critical> at line {crit_line} (target: ≤30)")

    # Check 3: Line-position check for <on-activation> (warning)
    if "on-activation" in tags:
        act_line = _find_line_of_tag(content, "on-activation")
        if act_line is not None and act_line > 150:
            warnings.append(f"<on-activation> at line {act_line} (target: ≤150)")

    # Check 4: File length check (error)
    # With 1M context, consistency > token conservation. Generous limit.
    max_lines = 750
    line_count = len(content.splitlines())
    if line_count > max_lines:
        errors.append(f"File has {line_count} lines (max: {max_lines})")

    # Check 5: Orphan content check (error)
    orphan_lines = _check_orphan_content(content)
    if orphan_lines:
        lines_str = ", ".join(str(n) for n in orphan_lines)
        errors.append(f"Content outside XML tags at lines: {lines_str}")

    # Check 6: Orphan content after last tag (warning)
    last_close = _find_last_closing_tag_line(content)
    if last_close is not None:
        lines = content.splitlines()
        for i in range(last_close, len(lines)):
            if lines[i].strip():
                warnings.append(f"Content found after last closing tag (line {i + 1})")
                break

    # Check 7: Checklist format check (warning)
    for checklist_tag in _CHECKLIST_TAGS:
        if checklist_tag in tags:
            if not _check_checklist_format(content, checklist_tag):
                warnings.append(f"Tag <{checklist_tag}> has malformed checklist items")

    # Check 8: Header format check (warning)
    lines = content.splitlines()
    fm_skip = _skip_frontmatter(content)
    header_line = lines[fm_skip] if len(lines) > fm_skip else ""
    if not re.match(r"^# .+ Agent", header_line):
        warnings.append("Header should be '# Name Agent - Description'")

    # Check 9: <parameters> with <helpers> (warning)
    if "helpers" in tags and "parameters" not in tags:
        warnings.append("Has <helpers> but missing <parameters> section")

    # Recommended sections (warnings)
    if "on-activation" not in tags:
        warnings.append("Missing recommended <on-activation> section")
    if "exit" not in tags and "exit-sequence" not in tags:
        warnings.append("Missing recommended <exit> or <exit-sequence> section")

    return errors, warnings


def validate_subagent(path: Path) -> tuple[list[str], list[str]]:
    """Validate a subagent definition file.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()

    # Frontmatter validation
    fm = _parse_frontmatter(content)
    if not fm:
        errors.append("Missing or invalid YAML frontmatter")
        return errors, warnings

    for field in ("name", "description", "tools", "model"):
        if field not in fm:
            errors.append(f"Missing required frontmatter field: {field}")

    # Check 10: Name must match filename
    if "name" in fm:
        expected_name = path.stem
        if fm["name"] != expected_name:
            errors.append(f"Name mismatch: expected '{expected_name}', got '{fm['name']}'")

    # Model validation — any valid Claude model is allowed
    if "model" in fm:
        model_val = str(fm["model"]).lower()
        valid_models = {"haiku", "sonnet", "opus"}
        if model_val not in valid_models:
            errors.append(f"Subagent model must be one of {valid_models}, got '{fm['model']}'")


    # Required tags
    tags = _find_tags(content)
    if "output" not in tags:
        errors.append("Missing required <output> section")

    # Recommended tags
    if "arguments" not in tags:
        warnings.append("Missing recommended <arguments> section")

    return errors, warnings


def validate_native_agent(path: Path) -> tuple[list[str], list[str]]:
    """Validate a native agent definition file.

    Native agents live in agents/native/ and must have frontmatter with
    name, description, model, and allowed-tools. Tool restrictions are
    validated against the role's intended capabilities.

    Returns:
        (errors, warnings) — two lists of message strings.
    """
    errors: list[str] = []
    warnings: list[str] = []
    content = path.read_text()

    fm = _parse_frontmatter(content)
    if not fm:
        errors.append("Missing or invalid YAML frontmatter")
        return errors, warnings

    # Required frontmatter fields
    for field in ("name", "description", "model", "allowed-tools"):
        if field not in fm:
            errors.append(f"Missing required frontmatter field: {field}")

    # Model must be opus for native (strategic) agents
    if "model" in fm:
        model_val = str(fm["model"]).lower()
        if model_val != "opus":
            warnings.append(f"Native agent model is '{fm['model']}', expected 'opus'")

    tools = fm.get("allowed-tools")
    if tools is None:
        return errors, warnings

    if not isinstance(tools, list):
        errors.append("allowed-tools must be a YAML list")
        return errors, warnings

    tool_set = set(tools)

    # All agents must have Read
    if "Read" not in tool_set:
        errors.append("Missing required tool: Read")

    # Check for invalid tool names
    unknown = tool_set - VALID_TOOLS
    if unknown:
        errors.append(f"Unknown tools: {', '.join(sorted(unknown))}")

    # Role-based tool restriction checks
    role = path.stem.lower()

    if role in READ_ONLY_ROLES:
        if "Write" in tool_set:
            errors.append(f"Read-only role '{role}' must not have Write tool")
        if "Edit" in tool_set:
            errors.append(f"Read-only role '{role}' must not have Edit tool")

    if role in WRITE_ROLES:
        if "Write" not in tool_set:
            errors.append(f"Write-capable role '{role}' must have Write tool")
        if "Edit" not in tool_set:
            errors.append(f"Write-capable role '{role}' must have Edit tool")

    return errors, warnings


def run(root: Path, *, fix: bool = False, strict: bool = False) -> ValidateReport:
    """Validate all agent definition files."""
    report = ValidateReport(validator="agent")
    dist_root = get_dist_root(project_root=root)
    if dist_root is None:
        report.details.append("[ERROR] agents directory not found")
        report.errors.append("agents directory not found")
        return report
    agents_dir = dist_root / "agents"

    if not agents_dir.is_dir():
        report.details.append("[ERROR] agents directory not found")
        report.errors.append("agents directory not found")
        return report

    main_agents, subagents, _skipped = classify_agent_files(agents_dir)

    if not main_agents and not subagents:
        report.warnings += 1
        report.details.append("[WARN] No agent files found in agents directory")

    for path in main_agents:
        file_errors, file_warnings = validate_main_agent(path, agents_dir)

        for e in file_errors:
            report.errors.append(f"{path.name}: {e}")
            report.details.append(f"[ERROR] {path.name}: {e}")

        for w in file_warnings:
            if strict:
                report.errors.append(f"{path.name}: {w}")
                report.details.append(f"[ERROR] {path.name}: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] {path.name}: {w}")

        if not file_errors:
            report.passed += 1

    for path in subagents:
        file_errors, file_warnings = validate_subagent(path)

        for e in file_errors:
            report.errors.append(f"{path.name}: {e}")
            report.details.append(f"[ERROR] {path.name}: {e}")

        for w in file_warnings:
            if strict:
                report.errors.append(f"{path.name}: {w}")
                report.details.append(f"[ERROR] {path.name}: {w}")
            else:
                report.warnings += 1
                report.details.append(f"[WARN] {path.name}: {w}")

        if not file_errors:
            report.passed += 1

    # Validate native agent definitions
    native_dir = agents_dir / "native"
    if native_dir.is_dir():
        native_files = sorted(native_dir.glob("*.md"))
        for path in native_files:
            file_errors, file_warnings = validate_native_agent(path)

            for e in file_errors:
                report.errors.append(f"native/{path.name}: {e}")
                report.details.append(f"[ERROR] native/{path.name}: {e}")

            for w in file_warnings:
                if strict:
                    report.errors.append(f"native/{path.name}: {w}")
                    report.details.append(f"[ERROR] native/{path.name}: {w}")
                else:
                    report.warnings += 1
                    report.details.append(f"[WARN] native/{path.name}: {w}")

            if not file_errors:
                report.passed += 1

    return report
