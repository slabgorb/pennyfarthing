"""Content generator — Claude ELI5 translation from classified signals.

Translates technical story signals into non-technical narratives using Claude API.
Produces GeneratedContent with problem statement, what changed, why, demo script,
diagrams, and slide outlines.
"""

from __future__ import annotations

from typing import Any

from pf.demo.models import ClassifiedStory, GeneratedContent


def generate_content(
    classified: ClassifiedStory,
    corrections: str | None = None,
) -> dict[str, Any]:
    """Generate ELI5 content from a classified story.

    Uses Claude API to translate technical signals into non-technical
    narratives for executive audience.

    Args:
        classified: Classified story with signals and type
        corrections: Optional developer feedback for regeneration

    Returns:
        Result object: {success: bool, data?: GeneratedContent, error?: str}
    """
    raise NotImplementedError("generate_content not yet implemented")


def build_prompt(
    classified: ClassifiedStory,
    corrections: str | None = None,
) -> str:
    """Build the Claude prompt from classified story signals.

    Constructs a prompt that includes all signals, story type, ACs,
    and constraints for ELI5 translation.

    Args:
        classified: Classified story with signals and type
        corrections: Optional previous output corrections

    Returns:
        Formatted prompt string
    """
    raise NotImplementedError("build_prompt not yet implemented")


def parse_response(
    response_text: str,
    classified: ClassifiedStory,
) -> dict[str, Any]:
    """Parse Claude's response into a GeneratedContent dataclass.

    Extracts structured fields from the response text and validates
    completeness.

    Args:
        response_text: Raw text response from Claude
        classified: The classified story (for context)

    Returns:
        Result object: {success: bool, data?: GeneratedContent, error?: str}
    """
    raise NotImplementedError("parse_response not yet implemented")
