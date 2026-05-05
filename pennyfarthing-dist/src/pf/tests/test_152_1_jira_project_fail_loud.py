"""Story 152-1: Fail-loud tests for the Jira project key resolution.

Current behavior (the bug):
    pf.jira.client._resolve_jira_config() silently returns ("", "") when no
    project key is configured and no JIRA_PROJECT env var is set.
    Downstream payload builders (build_epic_payload, create_story_in_jira)
    emit {"project": {"key": ""}} which the Jira API may reject silently or
    create an issue under the user's default project.

Required behavior (this test):
    Any operation that needs the Jira project key must fail loudly when the
    key is unset, with a clear message pointing the user at config or env.

These tests pin the *observable* contract — Dev may implement via a
require_jira_project() helper, by raising in _resolve_jira_config(), or by
guarding the payload builders directly.

Author: Igor (TEA), Story 152-1.
"""

from __future__ import annotations

import re

import pytest


def _empty_project_error_pattern() -> re.Pattern[str]:
    """Match any clear error message telling the user the project key is unset."""
    return re.compile(
        r"(jira[._\s-]?project|JIRA_PROJECT|project[._\s-]?key|jira\.project)",
        re.IGNORECASE,
    )


def test_build_epic_payload_fails_loud_when_project_unconfigured(monkeypatch):
    """build_epic_payload must refuse to produce a payload with an empty project key.

    Current implementation silently produces {"project": {"key": ""}}.
    """
    from pf.jira import epic as epic_module

    monkeypatch.setattr(epic_module, "JIRA_PROJECT", "")

    epic_data = {
        "title": "Test Epic",
        "description": "irrelevant",
    }

    with pytest.raises(Exception) as exc_info:
        epic_module.build_epic_payload(epic_data)

    assert _empty_project_error_pattern().search(str(exc_info.value)), (
        f"Error message must reference the missing project key configuration. "
        f"Got: {exc_info.value!r}"
    )


def test_create_story_in_jira_fails_loud_when_project_unconfigured(
    monkeypatch, tmp_path
):
    """create_story_in_jira must refuse to attempt creation when project key is empty.

    Currently silently builds a payload with {"key": ""} and calls the API.
    """
    import yaml as _yaml

    from pf.jira import create as create_module

    sprint_data = {
        "epics": [
            {
                "id": "epic-test",
                "jira": "PROJ-9999",
                "title": "Test",
                "stories": [
                    {
                        "id": "test-1",
                        "title": "Test Story",
                        "description": "Test desc",
                        "points": 1,
                        "priority": "P2",
                    }
                ],
            }
        ]
    }
    sprint_path = tmp_path / "current-sprint.yaml"
    sprint_path.write_text(_yaml.safe_dump(sprint_data))

    monkeypatch.setattr(create_module, "JIRA_PROJECT", "")

    # The error may surface as an exception or a result object — accept either,
    # but require a clear message and require that no client was constructed.
    sentinel_called = {"created": False}

    class _ShouldNotBeCalled:
        def create_issue_sync(self, *_args, **_kwargs):
            sentinel_called["created"] = True
            raise AssertionError(
                "client.create_issue_sync() must not be called when project key is empty"
            )

    monkeypatch.setattr(
        create_module,
        "get_client",
        lambda: _ShouldNotBeCalled(),
    )

    raised: Exception | None = None
    result: dict | None = None
    try:
        result = create_module.create_story_in_jira(
            "PROJ-9999",
            "test-1",
            sprint_path=sprint_path,
            dry_run=False,
        )
    except Exception as e:  # noqa: BLE001
        raised = e

    assert not sentinel_called["created"], (
        "Empty project key must short-circuit before any Jira API call."
    )

    if raised is not None:
        assert _empty_project_error_pattern().search(str(raised)), (
            f"Exception must mention the missing project key. Got: {raised!r}"
        )
    else:
        assert isinstance(result, dict), "Expected a result dict if no exception"
        assert result.get("success") is False, (
            f"Empty project key must produce success=False, got {result!r}"
        )
        error_msg = str(result.get("error", ""))
        assert _empty_project_error_pattern().search(error_msg), (
            f"Result error must mention the missing project key. Got: {result!r}"
        )


def test_jira_project_resolution_distinguishes_unset_state(monkeypatch):
    """_resolve_jira_config must give callers a way to distinguish 'unset' from 'empty'.

    The current implementation returns ("", "") for both cases. The fix must
    expose enough information to fail loudly at point of use — either by
    returning None for unset, raising directly, or providing a helper.

    This test calls _resolve_jira_config in a clean environment (no config file,
    no env vars) and asserts that *something downstream* can detect the unset
    state without the test having to inspect ``"" == ""``.
    """
    monkeypatch.delenv("JIRA_PROJECT", raising=False)
    monkeypatch.delenv("JIRA_URL", raising=False)

    # Force config loader to return an empty config
    def _empty_config():
        return {}

    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        _empty_config,
    )

    from pf.jira import client as client_module

    # Contract: after the fix, at least one of these must be true:
    # (a) _resolve_jira_config returns a sentinel (None, falsy non-string, or raises)
    # (b) a require_jira_project() / get_jira_project(strict=True) helper exists
    has_strict_helper = (
        hasattr(client_module, "require_jira_project")
        or hasattr(client_module, "get_jira_project")
    )

    raised_on_resolve = False
    project_value = None
    try:
        project, _url = client_module._resolve_jira_config()
        project_value = project
    except Exception:
        raised_on_resolve = True

    # If neither a strict helper exists nor resolve raises, the resolved value
    # must at least be a clearly-unset sentinel (None or False), not an empty
    # string that downstream code will paste into a payload.
    distinguishable = (
        has_strict_helper
        or raised_on_resolve
        or (project_value is None)
        or project_value is False
    )

    assert distinguishable, (
        "Unset Jira project key is indistinguishable from configured-empty. "
        f"_resolve_jira_config returned project={project_value!r}; "
        f"no require_jira_project / get_jira_project helper found on client module. "
        "Add a strict helper or change the unset return value to None."
    )
