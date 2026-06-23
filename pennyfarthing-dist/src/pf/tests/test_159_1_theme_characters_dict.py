"""Story 159-1: theme_characters accepts dict-shaped agent_data (gh #34).

`theme_characters.<role>` in `.pennyfarthing/config.local.yaml` historically
accepted only a string (the character name). Setting a role to a string sets
`persona.character` but leaves every other persona field empty, because
`load_persona()` reads style/role/trait/quote/helper from the theme's own
`agents.<role>:` block — which does not exist for custom roles.

These tests pin the new contract: `theme_characters.<role>` accepts EITHER

* a ``str`` — legacy behavior, sets the character name only (backwards
  compatible), OR
* a ``dict`` matching the ``agents.<role>:`` shape — merged onto the theme's
  agent data with override-wins semantics so the full persona populates.

Test groups:
  * Backwards-compat guards (green today, must stay green).
  * Dict-shape tests (RED today — fail until ``load_persona`` honors dicts).
  * A mutation guard enforcing python rule #2 (no shared-mutable-state
    corruption) against a naive in-place ``dict.update`` implementation.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import yaml

from pf.prime.persona import load_persona

THEME = "test-theme"


def _setup_project(
    tmp_path: Path,
    *,
    theme_characters: dict | None = None,
    agents: dict | None = None,
) -> Path:
    """Build a minimal project root with config + theme YAML.

    Mirrors the on-disk layout ``load_persona`` reads: a
    ``config.local.yaml`` carrying ``theme`` and (optionally)
    ``theme_characters``, plus a theme file under ``personas/themes/``.
    """
    pf_dir = tmp_path / ".pennyfarthing"
    pf_dir.mkdir(exist_ok=True)

    config: dict = {"theme": THEME}
    if theme_characters is not None:
        config["theme_characters"] = theme_characters
    (pf_dir / "config.local.yaml").write_text(yaml.dump(config))

    themes_dir = pf_dir / "personas" / "themes"
    themes_dir.mkdir(parents=True, exist_ok=True)
    theme_yaml = {"theme": {"name": "Test Theme"}, "agents": agents or {}}
    (themes_dir / f"{THEME}.yaml").write_text(yaml.dump(theme_yaml))

    return tmp_path


# ---------------------------------------------------------------------------
# Backwards-compat guards — string overrides (AC1) and theme fallback (AC4).
# These pass on the current code and MUST keep passing after the fix.
# ---------------------------------------------------------------------------


class TestStringOverrideBackwardsCompat:
    def test_string_override_sets_character_only_for_custom_role(
        self, tmp_path: Path
    ) -> None:
        """A string override on a role with no theme block sets only character."""
        root = _setup_project(
            tmp_path, theme_characters={"gm": "Count Rugen"}, agents={}
        )

        persona, theme = load_persona("gm", root)

        assert persona is not None
        assert persona.character == "Count Rugen"
        assert persona.style == ""
        assert persona.role == ""
        assert theme == THEME

    def test_string_override_wins_but_keeps_theme_fields(self, tmp_path: Path) -> None:
        """A string override replaces the character but theme fields remain."""
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": "Override Name"},
            agents={
                "dev": {
                    "character": "Theme Dev",
                    "style": "theme style",
                    "role": "theme role",
                }
            },
        )

        persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona.character == "Override Name"
        assert persona.style == "theme style"
        assert persona.role == "theme role"


class TestNoOverride:
    def test_theme_block_used_when_no_override(self, tmp_path: Path) -> None:
        """With no override, persona comes entirely from the theme block."""
        root = _setup_project(
            tmp_path,
            agents={
                "dev": {
                    "character": "Theme Dev",
                    "style": "theme style",
                    "role": "theme role",
                    "quirk": "theme quirk",
                }
            },
        )

        persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona.character == "Theme Dev"
        assert persona.style == "theme style"
        assert persona.quirk == "theme quirk"

    def test_returns_none_with_no_theme_data_and_no_override(
        self, tmp_path: Path
    ) -> None:
        """No theme block and no override → (None, None)."""
        root = _setup_project(tmp_path, agents={})

        persona, theme = load_persona("dev", root)

        assert persona is None
        assert theme is None


# ---------------------------------------------------------------------------
# Dict-shape contract — RED today. These fail until load_persona merges a
# dict override into agent_data with override-wins semantics.
# ---------------------------------------------------------------------------


class TestDictOverride:
    def test_dict_override_full_on_custom_role_populates_all_fields(
        self, tmp_path: Path
    ) -> None:
        """AC2/AC5: a full dict on a role with no theme block fills the persona."""
        root = _setup_project(
            tmp_path,
            theme_characters={
                "gm": {
                    "character": "Count Rugen",
                    "style": "the six-fingered scholar",
                    "role": "documents the pain points",
                    "trait": "scholarly detachment",
                    "quote": "I'm tracking them. Whoever they are.",
                    "quirk": "takes meticulous notes",
                    "motto": "measure everything",
                }
            },
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.character == "Count Rugen"
        assert persona.style == "the six-fingered scholar"
        assert persona.role == "documents the pain points"
        assert persona.trait == "scholarly detachment"
        assert persona.quote == "I'm tracking them. Whoever they are."
        assert persona.quirk == "takes meticulous notes"
        assert persona.motto == "measure everything"

    def test_dict_override_character_is_plain_string_not_dict(
        self, tmp_path: Path
    ) -> None:
        """AC3: the character must be the dict's ``character`` value, not the dict.

        On the current code ``persona.character`` becomes the entire override
        dict — this is the core bug. Assert it is the plain name string.
        """
        root = _setup_project(
            tmp_path,
            theme_characters={"gm": {"character": "Count Rugen", "style": "x"}},
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert isinstance(persona.character, str)
        assert persona.character == "Count Rugen"

    def test_dict_override_helper_and_catchphrases_populate(
        self, tmp_path: Path
    ) -> None:
        """AC2: nested helper and catchphrases from a dict override populate."""
        root = _setup_project(
            tmp_path,
            theme_characters={
                "gm": {
                    "character": "Count Rugen",
                    "catchphrases": ["I'm tracking them. Whoever they are."],
                    "helper": {
                        "name": "The Machine",
                        "style": "measures the life force of every narrative",
                    },
                }
            },
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.helper_name == "The Machine"
        assert persona.helper_style == "measures the life force of every narrative"
        # Single catchphrase → deterministic quote selection.
        assert persona.quote == "I'm tracking them. Whoever they are."

    def test_dict_override_partial_merges_over_theme_block(
        self, tmp_path: Path
    ) -> None:
        """AC4/AC5: a partial dict overrides provided keys; rest fall back to theme."""
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": {"character": "Custom Dev", "style": "custom style"}},
            agents={
                "dev": {
                    "character": "Theme Dev",
                    "style": "theme style",
                    "role": "theme role",
                    "quirk": "theme quirk",
                }
            },
        )

        persona, _ = load_persona("dev", root)

        assert persona is not None
        # Overridden keys win.
        assert persona.character == "Custom Dev"
        assert persona.style == "custom style"
        # Non-overridden keys fall back to the theme block.
        assert persona.role == "theme role"
        assert persona.quirk == "theme quirk"

    def test_dict_override_without_character_falls_back_to_theme_character(
        self, tmp_path: Path
    ) -> None:
        """AC4 edge: a dict lacking ``character`` still merges; character falls back.

        On the current code the truthy dict is assigned to ``character`` even
        though it has no character key — assert the theme character survives.
        """
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": {"style": "custom style"}},
            agents={"dev": {"character": "Theme Dev", "style": "theme style"}},
        )

        persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona.character == "Theme Dev"
        assert persona.style == "custom style"


# ---------------------------------------------------------------------------
# Rule-enforcement guard — python rule #2 (no shared-mutable-state).
# Guards against a naive ``agent_data.update(override)`` fix that would mutate
# the theme dict in place and corrupt cross-call state. RED today (the merge is
# not yet implemented, so the style assertion fails); after a correct
# ``{**agent_data, **override}`` fix both assertions pass. A fix that mutates
# the theme dict in place would satisfy the merge assertion but fail the
# no-mutation assertion.
# ---------------------------------------------------------------------------


class TestNoInputMutation:
    def test_load_persona_does_not_mutate_theme_agent_data(
        self, tmp_path: Path
    ) -> None:
        """The merge must not mutate the theme data returned by load_theme."""
        shared_theme = {
            "theme": {"name": "Test Theme"},
            "agents": {"dev": {"character": "Theme Dev", "role": "theme role"}},
        }
        original = {
            "theme": {"name": "Test Theme"},
            "agents": {"dev": {"character": "Theme Dev", "role": "theme role"}},
        }
        config = {"theme_characters": {"dev": {"style": "custom style"}}}

        with (
            patch("pf.prime.persona.get_current_theme", return_value=THEME),
            patch(
                "pf.prime.persona.load_pennyfarthing_config", return_value=config
            ),
            patch("pf.prime.persona.load_theme", return_value=shared_theme),
        ):
            persona, _ = load_persona("dev", tmp_path)

        assert persona is not None
        # The merge result is correct...
        assert persona.style == "custom style"
        assert persona.role == "theme role"
        # ...and the source theme dict was not mutated in place.
        assert shared_theme == original
