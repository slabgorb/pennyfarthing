"""Story 164-18: harden dict-shaped ``theme_characters`` overrides.

Deferred review findings from 159-1 (which taught ``load_persona`` to accept a
dict-shaped ``theme_characters.<role>``). 159-1 hardened the *character* field
but left four soft spots, all reachable from a hand-edited
``.pennyfarthing/config.local.yaml``:

1. ``helper`` is read with ``helper.get("name")`` guarded only by truthiness —
   a non-dict (e.g. ``helper: "Difference Engine"``) raises ``AttributeError``
   and takes the whole agent activation down.
2. ``catchphrases`` is fed to ``random.choice()`` guarded only by truthiness.
   A bare string is a *sequence*, so it does not crash — it silently yields a
   single random CHARACTER as the persona quote. Non-sequences (int, dict)
   crash instead.
3. ``get_crew_manifest`` does not apply ``load_persona``'s character-fallback
   chain, so the crew manifest and the persona disagree about who a role is.
4. ``_quote_cache`` is a module global with no reset hook, so a quote selected
   in one test leaks into every later test using the same (agent, theme) key.

The contract these tests pin:

* A malformed ``helper`` / ``catchphrases`` degrades — it never raises and never
  produces nonsense (a one-character quote is nonsense).
* ``get_crew_manifest(root)`` resolves the same character as
  ``load_persona(role, root)`` for every override shape: dict-with-character,
  dict-without-character, plain string, and no override at all.
* ``pf.prime.persona.reset_quote_cache()`` exists, clears the cache, and is
  wired into an autouse conftest fixture so no test inherits another's quote.

AC5 (documenting the str|dict shape in ``guides/persona-loading.md``) is
doc-only and is verified in review, not here.
"""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml

from pf.prime import persona as persona_mod
from pf.prime.persona import get_crew_manifest, load_persona

THEME = "test-theme"


