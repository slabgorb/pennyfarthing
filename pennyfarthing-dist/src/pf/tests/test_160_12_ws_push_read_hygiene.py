"""RED tests for story 160-12 — ws_push read-hygiene sweep (p1, gh #50 fail-loud).

Follow-up to 160-4 (gh #50). 160-4 hardened ONE read site in
``pf/frame/ws_push.py`` — the nested ``_load_file`` epic-shard loader — giving
it explicit ``encoding="utf-8"`` and ``warnings.warn`` surfacing for the full
read/parse taxonomy. The rest of the module still has the original anti-pattern:
``yaml.safe_load(path.read_text())`` wrapped in a blanket ``except Exception:
continue/pass/return`` with **no encoding** and **no diagnostic** — a
present-but-broken file vanishes silently (a fail-loud violation, gh #50).

The remaining sites, by the buckets named in the story:

* **archive loop** (``fetch_sprint``):
  - L275 ``archive_path.read_text()``   — ``sprint-*-completed.yaml`` index
  - L291 ``shard_path.read_text()``     — archived ``epic-<ref>.yaml`` shard
* **persona fetcher** (``fetch_persona``):
  - L408 ``f.read_text()``              — active agent file (plain text)
* **benchmark fetcher** (``fetch_benchmark_history``):
  - L483 ``chosen.read_text()``         — ``majority_vote.yaml`` / ``score.yaml``
  - L508/526 ``pipeline_file.read_text()`` — ``pipeline.yaml``
  - L551 ``narrative_file.read_text()`` — ``narrative.md``

(The module's main sprint read at L171 is the same anti-pattern and is swept by
the AC1 encoding scan below — see the TEA Design Deviation note.)

DESIGNED INTERFACE (for Dev / GREEN) — mirror 160-4's adjacent prior art
(``_load_file`` and ``shard_merge.py`` both use ``warnings.warn``):

1. **AC1 — encoding.** Every ``read_text()`` call in ws_push.py specifies
   ``encoding="utf-8"`` (no reliance on the platform's preferred encoding).

2. **AC2/3/4 — fail-loud, don't crash.** When a file is PRESENT but
   unreadable/undecodable/unparseable, the fetcher emits a ``warnings.warn``
   that NAMES the offending file, then degrades gracefully (returns its normal
   payload shape; the broken item is skipped, siblings survive). It must NOT
   raise — these run inside the long-lived Frame poll loop whose outer
   ``except Exception: pass`` would otherwise blank the panel with zero
   diagnostics (strictly worse than a warning).

   The taxonomy MUST be covered (160-4 was REJECTED in round 1 for missing the
   decode case): ``UnicodeDecodeError`` is a ``ValueError`` — it ESCAPES a
   narrowed ``except OSError`` — so an undecodable file is the critical case.

3. **AC5 — no over-warning.** A genuinely absent file (the common case) stays
   SILENT, and an all-healthy input set emits no read-failure warning.

fetch_sprint / fetch_persona / fetch_benchmark_history take NO args; each
resolves the project dir via FRAME_PROJECT_DIR -> PF_PROJECT_DIR -> cwd. The
``project_dir`` fixture points that env var at a tmp tree and clears
PF_PROJECT_DIR so each fetch is isolated.
"""

from __future__ import annotations

import ast
import os
import re
from pathlib import Path

import pytest
import yaml

import pf.frame.ws_push as ws_push_mod
from pf.frame.ws_push import (
    fetch_benchmark_history,
    fetch_persona,
    fetch_sprint,
)

# Invalid-but-decodable YAML (stray colons / bad indent) — proven malformed in
# 160-4. read_text() succeeds; yaml.safe_load() raises.
_MALFORMED_YAML = "id: 1\ntitle: broken\n  bad: : indent::\n"
# Latin-1 + stray BOM fragments: structurally fine bytes, invalid UTF-8.
# read_text(encoding="utf-8") raises UnicodeDecodeError (a ValueError).
_UNDECODABLE_BYTES = b"id: 1\ntitle: caf\xe9 broken \xff\xfe\n"

