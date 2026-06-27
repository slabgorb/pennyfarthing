"""RED tests for story 160-18 — sanitize the Frame warnings sink before any
network exposure (p1).

Follow-up to the fail-loud sweep (160-4/12/15/16/17). Those stories made the
``pf/frame/routes/data_proxy.py`` swallow sites *fail loud* via ``warnings.warn``.
A 160-16 Reviewer finding then flagged that the warn messages themselves
interpolate raw material that is unsafe to expose to a network client:

* **_get_git_info** (``data_proxy.py:194``) —
  ``warnings.warn(f"Failed to parse git info for {repo_path}: {exc}")`` leaks BOTH
  a local filesystem path (``repo_path`` — typically ``/Users/<name>/...``) AND the
  raw exception text. (160-16)
* **_get_repos_config** (``data_proxy.py:225``) —
  ``warnings.warn(f"Failed to load repos config {p.name}: {exc}")`` leaks the raw
  exception text. (160-16)
* **get_theme_agents** (``data_proxy.py:338``) —
  ``warnings.warn(f"Failed to load theme agents: {exc}")`` leaks raw ``exc``. (160-17)
* **_get_identity** jira probe (``data_proxy.py:403``) and gh probe
  (``data_proxy.py:418``) — each ``warnings.warn(f"... probe: {exc}")`` leaks raw
  ``exc`` (a parser/tool exception whose ``str`` can carry arbitrary content). (160-17)

THREAT MODEL (why this matters even though it's low-severity today): Frame does
NOT currently forward Python warnings to any network client — verified: the only
``catch_warnings``/``showwarning`` in the package is in ``sprint/validator.py``,
unrelated. So the default sink is stderr. BUT the story is explicitly preventive —
"sanitize ... before any network exposure". Frame already ships an OTLP/WebSocket
surface; routing warnings onto it is one refactor away. A raw exception ``str``
can carry file-content fragments, absolute paths (with usernames), or tokens.

DESIGNED INTERFACE (for Dev / GREEN) — sanitize at the source, keep fail-loud:

  Introduce a tiny network-safe summariser and route every data_proxy warn
  through it. Suggested shape (name is Dev's call; the CONTRACT below is what the
  tests pin)::

      def _safe_exc(exc: Exception) -> str:
          # Network-safe: the exception TYPE name only — never str(exc), which
          # can carry file contents / paths / tokens. Story 160-18.
          return type(exc).__name__

  Then each warn keeps its SUBJECT + the TYPE name, and drops the raw payload:

  1. _get_git_info   — ``warnings.warn(f"Failed to parse git info ({_safe_exc(exc)})")``
     The ``repo_path`` must be DROPPED ENTIRELY (not truncated to a basename — even
     the repo dir name is user-meaningful). Degrade shape unchanged (``None`` or a
     well-formed dict with ``branch``).
  2. _get_repos_config — ``warnings.warn(f"Failed to load repos config {p.name} ({_safe_exc(exc)})")``
     ``p.name`` (a FIXED filename, always ``repos.yaml``) is NOT sensitive and may
     stay; only the raw ``exc`` is dropped. Single-repo fallback unchanged.
  3. get_theme_agents — ``warnings.warn(f"Failed to load theme agents ({_safe_exc(exc)})")``; ``{}`` unchanged.
  4. _get_identity (both probes) — ``warnings.warn(f"Failed to parse {tool} identity probe ({_safe_exc(exc)})")``;
     field stays ``None``, warn-IN-PLACE per probe (a broken jira must not stop gh).

  WHAT MUST NOT CHANGE (fail-loud regression guards, baked into every test below):
  the warning STILL fires (no regression to silence), STILL names its subject
  (git / repos / theme / jira / gh — so the diagnostic stays useful), and the
  degrade path is byte-for-byte the prior behaviour.

The CONTRACT each test pins (sanitisation delta only — healthy/no-warn paths are
already covered by ``test_160_16_fail_loud_3.py`` / ``test_160_17_fail_loud_4.py``
and are NOT re-tested here):
  * the warning message CONTAINS ``type(exc).__name__`` (diagnostic class kept),
  * the warning message DOES NOT contain the raw exception ``str`` (sentinel), and
  * (git only) DOES NOT contain the ``repo_path`` value.

Bucket E adds a fix-agnostic AST guard: NO ``warnings.warn`` in ``data_proxy.py``
may interpolate a bare exception variable or ``repo_path`` — catching any site the
behavioural buckets did not enumerate, and any future regression.
"""

