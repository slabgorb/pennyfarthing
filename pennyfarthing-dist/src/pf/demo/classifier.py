"""Story type classifier — rule-based type detection and format mapping.

Deterministic classification of stories into types (UI, backend, infrastructure,
refactor, bugfix) based on file extensions, title keywords, and optional config
overrides. No AI/ML — purely rule-based.
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any

import yaml

from pf.demo.models import ArtifactType, ClassifiedStory, SignalBundle, StoryType

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

UI_KEYWORDS = ("ui", "screen", "button", "form", "layout")
BACKEND_KEYWORDS = ("api", "endpoint", "database", "query")
INFRA_KEYWORDS = ("infra", "deployment", "docker", "ci/cd", "k8s")
REFACTOR_KEYWORDS = ("refactor", "cleanup", "tech-debt", "simplify")
BUGFIX_KEYWORDS = ("fix", "bug", "patch", "regression")

UI_EXTENSIONS = frozenset({".tsx", ".jsx", ".css"})
BACKEND_EXTENSIONS = frozenset({".rs", ".py", ".go", ".java"})

ARTIFACT_MAP: dict[StoryType, list[ArtifactType]] = {
    StoryType.UI: [
        ArtifactType.UI_SCREENSHOTS,
        ArtifactType.SLIDE_DECK,
        ArtifactType.DEMO_SCRIPT,
    ],
    StoryType.BACKEND: [
        ArtifactType.MERMAID_DIAGRAM,
        ArtifactType.NARRATIVE,
        ArtifactType.DEMO_SCRIPT,
    ],
    StoryType.INFRASTRUCTURE: [
        ArtifactType.MERMAID_DIAGRAM,
        ArtifactType.NARRATIVE,
        ArtifactType.DEMO_SCRIPT,
    ],
    StoryType.REFACTOR: [
        ArtifactType.BEFORE_AFTER_COMPARISON,
        ArtifactType.NARRATIVE,
    ],
    StoryType.BUGFIX: [
        ArtifactType.PROBLEM_STATEMENT,
        ArtifactType.NARRATIVE,
    ],
}

ARTIFACT_NAME_MAP: dict[str, ArtifactType] = {a.value: a for a in ArtifactType}


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def classify_story(
    signals: SignalBundle,
    config_path: Path | None = None,
) -> dict[str, Any]:
    """Classify a story based on its signals.

    Applies config overrides first (if demo.yaml exists), then falls back
    to built-in rules (file extensions + title keywords). Fails hard on
    ambiguous classifications.

    Args:
        signals: Collected story signals from the collector
        config_path: Optional path to demo.yaml config file

    Returns:
        Result object: {success: bool, data?: ClassifiedStory, error?: str}
    """
    # 1. Try config rules first
    if config_path is not None and config_path.exists():
        config_result = _try_config_classification(signals, config_path)
        if config_result is not None:
            return config_result

    # 2. UI file extensions → immediate classification (high confidence)
    if signals.file_extensions & UI_EXTENSIONS:
        return _build_result(signals, StoryType.UI)

    # 3. Collect title keyword matches
    title = signals.title
    matches: set[StoryType] = set()

    if _title_has_keyword(title, UI_KEYWORDS):
        matches.add(StoryType.UI)
    if _title_has_keyword(title, INFRA_KEYWORDS):
        matches.add(StoryType.INFRASTRUCTURE)
    if _title_has_keyword(title, REFACTOR_KEYWORDS):
        matches.add(StoryType.REFACTOR)
    if _title_has_keyword(title, BUGFIX_KEYWORDS):
        matches.add(StoryType.BUGFIX)

    # 4. Backend: backend keywords + no UI keywords, plus either backend extensions
    #    or no file extensions at all (story has no PR diff)
    has_backend_exts = bool(signals.file_extensions & BACKEND_EXTENSIONS)
    no_extensions = len(signals.file_extensions) == 0
    has_ui_kw = StoryType.UI in matches
    if (has_backend_exts or no_extensions) and _title_has_keyword(title, BACKEND_KEYWORDS) and not has_ui_kw:
        matches.add(StoryType.BACKEND)

    # 5. Resolve matches
    if len(matches) == 0:
        return {"success": False, "error": "No classification matched for this story"}

    if len(matches) == 1:
        return _build_result(signals, next(iter(matches)))

    # 6. Deprioritize bugfix — generic keywords like "fix" appear in many contexts
    if StoryType.BUGFIX in matches:
        remaining = matches - {StoryType.BUGFIX}
        if len(remaining) == 1:
            return _build_result(signals, next(iter(remaining)))
        # Still ambiguous after removing bugfix
        types = sorted(m.value for m in remaining)
        return {
            "success": False,
            "error": f"Ambiguous classification: matched {types}",
        }

    # Multiple specific categories → ambiguous
    types = sorted(m.value for m in matches)
    return {
        "success": False,
        "error": f"Ambiguous classification: matched {types}",
    }


def load_classification_config(
    config_path: Path,
) -> dict[str, Any]:
    """Load classification rules from demo.yaml.

    Args:
        config_path: Path to demo.yaml

    Returns:
        Result object: {success: bool, data?: dict, error?: str}
    """
    if not config_path.exists():
        return {"success": False, "error": f"Config file not found: {config_path}"}

    try:
        text = config_path.read_text()
        data = yaml.safe_load(text)
        if not isinstance(data, dict):
            return {"success": False, "error": "Config file is not a YAML mapping"}
        return {"success": True, "data": data}
    except yaml.YAMLError as exc:
        return {"success": False, "error": f"Invalid YAML: {exc}"}


# ---------------------------------------------------------------------------
# Internals
# ---------------------------------------------------------------------------


def _title_has_keyword(title: str, keywords: tuple[str, ...]) -> bool:
    """Check if title contains any keyword (case-insensitive, word boundaries)."""
    for kw in keywords:
        pattern = r"\b" + re.escape(kw) + r"\b"
        if re.search(pattern, title, re.IGNORECASE):
            return True
    return False


def _build_result(
    signals: SignalBundle,
    story_type: StoryType,
    artifacts: list[ArtifactType] | None = None,
) -> dict[str, Any]:
    """Build a success result with a ClassifiedStory."""
    if artifacts is None:
        artifacts = list(ARTIFACT_MAP[story_type])
    classified = ClassifiedStory(
        signals=signals,
        story_type=story_type,
        artifacts=artifacts,
    )
    return {"success": True, "data": classified}


def _try_config_classification(
    signals: SignalBundle,
    config_path: Path,
) -> dict[str, Any] | None:
    """Try to classify using config rules. Returns None if no rule matches."""
    config_result = load_classification_config(config_path)
    if not config_result["success"]:
        return config_result

    config = config_result["data"]
    classification = config.get("classification", {})
    if not isinstance(classification, dict):
        return {
            "success": False,
            "error": "Config 'classification' must be a mapping",
        }
    rules = classification.get("rules", [])
    if not isinstance(rules, list):
        return {
            "success": False,
            "error": "Config 'classification.rules' must be a list",
        }

    for rule in rules:
        if not isinstance(rule, dict):
            return {
                "success": False,
                "error": f"Config rule must be a mapping, got {type(rule).__name__}",
            }
        pattern = rule.get("pattern", "")
        if not pattern:
            continue
        try:
            match = re.search(pattern, signals.title, re.IGNORECASE)
        except re.error as exc:
            return {
                "success": False,
                "error": f"Invalid regex in config rule: {pattern!r} — {exc}",
            }
        if match:
            type_str = rule.get("type", "")
            try:
                story_type = StoryType(type_str)
            except ValueError:
                return {
                    "success": False,
                    "error": f"Invalid story type in config: {type_str}",
                }

            artifact_names = rule.get("artifacts", [])
            artifacts = []
            for name in artifact_names:
                if name in ARTIFACT_NAME_MAP:
                    artifacts.append(ARTIFACT_NAME_MAP[name])
                else:
                    return {
                        "success": False,
                        "error": f"Unknown artifact type in config: {name}",
                    }

            return _build_result(signals, story_type, artifacts)

    return None