# A read-failure warning must surface the *nature* of the failure, not just be
# any UserWarning. Used to reject a fix that warns about the wrong thing.
_READ_FAIL_PAT = r"(?i)(read|decod|pars|unreadable|malform|invalid|fail|yaml)"


def _write_yaml(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(yaml.safe_dump(data, sort_keys=False), encoding="utf-8")


@pytest.fixture
def project_dir(tmp_path, monkeypatch):
    """A tmp project root wired so the ws_push fetchers read from it."""
    monkeypatch.setenv("FRAME_PROJECT_DIR", str(tmp_path))
    monkeypatch.delenv("PF_PROJECT_DIR", raising=False)
    return tmp_path


SPRINT_HEADER = {
    "name": "Test Sprint",
    "goal": "exercise ws_push read hygiene",
    "status": "active",
    "number": 9001,
}


def _valid_main_sprint(project_dir: Path, epics=None) -> None:
    """Write a well-formed current-sprint.yaml so fetch_sprint's pre-archive
    reads (main sprint + epic shards) emit no spurious warnings."""
    _write_yaml(
        project_dir / "sprint" / "current-sprint.yaml",
        {"sprint": SPRINT_HEADER, "epics": epics or [], "stories": []},
    )


def _run_dir(project_dir: Path, scenario="scen-a", theme="control", run="run-1") -> Path:
    """Create internal/results/pipeline-replay/<scenario>/<theme>/<run-N>/."""
    d = project_dir / "internal" / "results" / "pipeline-replay" / scenario / theme / run
    d.mkdir(parents=True, exist_ok=True)
    return d


# ===========================================================================
# AC1 — every read_text() in ws_push.py specifies encoding="utf-8"
# ===========================================================================


def test_ac1_all_read_text_calls_specify_utf8_encoding():
    """Source-scan: no ``read_text()`` may rely on the platform encoding.

    Fix-agnostic enforcement across ALL sites at once (archive, persona,
    benchmark, AND the main sprint read). RED today: 8 of 9 read_text calls
    omit ``encoding=`` — only the 160-4 ``_load_file`` site has it.
    """
    source = Path(ws_push_mod.__file__).read_text(encoding="utf-8")
    tree = ast.parse(source)

    offenders: list[str] = []
    for node in ast.walk(tree):
        if (
            isinstance(node, ast.Call)
            and isinstance(node.func, ast.Attribute)
            and node.func.attr == "read_text"
        ):
            enc = next((kw for kw in node.keywords if kw.arg == "encoding"), None)
            if enc is None:
                offenders.append(f"L{node.lineno}: missing encoding=")
            elif isinstance(enc.value, ast.Constant) and enc.value.value != "utf-8":
                offenders.append(f"L{node.lineno}: encoding={enc.value.value!r}")

    assert not offenders, (
        "read_text() calls lacking explicit encoding=\"utf-8\" in ws_push.py:\n  "
        + "\n  ".join(offenders)
    )


# ===========================================================================
# AC2 — archive loop (fetch_sprint): present-but-broken archive files surface
# ===========================================================================


def test_ac2_malformed_archive_index_warns_and_survives(project_dir):
    """A present-but-unparseable ``sprint-*-completed.yaml`` must warn, not drop.

    RED: today L275 ``except Exception: continue`` swallows the parse error —
    zero diagnostics, archive contents silently absent.
    """
    _valid_main_sprint(project_dir)
    archive = project_dir / "sprint" / "archive"
    archive.mkdir(parents=True, exist_ok=True)
    (archive / "sprint-9001-completed.yaml").write_text(_MALFORMED_YAML, encoding="utf-8")

    with pytest.warns(UserWarning, match=r"sprint-9001-completed"):
        result = fetch_sprint()  # must NOT raise

    assert result["type"] == "init"
    assert isinstance(result["epics"], list)


def test_ac2_malformed_archived_epic_shard_warns(project_dir):
    """A present-but-unparseable archived ``epic-<ref>.yaml`` shard must warn.

    RED: today L291 ``except Exception: continue`` drops the shard silently.
    """
    _valid_main_sprint(project_dir)
    archive = project_dir / "sprint" / "archive"
    _write_yaml(
        archive / "sprint-9001-completed.yaml",
        {"sprint": {"number": 9001}, "completed_epics": ["77"]},
    )
    (archive / "epic-77.yaml").write_text(_MALFORMED_YAML, encoding="utf-8")

    with pytest.warns(UserWarning, match=r"epic-77"):
        result = fetch_sprint()  # must NOT raise

    assert result["type"] == "init"


def test_ac2_undecodable_archived_epic_shard_warns(project_dir):
    """A present-but-non-UTF-8 archived shard must warn and survive — NOT raise.

    CRITICAL taxonomy case (the 160-4 round-1 rejection): once Dev adds
    ``encoding="utf-8"`` the read raises ``UnicodeDecodeError`` (a ValueError,
    NOT an OSError); a narrowed ``except OSError`` would let it escape and crash
    the whole fetch. It must route into the same warning branch as a parse error.
    """
    _valid_main_sprint(project_dir)
    archive = project_dir / "sprint" / "archive"
    _write_yaml(
        archive / "sprint-9001-completed.yaml",
        {"sprint": {"number": 9001}, "completed_epics": ["77"]},
    )
    (archive / "epic-77.yaml").write_bytes(_UNDECODABLE_BYTES)

    with pytest.warns(UserWarning, match=r"epic-77"):
        result = fetch_sprint()  # must NOT raise UnicodeDecodeError

    assert result["type"] == "init"


def test_ac2_missing_archived_shard_stays_silent(project_dir, recwarn):
    """An archive index that references an ABSENT shard stays silent.

    Regression guard (AC5 for the archive loop): the ``is_file()`` gate means a
    missing shard is normal — the fix must NOT start warning about it.
    """
    _valid_main_sprint(project_dir)
    _write_yaml(
        project_dir / "sprint" / "archive" / "sprint-9001-completed.yaml",
        {"sprint": {"number": 9001}, "completed_epics": ["404"]},
    )
    # No archive/epic-404.yaml written.

    result = fetch_sprint()

    assert result["type"] == "init"
    offenders = [str(w.message) for w in recwarn.list if re.search(r"epic-404", str(w.message))]
    assert not offenders, f"missing archived shard wrongly warned: {offenders!r}"


# ===========================================================================
# AC3 — persona fetcher (fetch_persona): present-but-broken agent file surfaces
# ===========================================================================


def test_ac3_undecodable_agent_file_warns_and_degrades(project_dir):
    """A present-but-non-UTF-8 active-agent file must warn, then degrade to {}.

    CRITICAL taxonomy case: L408 ``f.read_text()`` raises ``UnicodeDecodeError``
    which today is swallowed by ``fetch_persona``'s outer ``except Exception:
    return {}`` — the panel goes blank with no clue why.
    """
    agents = project_dir / ".session" / "agents"
    agents.mkdir(parents=True)
    (agents / "reviewer").write_bytes(_UNDECODABLE_BYTES)

    with pytest.warns(UserWarning, match=r"reviewer"):
        result = fetch_persona()  # must NOT raise

    assert result == {}


@pytest.mark.skipif(os.geteuid() == 0, reason="chmod 000 is ineffective as root")
def test_ac3_unreadable_agent_file_warns(project_dir):
    """A present-but-permission-denied active-agent file must warn, not vanish.

    OSError taxonomy: ``exists()``/``is_file()`` are True so a 'not found'
    explanation would mislead — the read failure itself must surface.
    """
    agents = project_dir / ".session" / "agents"
    agents.mkdir(parents=True)
    f = agents / "reviewer"
    f.write_text("reviewer", encoding="utf-8")
    f.chmod(0o000)

    try:
        with pytest.warns(UserWarning, match=r"reviewer"):
            result = fetch_persona()  # must NOT raise PermissionError
    finally:
        f.chmod(0o644)  # restore so tmp_path cleanup can remove it

    assert result == {}


def test_ac3_healthy_agent_file_emits_no_read_warning(project_dir, recwarn):
    """A readable agent file emits no read-failure warning (no over-warning)."""
    agents = project_dir / ".session" / "agents"
    agents.mkdir(parents=True)
    (agents / "reviewer").write_text("reviewer", encoding="utf-8")

    fetch_persona()  # may return {} if no theme resolves — that's fine

    offenders = [
        str(w.message)
        for w in recwarn.list
        if re.search(r"reviewer", str(w.message)) and re.search(_READ_FAIL_PAT, str(w.message))
    ]
    assert not offenders, f"healthy agent file emitted a read-failure warning: {offenders!r}"


# ===========================================================================
# AC4 — benchmark fetcher (fetch_benchmark_history): broken result files surface
# ===========================================================================


def test_ac4_malformed_score_yaml_warns_and_survives(project_dir):
    """A present-but-unparseable ``score.yaml`` must warn, not silently skip.

    RED: today L483 ``except Exception: continue`` drops the run with no clue.
    """
    rd = _run_dir(project_dir)
    (rd / "score.yaml").write_text(_MALFORMED_YAML, encoding="utf-8")

    with pytest.warns(UserWarning, match=r"score"):
        result = fetch_benchmark_history()  # must NOT raise

    assert result["type"] == "init"
    assert isinstance(result["runs"], list)


def test_ac4_undecodable_score_yaml_warns(project_dir):
    """A present-but-non-UTF-8 ``score.yaml`` must warn and survive — NOT raise.

    CRITICAL taxonomy case (UnicodeDecodeError escapes ``except OSError``).
    """
    rd = _run_dir(project_dir)
    (rd / "score.yaml").write_bytes(_UNDECODABLE_BYTES)

    with pytest.warns(UserWarning, match=r"score"):
        result = fetch_benchmark_history()  # must NOT raise UnicodeDecodeError

    assert result["type"] == "init"


def test_ac4_malformed_pipeline_yaml_warns(project_dir):
    """A valid run whose ``pipeline.yaml`` is unparseable must warn, not pass.

    RED: today L508 ``except Exception: pass`` swallows the parse error — the
    run renders with no date/tokens and no diagnostic.
    """
    rd = _run_dir(project_dir)
    _write_yaml(rd / "score.yaml", {"run_id": 1, "score_pct": 50})
    (rd / "pipeline.yaml").write_text(_MALFORMED_YAML, encoding="utf-8")

    with pytest.warns(UserWarning, match=r"pipeline"):
        result = fetch_benchmark_history()  # must NOT raise

    assert result["type"] == "init"


def test_ac4_undecodable_narrative_md_warns(project_dir):
    """A valid run whose ``narrative.md`` is non-UTF-8 must warn, not pass.

    RED: today L551 ``except Exception: pass`` swallows the decode error.
    """
    rd = _run_dir(project_dir)
    _write_yaml(rd / "score.yaml", {"run_id": 1, "score_pct": 50})
    (rd / "narrative.md").write_bytes(_UNDECODABLE_BYTES)

    with pytest.warns(UserWarning, match=r"narrative"):
        result = fetch_benchmark_history()  # must NOT raise

    assert result["type"] == "init"


def test_ac4_healthy_run_emits_no_read_warning(project_dir, recwarn):
    """A fully-healthy benchmark run emits no read-failure warning and renders.

    Regression guard (AC5): the fix must not over-warn on well-formed files.
    """
    rd = _run_dir(project_dir)
    _write_yaml(rd / "score.yaml", {"run_id": 1, "score_pct": 50, "total_caught": 1})
    _write_yaml(rd / "pipeline.yaml", {"completed_at": "2026-06-25", "phases": {}})
    (rd / "narrative.md").write_text("# narrative\n\nall good\n", encoding="utf-8")

    result = fetch_benchmark_history()

    assert [r["run_id"] for r in result["runs"]] == [1]
    offenders = [str(w.message) for w in recwarn.list if re.search(_READ_FAIL_PAT, str(w.message))]
    assert not offenders, f"healthy benchmark run emitted spurious warning(s): {offenders!r}"