from __future__ import annotations

import ast
import json
import os
import re
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest
import yaml

from pf.frame.routes import data_proxy
from pf.frame.routes.data_proxy import (
    _get_git_info,
    _get_identity,
    _get_repos_config,
    get_theme_agents,
)

# Sentinels chosen so they can NEVER appear incidentally in a sanitised message.
_SECRET = "SENSITIVE_SECRET_d41d8cd9"  # stand-in for str(exc) payload (paths/tokens/file bytes)
_SECRET_PATH_COMPONENT = "SENSITIVE_REPO_PATH_a1b2c3"  # a directory name in repo_path
_SECRET_GIT_COUNT = "SENSITIVE_COUNT_9f8e7d"  # non-numeric rev-list count → ValueError carrying it

# Subject patterns: a sanitised warning must STILL name its failure domain.
_GIT_SUBJECT = re.compile(r"(?i)git")
_REPOS_SUBJECT = re.compile(r"(?i)repos")
_THEME_SUBJECT = re.compile(r"(?i)(theme|crew|agent)")
_JIRA_SUBJECT = re.compile(r"(?i)(jira|identity)")
_GH_SUBJECT = re.compile(r"(?i)(gh|github|identity)")


# ===========================================================================
# Fixtures / helpers
# ===========================================================================


@pytest.fixture(autouse=True)
def _reset_identity_cache(monkeypatch):
    """``_get_identity`` memoises in module globals (5-min TTL). Clear it before
    every test so the jira/gh probes under test actually run."""
    monkeypatch.setattr(data_proxy, "_identity_cache", None)
    monkeypatch.setattr(data_proxy, "_identity_cache_time", 0.0)


def _raiser(exc: Exception):
    """A callable that ignores its args and raises ``exc`` — for seam patches."""

    def _raise(*_a, **_k):
        raise exc

    return _raise


def _fake_which(present: set[str]):
    """``shutil.which`` fake: a path only for tools in ``present``."""
    return lambda name: (f"/usr/bin/{name}" if name in present else None)


def _fake_popen(*, jira_out: str = "", gh_out: str = ""):
    """``os.popen`` fake routed by command substring (mirrors 160-17)."""

    def _popen(cmd, *_a, **_k):
        payload = jira_out if "jira" in cmd else gh_out if "gh" in cmd else ""
        return SimpleNamespace(read=lambda: payload)

    return _popen


def _fake_git_run(counts_stdout: str):
    """``subprocess.run`` fake: rev-parse→branch, status→clean, rev-list→counts
    (mirrors 160-16's ``_fake_git_run``)."""

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


def _assert_sanitised(message: str, *, type_name: str, forbidden: list[str], subject: re.Pattern):
    """The core sanitisation contract, shared by every behavioural bucket.

    * the exception TYPE name survives (diagnostic class kept),
    * none of the ``forbidden`` raw substrings (str(exc) / repo_path) appear, and
    * the warning STILL names its failure domain (fail-loud value preserved).
    """
    assert subject.search(message), (
        f"sanitised warning lost its subject — no {subject.pattern!r} match in {message!r}"
    )
    assert type_name in message, (
        f"sanitised warning must include the exception type {type_name!r} for diagnostics: {message!r}"
    )
    for secret in forbidden:
        assert secret not in message, (
            f"warning leaks raw material {secret!r} (must emit type name only): {message!r}"
        )


def _run_theme_agents():
    """Drive the async theme-agents route to completion (direct await)."""
    import asyncio

    return asyncio.run(get_theme_agents())


# ===========================================================================
# Bucket A — _get_git_info: drop repo_path AND raw exc (data_proxy.py:194)
# The crown-jewel leak: a filesystem path + raw exception text.
# ===========================================================================


