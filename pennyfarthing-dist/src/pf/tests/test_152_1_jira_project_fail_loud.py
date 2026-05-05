"""Story 152-1: Fail-loud tests for the Jira project key resolution.

Implemented behavior (pinned by these tests):
    pf.jira.client._resolve_jira_config() returns (None, None) when no project
    key is configured and no JIRA_PROJECT env var is set. The strict accessor
    require_jira_project() raises JiraConfigError with a clear message naming
    both the config-file and env-var paths. Payload builders that need the key
    call require_jira_project() before constructing any Jira API request and
    refuse to emit {"project": {"key": ""}}.

These tests guard against regression to the silent-default behaviour:
    - Resolver-sentinel test ensures the unset state is non-string (None/raise).
    - Strict-helper test ensures require_jira_project() (or get_jira_project)
      remains exposed on pf.jira.client.
    - build_epic_payload / create_story_in_jira / create_epic_in_jira tests
      ensure each public payload-construction path short-circuits before any
      Jira API call when the project key is empty.

Author: Igor (TEA), Story 152-1 (RED + re-RED rounds).
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

    Asserts that build_epic_payload raises JiraConfigError when the imported
    JIRA_PROJECT module constant is empty, instead of silently emitting
    ``{"project": {"key": ""}}``.
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
    """create_story_in_jira must short-circuit with success=False before any API call.

    Asserts the function returns ``{success: False, error: ...}`` (or raises)
    when the imported JIRA_PROJECT module constant is empty, never reaching
    ``client.create_issue_sync``. Pins the require_jira_project() guard at the
    create.py call site.
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


def test_jira_project_resolution_returns_sentinel_when_unset(monkeypatch):
    """_resolve_jira_config must return a clearly-unset sentinel (not empty string).

    A future regression that restores the silent ``""`` default would be
    indistinguishable from a deliberate empty config; downstream code would
    paste that empty string straight into a Jira payload. This test pins the
    resolver's contract: in a clean environment (no config file, no env vars)
    it must return ``None`` for the project key, raise, or use some other
    non-string sentinel.

    Split out from the original distinguishability test, which also asserted
    on the existence of a ``require_jira_project`` helper — that combined
    assertion was satisfied by helper presence alone, leaving the resolver's
    return-value contract unverified.
    """
    monkeypatch.delenv("JIRA_PROJECT", raising=False)
    monkeypatch.delenv("JIRA_URL", raising=False)

    def _empty_config():
        return {}

    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        _empty_config,
    )

    from pf.jira import client as client_module

    raised_on_resolve = False
    project_value: object = "<not-set>"
    try:
        project, _url = client_module._resolve_jira_config()
        project_value = project
    except Exception:
        raised_on_resolve = True

    # The resolver MUST signal unset clearly — by raising or by returning a
    # non-string sentinel (None, False). An empty string is the silent-default
    # behaviour the story exists to eliminate.
    if raised_on_resolve:
        return  # raising is acceptable; caller will surface

    assert project_value is None or project_value is False, (
        "Unset Jira project key must return a non-string sentinel (preferably None) "
        f"so callers can fail loudly at point of use. Got project={project_value!r}; "
        "this is the silent-default state story 152-1 was written to eliminate."
    )


def test_jira_project_strict_helper_is_exposed():
    """``require_jira_project`` (or equivalent strict accessor) must exist on the client module.

    Pinning this separately from the resolver-sentinel test above so a regression
    that removes the helper does not silently pass by virtue of the resolver
    still returning ``None``.
    """
    from pf.jira import client as client_module

    has_strict_helper = hasattr(client_module, "require_jira_project") or hasattr(
        client_module, "get_jira_project"
    )
    assert has_strict_helper, (
        "Expected a strict accessor like `require_jira_project` on pf.jira.client "
        "so downstream callers can fail loudly when the project key is unset. "
        "If the resolver is being relied on alone, downstream code that imports "
        "the JIRA_PROJECT module-level constant cannot tell unset apart from empty."
    )


def test_create_epic_in_jira_fails_loud_when_project_unconfigured(
    monkeypatch, tmp_path
):
    """create_epic_in_jira must refuse to act when the project key is unset.

    Mirror of ``test_create_story_in_jira_fails_loud_when_project_unconfigured``
    for the sibling function in the same module. The Reviewer flagged that
    ``create_epic_in_jira`` builds both a JQL search query (interpolating
    ``JIRA_PROJECT`` directly) and a Jira create payload (also using bare
    ``JIRA_PROJECT``) without the ``require_jira_project`` guard that protects
    its sibling. When ``JIRA_PROJECT == ""`` either path silently leaks an empty
    project key onto the wire — exactly the bug story 152-1 was meant to close.
    """
    import yaml as _yaml

    from pf.jira import create as create_module

    # Sprint YAML with one epic that has NO existing Jira key — forces the
    # function down the create-epic branch where the unguarded JIRA_PROJECT
    # references live (lines 232 and 267 at time of writing).
    sprint_data = {
        "epics": [
            {
                "id": "999",
                "type": "epic",
                "title": "Test Epic",
                "description": "test",
                "priority": "p3",
                "status": "active",
                "stories": [],
            }
        ]
    }
    sprint_path = tmp_path / "current-sprint.yaml"
    sprint_path.write_text(_yaml.safe_dump(sprint_data))

    monkeypatch.setattr(create_module, "JIRA_PROJECT", "")

    # create_epic_in_jira reads BOTH `sprint_path` (for the mutable ruamel copy)
    # AND the project's default sprint via `load_sprint()` (for find_epic). To
    # keep this unit test self-contained we monkeypatch load_sprint to return
    # the same fixture data — otherwise the function returns
    # "Epic not found in sprint YAML" before reaching the JIRA_PROJECT-using
    # branch we're trying to exercise.
    monkeypatch.setattr(create_module, "load_sprint", lambda: sprint_data)

    sentinel_called = {"created": False, "searched": False}

    class _ShouldNotBeCalled:
        def create_issue_sync(self, *_args, **_kwargs):
            sentinel_called["created"] = True
            raise AssertionError(
                "client.create_issue_sync() must not be called when project key is empty"
            )

        def search_issues_sync(self, *_args, **_kwargs):
            sentinel_called["searched"] = True
            raise AssertionError(
                "client.search_issues_sync() must not be called when project key is empty"
            )

    monkeypatch.setattr(
        create_module,
        "get_client",
        lambda: _ShouldNotBeCalled(),
    )

    raised: Exception | None = None
    result: dict | None = None
    try:
        result = create_module.create_epic_in_jira(
            "999",
            sprint_path=sprint_path,
            dry_run=False,
        )
    except Exception as e:  # noqa: BLE001
        raised = e

    assert not sentinel_called["created"], (
        "Empty project key must short-circuit before client.create_issue_sync()."
    )
    assert not sentinel_called["searched"], (
        "Empty project key must short-circuit before client.search_issues_sync() — "
        "interpolating an empty key into a JQL string is the same fail-loud violation."
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
