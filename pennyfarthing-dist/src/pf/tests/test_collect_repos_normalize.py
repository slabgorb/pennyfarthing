"""Tests for _collect_repos / _normalize_repos string vs list handling."""

from pf.core.resolver import _collect_repos, _normalize_repos


def test_normalize_repos_string_single():
    assert _normalize_repos("joust") == ["joust"]


def test_normalize_repos_string_csv():
    assert _normalize_repos("alpha, beta") == ["alpha", "beta"]


def test_normalize_repos_list_passthrough():
    assert _normalize_repos(["a", "b"]) == ["a", "b"]


def test_collect_repos_string_field_not_characters():
    sprint = {"epics": [{"repos": "pennyfarthing"}]}
    assert _collect_repos(sprint) == ["pennyfarthing"]


def test_collect_repos_list_dedupes():
    sprint = {"epics": [{"repos": ["a", "b"]}, {"repos": "a, c"}]}
    assert _collect_repos(sprint) == ["a", "b", "c"]