def test_git_info_warning_drops_repo_path_and_raw_exc(tmp_path, monkeypatch):
    """A non-numeric rev-list count makes ``int()`` raise; the resulting warning
    must name git + the exception TYPE, but must NOT contain the repo path or the
    raw ``str(exc)``.

    RED: today ``data_proxy.py:194`` is
    ``warnings.warn(f"Failed to parse git info for {repo_path}: {exc}")`` — it
    leaks both the path (``SENSITIVE_REPO_PATH_*``) and the raw ValueError text
    (``... 'SENSITIVE_COUNT_*'``), and it never contains the bare type name.
    """
    import subprocess

    repo = tmp_path / _SECRET_PATH_COMPONENT
    (repo / ".git").mkdir(parents=True)
    monkeypatch.setattr(shutil, "which", lambda _bin: "/usr/bin/git")
    # subprocess is imported lazily inside _get_git_info; patching the real module
    # is sufficient (mirrors 160-16's _fake_git_run seam).
    monkeypatch.setattr(subprocess, "run", _fake_git_run(f"{_SECRET_GIT_COUNT}\n"))

    with pytest.warns(UserWarning) as caught:
        result = _get_git_info(str(repo))  # must NOT raise

    msg = "\n".join(str(w.message) for w in caught.list)
    _assert_sanitised(
        msg,
        type_name="ValueError",
        forbidden=[_SECRET_PATH_COMPONENT, str(repo), _SECRET_GIT_COUNT],
        subject=_GIT_SUBJECT,
    )
    # Degrade unchanged: None, or a well-formed dict that still carries branch.
    assert result is None or (isinstance(result, dict) and "branch" in result)


# ===========================================================================
# Bucket B — _get_repos_config: drop raw exc, keep the fixed filename (L225)
# ===========================================================================


def test_repos_config_warning_drops_raw_exc(tmp_path, monkeypatch):
    """A present-but-broken repos.yaml must WARN with the type name, not the raw
    exception payload. The fixed filename (``repos.yaml``) may stay.

    RED: today ``data_proxy.py:225`` is
    ``warnings.warn(f"Failed to load repos config {p.name}: {exc}")`` — it
    interpolates the raw ``exc`` (here carrying ``SENSITIVE_SECRET_*``).
    """
    repos = tmp_path / ".pennyfarthing" / "repos.yaml"
    repos.parent.mkdir(parents=True)
    repos.write_text("repos:\n  alpha:\n    path: .\n", encoding="utf-8")
    # Force a controlled exception whose str carries the sentinel. ``import yaml``
    # inside the function resolves to this same module object.
    monkeypatch.setattr(yaml, "safe_load", _raiser(ValueError(_SECRET)))

    with pytest.warns(UserWarning) as caught:
        result = _get_repos_config(str(tmp_path))  # must NOT raise

    msg = "\n".join(str(w.message) for w in caught.list)
    _assert_sanitised(msg, type_name="ValueError", forbidden=[_SECRET], subject=_REPOS_SUBJECT)
    assert result == [{"name": tmp_path.name, "path": "."}]


# ===========================================================================
# Bucket C — get_theme_agents: drop raw exc (data_proxy.py:338)
# ===========================================================================


def test_theme_agents_warning_drops_raw_exc(monkeypatch):
    """A raising ``get_crew_manifest`` must WARN with the type name, not the raw
    exception text, then still return ``{}``.

    RED: today ``data_proxy.py:338`` is
    ``warnings.warn(f"Failed to load theme agents: {exc}")``.
    """
    monkeypatch.setattr(data_proxy, "get_crew_manifest", _raiser(RuntimeError(_SECRET)))

    with pytest.warns(UserWarning) as caught:
        response = _run_theme_agents()  # must NOT raise

    msg = "\n".join(str(w.message) for w in caught.list)
    _assert_sanitised(msg, type_name="RuntimeError", forbidden=[_SECRET], subject=_THEME_SUBJECT)
    assert json.loads(response.body) == {}


# ===========================================================================
# Bucket D — _get_identity probes: drop raw exc (jira L403, gh L418)
# ===========================================================================