def _setup_project(
    tmp_path: Path,
    *,
    theme_characters: dict | None = None,
    agents: dict | None = None,
) -> Path:
    """Build a minimal project root with config + theme YAML.

    Same layout helper as ``test_159_1_theme_characters_dict.py`` — a
    ``config.local.yaml`` carrying ``theme`` and optionally
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


@pytest.fixture
def clear_quote_cache():
    """Explicitly drop the module quote cache around a test.

    Deliberately NOT autouse: the AC4 tests below prove that an autouse reset
    exists in conftest, and an autouse fixture here would make that proof
    vacuous. Tests whose assertions depend on a freshly selected quote take
    this fixture by name.
    """
    persona_mod._quote_cache.clear()
    yield
    persona_mod._quote_cache.clear()


# ---------------------------------------------------------------------------
# AC1 — a non-dict ``helper`` must degrade, not raise.
#
# RED today: line 150 does ``helper.get("name") if helper else None``. A
# non-empty string is truthy and has no ``.get`` -> AttributeError.
# ---------------------------------------------------------------------------


class TestNonDictHelper:
    def test_string_helper_does_not_raise(self, tmp_path: Path) -> None:
        """``helper: "some string"`` must not blow up agent activation."""
        root = _setup_project(
            tmp_path,
            theme_characters={"gm": {"character": "Count Rugen", "helper": "The Machine"}},
            agents={},
        )

        persona, theme = load_persona("gm", root)

        assert persona is not None
        assert theme == THEME
        # The valid parts of the override still resolve.
        assert persona.character == "Count Rugen"
        # The malformed helper is dropped, not half-applied.
        assert persona.helper_name is None
        assert persona.helper_style is None

    @pytest.mark.parametrize(
        "bad_helper",
        [
            pytest.param("The Machine", id="str"),
            pytest.param(["The Machine", "mechanical"], id="list"),
            pytest.param(42, id="int"),
            pytest.param(True, id="bool"),
        ],
    )
    def test_non_dict_helper_shapes_degrade_to_none(
        self, tmp_path: Path, bad_helper: object
    ) -> None:
        """Every non-dict helper shape yields ``helper_name``/``style`` of None."""
        root = _setup_project(
            tmp_path,
            theme_characters={"gm": {"character": "Count Rugen", "helper": bad_helper}},
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.helper_name is None
        assert persona.helper_style is None

    def test_theme_block_non_dict_helper_degrades(self, tmp_path: Path) -> None:
        """The guard covers a malformed helper in the THEME yaml too.

        The override path is not the only source of ``helper`` — a hand-edited
        theme file reaches the same line.
        """
        root = _setup_project(
            tmp_path,
            agents={"dev": {"character": "Theme Dev", "helper": "not-a-dict"}},
        )

        persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona.character == "Theme Dev"
        assert persona.helper_name is None
        assert persona.helper_style is None

    def test_valid_dict_helper_still_populates(self, tmp_path: Path) -> None:
        """Regression guard: the guard must not break well-formed helpers."""
        root = _setup_project(
            tmp_path,
            theme_characters={
                "gm": {
                    "character": "Count Rugen",
                    "helper": {"name": "The Machine", "style": "mechanical"},
                }
            },
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.helper_name == "The Machine"
        assert persona.helper_style == "mechanical"


# ---------------------------------------------------------------------------
# AC2 — a non-list ``catchphrases`` must degrade, not raise and not produce a
# single random character.
#
# RED today: line 146 does ``random.choice(catchphrases)`` guarded only by
# truthiness. ``random.choice("Only one phrase")`` returns e.g. "y"; an int or
# a dict raises.
# ---------------------------------------------------------------------------


class TestNonListCatchphrases:
    def test_string_catchphrases_is_not_sliced_into_one_character(
        self, tmp_path: Path, clear_quote_cache
    ) -> None:
        """A bare-string ``catchphrases`` must not yield a 1-char quote.

        This is the silent-corruption case: ``random.choice`` treats the string
        as a sequence of characters. Accept either sanctioned degradation —
        coerce to ``[value]``, or skip and fall back to ``quote``.
        """
        root = _setup_project(
            tmp_path,
            theme_characters={
                "gm": {
                    "character": "Count Rugen",
                    "catchphrases": "I'm tracking them.",
                    "quote": "Fallback quote.",
                }
            },
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.quote in ("I'm tracking them.", "Fallback quote."), (
            f"expected the whole string or the quote fallback, got {persona.quote!r}"
        )

    def test_string_catchphrases_without_quote_fallback(
        self, tmp_path: Path, clear_quote_cache
    ) -> None:
        """No ``quote`` to fall back on: the result is the string or None.

        Never a single character sliced out of the string.
        """
        root = _setup_project(
            tmp_path,
            theme_characters={"gm": {"character": "Count Rugen", "catchphrases": "Tracking them."}},
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.quote in ("Tracking them.", None), (
            f"expected whole string or None, got {persona.quote!r}"
        )

    @pytest.mark.parametrize(
        "bad_catchphrases",
        [
            pytest.param(42, id="int"),
            pytest.param(3.14, id="float"),
            pytest.param(True, id="bool"),
            pytest.param({"a": "one", "b": "two"}, id="dict"),
            pytest.param(object(), id="opaque-object"),
        ],
    )
    def test_non_sequence_catchphrases_falls_back_to_quote(
        self, tmp_path: Path, bad_catchphrases: object, clear_quote_cache
    ) -> None:
        """Non-sequence ``catchphrases`` must not raise; quote wins as fallback.

        ``object()`` is not YAML-serializable, so this case is injected through
        the theme dict directly rather than through the config file.
        """
        root = _setup_project(tmp_path, agents={})
        theme_data = {
            "theme": {"name": "Test Theme"},
            "agents": {
                "dev": {
                    "character": "Theme Dev",
                    "catchphrases": bad_catchphrases,
                    "quote": "Fallback quote.",
                }
            },
        }

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(persona_mod, "load_theme", lambda *_a, **_kw: theme_data)
            persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona.character == "Theme Dev"
        assert persona.quote == "Fallback quote."

    def test_valid_list_catchphrases_still_selected(
        self, tmp_path: Path, clear_quote_cache
    ) -> None:
        """Regression guard: a real list still drives quote selection."""
        root = _setup_project(
            tmp_path,
            theme_characters={
                "gm": {
                    "character": "Count Rugen",
                    "catchphrases": ["Only one."],
                    "quote": "Should not be used.",
                }
            },
            agents={},
        )

        persona, _ = load_persona("gm", root)

        assert persona is not None
        assert persona.quote == "Only one."

    def test_tuple_catchphrases_accepted(self, tmp_path: Path, clear_quote_cache) -> None:
        """A tuple is a legitimate sequence of phrases and must be honored."""
        root = _setup_project(tmp_path, agents={})
        theme_data = {
            "theme": {"name": "Test Theme"},
            "agents": {
                "dev": {
                    "character": "Theme Dev",
                    "catchphrases": ("Only one.",),
                    "quote": "Should not be used.",
                }
            },
        }

        with pytest.MonkeyPatch.context() as mp:
            mp.setattr(persona_mod, "load_theme", lambda *_a, **_kw: theme_data)
            persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona.quote == "Only one."


# ---------------------------------------------------------------------------
# AC3 — ``get_crew_manifest`` must resolve a role's character through the SAME
# fallback chain as ``load_persona``:
#
#   override dict["character"] -> override str -> agent_data["character"] -> "Unknown"
#
# RED today: for a role present in ``theme_characters`` with a dict override
# that carries no ``character`` key, ``get_crew_manifest`` computes
# ``character = None`` and DROPS the role from the manifest entirely, while
# ``load_persona`` resolves the theme's character. The crew panel then omits an
# agent that has a perfectly good name.
#
# Scope note: parity is asserted for roles that appear in ``theme_characters``.
# Roles with no override and no theme block are still omitted (existing
# contract — see test_prime.py::test_get_crew_manifest).
# ---------------------------------------------------------------------------


def _crew_character(root: Path, role: str) -> str | None:
    """Character ``get_crew_manifest`` assigns to ``role``, or None if dropped."""
    members = [m for m in get_crew_manifest(root) if m.role == role]
    assert len(members) <= 1, f"role {role!r} appears {len(members)} times in manifest"
    return members[0].character if members else None


def _persona_character(root: Path, role: str) -> str | None:
    """Character ``load_persona`` resolves for ``role``, or None if not found."""
    persona, _ = load_persona(role, root)
    return persona.character if persona else None


class TestCrewManifestFallbackParity:
    def test_dict_override_with_character_parity(self, tmp_path: Path) -> None:
        """Override dict's ``character`` wins in both functions (green today)."""
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": {"character": "Custom Dev", "style": "x"}},
            agents={"dev": {"character": "Theme Dev"}},
        )

        assert _persona_character(root, "dev") == "Custom Dev"
        assert _crew_character(root, "dev") == "Custom Dev"

    def test_dict_override_without_character_falls_back_to_theme(self, tmp_path: Path) -> None:
        """A dict override lacking ``character`` must fall back to the theme.

        Core RED case: today the manifest drops ``dev`` (None character) while
        ``load_persona`` returns "Theme Dev".
        """
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": {"style": "custom style"}},
            agents={"dev": {"character": "Theme Dev", "style": "theme style"}},
        )

        assert _persona_character(root, "dev") == "Theme Dev"
        assert _crew_character(root, "dev") == "Theme Dev"

    def test_dict_override_without_character_or_theme_yields_unknown(self, tmp_path: Path) -> None:
        """Nothing resolvable: both functions land on the same "Unknown" sentinel.

        ``load_persona`` returns a persona with ``character == "Unknown"``
        because the merged override makes ``agent_data`` truthy. The manifest
        must agree rather than silently dropping the role.
        """
        root = _setup_project(
            tmp_path,
            theme_characters={"gm": {"style": "custom style"}},
            agents={},
        )

        assert _persona_character(root, "gm") == "Unknown"
        assert _crew_character(root, "gm") == "Unknown"

    def test_string_override_parity(self, tmp_path: Path) -> None:
        """A str override resolves identically in both functions (green today)."""
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": "Override Name"},
            agents={"dev": {"character": "Theme Dev"}},
        )

        assert _persona_character(root, "dev") == "Override Name"
        assert _crew_character(root, "dev") == "Override Name"

    def test_empty_string_override_falls_back_to_theme(self, tmp_path: Path) -> None:
        """An empty str override is not a name — both fall back to the theme."""
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": ""},
            agents={"dev": {"character": "Theme Dev"}},
        )

        assert _persona_character(root, "dev") == "Theme Dev"
        assert _crew_character(root, "dev") == "Theme Dev"

    def test_no_override_parity(self, tmp_path: Path) -> None:
        """No override at all: both read the theme block (green today)."""
        root = _setup_project(
            tmp_path,
            theme_characters={"tea": "Someone Else"},
            agents={"dev": {"character": "Theme Dev"}},
        )

        assert _persona_character(root, "dev") == "Theme Dev"
        assert _crew_character(root, "dev") == "Theme Dev"

    def test_non_dict_non_str_override_does_not_crash_manifest(self, tmp_path: Path) -> None:
        """A junk override shape (list) must not corrupt the manifest.

        ``load_persona`` ignores it (neither dict nor str) and falls back to the
        theme character; the manifest must do the same rather than emitting a
        ``CrewMember`` whose character is a list.
        """
        root = _setup_project(
            tmp_path,
            theme_characters={"dev": ["Not", "A", "Name"]},
            agents={"dev": {"character": "Theme Dev"}},
        )

        assert _persona_character(root, "dev") == "Theme Dev"
        crew_character = _crew_character(root, "dev")
        assert isinstance(crew_character, str), (
            f"manifest character must be a str, got {crew_character!r}"
        )
        assert crew_character == "Theme Dev"


