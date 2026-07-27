"""RED tests for story 160-16 — ws_push/data_proxy fail-loud sweep part 3 (p1).

Follow-up to 160-15, whose TEA/Dev/Reviewer pass flagged three remaining silent
swallows as out-of-scope follow-ups. 160-15 hardened the swallow sites *inside*
``ws_push.py``; the ``fetch_git`` git-info swallow it named actually lives in a
DIFFERENT file — ``pf/frame/routes/data_proxy.py`` — which is why it was deferred.
This story sweeps the three:

* **data_proxy._get_git_info** (``data_proxy.py:~187``) — the outer
  ``except Exception: return None`` swallows the ``int()`` parse of the
  ``git rev-list --count`` outputs (``ahead``/``behind``/``developBehind``). A
  present-but-broken count silently collapses the WHOLE repo to ``None`` →
  ``get_git_all`` then renders the repo as ``branch="unknown", clean=True`` with
  zero diagnostics (AC-1).
* **data_proxy._get_repos_config** (``data_proxy.py:~211``) — ``except Exception:
  pass`` swallows a malformed / undecodable / unreadable ``repos.yaml``; the
  panel silently falls back to a single ``[{name: <dir>, path: "."}]`` repo,
  hiding the real (broken) multi-repo topology. The guarded ``p.read_text()``
  (``data_proxy.py:202``) also lacks ``encoding=`` (CWE-838, lang-review #5),
  so undecodable bytes raise inside the same blind swallow (AC-2).
* **ws_push.fetch_persona** inner portrait resolver (``ws_push.py:~497``) — the
  INNER ``try: ... except Exception: pass  # AC-3: graceful degradation`` around
  ``resolve_portrait_path`` swallows a portrait-resolver failure silently. (The
  OUTER ``fetch_persona`` catch-all already warns — added in 160-15.) (AC-3)

DESIGNED INTERFACE (for Dev / GREEN) — mirror the 160-4/160-12/160-15 prior art:
``warnings.warn`` naming the offending subject, then GRACEFUL degradation.
NEVER raise — all three run inside the long-lived Frame poll loop / FastAPI
routes whose own outer guards would swallow a raise and blank the panel, which
is strictly worse than a warning.

  1. **_get_git_info** — on an ``int()`` parse failure of a rev-list count,
     ``warnings.warn`` (naming git / the count / the repo), then degrade exactly
     as today (the repo contributes no count data). Return shape unchanged: a
     well-formed ``dict`` (with ``branch`` populated) OR ``None`` — both are
     accepted here; what must change is the SILENCE.
  2. **_get_repos_config** — add ``encoding="utf-8"`` to the ``read_text`` call,
     then on a present-but-broken ``repos.yaml`` ``warnings.warn`` (naming the
     file), then return the unchanged single-repo fallback. A MISSING repos.yaml
     stays silent (the ``is_file()`` gate already skips it).
  3. **fetch_persona inner resolver** — on a ``resolve_portrait_path`` exception,
     ``warnings.warn`` (naming the portrait / agent), then keep
     ``portrait_path = None`` and RETURN THE FULL PERSONA DICT. The inner try
     MUST stay: letting the portrait error reach the outer catch-all would blank
     the entire persona panel (return ``{}``) — strictly worse.

``_get_git_info(repo_path)`` and ``_get_repos_config(project_dir)`` take their
path as a DIRECT argument, so the data_proxy tests call them with ``tmp_path``
and need no env wiring. ``fetch_persona`` resolves the project dir via
FRAME_PROJECT_DIR -> PF_PROJECT_DIR -> cwd, so it reuses the 160-15
``project_dir`` fixture + ``_wire_active_agent`` helper.

Intentional GREEN regression guards (no-over-warning / missing-file-silent /
healthy-path) are documented as TEA Design Deviations per
``ac-as-green-regression-guard``.
"""

from __future__ import annotations

import ast
import os
import re
import shutil
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

from pf.frame.routes import data_proxy
from pf.frame.routes.data_proxy import _get_git_info, _get_repos_config
from pf.frame.ws_push import fetch_persona

# Invalid-but-decodable YAML (stray colon / bad indent): read_text() succeeds;
# yaml.safe_load() raises a ScannerError. Proven malformed in 160-4/160-12/160-15.
_MALFORMED_YAML = "repos:\n  alpha: 1\n  bad: : indent::\n"
# Latin-1 + stray BOM fragments: invalid UTF-8. read_text(encoding="utf-8")
# raises UnicodeDecodeError (a ValueError, NOT an OSError — the 160-4 lesson).
_UNDECODABLE_BYTES = b"repos:\n  alpha: caf\xe9 \xff\xfe\n"