def test_identity_jira_probe_warning_drops_raw_exc(monkeypatch):
    """A present-but-broken jira probe must WARN with the type name, not the raw
    parser exception, then degrade (``jiraEmail=None``).

    RED: today ``data_proxy.py:403`` is
    ``warnings.warn(f"Failed to parse jira identity probe: {exc}")``.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"jira"}))
    monkeypatch.setattr(os, "popen", _fake_popen(jira_out="<<not json>>"))
    # ``import json as _json`` inside the function resolves to this module object.
    monkeypatch.setattr(json, "loads", _raiser(ValueError(_SECRET)))

    with pytest.warns(UserWarning) as caught:
        result = _get_identity()  # must NOT raise

    msg = "\n".join(str(w.message) for w in caught.list)
    _assert_sanitised(msg, type_name="ValueError", forbidden=[_SECRET], subject=_JIRA_SUBJECT)
    assert result["jiraEmail"] is None


def test_identity_gh_probe_warning_drops_raw_exc(monkeypatch):
    """A present-but-broken gh probe must WARN with the type name, not the raw
    parser exception, then degrade (``githubUsername=None``).

    RED: today ``data_proxy.py:418`` is
    ``warnings.warn(f"Failed to parse gh identity probe: {exc}")``.
    """
    monkeypatch.setattr(shutil, "which", _fake_which({"gh"}))
    monkeypatch.setattr(os, "popen", _fake_popen(gh_out="<<not json>>"))
    monkeypatch.setattr(json, "loads", _raiser(ValueError(_SECRET)))

    with pytest.warns(UserWarning) as caught:
        result = _get_identity()  # must NOT raise

    msg = "\n".join(str(w.message) for w in caught.list)
    _assert_sanitised(msg, type_name="ValueError", forbidden=[_SECRET], subject=_GH_SUBJECT)
    assert result["githubUsername"] is None
    assert result["avatarUrl"] is None


# ===========================================================================
# Bucket E — fix-agnostic AST guard: NO data_proxy warnings.warn may interpolate
# a bare exception variable or repo_path. Catches un-enumerated sites + future
# regressions; passes once each leak is wrapped (``_safe_exc(exc)`` /
# ``type(exc).__name__``) since those are Call/Attribute nodes, not bare Names.
# ===========================================================================

# Expressions that leak raw material when interpolated directly into a warning.
_RAW_LEAK_EXPRS = frozenset(
    {
        "exc",
        "e",
        "err",
        "error",
        "str(exc)",
        "str(e)",
        "repr(exc)",
        "repr(e)",
        "repo_path",
        "str(repo_path)",
    }
)


def _warnings_warn_calls(module_file: str) -> list[ast.Call]:
    """Every ``warnings.warn(...)`` Call node in the module (AST, fix-agnostic)."""
    tree = ast.parse(Path(module_file).read_text(encoding="utf-8"))
    return [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "warn"
        and isinstance(node.func.value, ast.Name)
        and node.func.value.id == "warnings"
    ]


def test_no_data_proxy_warning_interpolates_raw_exc_or_path():
    """No ``warnings.warn`` in ``data_proxy.py`` may f-string-interpolate a bare
    exception object/alias or ``repo_path``.

    RED: lines 194/225/338/403/418 each interpolate ``{exc}`` (and 194 also
    ``{repo_path}``). GREEN once they route through a sanitiser, because
    ``_safe_exc(exc)`` / ``type(exc).__name__`` are Call/Attribute expressions,
    not the bare Names this guard flags. A fixed filename like ``{p.name}`` is
    never flagged.
    """
    offenders: list[tuple[int, str]] = []
    for call in _warnings_warn_calls(data_proxy.__file__):
        if not call.args:
            continue
        first = call.args[0]
        parts = first.values if isinstance(first, ast.JoinedStr) else [first]
        for part in parts:
            if isinstance(part, ast.FormattedValue):
                expr = ast.unparse(part.value).strip()
                if expr in _RAW_LEAK_EXPRS:
                    offenders.append((getattr(call, "lineno", -1), expr))

    assert not offenders, (
        "data_proxy.py warnings.warn calls interpolate raw exception/path material "
        f"(sanitise via type(exc).__name__): {offenders!r}"
    )