# ---------------------------------------------------------------------------
# AC4 — ``_quote_cache`` needs a public reset hook, wired into conftest.
#
# RED today: ``pf.prime.persona`` has no ``reset_quote_cache``, and a quote
# selected by one test survives into the next test that uses the same
# (agent_name, theme) key.
# ---------------------------------------------------------------------------


class TestQuoteCacheReset:
    def test_reset_quote_cache_exists_and_is_callable(self) -> None:
        """A public reset hook must exist on the module."""
        reset = getattr(persona_mod, "reset_quote_cache", None)
        assert reset is not None, "pf.prime.persona.reset_quote_cache is missing"
        assert callable(reset)

    def test_reset_quote_cache_empties_the_cache(self, tmp_path: Path) -> None:
        """Calling the hook drops every cached quote."""
        root = _setup_project(
            tmp_path,
            agents={"dev": {"character": "Theme Dev", "catchphrases": ["A phrase."]}},
        )

        persona_mod._quote_cache.clear()
        load_persona("dev", root)
        assert persona_mod._quote_cache, "load_persona should have cached a quote"

        persona_mod.reset_quote_cache()

        assert persona_mod._quote_cache == {}

    def test_reset_quote_cache_rebinds_nothing_callers_hold(self, tmp_path: Path) -> None:
        """The reset must clear in place, not rebind a fresh dict.

        ``from pf.prime.persona import _quote_cache`` style access (and the
        module's own closure over the global) must observe the clear, so the
        object identity has to survive.
        """
        cache_before = persona_mod._quote_cache
        persona_mod.reset_quote_cache()
        assert persona_mod._quote_cache is cache_before

    def test_stale_cached_quote_is_dropped_after_reset(self, tmp_path: Path) -> None:
        """A changed catchphrase list is honored once the cache is reset.

        Without the reset the second load returns the FIRST quote — the exact
        cross-test pollution this AC removes.
        """
        root = _setup_project(
            tmp_path,
            agents={"dev": {"character": "Theme Dev", "catchphrases": ["First."]}},
        )
        persona_mod._quote_cache.clear()

        first, _ = load_persona("dev", root)
        assert first is not None and first.quote == "First."

        # Rewrite the theme with a different single catchphrase.
        _setup_project(
            tmp_path,
            agents={"dev": {"character": "Theme Dev", "catchphrases": ["Second."]}},
        )

        stale, _ = load_persona("dev", root)
        assert stale is not None and stale.quote == "First.", (
            "cache is expected to hold the first quote until reset"
        )

        persona_mod.reset_quote_cache()

        fresh, _ = load_persona("dev", root)
        assert fresh is not None
        assert fresh.quote == "Second."


class TestQuoteCacheAutouseFixture:
    """Prove conftest resets the cache between tests.

    These two tests are order-dependent BY DESIGN and rely on pytest's
    in-file declaration order: the first populates the cache and deliberately
    does not clean up; the second asserts it started clean. That can only hold
    if an autouse fixture reset it in between.
    """

    def test_a_populates_the_quote_cache_and_leaves_it_dirty(self, tmp_path: Path) -> None:
        root = _setup_project(
            tmp_path,
            agents={"dev": {"character": "Theme Dev", "catchphrases": ["Leaked phrase."]}},
        )

        persona, _ = load_persona("dev", root)

        assert persona is not None
        assert persona_mod._quote_cache, "expected a cached quote to leak forward"

    def test_b_starts_with_an_empty_quote_cache(self) -> None:
        assert persona_mod._quote_cache == {}, (
            "quote cache leaked from the previous test — conftest needs an "
            "autouse reset_quote_cache fixture"
        )
