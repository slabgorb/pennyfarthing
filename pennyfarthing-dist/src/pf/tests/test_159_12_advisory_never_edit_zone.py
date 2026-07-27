"""RED tests for story 159-12 — advisory never-edit-zone PreToolUse hook (ADR-0041 Phase 1).

These pin the *designed* interface Dev must implement. The handler module does
NOT exist yet, so every test that imports it fails RED until GREEN lands.

  Designed interface — pf.hooks.advisory_never_edit_zone.main() -> None
    - Reads a Claude Code PreToolUse payload from stdin:
        {"tool_name": "Edit", "tool_input": {"file_path": "<path>"}}
    - Resolves the project root from CLAUDE_PROJECT_DIR (via get_project_root).
    - Loads never-edit zones from repos.yaml using the EXISTING loader
      (pf.git.repos.load_repos_config) — repos.yaml is the single source of truth.
    - Matches the edited path against each repo's `never_edit` patterns with
      gitignore-style semantics (a slashless pattern matches the basename at any
      depth; `**` spans zero-or-more segments; a pattern containing `/` is
      anchored to the repo-relative path). Paths are matched per-repo, relative
      to each repo's declared `path`.
    - ON MATCH: writes a HookResponse to stdout:
        {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                 "additionalContext": "<reminder>"}}
      When the matched zone sits under a repo `symlinks` prefix, the reminder
      NAMES the correct source (e.g. pennyfarthing/pennyfarthing-dist/agents).
    - Returns additionalContext ONLY. It NEVER emits a permissionDecision and
      NEVER exits non-zero — enforcement stays with pre_edit_check /
      branch_protection (ADR-0041: advisory, not a gate).
    - NO MATCH / missing-or-malformed repos.yaml / bad stdin => no output, exit 0.

  Registered in pf.hooks.dispatch.DISPATCH_REGISTRY["PreToolUse"] as
    ("advisory-never-edit-zone", "<matcher superset of {Edit,Write,MultiEdit}>",
     "pf.hooks.advisory_never_edit_zone")
  ... without disturbing the existing PreToolUse handlers, and WITHOUT adding
  any UserPromptSubmit handler (ADR-0041 rejects the every-prompt "hammer").

CAUTION: every test uses a tmp-dir repos.yaml fixture. None touch the live
orchestrator topology or symlinks.
"""

from __future__ import annotations

import importlib
import io
import json
import os
import time
from pathlib import Path

import pytest
import yaml

HOOK_MODULE = "pf.hooks.advisory_never_edit_zone"
DISPATCH_MODULE = "pf.hooks.dispatch"

# The real dogfood symlink mapping (link-path -> source), mirrored in fixtures.
_ORCH_SYMLINKS = {
    ".pennyfarthing/agents": "pennyfarthing/pennyfarthing-dist/agents",
    ".pennyfarthing/guides": "pennyfarthing/pennyfarthing-dist/guides",
}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_repos(root: Path, repos: dict) -> None:
    """Write a tmp-dir .pennyfarthing/repos.yaml with the given repos map."""
    pf = root / ".pennyfarthing"
    pf.mkdir(parents=True, exist_ok=True)
    (pf / "repos.yaml").write_text(yaml.dump({"repos": repos}, default_flow_style=False))


def _edit(file_path: str, tool: str = "Edit") -> dict:
    """A minimal PreToolUse payload for an edit to *file_path*."""
    return {"tool_name": tool, "tool_input": {"file_path": file_path}}


def _run_hook(
    payload: dict | str,
    *,
    project_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> tuple[str, int]:
    """Run the advisory hook's main() with *payload* on stdin.

    Returns (stdout, exit_code). *payload* may be a dict (json-encoded) or a raw
    string (to exercise the malformed-stdin path).
    """
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(project_dir))
    raw = payload if isinstance(payload, str) else json.dumps(payload)
    monkeypatch.setattr("sys.stdin", io.StringIO(raw))

    mod = importlib.import_module(HOOK_MODULE)
    code = 0
    try:
        mod.main()
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 0
    out = capsys.readouterr().out
    return out, code


def _hook_output(stdout: str) -> dict | None:
    """Parse the first HookResponse JSON line; return hookSpecificOutput or None."""
    for line in stdout.strip().splitlines():
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(data, dict) and "hookSpecificOutput" in data:
            return data["hookSpecificOutput"]
    return None


def _registry() -> dict:
    dispatch = importlib.import_module(DISPATCH_MODULE)
    return dispatch.DISPATCH_REGISTRY


def _pretooluse_entry() -> tuple[str, str | None, str] | None:
    for entry in _registry().get("PreToolUse", []):
        if entry[2] == HOOK_MODULE:
            return entry
    return None


