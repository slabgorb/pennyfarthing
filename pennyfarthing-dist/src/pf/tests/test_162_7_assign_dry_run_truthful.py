"""Truthful dry-run + unambiguous identifier contract for pf jira assign (Story 162-7, gh #146).

Epic: 162 — Finish & sprint-tooling truthfulness

gh #146 reported two distinct truthfulness bugs in ``pf jira assign KEY USER``:

1. **False-positive success.** ``--dry-run`` echoed the raw input and printed
   "Assigned ..." without ever resolving the identifier against Jira. So
   ``pf jira assign PROJ-18553 dreyes@personal.example.net --dry-run`` reported success
   and the immediately following real call failed "User not found". A dry-run
   that cannot fail is worthless for validating an identifier before a live
   call — it is strictly worse than no dry-run, because it manufactures
   confidence.

2. **Ambiguous identifier contract.** The help text said "email or GitHub
   username", but the email has to be the Jira ACCOUNT email (corporate SSO,
   e.g. dana.reyes@corp.example.com), not any personal address. Worse, the
   GitHub-username branch runs through map_github_to_jira, which falls back to
   get_current_user_email() for any username that is not in jira.user_map — so
   assigning to an unknown teammate silently resolves to YOURSELF. That is why
   "only the GitHub username resolved" in the live session: it did not resolve
   the teammate, it resolved the operator.

Designed contract (Dev implements to this):

* JiraClient.find_user_sync(query) -> dict | None — read-only user lookup
  (GET /rest/api/3/user/search). Returns the first matching account dict
  (accountId, emailAddress, displayName) or None when nothing matches.
* Resolution happens BEFORE the dry-run branch, for both dry-run and real runs.
* Unresolvable identifier -> non-zero exit and "User not found: {identifier}",
  where {identifier} is what the USER typed, not a substituted email.
* Absent credentials -> non-zero exit with a message distinct from
  "User not found" (it is a tooling failure, not a data answer).
* Both dry-run and real output name the resolved account: email AND display
  name. Dry-run must not claim the assignment happened.
* Result dicts only — {success, data?, error?}. No exceptions escape (rule 6).

Acceptance criteria covered:
- [AC1] dry-run does the real lookup and fails loudly, without mutating
- [AC2] dry-run and real output print the resolved account (email + display name)
- [AC3] help text pins USER = GitHub username or Jira account email; non-Jira
        emails will not resolve
- [AC4] sibling dry-run false-positive paths pinned (pf jira sprint add, plus
        pf jira link which shares the pure-echo bug in the same module)
"""

from __future__ import annotations

from typing import Any

import pytest
from click.testing import CliRunner

from pf.jira.cli import jira as jira_group

# The Jira account that exists in the fake instance. Corporate-SSO shaped on
# purpose: the whole point of AC3 is that this is NOT interchangeable with a
# personal address.
KNOWN_EMAIL = "dana.reyes@corp.example.com"
KNOWN_DISPLAY = "Dana Reyes"
KNOWN_ACCOUNT: dict[str, Any] = {
    "accountId": "acct-5f3a91",
    "emailAddress": KNOWN_EMAIL,
    "displayName": KNOWN_DISPLAY,
}

# The personal address from gh #146 that looks plausible and resolves to nothing.
UNKNOWN_EMAIL = "dreyes@personal.example.net"
# A GitHub username with no jira.user_map entry and no Jira account.
UNKNOWN_GITHUB = "ghost-user"

ISSUE_KEY = "PROJ-1"
OTHER_ISSUE_KEY = "PROJ-2"
MISSING_ISSUE_KEY = "PROJ-999"


def _issue(key: str) -> dict[str, Any]:
    """Unassigned issue payload — no assignee, so no already-assigned short-circuit."""
    return {"key": key, "fields": {"summary": "Fixture issue", "assignee": None}}


# =============================================================================
# Jira boundary stub (get_client, per the 162-5 pattern)
# =============================================================================


