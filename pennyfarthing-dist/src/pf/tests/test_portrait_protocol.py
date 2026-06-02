"""Tests for detect_image_protocol() terminal/graphics detection.

Focus: detection must see through tmux/screen to the host terminal. Inside a
multiplexer TERM becomes ``tmux-256color`` and TERM_PROGRAM becomes ``tmux``,
masking the real terminal — but host terminals leak identifying env vars
(GHOSTTY_*, KITTY_WINDOW_ID, WEZTERM_*) into the pane, which is the signal we
use. See portrait_resolver.detect_image_protocol.
"""

from __future__ import annotations

import pytest

from pf.tui.portrait_resolver import detect_image_protocol

# Every env var the detector consults — cleared before each test for isolation.
_TERMINAL_ENV_VARS = (
    "TERM",
    "TERM_PROGRAM",
    "KITTY_WINDOW_ID",
    "KITTY_PID",
    "GHOSTTY_RESOURCES_DIR",
    "GHOSTTY_BIN_DIR",
    "WEZTERM_EXECUTABLE",
    "WEZTERM_PANE",
    "TMUX",
    "__CFBundleIdentifier",
)


@pytest.fixture
def clean_env(monkeypatch):
    for var in _TERMINAL_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    return monkeypatch


def test_direct_ghostty_is_kitty(clean_env):
    clean_env.setenv("TERM", "xterm-ghostty")
    clean_env.setenv("TERM_PROGRAM", "ghostty")
    assert detect_image_protocol() == "kitty"


def test_direct_kitty_is_kitty(clean_env):
    clean_env.setenv("TERM", "xterm-kitty")
    assert detect_image_protocol() == "kitty"


def test_tmux_masks_ghostty_but_env_leaks_through(clean_env):
    """The real-world failure: Ghostty hosting tmux. TERM/TERM_PROGRAM are
    masked by tmux, but GHOSTTY_* env vars leak into the pane → kitty."""
    clean_env.setenv("TERM", "tmux-256color")
    clean_env.setenv("TERM_PROGRAM", "tmux")
    clean_env.setenv("TMUX", "/tmp/tmux-501/default,123,0")
    clean_env.setenv("GHOSTTY_RESOURCES_DIR", "/Applications/Ghostty.app/Contents/Resources/ghostty")
    clean_env.setenv("GHOSTTY_BIN_DIR", "/Applications/Ghostty.app/Contents/MacOS")
    assert detect_image_protocol() == "kitty"


def test_tmux_masks_kitty_but_window_id_leaks(clean_env):
    clean_env.setenv("TERM", "tmux-256color")
    clean_env.setenv("TERM_PROGRAM", "tmux")
    clean_env.setenv("TMUX", "/tmp/tmux-501/default,123,0")
    clean_env.setenv("KITTY_WINDOW_ID", "1")
    assert detect_image_protocol() == "kitty"


def test_tmux_with_no_graphics_host_is_not_kitty(clean_env):
    """Inside tmux with no host-terminal signal, must NOT claim kitty."""
    clean_env.setenv("TERM", "tmux-256color")
    clean_env.setenv("TERM_PROGRAM", "tmux")
    clean_env.setenv("TMUX", "/tmp/tmux-501/default,123,0")
    assert detect_image_protocol() != "kitty"