# ---------------------------------------------------------------------------
# Fixtures — tmp-dir topologies only.
# ---------------------------------------------------------------------------


@pytest.fixture
def dogfood_project(tmp_path: Path) -> Path:
    """A tmp project mirroring the dogfood shape: an orchestrator repo with
    symlinked never-edit zones, plus an inlined framework repo with build zones.
    """
    root = tmp_path / "project"
    root.mkdir()
    _write_repos(
        root,
        {
            "orchestrator": {
                "path": ".",
                "type": "orchestrator",
                "owns": ["sprint/**", "docs/**", ".session/**"],
                "never_edit": [
                    "node_modules/**",
                    ".pennyfarthing/agents/**",
                    ".pennyfarthing/guides/**",
                ],
                "symlinks": _ORCH_SYMLINKS,
            },
            "pennyfarthing": {
                "path": "pennyfarthing",
                "type": "framework",
                "owns": ["pennyfarthing-dist/**"],
                "never_edit": ["node_modules/**", "packages/*/dist/**", "*.tsbuildinfo"],
                "symlinks": {},
            },
        },
    )
    return root


# ---------------------------------------------------------------------------
# AC1 — editing a never-edit zone injects an advisory naming the correct source
# ---------------------------------------------------------------------------


def test_symlinked_zone_injects_advisory_naming_source(dogfood_project, monkeypatch, capsys):
    out, code = _run_hook(
        _edit(".pennyfarthing/agents/tea.md"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    hso = _hook_output(out)
    assert hso is not None, "a never-edit match must emit a HookResponse"
    ctx = hso.get("additionalContext", "")
    assert ctx, "additionalContext must be non-empty on a never-edit match"
    # AC1: the reminder names the correct SOURCE, not just the symlink path.
    assert "pennyfarthing/pennyfarthing-dist/agents" in ctx, (
        "advisory must point at the pennyfarthing-dist/ source for a symlinked zone; "
        f"got: {ctx!r}"
    )


def test_absolute_path_under_root_is_matched(dogfood_project, monkeypatch, capsys):
    """Claude Code passes absolute file_paths — the hook must relativize to the
    project root before matching (lang-review #5, path handling)."""
    abs_path = str(dogfood_project / ".pennyfarthing" / "guides" / "hooks.md")
    out, code = _run_hook(
        _edit(abs_path), project_dir=dogfood_project, monkeypatch=monkeypatch, capsys=capsys
    )
    assert code == 0
    hso = _hook_output(out)
    assert hso is not None, "an absolute path inside a zone must still match"
    assert "pennyfarthing/pennyfarthing-dist/guides" in hso.get("additionalContext", "")


# ---------------------------------------------------------------------------
# AC3 (matching) — gitignore-style glob semantics
# ---------------------------------------------------------------------------


def test_glob_double_star_matches_nested_depth(dogfood_project, monkeypatch, capsys):
    out, code = _run_hook(
        _edit(".pennyfarthing/guides/sub/deep/x.md"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert _hook_output(out) is not None, "'**' must match at any nesting depth"


def test_glob_slashless_matches_basename_any_depth(dogfood_project, monkeypatch, capsys):
    # `*.tsbuildinfo` is a pennyfarthing-repo zone; the file lives several dirs
    # deep inside that repo. A slashless pattern matches the basename at any depth.
    out, code = _run_hook(
        _edit("pennyfarthing/packages/core/build/app.tsbuildinfo"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert _hook_output(out) is not None, "slashless '*.tsbuildinfo' must match at any depth"


def test_glob_anchored_matches_dist_not_src(dogfood_project, monkeypatch, capsys):
    hit, hit_code = _run_hook(
        _edit("pennyfarthing/packages/a/dist/bundle.js"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    miss, miss_code = _run_hook(
        _edit("pennyfarthing/packages/a/src/index.ts"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert hit_code == 0 and miss_code == 0
    assert _hook_output(hit) is not None, "packages/*/dist/** must match a dist file"
    assert _hook_output(miss) is None, "packages/*/dist/** must NOT match a src file"


def test_malformed_glob_pattern_is_skipped_not_fatal(tmp_path, monkeypatch, capsys):
    root = tmp_path / "p"
    root.mkdir()
    # A malformed pattern must be skipped; the valid sibling still matches.
    _write_repos(root, {"orchestrator": {"path": ".", "never_edit": ["[unterminated", "vault/**"]}})
    out, code = _run_hook(
        _edit("vault/key.txt"), project_dir=root, monkeypatch=monkeypatch, capsys=capsys
    )
    assert code == 0
    assert _hook_output(out) is not None, (
        "a malformed pattern must be skipped, not abort matching of valid patterns"
    )


# ---------------------------------------------------------------------------
# AC2 — ordinary owned paths (including the SOURCE we want edited) => no output
# ---------------------------------------------------------------------------


def test_ordinary_owned_path_no_output(dogfood_project, monkeypatch, capsys):
    out, code = _run_hook(
        _edit("sprint/current-sprint.yaml"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert out.strip() == "", "an owned, non-never-edit path must produce no output"


def test_editing_the_source_is_silent(dogfood_project, monkeypatch, capsys):
    # Editing pennyfarthing-dist/ (the thing we WANT edited) must never nag.
    out, code = _run_hook(
        _edit("pennyfarthing/pennyfarthing-dist/agents/tea.md"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert _hook_output(out) is None, "editing the source path must not trigger an advisory"


# ---------------------------------------------------------------------------
# AC3 (core invariant) — additionalContext ONLY, never a permission decision
# ---------------------------------------------------------------------------


def test_advisory_never_emits_permission_decision(dogfood_project, monkeypatch, capsys):
    """THE critical ADR-0041 invariant: advisory-only, no decision, never blocks."""
    out, code = _run_hook(
        _edit(".pennyfarthing/agents/tea.md"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0, "advisory hook must never exit non-zero (never blocks)"
    hso = _hook_output(out)
    assert hso is not None and hso.get("additionalContext")
    assert "permissionDecision" not in hso, "advisory hook must NOT emit a permissionDecision"
    assert "permissionDecisionReason" not in hso
    # Belt-and-suspenders on the raw output: no decision keyword leaks through.
    assert '"permissionDecision"' not in out
    assert '"deny"' not in out and '"allow"' not in out


# ---------------------------------------------------------------------------
# AC4 — fail-soft (lang-review #1: never raise, never block)
# ---------------------------------------------------------------------------


def test_missing_repos_yaml_failsoft(tmp_path, monkeypatch, capsys):
    root = tmp_path / "empty"
    root.mkdir()  # no .pennyfarthing/repos.yaml at all
    out, code = _run_hook(
        _edit(".pennyfarthing/agents/tea.md"),
        project_dir=root,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert out.strip() == "", "no repos.yaml => no output, no block"


def test_malformed_repos_yaml_failsoft(tmp_path, monkeypatch, capsys):
    root = tmp_path / "bad"
    (root / ".pennyfarthing").mkdir(parents=True)
    # Unterminated flow collections => yaml.safe_load raises; hook must swallow it.
    (root / ".pennyfarthing" / "repos.yaml").write_text(
        "repos:\n  orchestrator: {path: '.', never_edit: [a, b\n"
    )
    out, code = _run_hook(
        _edit(".pennyfarthing/agents/tea.md"),
        project_dir=root,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0, "malformed repos.yaml must not crash the hook or block the edit"
    assert out.strip() == ""


# ---------------------------------------------------------------------------
# lang-review #11 — boundary input validation (bad/empty payloads)
# ---------------------------------------------------------------------------


def test_non_json_stdin_failsoft(dogfood_project, monkeypatch, capsys):
    out, code = _run_hook(
        "this is not json", project_dir=dogfood_project, monkeypatch=monkeypatch, capsys=capsys
    )
    assert code == 0
    assert out.strip() == ""


def test_empty_file_path_no_output(dogfood_project, monkeypatch, capsys):
    out, code = _run_hook(
        {"tool_name": "Edit", "tool_input": {"file_path": ""}},
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert out.strip() == ""


def test_missing_tool_input_no_output(dogfood_project, monkeypatch, capsys):
    out, code = _run_hook(
        {"tool_name": "Edit"}, project_dir=dogfood_project, monkeypatch=monkeypatch, capsys=capsys
    )
    assert code == 0
    assert out.strip() == ""


# ---------------------------------------------------------------------------
# AC5 — zones come from repos.yaml (single source of truth; no hardcoded list)
# ---------------------------------------------------------------------------


def test_zones_come_from_repos_yaml_custom_zone(tmp_path, monkeypatch, capsys):
    root = tmp_path / "custom"
    root.mkdir()
    _write_repos(root, {"orchestrator": {"path": ".", "never_edit": ["vault/**"]}})
    # A zone defined ONLY in repos.yaml must trigger...
    hit, hit_code = _run_hook(
        _edit("vault/secret.txt"), project_dir=root, monkeypatch=monkeypatch, capsys=capsys
    )
    assert hit_code == 0
    assert _hook_output(hit) is not None, "hook must read zones from repos.yaml"
    # ...and a classic-looking protected path that is NOT in THIS repos.yaml must
    # stay silent — proving there is no hardcoded fallback list.
    miss, miss_code = _run_hook(
        _edit(".pennyfarthing/agents/tea.md"),
        project_dir=root,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert miss_code == 0
    assert _hook_output(miss) is None, "zones must come ONLY from repos.yaml, not a hardcoded list"


def test_empty_never_edit_produces_no_output(tmp_path, monkeypatch, capsys):
    root = tmp_path / "nozones"
    root.mkdir()
    _write_repos(root, {"orchestrator": {"path": ".", "never_edit": []}})
    out, code = _run_hook(
        _edit("node_modules/pkg/index.js"),
        project_dir=root,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert out.strip() == "", "empty never_edit => even node_modules is silent (no hardcoded list)"


def test_reuses_existing_repos_loader(dogfood_project, monkeypatch, capsys):
    """SOUL #2/#9: reuse the existing loader, don't re-parse repos.yaml or shell out."""
    # Import via a real run so the module is loaded, then inspect its source.
    _run_hook(
        _edit("sprint/x.yaml"), project_dir=dogfood_project, monkeypatch=monkeypatch, capsys=capsys
    )
    mod = importlib.import_module(HOOK_MODULE)
    src = Path(mod.__file__).read_text()
    assert "load_repos_config" in src or "from pf.git.repos" in src, (
        "hook must reuse pf.git.repos.load_repos_config (single source of truth)"
    )
    assert "subprocess" not in src, "Python-only, no shelling out (SOUL #9)"


# ---------------------------------------------------------------------------
# AC6 — dispatch registration, matcher, existing handlers intact, no hammer
# ---------------------------------------------------------------------------


def test_registered_as_pretooluse_handler():
    assert _pretooluse_entry() is not None, (
        f"{HOOK_MODULE} must be registered under DISPATCH_REGISTRY['PreToolUse']"
    )


def test_matcher_covers_edit_write_multiedit():
    entry = _pretooluse_entry()
    assert entry is not None
    _, matcher, _ = entry
    assert matcher is not None, "advisory hook must be scoped to edit tools, not unconditional"
    segments = set(matcher.split("|"))
    assert {"Edit", "Write", "MultiEdit"}.issubset(segments), (
        f"matcher {matcher!r} must cover Edit|Write|MultiEdit"
    )


def test_existing_pretooluse_handlers_intact():
    modules = {entry[2] for entry in _registry().get("PreToolUse", [])}
    for existing in (
        "pf.hooks.pre_edit_check",
        "pf.hooks.context_warning",
        "pf.hooks.context_breaker",
        "pf.hooks.schema_validation",
        "pf.hooks.branch_protection",
        "pf.hooks.pretooluse_forward",
    ):
        assert existing in modules, f"existing handler {existing} must remain registered"


def test_no_userpromptsubmit_handler_added():
    """ADR-0041 explicitly rejects the every-prompt hammer."""
    reg = _registry()
    assert "UserPromptSubmit" not in reg, (
        "no UserPromptSubmit handler — the every-prompt hammer stays out (ADR-0041)"
    )
    for event, handlers in reg.items():
        if event == "PreToolUse":
            continue
        assert all(entry[2] != HOOK_MODULE for entry in handlers), (
            f"{HOOK_MODULE} must only be a PreToolUse handler; found under {event}"
        )


def test_dispatch_injects_advisory_without_blocking(dogfood_project, monkeypatch, capsys):
    """End-to-end wiring: the real dispatcher runs the advisory hook, injects the
    source path, and does NOT block. Other advisory hooks may add context too, so
    we assert INCLUSION of the source path, not exact output equality.
    """
    monkeypatch.setenv("CLAUDE_PROJECT_DIR", str(dogfood_project))
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(_edit(".pennyfarthing/agents/tea.md"))))
    dispatch = importlib.import_module(DISPATCH_MODULE)
    code = 0
    try:
        dispatch.dispatch("PreToolUse")
    except SystemExit as exc:
        code = exc.code if isinstance(exc.code, int) else 0
    out = capsys.readouterr().out
    assert code != 2, "advisory hook must not cause the chain to block (exit 2)"
    hso = _hook_output(out)
    assert hso is not None, "dispatcher should emit a merged hookSpecificOutput"
    assert hso.get("permissionDecision") != "deny", "advisory path must not produce a deny"
    assert "pennyfarthing/pennyfarthing-dist/agents" in hso.get("additionalContext", ""), (
        "the advisory source path must appear in the dispatched additionalContext"
    )


# ---------------------------------------------------------------------------
# Rework (159-12 round 1) — ReDoS hardening, symlink-path correctness, AC4 length
# ---------------------------------------------------------------------------


def test_collapse_adjacent_double_stars():
    """Consecutive `**` segments collapse to one (the ReDoS root cause); a single
    `**` and non-adjacent `**` are preserved."""
    mod = importlib.import_module(HOOK_MODULE)
    assert mod._collapse_double_stars("**/**/**/**/x") == "**/x"
    assert mod._collapse_double_stars("**/a/**/**/b") == "**/a/**/b"
    assert mod._collapse_double_stars("**/x") == "**/x"
    assert mod._collapse_double_stars("a/*/dist/**") == "a/*/dist/**"


def test_chained_double_star_pattern_is_bounded_and_correct():
    """A pattern with many chained `**` groups must NOT blow up (ReDoS regression):
    it matches in bounded time and preserves correct semantics after collapsing."""
    mod = importlib.import_module(HOOK_MODULE)
    pattern = "**/" * 8 + "nomatch"  # '**/**/.../**/nomatch'
    deep_path = "/".join(f"seg{i}" for i in range(50)) + "/file.txt"  # 50 segments, no 'nomatch'
    start = time.perf_counter()
    result = mod._matches(pattern, deep_path)  # worst case = a non-match on a deep path
    elapsed = time.perf_counter() - start
    assert result is False, "the crafted pattern should not match this path"
    assert elapsed < 2.0, f"matching must stay bounded (ReDoS guard); took {elapsed:.2f}s"
    # semantics preserved: the collapsed `**/nomatch` still matches a path ending in it
    assert mod._matches(pattern, "a/b/c/nomatch") is True


def test_absolute_symlink_path_matches_zone(tmp_path, monkeypatch, capsys):
    """Editing a REAL `.pennyfarthing/` symlink via an ABSOLUTE path must still match
    the never-edit zone. The hook must NOT resolve the symlink away to its source
    (regression: `Path.resolve()` followed the symlink and missed the zone)."""
    root = tmp_path / "project"
    root.mkdir()
    src = root / "pennyfarthing" / "pennyfarthing-dist" / "agents"
    src.mkdir(parents=True)
    pf = root / ".pennyfarthing"
    pf.mkdir()
    link = pf / "agents"
    link.symlink_to(os.path.relpath(src, pf))  # real filesystem symlink
    _write_repos(
        root,
        {
            "orchestrator": {
                "path": ".",
                "never_edit": [".pennyfarthing/agents/**"],
                "symlinks": {".pennyfarthing/agents": "pennyfarthing/pennyfarthing-dist/agents"},
            }
        },
    )
    abs_edit = str(link / "dev.md")  # absolute path THROUGH the symlink
    out, code = _run_hook(_edit(abs_edit), project_dir=root, monkeypatch=monkeypatch, capsys=capsys)
    assert code == 0
    hso = _hook_output(out)
    assert hso is not None, "an absolute edit of a symlinked zone must trigger the advisory"
    assert "pennyfarthing/pennyfarthing-dist/agents" in hso.get("additionalContext", "")


def test_relative_path_with_dotdot_is_normalized(dogfood_project, monkeypatch, capsys):
    """A relative path containing `..` is normalized before matching (consistency
    with the absolute branch); one that escapes the project is silent."""
    # `.pennyfarthing/guides/../agents/tea.md` normalizes to `.pennyfarthing/agents/tea.md`
    out, code = _run_hook(
        _edit(".pennyfarthing/guides/../agents/tea.md"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert code == 0
    assert _hook_output(out) is not None, "`..` must be normalized, then matched"
    # a path that escapes the project root produces no output
    esc, esc_code = _run_hook(
        _edit("../../etc/passwd"),
        project_dir=dogfood_project,
        monkeypatch=monkeypatch,
        capsys=capsys,
    )
    assert esc_code == 0
    assert esc.strip() == ""


def test_reminder_stays_under_200_chars_for_deep_path(dogfood_project, monkeypatch, capsys):
    """AC4: the advisory reminder is < 200 characters, even for a deep symlinked path."""
    deep = ".pennyfarthing/agents/" + "/".join(f"seg{i}" for i in range(30)) + "/file.md"
    out, code = _run_hook(_edit(deep), project_dir=dogfood_project, monkeypatch=monkeypatch, capsys=capsys)
    assert code == 0
    hso = _hook_output(out)
    assert hso is not None
    assert len(hso["additionalContext"]) < 200, (
        f"reminder must be < 200 chars (AC4); got {len(hso['additionalContext'])}"
    )