# A read/parse-failure warning must surface the NATURE of the failure, not be an
# unrelated UserWarning. Used by the no-over-warning guards.
_READ_FAIL_PAT = r"(?i)(read|decod|pars|unreadable|malform|invalid|fail|yaml|repos)"


# ===========================================================================
# Fixtures / helpers
# ===========================================================================


@pytest.fixture
def project_dir(tmp_path, monkeypatch):
    """A tmp project root wired so the ws_push fetchers read from it (160-15)."""
    monkeypatch.setenv("FRAME_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
    return tmp_path


def _wire_active_agent(project_dir: Path, name: str = "reviewer") -> str:
    """Write an active-agent marker so fetch_persona resolves an agent name and
    reaches the load_persona call + inner portrait resolver (160-15)."""
    agents = project_dir / ".session" / "agents"
    agents.mkdir(parents=True, exist_ok=True)
    (agents / name).write_text(name, encoding="utf-8")
    return name


def _read_text_calls_in_func(module_file: str, func_name: str) -> list[ast.Call]:
    """All ``*.read_text(...)`` Call nodes inside the named top-level function.

    Fix-agnostic source scan for the encoding AC: locates every ``read_text``
    call lexically within ``func_name`` regardless of how Dev restructures the
    surrounding try/except.
    """
    tree = ast.parse(Path(module_file).read_text(encoding="utf-8"))
    func = next(
        n
        for n in ast.walk(tree)
        if isinstance(n, ast.FunctionDef) and n.name == func_name
    )
    return [
        node
        for node in ast.walk(func)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "read_text"
    ]


def _fake_git_run(counts_stdout: str):
    """Build a subprocess.run fake: rev-parse -> a branch, status -> clean,
    every rev-list --count -> ``counts_stdout``. The command is
    ``[git_bin, "--no-optional-locks", *args]``."""

    def _run(cmd, **_kwargs):
        joined = " ".join(cmd)
        if "rev-parse" in joined:
            return SimpleNamespace(returncode=0, stdout="feature/x\n", stderr="")
        if "status" in joined and "--porcelain" in joined:
            return SimpleNamespace(returncode=0, stdout="", stderr="")
        if "rev-list" in joined:
            return SimpleNamespace(returncode=0, stdout=counts_stdout, stderr="")
        return SimpleNamespace(returncode=0, stdout="", stderr="")

    return _run


# ===========================================================================
# Bucket A — data_proxy._get_git_info: rev-list int-parse failure must surface
# (the "subprocess int-parse silent->None" swallow, data_proxy.py:~187, AC-1)
# ===========================================================================


def test_git_info_bad_count_warns_not_silent(tmp_path, monkeypatch):
    """A non-numeric ``rev-list --count`` (int() raises) must WARN, not vanish.

    RED: today ``data_proxy.py:~187`` ``except Exception: return None`` swallows
    the ``int()`` ValueError; the repo silently collapses to None and renders as
    ``branch="unknown", clean=True`` in ``get_git_all`` with zero diagnostics.
    """
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr(shutil, "which", lambda _bin: "/usr/bin/git")
    monkeypatch.setattr(subprocess, "run", _fake_git_run("not-a-number\n"))

    with pytest.warns(UserWarning, match=r"(?i)(git|count|int|number|pars|literal|rev-list)"):
        result = _get_git_info(str(tmp_path))  # must NOT raise

    # Fix-agnostic graceful degrade: either the unchanged None, or a well-formed
    # dict whose branch survived. NOT a half-built dict missing "branch" (which
    # would KeyError downstream in get_git_all).
    assert result is None or (isinstance(result, dict) and result.get("branch") == "feature/x")


def test_git_info_healthy_counts_no_warning(tmp_path, monkeypatch, recwarn):
    """A healthy repo (numeric counts) yields real data and emits no warning.

    GREEN regression guard (no over-warning): the fix must stay silent when the
    counts parse cleanly. Green-on-arrival — TEA Design Deviation.
    """
    (tmp_path / ".git").mkdir()
    monkeypatch.setattr(shutil, "which", lambda _bin: "/usr/bin/git")
    monkeypatch.setattr(subprocess, "run", _fake_git_run("0\n"))

    result = _get_git_info(str(tmp_path))

    assert result is not None
    assert result["branch"] == "feature/x"
    assert result["ahead"] == 0 and result["behind"] == 0
    offenders = [
        str(w.message)
        for w in recwarn.list
        if re.search(r"(?i)(git|count|int|number|pars)", str(w.message))
    ]
    assert not offenders, f"healthy git info emitted spurious warning(s): {offenders!r}"


# ===========================================================================
# Bucket B — data_proxy._get_repos_config: present-but-broken repos.yaml surface
# (the "repos.yaml parse swallow", data_proxy.py:~211 + missing encoding, AC-2)
# ===========================================================================


def test_repos_config_malformed_yaml_warns_and_falls_back(tmp_path):
    """A present-but-malformed repos.yaml must WARN (naming the file) then fall
    back to the single-repo default — not vanish silently.

    RED: today ``data_proxy.py:~211`` ``except Exception: pass`` swallows the
    ScannerError; the panel silently shows one ``path: "."`` repo.
    """
    repos = tmp_path / ".pennyfarthing" / "repos.yaml"
    repos.parent.mkdir(parents=True)
    repos.write_text(_MALFORMED_YAML, encoding="utf-8")  # decodes; safe_load raises

    with pytest.warns(UserWarning, match=r"(?i)repos"):
        result = _get_repos_config(str(tmp_path))  # must NOT raise

    assert result == [{"name": tmp_path.name, "path": "."}]


def test_repos_config_undecodable_bytes_warns_and_falls_back(tmp_path):
    """A present-but-non-UTF-8 repos.yaml must WARN then fall back — not vanish.

    RED: ``read_text()`` lacks ``encoding=`` (CWE-838); the UnicodeDecodeError it
    raises (a ValueError, escaping a hypothetical OSError-only catch) is swallowed
    by the broad ``except Exception: pass``. Drives BOTH the encoding= fix and the
    warn.
    """
    repos = tmp_path / ".pennyfarthing" / "repos.yaml"
    repos.parent.mkdir(parents=True)
    repos.write_bytes(_UNDECODABLE_BYTES)

    with pytest.warns(UserWarning, match=r"(?i)repos"):
        result = _get_repos_config(str(tmp_path))  # must NOT raise UnicodeDecodeError

    assert result == [{"name": tmp_path.name, "path": "."}]


@pytest.mark.skipif(
    hasattr(os, "geteuid") and os.geteuid() == 0,
    reason="root bypasses file permission checks",
)
def test_repos_config_permission_denied_warns_and_falls_back(tmp_path):
    """A present-but-unreadable repos.yaml (chmod 000) must WARN then fall back.

    RED: the PermissionError is swallowed by ``except Exception: pass``. Perms are
    restored in ``finally`` so tmp cleanup succeeds.
    """
    repos = tmp_path / ".pennyfarthing" / "repos.yaml"
    repos.parent.mkdir(parents=True)
    repos.write_text("repos:\n  alpha:\n    path: .\n", encoding="utf-8")
    repos.chmod(0o000)
    try:
        with pytest.warns(UserWarning, match=r"(?i)repos"):
            result = _get_repos_config(str(tmp_path))  # must NOT raise
        assert result == [{"name": tmp_path.name, "path": "."}]
    finally:
        repos.chmod(0o644)


def test_repos_config_read_text_has_utf8_encoding():
    """``_get_repos_config``'s read_text must pass ``encoding="utf-8"`` (CWE-838,
    lang-review #5). Fix-agnostic source scan.

    RED: ``data_proxy.py:202`` is ``yaml.safe_load(p.read_text())`` — no encoding.
    """
    calls = _read_text_calls_in_func(data_proxy.__file__, "_get_repos_config")
    assert calls, "expected a read_text call inside _get_repos_config"
    for call in calls:
        kwargs = {kw.arg: kw.value for kw in call.keywords}
        assert "encoding" in kwargs, "read_text missing encoding= (CWE-838, lang-review #5)"
        val = kwargs["encoding"]
        if isinstance(val, ast.Constant):
            assert val.value == "utf-8", f"encoding must be utf-8, got {val.value!r}"


def test_repos_config_valid_returns_topology_no_warning(tmp_path, recwarn):
    """A valid multi-repo repos.yaml yields the real topology and no warning.

    GREEN regression guard (no over-warning): green-on-arrival — TEA Design
    Deviation.
    """
    repos = tmp_path / ".pennyfarthing" / "repos.yaml"
    repos.parent.mkdir(parents=True)
    repos.write_text(
        "repos:\n  alpha:\n    path: .\n  beta:\n    path: beta\n",
        encoding="utf-8",
    )

    result = _get_repos_config(str(tmp_path))

    assert {r["name"] for r in result} == {"alpha", "beta"}
    assert {r["path"] for r in result} == {".", "beta"}
    offenders = [str(w.message) for w in recwarn.list if re.search(_READ_FAIL_PAT, str(w.message))]
    assert not offenders, f"valid repos.yaml emitted spurious warning(s): {offenders!r}"


def test_repos_config_missing_file_stays_silent(tmp_path, recwarn):
    """No repos.yaml present → silent single-repo fallback, NO warning.

    GREEN regression guard: the fix must warn only on PRESENT-but-broken files,
    never on the (common) absent-config case which the ``is_file()`` gate skips.
    Green-on-arrival — TEA Design Deviation.
    """
    result = _get_repos_config(str(tmp_path))

    assert result == [{"name": tmp_path.name, "path": "."}]
    offenders = [str(w.message) for w in recwarn.list if re.search(_READ_FAIL_PAT, str(w.message))]
    assert not offenders, f"missing repos.yaml emitted a warning: {offenders!r}"


# ===========================================================================
# Bucket C — ws_push.fetch_persona inner portrait resolver must surface
# (the "inner except Exception: pass" swallow, ws_push.py:~497, AC-3)
# ===========================================================================


def _fake_persona():
    """A loadable persona namespace exposing the attrs fetch_persona reads."""
    return SimpleNamespace(
        character="Captain Darling",
        style="suspicious chancellor",
        quote="A loyal servant is simply a traitor who has not yet been tempted.",
        motto="",
        trait="paranoid",
    )


def test_persona_portrait_resolver_failure_warns_but_keeps_persona(project_dir, monkeypatch):
    """A raising ``resolve_portrait_path`` must WARN yet STILL return the full
    persona dict with ``portraitPath=None`` — not vanish, and not blank the panel.

    RED: today ``ws_push.py:~497`` inner ``except Exception: pass`` swallows the
    error silently. The inner try MUST stay — if Dev removes it, the exception
    reaches the OUTER catch-all which returns ``{}`` and blanks the whole persona
    panel (this test's character/role asserts would then fail), so this pins the
    warn-in-place fix.
    """
    import pf.prime.persona as persona_mod
    import pf.tui.portrait_resolver as pr_mod

    _wire_active_agent(project_dir, "reviewer")
    monkeypatch.setattr(persona_mod, "load_persona", lambda *_a, **_k: (_fake_persona(), "blackadder"))

    def _boom(*_a, **_k):
        raise RuntimeError("portrait resolver exploded")

    monkeypatch.setattr(pr_mod, "resolve_portrait_path", _boom)

    with pytest.warns(UserWarning, match=r"(?i)(portrait|resolv|persona|reviewer)"):
        result = fetch_persona()  # must NOT raise

    assert result != {}, "portrait failure must NOT blank the persona panel"
    assert result["character"] == "Captain Darling"
    assert result["role"] == "reviewer"
    assert result["portraitPath"] is None


def test_persona_portrait_resolved_sets_path_no_warning(project_dir, monkeypatch, recwarn):
    """A healthy resolver yields ``portraitPath`` set and emits no warning.

    GREEN regression guard (no over-warning): green-on-arrival — TEA Design
    Deviation.
    """
    import pf.prime.persona as persona_mod
    import pf.tui.portrait_resolver as pr_mod

    _wire_active_agent(project_dir, "reviewer")
    monkeypatch.setattr(persona_mod, "load_persona", lambda *_a, **_k: (_fake_persona(), "blackadder"))
    monkeypatch.setattr(
        pr_mod, "resolve_portrait_path", lambda *_a, **_k: Path("/tmp/portrait.png")
    )

    result = fetch_persona()

    assert result["portraitPath"] == "/tmp/portrait.png"
    offenders = [
        str(w.message) for w in recwarn.list if re.search(r"(?i)(portrait|resolv)", str(w.message))
    ]
    assert not offenders, f"healthy portrait resolve emitted spurious warning(s): {offenders!r}"


def test_persona_no_portrait_found_no_warning(project_dir, monkeypatch, recwarn):
    """A resolver that finds NO portrait (returns None) is a NORMAL state:
    ``portraitPath=None`` WITHOUT a warning.

    GREEN regression guard: the inner fix must warn only on an EXCEPTION, never on
    the common 'no portrait for this agent yet' return-None case. Green-on-arrival
    — TEA Design Deviation.
    """
    import pf.prime.persona as persona_mod
    import pf.tui.portrait_resolver as pr_mod

    _wire_active_agent(project_dir, "reviewer")
    monkeypatch.setattr(persona_mod, "load_persona", lambda *_a, **_k: (_fake_persona(), "blackadder"))
    monkeypatch.setattr(pr_mod, "resolve_portrait_path", lambda *_a, **_k: None)

    result = fetch_persona()

    assert result["portraitPath"] is None
    offenders = [
        str(w.message) for w in recwarn.list if re.search(r"(?i)(portrait|resolv)", str(w.message))
    ]
    assert not offenders, f"no-portrait-found state emitted a warning: {offenders!r}"