class _StubJiraClient:
    """Deterministic stand-in for the Jira client.

    Records every read and every write separately, because the central claim of
    this story is "the dry-run reads and does not write". A stub that lumped
    both together could not prove it.
    """

    def __init__(
        self,
        *,
        users: dict[str, dict[str, Any]] | None = None,
        issues: dict[str, dict[str, Any]] | None = None,
        token: str = "stub-token",
    ) -> None:
        self.token = token
        self._users = dict(users or {})
        self._issues = dict(issues or {})
        # Reads
        self.user_queries: list[str] = []
        self.issue_reads: list[str] = []
        # Writes
        self.assign_calls: list[tuple[str, str | None]] = []
        self.sprint_adds: list[tuple[str, str]] = []
        self.link_calls: list[tuple[str, str, str]] = []
        # Injectable write outcome, for the failure-propagation integrity test.
        self.assign_result: dict[str, Any] = {"success": True}

    @property
    def writes(self) -> list[tuple[str, ...]]:
        """Every mutating call, flattened — the thing a dry-run must leave empty."""
        return (
            [("assign", *(str(p) for p in c)) for c in self.assign_calls]
            + [("sprint_add", *c) for c in self.sprint_adds]
            + [("link", *c) for c in self.link_calls]
        )

    # --- reads ---------------------------------------------------------------

    def find_user_sync(self, query: str) -> dict[str, Any] | None:
        """Designed read-only lookup boundary (see module docstring)."""
        self.user_queries.append(query)
        return self._users.get(query)

    def get_issue_sync(self, issue_key: str) -> dict[str, Any] | None:
        self.issue_reads.append(issue_key)
        return self._issues.get(issue_key)

    # --- writes --------------------------------------------------------------

    def assign_issue_sync(self, issue_key: str, assignee_email: str | None) -> dict[str, Any]:
        self.assign_calls.append((issue_key, assignee_email))
        return self.assign_result

    def add_to_sprint_sync(self, sprint_id: int | str, issue_key: str) -> dict[str, Any]:
        self.sprint_adds.append((str(sprint_id), issue_key))
        return {"success": True}

    def link_issues_sync(self, inward: str, outward: str, link_type: str) -> dict[str, Any]:
        self.link_calls.append((inward, outward, link_type))
        return {"success": True}


@pytest.fixture
def jira_config(monkeypatch: pytest.MonkeyPatch):
    """Enable Jira and control jira.user_map.

    Returns a setter so individual tests can install a user_map; the default is
    an EMPTY map, which is the configuration that produced gh #146.
    """
    state: dict[str, Any] = {
        "jira": {
            "project": "PROJ",
            "url": "https://jira.example.com",
            "user_map": {},
        }
    }
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config",
        lambda *_a, **_kw: state,
    )
    # The map_github_to_jira fallback reads JIRA_USER. Point it at an account the
    # fake instance DOES know, so a silent fallback would look like a success and
    # get caught by TestNoSilentFallbackToOperator rather than passing by luck.
    monkeypatch.setenv("JIRA_USER", KNOWN_EMAIL)

    def set_user_map(mapping: dict[str, str]) -> None:
        state["jira"]["user_map"] = mapping

    return set_user_map


@pytest.fixture
def stub(monkeypatch: pytest.MonkeyPatch) -> _StubJiraClient:
    """Replace the Jira client at every get_client boundary the CLI can reach.

    operations.py binds get_client at import time, so patching
    pf.jira.client.get_client alone would leave the assign path on the real
    client. Both names are patched; TestStubIntegrity proves the patch lands.
    """
    client = _StubJiraClient(
        users={KNOWN_EMAIL: KNOWN_ACCOUNT},
        issues={ISSUE_KEY: _issue(ISSUE_KEY), OTHER_ISSUE_KEY: _issue(OTHER_ISSUE_KEY)},
    )
    monkeypatch.setattr("pf.jira.client.get_client", lambda *a, **kw: client, raising=True)
    monkeypatch.setattr("pf.jira.operations.get_client", lambda *a, **kw: client, raising=True)
    return client


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def _invoke(runner: CliRunner, args: list[str]):
    return runner.invoke(jira_group, args)


def _text(result) -> str:
    """All CLI text, stdout and stderr, as one lowercase-safe blob."""
    out = result.output or ""
    stderr = getattr(result, "stderr_bytes", None)
    if stderr:
        out += stderr.decode("utf-8", "replace")
    return out


# =============================================================================
# AC1 — dry-run performs the real lookup and fails loudly, without mutating
# =============================================================================


