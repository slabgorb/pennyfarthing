"""Gate file validation — schema, depth, cycles, and mandatory elements.

Validates a gate file for:
  1. Schema: <gate name="..."> with <purpose>, <pass>, <fail>
  2. Depth: max nesting depth of 3
  3. Cycles: no duplicate gate names
  4. Completeness: all required elements non-empty

Reports ALL errors at once (not fail-fast).

Story: 107-3 (Gate authoring guide and validation command)
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from pathlib import Path

MAX_DEPTH = 3


@dataclass
class GateInfo:
    """Parsed gate metadata."""

    name: str
    model: str = "haiku"
    depth: int = 0
    children: list[str] = field(default_factory=list)


@dataclass
class ValidationResult:
    """Result of gate file validation."""

    valid: bool
    gate_name: str | None = None
    model: str | None = None
    depth: int = 0
    child_count: int = 0
    errors: list[str] = field(default_factory=list)


def validate_gate_file(path: str | Path) -> ValidationResult:
    """Validate a gate file for schema compliance, depth, and cycles.

    Args:
        path: Path to the gate file.

    Returns:
        ValidationResult with all errors collected.
    """
    path = Path(path)
    errors: list[str] = []

    if not path.exists():
        return ValidationResult(valid=False, errors=[f"File not found: {path}"])

    content = path.read_text()
    if not content.strip():
        return ValidationResult(valid=False, errors=["File is empty"])

    # Tokenize all gate-related tags
    tokens = _tokenize(content)

    if not tokens:
        return ValidationResult(
            valid=False,
            errors=["No <gate> tag found in file"],
        )

    # Parse gate structure and collect errors
    gate_names: list[str] = []
    root_name: str | None = None
    root_model: str | None = None
    max_depth = 0
    depth = 0

    for token in tokens:
        if token["type"] == "gate_open":
            name = token.get("name")
            model = token.get("model", "haiku")

            if depth == 0:
                root_name = name
                root_model = model

            if not name:
                errors.append(f"Gate element at depth {depth} missing required 'name' attribute")
            else:
                # Check for duplicate names (cycle indicator)
                if name in gate_names:
                    errors.append(
                        f"Duplicate gate name '{name}' — names must be unique within a file"
                    )
                gate_names.append(name)

            depth += 1
            if depth - 1 > max_depth:
                max_depth = depth - 1

            # Depth limit check (depth is 0-indexed, so depth-1 after increment)
            if depth - 1 > MAX_DEPTH:
                gate_label = name or "(unnamed)"
                errors.append(
                    f"Gate depth limit exceeded: '{gate_label}' at depth {depth - 1} (max {MAX_DEPTH})"
                )

        elif token["type"] == "gate_close":
            depth -= 1

    # Validate required child elements for each gate
    _validate_required_elements(content, gate_names, errors)

    child_count = len(gate_names) - 1 if len(gate_names) > 1 else 0

    return ValidationResult(
        valid=len(errors) == 0,
        gate_name=root_name,
        model=root_model,
        depth=max_depth,
        child_count=child_count,
        errors=errors,
    )


def _tokenize(content: str) -> list[dict]:
    """Tokenize gate-related XML tags from content."""
    tokens: list[dict] = []

    # Match opening gate tags with attributes
    open_pattern = re.compile(r"<gate\b([^>]*)>", re.IGNORECASE)
    close_pattern = re.compile(r"</gate\s*>", re.IGNORECASE)

    # Build a list of all tags with their positions
    events: list[tuple[int, dict]] = []

    for m in open_pattern.finditer(content):
        attrs = m.group(1)
        name_match = re.search(r'name="([^"]*)"', attrs)
        model_match = re.search(r'model="([^"]*)"', attrs)
        events.append(
            (
                m.start(),
                {
                    "type": "gate_open",
                    "name": name_match.group(1) if name_match else None,
                    "model": model_match.group(1) if model_match else "haiku",
                },
            )
        )

    for m in close_pattern.finditer(content):
        events.append((m.start(), {"type": "gate_close"}))

    # Sort by position
    events.sort(key=lambda e: e[0])
    tokens = [e[1] for e in events]

    return tokens


def _validate_required_elements(
    content: str,
    gate_names: list[str],
    errors: list[str],
) -> None:
    """Validate that each gate has <purpose>, <pass>, and <fail> elements.

    For each gate, checks that required child elements exist and are non-empty
    within the gate's scope.
    """
    # For simple files with one gate, check globally
    # For nested files, check per-gate scope
    if len(gate_names) <= 1:
        name = gate_names[0] if gate_names else "(unnamed)"
        _check_required_for_gate(content, name, errors)
    else:
        # Split content by gate scopes and validate each
        # Use a stack-based approach to extract each gate's direct content
        _validate_nested_gates(content, errors)


def _check_required_for_gate(
    scope_content: str,
    gate_name: str,
    errors: list[str],
) -> None:
    """Check that a gate scope contains non-empty <purpose>, <pass>, <fail>."""
    for element in ("purpose", "pass", "fail"):
        pattern = re.compile(
            rf"<{element}>(.*?)</{element}>",
            re.DOTALL | re.IGNORECASE,
        )
        match = pattern.search(scope_content)
        if not match:
            errors.append(f"Gate '{gate_name}' missing required <{element}> block")
        elif not match.group(1).strip():
            errors.append(f"Gate '{gate_name}' has empty <{element}> block")


def _validate_nested_gates(content: str, errors: list[str]) -> None:
    """Validate required elements for each gate in a nested structure."""
    # Extract each gate's scope using a stack-based parser
    open_pattern = re.compile(r"<gate\b([^>]*)>", re.IGNORECASE)
    close_pattern = re.compile(r"</gate\s*>", re.IGNORECASE)

    events: list[tuple[int, str, str | None]] = []

    for m in open_pattern.finditer(content):
        name_match = re.search(r'name="([^"]*)"', m.group(1))
        name = name_match.group(1) if name_match else None
        events.append((m.start(), "open", name))

    for m in close_pattern.finditer(content):
        events.append((m.start(), "close", None))

    events.sort(key=lambda e: e[0])

    # Stack-based scope extraction
    stack: list[tuple[str | None, int]] = []  # (name, start_pos)

    for pos, event_type, name in events:
        if event_type == "open":
            stack.append((name, pos))
        elif event_type == "close" and stack:
            gate_name, start_pos = stack.pop()
            # Extract this gate's direct content (between open and close)
            gate_scope = content[start_pos:pos]
            # Remove nested gate content to check only direct children
            direct_content = _remove_nested_gates(gate_scope)
            label = gate_name or "(unnamed)"
            _check_required_for_gate(direct_content, label, errors)


def _remove_nested_gates(scope: str) -> str:
    """Remove nested <gate>...</gate> blocks from scope content.

    Keeps the outermost gate's direct content only.
    """
    depth = 0
    result: list[str] = []
    i = 0

    open_pattern = re.compile(r"<gate\b[^>]*>", re.IGNORECASE)
    close_pattern = re.compile(r"</gate\s*>", re.IGNORECASE)

    while i < len(scope):
        open_match = open_pattern.match(scope, i)
        close_match = close_pattern.match(scope, i)

        if open_match:
            depth += 1
            if depth <= 1:
                # Keep the outermost gate open tag
                result.append(open_match.group())
            i = open_match.end()
        elif close_match:
            if depth <= 1:
                result.append(close_match.group())
            depth -= 1
            i = close_match.end()
        else:
            if depth <= 1:
                result.append(scope[i])
            i += 1

    return "".join(result)
