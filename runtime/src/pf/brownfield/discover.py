"""
Brownfield discovery - Analyze existing codebases.

Scans codebases and generates AI-ready documentation matching
_bmad-output format.
"""

import asyncio
import json
import re
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path

# Try to import tomllib (Python 3.11+) or fall back to tomli
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib  # type: ignore
    except ImportError:
        tomllib = None  # type: ignore


class DepthLevel(Enum):
    """Discovery depth levels."""

    QUICK = "quick"  # Surface scan - just package files
    STANDARD = "standard"  # Typical scan - package + key dirs
    DEEP = "deep"  # Comprehensive - full directory tree


class ProjectType(Enum):
    """Detected project types."""

    MONOREPO = "monorepo"
    SINGLE_PACKAGE = "single_package"
    MULTI_LANGUAGE = "multi_language"
    UNKNOWN = "unknown"


@dataclass
class TechStackItem:
    """A detected technology in the stack."""

    name: str
    version: str | None = None
    category: str = "unknown"  # runtime, dev, test, build, etc.


@dataclass
class DirectoryNode:
    """A node in the directory tree."""

    path: Path
    name: str
    is_dir: bool
    children: list["DirectoryNode"] = field(default_factory=list)
    annotation: str = ""  # Description of directory purpose


@dataclass
class ArchitecturePattern:
    """A detected architecture pattern."""

    name: str
    description: str
    evidence: list[str] = field(default_factory=list)


@dataclass
class DiscoveryResult:
    """Complete brownfield discovery result."""

    project_path: Path
    project_type: ProjectType
    project_name: str
    version: str | None
    tech_stack: list[TechStackItem] = field(default_factory=list)
    directory_tree: DirectoryNode | None = None
    patterns: list[ArchitecturePattern] = field(default_factory=list)
    error: str | None = None

    @property
    def success(self) -> bool:
        """Return True if discovery succeeded."""
        return self.error is None


# Directories to always exclude from scanning
EXCLUDED_DIRS = {
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "venv",
    ".pytest_cache",
    ".mypy_cache",
    ".tox",
    "dist",
    "build",
    ".eggs",
    "*.egg-info",
    ".cache",
    ".idea",
    ".vscode",
}

# Common directory annotations
DIR_ANNOTATIONS = {
    "src": "Source code",
    "lib": "Library code",
    "test": "Test files",
    "tests": "Test files",
    "spec": "Test specifications",
    "docs": "Documentation",
    "doc": "Documentation",
    "scripts": "Utility scripts",
    "bin": "Executable scripts",
    "config": "Configuration files",
    "configs": "Configuration files",
    "public": "Public assets",
    "static": "Static assets",
    "assets": "Asset files",
    "images": "Image files",
    "styles": "Stylesheets",
    "css": "CSS stylesheets",
    "components": "UI components",
    "pages": "Page components",
    "views": "View templates",
    "templates": "Template files",
    "models": "Data models",
    "controllers": "Controller logic",
    "services": "Service layer",
    "repositories": "Data repositories",
    "api": "API endpoints",
    "utils": "Utility functions",
    "helpers": "Helper functions",
    "types": "Type definitions",
    "interfaces": "Interface definitions",
    "packages": "Workspace packages",
    "apps": "Application packages",
    "tools": "Development tools",
    "fixtures": "Test fixtures",
    "mocks": "Mock implementations",
    "stubs": "Stub implementations",
}


