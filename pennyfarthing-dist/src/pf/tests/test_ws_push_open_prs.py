"""Open-PR enrichment for the git channel — gh-backed, TTL-cached."""
import json
import subprocess

import pf.frame.ws_push as ws_push


def _fake_run(payload):
    def run(cmd, **kwargs):
        class R:
            returncode = 0
            stdout = json.dumps(payload)
            stderr = ""
        return R()
    return run


def setup_function(_fn):
    # Each test starts with a cold cache.
    ws_push._open_pr_cache.clear()


def test_returns_parsed_prs(monkeypatch, tmp_path):
    monkeypatch.setattr(ws_push.shutil, "which", lambda name: "/usr/bin/gh")
    monkeypatch.setattr(
        ws_push.subprocess, "run",
        _fake_run([{"number": 7, "title": "feat: x", "isDraft": False}]),
    )
    prs = ws_push._get_open_prs(str(tmp_path))
    assert prs == [{"number": 7, "title": "feat: x", "isDraft": False}]


def test_empty_when_gh_missing(monkeypatch, tmp_path):
    monkeypatch.setattr(ws_push.shutil, "which", lambda name: None)
    assert ws_push._get_open_prs(str(tmp_path)) == []


def test_empty_on_subprocess_failure(monkeypatch, tmp_path):
    monkeypatch.setattr(ws_push.shutil, "which", lambda name: "/usr/bin/gh")

    def boom(cmd, **kwargs):
        raise subprocess.TimeoutExpired(cmd, 5)

    monkeypatch.setattr(ws_push.subprocess, "run", boom)
    assert ws_push._get_open_prs(str(tmp_path)) == []


def test_cache_prevents_repeat_calls_within_ttl(monkeypatch, tmp_path):
    calls = []
    monkeypatch.setattr(ws_push.shutil, "which", lambda name: "/usr/bin/gh")

    def counting_run(cmd, **kwargs):
        calls.append(cmd)
        class R:
            returncode = 0
            stdout = "[]"
            stderr = ""
        return R()

    monkeypatch.setattr(ws_push.subprocess, "run", counting_run)
    ws_push._get_open_prs(str(tmp_path))
    ws_push._get_open_prs(str(tmp_path))
    assert len(calls) == 1