class TestDryRunFailsLoudlyOnUnresolvableIdentifier:
    """The gh #146 headline: a dry-run that cannot fail is a lie."""

    def test_unresolvable_email_exits_nonzero(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_EMAIL, "--dry-run"])
        assert result.exit_code != 0, (
            "dry-run reported success for an identifier that cannot be assigned; "
            f"output was: {_text(result)!r}"
        )

    def test_unresolvable_email_names_the_identifier(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_EMAIL, "--dry-run"])
        assert f"User not found: {UNKNOWN_EMAIL}" in _text(result), (
            "dry-run must fail with the exact AC1 message naming the identifier; "
            f"got: {_text(result)!r}"
        )

    def test_unresolvable_email_does_not_mutate_the_issue(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_EMAIL, "--dry-run"])
        assert stub.writes == [], f"dry-run wrote to Jira: {stub.writes}"

    def test_dry_run_actually_queries_jira(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """A real read must happen — otherwise the failure is guesswork, not a lookup."""
        _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_EMAIL, "--dry-run"])
        assert UNKNOWN_EMAIL in stub.user_queries, (
            f"dry-run did not perform the read-only user lookup; queries were: {stub.user_queries}"
        )

    def test_unresolvable_github_username_exits_nonzero(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_GITHUB, "--dry-run"])
        assert result.exit_code != 0, (
            f"dry-run reported success for unknown GitHub user: {_text(result)!r}"
        )

    def test_unresolvable_github_username_names_what_the_user_typed(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """AC1 says 'User not found: X' where X is the input, not a derived email."""
        result = _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_GITHUB, "--dry-run"])
        assert f"User not found: {UNKNOWN_GITHUB}" in _text(result), (
            f"error should name the typed identifier {UNKNOWN_GITHUB!r}; got: {_text(result)!r}"
        )

    def test_unresolvable_github_username_does_not_mutate(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_GITHUB, "--dry-run"])
        assert stub.writes == [], f"dry-run wrote to Jira: {stub.writes}"

    def test_dry_run_output_does_not_claim_completion(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """Even on the resolvable path, a dry-run must not say it assigned anything."""
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        assert result.exit_code == 0, _text(result)
        assert f"Assigned {ISSUE_KEY}" not in _text(result), (
            f"dry-run output claims a completed assignment; got: {_text(result)!r}"
        )

    def test_dry_run_resolvable_still_does_not_mutate(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        assert stub.writes == [], f"dry-run wrote to Jira on the happy path: {stub.writes}"

    def test_assign_issue_returns_error_result_not_raise(
        self, jira_config, stub: _StubJiraClient
    ) -> None:
        """Rule 6: result objects, never exceptions."""
        from pf.jira.operations import assign_issue

        result = assign_issue(ISSUE_KEY, UNKNOWN_EMAIL, dry_run=True)
        assert isinstance(result, dict), f"expected a result dict, got {type(result)!r}"
        assert result.get("success") is False, f"expected success=False, got {result!r}"
        assert result.get("error") == f"User not found: {UNKNOWN_EMAIL}", (
            f"unexpected error text: {result!r}"
        )


class TestNoSilentFallbackToOperator:
    """map_github_to_jira falls back to get_current_user_email() for unmapped
    usernames, so ``pf jira assign KEY teammate`` silently targets the operator.
    An unresolvable identifier must fail, not quietly retarget."""

    def test_unmapped_username_does_not_resolve_to_the_operator(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_GITHUB, "--dry-run"])
        assert KNOWN_EMAIL not in _text(result), (
            "an unmapped GitHub username silently resolved to the operator's own "
            f"account: {_text(result)!r}"
        )

    def test_unmapped_username_real_run_does_not_assign_the_operator(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, UNKNOWN_GITHUB])
        assert result.exit_code != 0, f"real run silently succeeded: {_text(result)!r}"
        assert stub.assign_calls == [], (
            f"assigned the wrong user for an unmapped username: {stub.assign_calls}"
        )

    def test_explicit_user_map_entry_still_resolves(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """Regression guard: the legitimate mapping path must keep working."""
        jira_config({"dreyes-gh": KNOWN_EMAIL})
        result = _invoke(runner, ["assign", ISSUE_KEY, "dreyes-gh", "--dry-run"])
        assert result.exit_code == 0, _text(result)
        assert KNOWN_DISPLAY in _text(result), (
            f"mapped username should resolve to {KNOWN_DISPLAY!r}; got: {_text(result)!r}"
        )


class TestUnassignDryRunOutput:
    """The unassign preview has no account to resolve, so it must simply say it
    would unassign — once. Review found it printing two contradictory lines,
    '[DRY RUN] Would unassign KEY' followed by '... Would assign KEY to nobody',
    because both operations.assign_issue and the CLI were writing output.
    """

    @pytest.mark.parametrize("sentinel", ["none", "null", "x"])
    def test_dry_run_prints_exactly_one_line(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient, sentinel: str
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, sentinel, "--dry-run"])
        assert result.exit_code == 0, _text(result)
        lines = [ln for ln in _text(result).splitlines() if ln.strip()]
        assert lines == [f"[DRY RUN] Would unassign {ISSUE_KEY}"], (
            f"unassign preview must be one truthful line; got: {lines!r}"
        )

    def test_dry_run_does_not_claim_an_assignment(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        text = _text(_invoke(runner, ["assign", ISSUE_KEY, "none", "--dry-run"]))
        assert "assign" in text.lower(), text
        assert "Would assign" not in text, (
            f"unassign preview contradicts itself by also claiming an assignment: {text!r}"
        )

    def test_dry_run_does_not_mutate(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, "none", "--dry-run"])
        assert stub.writes == [], f"unassign dry-run wrote to Jira: {stub.writes}"

    def test_real_unassign_still_unassigns(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """Regression guard: the mutating unassign path keeps working, and passes
        None rather than a resolved email."""
        result = _invoke(runner, ["assign", ISSUE_KEY, "none"])
        assert result.exit_code == 0, _text(result)
        assert stub.assign_calls == [(ISSUE_KEY, None)], stub.assign_calls
        assert f"Unassigned {ISSUE_KEY}" in _text(result), _text(result)


# =============================================================================
# AC2 — dry-run and real output print the resolved account
# =============================================================================


class TestResolvedAccountIsPrinted:
    """Printing the input back is what made the bug invisible. Print what Jira said."""

    def test_dry_run_prints_resolved_email(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """Assign by mapped username, so echoing the input cannot satisfy this."""
        jira_config({"dreyes-gh": KNOWN_EMAIL})
        result = _invoke(runner, ["assign", ISSUE_KEY, "dreyes-gh", "--dry-run"])
        assert result.exit_code == 0, _text(result)
        assert KNOWN_EMAIL in _text(result), f"resolved email missing: {_text(result)!r}"

    def test_dry_run_prints_resolved_display_name(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        assert KNOWN_DISPLAY in _text(result), f"resolved display name missing: {_text(result)!r}"

    def test_real_run_prints_resolved_email_and_display_name(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL])
        assert result.exit_code == 0, _text(result)
        text = _text(result)
        assert KNOWN_EMAIL in text and KNOWN_DISPLAY in text, (
            f"real output must name the resolved account: {text!r}"
        )

    def test_real_run_resolves_before_mutating(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL])
        assert stub.user_queries, "real run skipped the user lookup"
        assert stub.assign_calls == [(ISSUE_KEY, KNOWN_EMAIL)], (
            f"unexpected assignment calls: {stub.assign_calls}"
        )

    def test_assign_issue_returns_resolved_account_in_data(
        self, jira_config, stub: _StubJiraClient
    ) -> None:
        """Callers other than the CLI need the resolved account too."""
        from pf.jira.operations import assign_issue

        result = assign_issue(ISSUE_KEY, KNOWN_EMAIL, dry_run=True)
        assert result.get("success") is True, f"expected success, got {result!r}"
        data = result.get("data") or {}
        assert data.get("email") == KNOWN_EMAIL, f"missing resolved email: {result!r}"
        assert data.get("display_name") == KNOWN_DISPLAY, (
            f"missing resolved display name: {result!r}"
        )
        assert data.get("account_id") == KNOWN_ACCOUNT["accountId"], (
            f"missing resolved account id: {result!r}"
        )


# =============================================================================
# AC1 (design decision) — absent credentials fail loudly and DISTINCTLY
# =============================================================================


class TestAbsentCredentials:
    """Without a token the read returns nothing, which is indistinguishable from
    'no such user'. Reporting 'User not found' there is a second lie: it blames
    the identifier for a tooling problem."""

    @pytest.fixture
    def tokenless_stub(self, monkeypatch: pytest.MonkeyPatch) -> _StubJiraClient:
        client = _StubJiraClient(
            users={},
            issues={ISSUE_KEY: _issue(ISSUE_KEY)},
            token="",
        )
        monkeypatch.setattr("pf.jira.client.get_client", lambda *a, **kw: client)
        monkeypatch.setattr("pf.jira.operations.get_client", lambda *a, **kw: client)
        return client

    def test_exits_nonzero(
        self, runner: CliRunner, jira_config, tokenless_stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        assert result.exit_code != 0, (
            f"dry-run without credentials reported success: {_text(result)!r}"
        )

    def test_message_is_distinct_from_user_not_found(
        self, runner: CliRunner, jira_config, tokenless_stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        text = _text(result)
        assert "User not found" not in text, (
            f"missing credentials must not be reported as a missing user: {text!r}"
        )
        assert "credential" in text.lower(), f"error should name the credentials problem: {text!r}"

    def test_does_not_mutate(
        self, runner: CliRunner, jira_config, tokenless_stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        assert tokenless_stub.writes == [], (
            f"credential-less dry-run wrote to Jira: {tokenless_stub.writes}"
        )

    def test_real_run_also_fails_on_missing_credentials(
        self, runner: CliRunner, jira_config, tokenless_stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL])
        assert result.exit_code != 0, f"real run without credentials succeeded: {_text(result)!r}"
        assert tokenless_stub.assign_calls == [], (
            f"attempted an assignment without credentials: {tokenless_stub.assign_calls}"
        )


# =============================================================================
# AC3 — help text pins the identifier contract
# =============================================================================


class TestHelpTextPinsTheContract:
    """'email or GitHub username' is what sent the reporter down the wrong path."""

    @pytest.fixture
    def help_text(self, runner: CliRunner, jira_config) -> str:
        result = _invoke(runner, ["assign", "--help"])
        assert result.exit_code == 0, _text(result)
        return _text(result)

    def test_mentions_github_username(self, help_text: str) -> None:
        assert "github username" in help_text.lower(), help_text

    def test_mentions_jira_account_email(self, help_text: str) -> None:
        assert "jira account email" in help_text.lower(), (
            "help must say ACCOUNT email, not just 'email': " + help_text
        )

    def test_warns_that_non_jira_emails_do_not_resolve(self, help_text: str) -> None:
        lowered = help_text.lower()
        assert "non-jira" in lowered and "resolve" in lowered, (
            "help must warn that non-Jira emails will not resolve: " + help_text
        )


# =============================================================================
# AC4 — sibling dry-run false-positive paths
# =============================================================================


class TestSprintAddDryRun:
    """pf jira sprint add --dry-run echoes and returns. Same bug class as assign:
    it cannot tell you the issue key is wrong."""

    def test_unknown_issue_exits_nonzero(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["sprint", "add", "276", MISSING_ISSUE_KEY, "--dry-run"])
        assert result.exit_code != 0, (
            f"dry-run reported success for a nonexistent issue: {_text(result)!r}"
        )

    def test_unknown_issue_names_the_key(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["sprint", "add", "276", MISSING_ISSUE_KEY, "--dry-run"])
        assert f"Issue not found: {MISSING_ISSUE_KEY}" in _text(result), _text(result)

    def test_unknown_issue_does_not_mutate(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["sprint", "add", "276", MISSING_ISSUE_KEY, "--dry-run"])
        assert stub.sprint_adds == [], f"dry-run added to a sprint: {stub.sprint_adds}"

    def test_known_issue_performs_the_read(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["sprint", "add", "276", ISSUE_KEY, "--dry-run"])
        assert result.exit_code == 0, _text(result)
        assert ISSUE_KEY in stub.issue_reads, (
            f"dry-run never verified the issue exists: {stub.issue_reads}"
        )
        assert stub.sprint_adds == [], f"dry-run added to a sprint: {stub.sprint_adds}"

    def test_real_run_still_adds(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """Regression guard: validating must not break the mutating path."""
        result = _invoke(runner, ["sprint", "add", "276", ISSUE_KEY])
        assert result.exit_code == 0, _text(result)
        assert stub.sprint_adds == [("276", ISSUE_KEY)], stub.sprint_adds


class TestLinkDryRun:
    """pf jira link --dry-run returns before it even builds a client, so a typo in
    either key is reported as a successful preview."""

    def test_unknown_key_exits_nonzero(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["link", ISSUE_KEY, MISSING_ISSUE_KEY, "Blocks", "--dry-run"])
        assert result.exit_code != 0, (
            f"dry-run reported success linking a nonexistent issue: {_text(result)!r}"
        )
        assert f"Issue not found: {MISSING_ISSUE_KEY}" in _text(result), _text(result)

    def test_unknown_key_does_not_mutate(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["link", ISSUE_KEY, MISSING_ISSUE_KEY, "Blocks", "--dry-run"])
        assert stub.link_calls == [], f"dry-run created a link: {stub.link_calls}"

    def test_known_keys_are_both_verified(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        result = _invoke(runner, ["link", ISSUE_KEY, OTHER_ISSUE_KEY, "Blocks", "--dry-run"])
        assert result.exit_code == 0, _text(result)
        assert set(stub.issue_reads) >= {ISSUE_KEY, OTHER_ISSUE_KEY}, (
            f"dry-run must verify both endpoints: {stub.issue_reads}"
        )
        assert stub.link_calls == [], f"dry-run created a link: {stub.link_calls}"


# =============================================================================
# Designed client interface
# =============================================================================


class TestFindUserSyncContract:
    """The read-only lookup both dry-run and real runs share.

    Resolution currently lives inside assign_issue_sync, welded to the PUT that
    mutates the issue, which is the structural reason dry-run could not reuse it.
    """

    def _client(self):
        from pf.jira.client import JiraClient

        return JiraClient(base_url="https://jira.example.com", user="u", token="t")

    def test_method_exists(self) -> None:
        client = self._client()
        assert callable(getattr(client, "find_user_sync", None)), (
            "JiraClient.find_user_sync is missing — dry-run has no read-only "
            "lookup to share with the real path"
        )

    def test_uses_a_read_only_verb(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = self._client()
        calls: list[tuple[str, str]] = []

        def fake_call(method: str, endpoint: str, data: Any = None):
            calls.append((method, endpoint))
            return [KNOWN_ACCOUNT]

        monkeypatch.setattr(client, "_call_api_sync", fake_call)
        client.find_user_sync(KNOWN_EMAIL)
        assert calls, "find_user_sync made no API call"
        assert [m for m, _ in calls] == ["GET"], f"user lookup must be read-only, saw: {calls}"

    def test_returns_the_matching_account(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = self._client()
        monkeypatch.setattr(client, "_call_api_sync", lambda *a, **kw: [KNOWN_ACCOUNT])
        assert client.find_user_sync(KNOWN_EMAIL) == KNOWN_ACCOUNT

    def test_returns_none_when_nothing_matches(self, monkeypatch: pytest.MonkeyPatch) -> None:
        client = self._client()
        monkeypatch.setattr(client, "_call_api_sync", lambda *a, **kw: [])
        assert client.find_user_sync(UNKNOWN_EMAIL) is None

    def test_returns_none_on_transport_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """_call_api_sync returns None for auth/transport failures — must not
        be mistaken for a decoded empty result, and must never raise."""
        client = self._client()
        monkeypatch.setattr(client, "_call_api_sync", lambda *a, **kw: None)
        assert client.find_user_sync(KNOWN_EMAIL) is None


# =============================================================================
# Stub integrity
# =============================================================================


class TestStubIntegrity:
    """Guards on the stub itself. A stub that stops being reached, or that
    swallows failures, turns every test above into a vacuous pass."""

    def test_stub_replaces_the_operations_boundary(
        self, jira_config, stub: _StubJiraClient
    ) -> None:
        from pf.jira.operations import get_client

        assert get_client() is stub, "operations.get_client was not patched"

    def test_stub_replaces_the_client_boundary(self, jira_config, stub: _StubJiraClient) -> None:
        from pf.jira.client import get_client

        assert get_client() is stub, "client.get_client was not patched"

    def test_stub_records_the_real_assignment(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL])
        assert stub.assign_calls == [(ISSUE_KEY, KNOWN_EMAIL)], (
            f"the mutating path did not reach the stub: {stub.assign_calls}"
        )

    def test_stubbed_write_failure_propagates(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """With the stub set to fail, the CLI must report failure — proving the
        tests above would notice a swallowed error."""
        stub.assign_result = {"success": False, "error": "stubbed Jira failure"}
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL])
        assert result.exit_code != 0, f"a failed assignment reported success: {_text(result)!r}"
        assert "stubbed Jira failure" in _text(result), _text(result)

    def test_stubbed_lookup_failure_propagates(
        self, runner: CliRunner, jira_config, stub: _StubJiraClient
    ) -> None:
        """Same guard on the read side: emptying the fake directory must turn a
        previously-passing resolution into a loud failure."""
        stub._users.clear()
        result = _invoke(runner, ["assign", ISSUE_KEY, KNOWN_EMAIL, "--dry-run"])
        assert result.exit_code != 0, f"lookup failure did not propagate: {_text(result)!r}"
        assert f"User not found: {KNOWN_EMAIL}" in _text(result), _text(result)