def _parse_json_safe(path: Path) -> dict | None:
    """Parse JSON file safely, returning None on error."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeDecodeError):
        return None


def _parse_toml_safe(path: Path) -> dict | None:
    """Parse TOML file safely, returning None on error."""
    if tomllib is None:
        return None
    try:
        return tomllib.loads(path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError):
        return None
    except Exception:
        # tomllib.TOMLDecodeError or similar
        return None


async def detect_project_type(path: Path) -> ProjectType:
    """Detect if project is monorepo, single package, etc.

    Args:
        path: Root path to analyze

    Returns:
        Detected ProjectType
    """
    if not path.exists() or not path.is_dir():
        return ProjectType.UNKNOWN

    # Check for monorepo indicators
    pnpm_workspace = path / "pnpm-workspace.yaml"
    lerna_json = path / "lerna.json"
    package_json = path / "package.json"

    # pnpm workspace
    if pnpm_workspace.exists():
        return ProjectType.MONOREPO

    # lerna monorepo
    if lerna_json.exists():
        return ProjectType.MONOREPO

    # npm/yarn workspaces in package.json
    if package_json.exists():
        data = _parse_json_safe(package_json)
        if data and "workspaces" in data:
            return ProjectType.MONOREPO

    # Count language manifest files
    manifests = {
        "node": package_json.exists(),
        "python": (path / "pyproject.toml").exists() or (path / "setup.py").exists(),
        "go": (path / "go.mod").exists(),
        "rust": (path / "Cargo.toml").exists(),
        "java": (path / "pom.xml").exists() or (path / "build.gradle").exists(),
    }

    language_count = sum(1 for present in manifests.values() if present)

    if language_count > 1:
        return ProjectType.MULTI_LANGUAGE

    if language_count == 1:
        return ProjectType.SINGLE_PACKAGE

    return ProjectType.UNKNOWN


async def detect_tech_stack(
    path: Path, depth: DepthLevel = DepthLevel.STANDARD
) -> list[TechStackItem]:
    """Detect technology stack from manifest files.

    Args:
        path: Root path to analyze
        depth: How deep to search

    Returns:
        List of detected technologies
    """
    if not path.exists() or not path.is_dir():
        return []

    items: list[TechStackItem] = []

    # Parse package.json (Node.js)
    package_json = path / "package.json"
    if package_json.exists():
        data = _parse_json_safe(package_json)
        if data:
            # Runtime dependencies
            for name, version in data.get("dependencies", {}).items():
                items.append(TechStackItem(name, version, "runtime"))
            # Dev dependencies
            for name, version in data.get("devDependencies", {}).items():
                items.append(TechStackItem(name, version, "dev"))

    # Parse pyproject.toml (Python)
    pyproject = path / "pyproject.toml"
    if pyproject.exists():
        data = _parse_toml_safe(pyproject)
        if data:
            project = data.get("project", {})
            # Main dependencies
            for dep in project.get("dependencies", []):
                name, version = _parse_python_dep(dep)
                items.append(TechStackItem(name, version, "runtime"))
            # Optional/dev dependencies
            for group, deps in project.get("optional-dependencies", {}).items():
                category = "dev" if group in ("dev", "test", "development") else "optional"
                for dep in deps:
                    name, version = _parse_python_dep(dep)
                    items.append(TechStackItem(name, version, category))

    # Parse go.mod (Go)
    go_mod = path / "go.mod"
    if go_mod.exists():
        try:
            content = go_mod.read_text(encoding="utf-8")
            # Extract Go version
            go_match = re.search(r"^go\s+(\d+\.\d+)", content, re.MULTILINE)
            if go_match:
                items.append(TechStackItem("go", go_match.group(1), "runtime"))
            # Extract requires
            for match in re.finditer(r"^\s*(\S+)\s+v?([\d.]+)", content, re.MULTILINE):
                module = match.group(1)
                version = match.group(2)
                if "/" in module:  # It's a dependency, not the module declaration
                    name = module.split("/")[-1]
                    items.append(TechStackItem(name, version, "runtime"))
        except OSError:
            pass

    # Parse Cargo.toml (Rust)
    cargo_toml = path / "Cargo.toml"
    if cargo_toml.exists():
        data = _parse_toml_safe(cargo_toml)
        if data:
            items.append(TechStackItem("rust", None, "runtime"))
            for name, dep_info in data.get("dependencies", {}).items():
                if isinstance(dep_info, str):
                    version = dep_info
                elif isinstance(dep_info, dict):
                    version = dep_info.get("version")
                else:
                    version = None
                items.append(TechStackItem(name, version, "runtime"))

    # Deep scan: look in subdirectories for workspace packages
    if depth == DepthLevel.DEEP:
        packages_dir = path / "packages"
        if packages_dir.exists() and packages_dir.is_dir():
            for subdir in packages_dir.iterdir():
                if subdir.is_dir():
                    sub_items = await detect_tech_stack(subdir, DepthLevel.QUICK)
                    items.extend(sub_items)

    return items


def _parse_python_dep(dep: str) -> tuple[str, str | None]:
    """Parse a Python dependency string like 'requests>=2.28.0'."""
    # Match: name[extras]>=version or name>=version or just name
    match = re.match(r"^([a-zA-Z0-9_-]+)(?:\[.*\])?(?:([><=!~]+)(.*))?$", dep.strip())
    if match:
        name = match.group(1)
        version = match.group(3) if match.group(3) else None
        return name, version
    return dep, None


async def scan_directory_structure(
    path: Path,
    depth: DepthLevel = DepthLevel.STANDARD,
    max_depth: int = 5,
    _current_depth: int = 0,
    _visited: set[Path] | None = None,
) -> DirectoryNode:
    """Scan directory structure with annotations.

    Args:
        path: Root path to scan
        depth: Discovery depth level
        max_depth: Maximum directory depth to traverse
        _current_depth: Internal - current recursion depth
        _visited: Internal - visited paths (for symlink loop detection)

    Returns:
        Root DirectoryNode with children
    """
    if _visited is None:
        _visited = set()

    # Resolve to real path for symlink detection
    try:
        real_path = path.resolve()
    except OSError:
        real_path = path

    # Check for symlink loops
    if real_path in _visited:
        return DirectoryNode(
            path=path,
            name=path.name or str(path),
            is_dir=True,
            annotation="(symlink loop)",
        )
    _visited.add(real_path)

    node = DirectoryNode(
        path=path,
        name=path.name or str(path),
        is_dir=path.is_dir() if path.exists() else False,
        annotation=DIR_ANNOTATIONS.get(path.name.lower(), ""),
    )

    if not path.is_dir() or _current_depth >= max_depth:
        return node

    # Get children
    children: list[DirectoryNode] = []
    try:
        entries = list(path.iterdir())
    except (PermissionError, OSError):
        return node

    # Filter and sort entries
    for entry in sorted(entries, key=lambda e: (not e.is_dir(), e.name.lower())):
        # Skip excluded directories
        if entry.name in EXCLUDED_DIRS:
            continue
        if entry.name.startswith(".") and entry.name not in (".github", ".claude"):
            continue

        if entry.is_dir():
            # Recursively scan subdirectories
            child = await scan_directory_structure(
                entry,
                depth,
                max_depth,
                _current_depth + 1,
                _visited,
            )
            children.append(child)
        elif entry.is_file():
            children.append(
                DirectoryNode(
                    path=entry,
                    name=entry.name,
                    is_dir=False,
                )
            )

    node.children = children
    return node


async def detect_architecture_patterns(
    path: Path, depth: DepthLevel = DepthLevel.STANDARD
) -> list[ArchitecturePattern]:
    """Detect common architecture patterns.

    Args:
        path: Root path to analyze
        depth: Discovery depth level

    Returns:
        List of detected patterns with evidence
    """
    if not path.exists() or not path.is_dir():
        return []

    patterns: list[ArchitecturePattern] = []

    try:
        dirs = {d.name.lower() for d in path.iterdir() if d.is_dir()}
    except (PermissionError, OSError):
        return []

    # Check for monorepo/workspace pattern
    if "packages" in dirs or "apps" in dirs:
        evidence = []
        if "packages" in dirs:
            evidence.append("packages/ directory present")
        if "apps" in dirs:
            evidence.append("apps/ directory present")
        if (path / "pnpm-workspace.yaml").exists():
            evidence.append("pnpm-workspace.yaml present")
        if (path / "package.json").exists():
            data = _parse_json_safe(path / "package.json")
            if data and "workspaces" in data:
                evidence.append("workspaces field in package.json")

        if evidence:
            patterns.append(
                ArchitecturePattern(
                    "monorepo",
                    "Monorepo with multiple packages/apps",
                    evidence,
                )
            )

    # Check for MVC pattern
    mvc_dirs = {"models", "views", "controllers"}
    if mvc_dirs.issubset(dirs):
        patterns.append(
            ArchitecturePattern(
                "mvc",
                "Model-View-Controller architecture",
                [f"{d}/ directory present" for d in mvc_dirs],
            )
        )

    # Check for layered architecture
    layered_indicators = {"api", "services", "repositories"}
    matches = layered_indicators.intersection(dirs)
    if len(matches) >= 2:
        patterns.append(
            ArchitecturePattern(
                "layered",
                "Layered architecture with service separation",
                [f"{d}/ directory present" for d in matches],
            )
        )

    # Check for TypeScript pattern
    if (path / "tsconfig.json").exists():
        evidence = ["tsconfig.json present"]
        if (path / "src").is_dir():
            evidence.append("src/ directory present")
        patterns.append(
            ArchitecturePattern(
                "typescript",
                "TypeScript project with compilation",
                evidence,
            )
        )

    # Check for src/lib pattern
    if "src" in dirs or "lib" in dirs:
        evidence = []
        if "src" in dirs:
            evidence.append("src/ directory present")
        if "lib" in dirs:
            evidence.append("lib/ directory present")
        if evidence and not any(p.name == "typescript" for p in patterns):
            patterns.append(
                ArchitecturePattern(
                    "source-separation",
                    "Source code separated into dedicated directory",
                    evidence,
                )
            )

    return patterns


def generate_project_overview(result: DiscoveryResult) -> str:
    """Generate project-overview.md content.

    Args:
        result: Discovery result

    Returns:
        Markdown content for project overview
    """
    lines = [
        "# Project Overview",
        "",
        "## Executive Summary",
        "",
        f"**{result.project_name}** is a {result.project_type.value.replace('_', ' ')} project.",
        "",
        "| Attribute | Value |",
        "|-----------|-------|",
        f"| **Name** | {result.project_name} |",
        f"| **Version** | {result.version or 'N/A'} |",
        f"| **Type** | {result.project_type.value} |",
        f"| **Path** | {result.project_path} |",
        "",
    ]

    if result.patterns:
        lines.extend(
            [
                "## Architecture Patterns",
                "",
            ]
        )
        for pattern in result.patterns:
            lines.append(f"### {pattern.name.title()}")
            lines.append("")
            lines.append(pattern.description)
            lines.append("")
            if pattern.evidence:
                lines.append("**Evidence:**")
                for e in pattern.evidence:
                    lines.append(f"- {e}")
                lines.append("")

    return "\n".join(lines)


def generate_tech_stack_doc(result: DiscoveryResult) -> str:
    """Generate technology-stack.md content.

    Args:
        result: Discovery result

    Returns:
        Markdown content for tech stack
    """
    lines = [
        "# Technology Stack",
        "",
    ]

    if not result.tech_stack:
        lines.append("No technologies detected.")
        return "\n".join(lines)

    # Group by category
    categories: dict[str, list[TechStackItem]] = {}
    for item in result.tech_stack:
        cat = item.category
        if cat not in categories:
            categories[cat] = []
        categories[cat].append(item)

    for category, items in sorted(categories.items()):
        lines.append(f"## {category.title()} Dependencies")
        lines.append("")
        lines.append("| Package | Version |")
        lines.append("|---------|---------|")
        for item in sorted(items, key=lambda x: x.name.lower()):
            lines.append(f"| {item.name} | {item.version or 'N/A'} |")
        lines.append("")

    return "\n".join(lines)


def _format_tree(node: DirectoryNode, prefix: str = "", is_last: bool = True) -> list[str]:
    """Format directory tree with box-drawing characters."""
    lines: list[str] = []

    connector = "└── " if is_last else "├── "
    annotation = f"  # {node.annotation}" if node.annotation else ""

    lines.append(f"{prefix}{connector}{node.name}{annotation}")

    if node.children:
        extension = "    " if is_last else "│   "
        new_prefix = prefix + extension
        for i, child in enumerate(node.children):
            is_child_last = i == len(node.children) - 1
            lines.extend(_format_tree(child, new_prefix, is_child_last))

    return lines


def generate_source_tree_doc(result: DiscoveryResult) -> str:
    """Generate source-tree-analysis.md content.

    Args:
        result: Discovery result

    Returns:
        Markdown content for source tree
    """
    lines = [
        "# Source Tree Analysis",
        "",
        "## Directory Structure",
        "",
        "```",
        result.project_name,
    ]

    if result.directory_tree and result.directory_tree.children:
        for i, child in enumerate(result.directory_tree.children):
            is_last = i == len(result.directory_tree.children) - 1
            lines.extend(_format_tree(child, "", is_last))

    lines.append("```")
    lines.append("")

    return "\n".join(lines)


def generate_ai_guidance_doc(result: DiscoveryResult) -> str:
    """Generate ai-guidance.md content.

    Args:
        result: Discovery result

    Returns:
        Markdown content for AI guidance
    """
    lines = [
        "# AI Guidance",
        "",
        f"This document provides guidance for AI agents working on **{result.project_name}**.",
        "",
        "## Project Type",
        "",
        f"This is a **{result.project_type.value}** project.",
        "",
    ]

    if result.patterns:
        lines.extend(
            [
                "## Detected Patterns",
                "",
            ]
        )
        for pattern in result.patterns:
            lines.append(f"- **{pattern.name}**: {pattern.description}")
        lines.append("")

    if result.tech_stack:
        # Get unique tech names
        tech_names = sorted({item.name.lower() for item in result.tech_stack})[:10]
        lines.extend(
            [
                "## Key Technologies",
                "",
                f"The project uses: {', '.join(tech_names)}",
                "",
            ]
        )

    lines.extend(
        [
            "## Recommendations",
            "",
            "- Follow existing code patterns and conventions",
            "- Check for existing tests before modifying code",
            "- Review the tech stack documentation for version constraints",
            "",
        ]
    )

    return "\n".join(lines)


async def discover(
    path: Path, depth: DepthLevel = DepthLevel.STANDARD, output_dir: Path | None = None
) -> DiscoveryResult:
    """Run complete brownfield discovery.

    Args:
        path: Root path to analyze
        depth: Discovery depth level (quick/standard/deep)
        output_dir: Optional output directory for generated docs

    Returns:
        DiscoveryResult with all findings
    """
    # Validate path
    if not path.exists():
        return DiscoveryResult(
            project_path=path,
            project_type=ProjectType.UNKNOWN,
            project_name=path.name,
            version=None,
            error=f"Path does not exist: {path}",
        )

    if not path.is_dir():
        return DiscoveryResult(
            project_path=path,
            project_type=ProjectType.UNKNOWN,
            project_name=path.name,
            version=None,
            error=f"Path is not a directory: {path}",
        )

    # Extract project name and version from manifests
    project_name = path.name
    version: str | None = None

    package_json = path / "package.json"
    if package_json.exists():
        data = _parse_json_safe(package_json)
        if data:
            project_name = data.get("name", project_name)
            version = data.get("version")

    pyproject = path / "pyproject.toml"
    if pyproject.exists() and version is None:
        data = _parse_toml_safe(pyproject)
        if data:
            project = data.get("project", {})
            project_name = project.get("name", project_name)
            version = project.get("version")

    # Run detection tasks in parallel
    project_type, tech_stack, directory_tree, patterns = await asyncio.gather(
        detect_project_type(path),
        detect_tech_stack(path, depth),
        scan_directory_structure(path, depth),
        detect_architecture_patterns(path, depth),
    )

    result = DiscoveryResult(
        project_path=path,
        project_type=project_type,
        project_name=project_name,
        version=version,
        tech_stack=tech_stack,
        directory_tree=directory_tree,
        patterns=patterns,
    )

    # Write output files if requested
    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)

        (output_dir / "project-overview.md").write_text(
            generate_project_overview(result), encoding="utf-8"
        )
        (output_dir / "technology-stack.md").write_text(
            generate_tech_stack_doc(result), encoding="utf-8"
        )
        (output_dir / "source-tree-analysis.md").write_text(
            generate_source_tree_doc(result), encoding="utf-8"
        )
        (output_dir / "ai-guidance.md").write_text(
            generate_ai_guidance_doc(result), encoding="utf-8"
        )

    return result
