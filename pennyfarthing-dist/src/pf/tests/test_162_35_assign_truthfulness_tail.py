"""162-7 truthfulness tail: single resolution, truthful email slot, credential
guard on all three dry-runs, URL-encoded user query (Story 162-35).

Epic: 162 — Finish & sprint-tooling truthfulness.
Source: the 162-7 review (findings F1/F3/F4/F5). 162-7 established the contract
(see ``test_162_7_assign_dry_run_truthful.py``): resolve the identifier BEFORE
the dry-run branch, print what Jira said, and name the identifier the USER
typed — never a substituted email — when resolution fails.

Four defects survived that story. All four are pinned here against a FAKE
TRANSPORT rather than a stubbed client: every one of them lives *between*
``operations.assign_issue`` and ``JiraClient``, so a client-level stub (the
162-7 pattern) cannot see them. The seam is ``JiraClient._call_api_sync``, the
single place every read and write leaves the process, which also lets the tests
assert on the exact URL that would have been handed to curl.

**F1 — the real assign path resolves the user TWICE.**
``operations.assign_issue`` resolves the identifier via ``find_user_sync``,
substitutes ``account["emailAddress"]``, then hands that email to
``client.assign_issue_sync``, which RE-LOOKS-IT-UP to get the very accountId the
first lookup already returned. Two lies fall out:

  a. The second lookup's failure is reported as ``User not found: {substituted
     email}``. The user never typed that string. 162-7's rule was explicit:
     errors name the raw input.
  b. A preview/write divergence window. The dry-run resolves ONCE and previews
     success; the real run resolves TWICE and can fail on the second. Jira's
     user search does not index every account by its own ``emailAddress``
     (withheld/aliased addresses are common), so "dry-run said yes, real run
     said User not found" is reachable with no state change in between.

Fix: resolve once, carry the resolved accountId to the write, and report the
raw input on failure.

**F3 — the withheld-email display echoes the input.** When Jira withholds
``emailAddress`` (privacy settings — the default for many Cloud accounts),
``assign_issue`` falls back to ``account.get("emailAddress") or query``, so the
CLI prints ``Dana Reyes <Dana Reyes>``: the string the user typed, sitting in
the email slot, dressed up as a resolved Jira address. That is the exact
echo-the-input failure 162-7 existed to remove, re-entering through the
fallback. A withheld email must be reported as withheld (or by accountId),
never invented.

**F4 — the credential guard is on 1 of 3 dry-run paths.** ``assign_issue``
checks ``client.token`` and fails with "no Jira credentials". The ``sprint add``
and ``link`` dry-runs do not: with no token every read returns None, so both
report ``Issue not found: KEY``. That blames the data for a tooling failure and
sends the operator hunting a key that is fine. Same class as 162-7's
``TestAbsentCredentials``, on the two paths it did not cover.

**F5 — ``find_user_sync`` does not URL-encode its query.** The endpoint is
built by f-string interpolation: ``?query={query}``. A display name with a
space produces a URL with a raw space in it, which curl rejects (exit 3, "URL
using bad/illegal format"); ``_call_api_sync`` maps the non-zero exit to None,
which ``find_user_sync`` maps to "no such user". So every display-name lookup
is unresolvable, and the failure is reported as a data answer. Unencoded ``&``
is worse: it injects a second query parameter.

Acceptance criteria covered:
- [AC-F1] real assign resolves the user exactly once; the write carries the
          already-resolved accountId; no dry-run/real divergence; any
          not-found error names the raw input, never the substituted email.
- [AC-F3] a withheld email is never displayed as the raw input.
- [AC-F4] all three dry-run paths (assign, sprint add, link) fail distinctly on
          missing credentials, and none echo credential material.
- [AC-F5] the user-search query reaching the transport is URL-encoded.
"""

from __future__ import annotations

import urllib.parse
from typing import Any

import pytest
from click.testing import CliRunner

from pf.jira.cli import jira as jira_group

ISSUE_KEY = "PROJ-1"
OTHER_ISSUE_KEY = "PROJ-2"

# A display name, with a space, as an operator would type it. Deliberately NOT
# an email: it is the input for both the F1 second-lookup failure and F5.
DISPLAY_INPUT = "Dana Reyes"
ACCOUNT_ID = "acct-5f3a91"
# The account's own email — the SUBSTITUTED string the second-stage lookup uses
# and that F1(a) must never surface as the thing the user asked for.
ACCOUNT_EMAIL = "dana.reyes@corp.example.com"

RESOLVABLE_ACCOUNT: dict[str, Any] = {
    "accountId": ACCOUNT_ID,
    "emailAddress": ACCOUNT_EMAIL,
    "displayName": DISPLAY_INPUT,
}
WITHHELD_ACCOUNT: dict[str, Any] = {
    "accountId": ACCOUNT_ID,
    # Jira omits the key entirely when the account withholds its address.
    "displayName": DISPLAY_INPUT,
}

# Credential material that must never appear in operator-facing output.
SECRET_TOKEN = "s3cr3t-jira-token"


def _issue(key: str) -> dict[str, Any]:
    return {"key": key, "fields": {"summary": "Fixture issue", "assignee": None}}


# =============================================================================
# Fake transport — the single seam every Jira read and write passes through
# =============================================================================


class _FakeTransport:
    """Stand-in for ``JiraClient._call_api_sync``.

    Records the METHOD, the ENDPOINT AS BUILT (pre-curl, so encoding defects are
    visible), and the body. Answers user searches from a directory keyed by the
    *decoded* query, so a correctly-encoded request and a raw-space request both
    resolve — the encoding claim is proved from the recorded URL, not smuggled
    in as a lookup miss.
    """

    def __init__(
        self,
        *,
        directory: dict[str, dict[str, Any]] | None = None,
        issues: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self.directory = dict(directory or {})
        self.issues = dict(issues or {})
        self.calls: list[tuple[str, str, Any]] = []
        # Set by _make_client. The real _call_api_sync short-circuits to None
        # when there is no token, which is precisely why "no credentials" and
        # "no such issue" are indistinguishable downstream — the fake has to
        # reproduce that or the F4 tests would be testing a friendlier world.
        self.token: str = "fake-token"

    def __call__(self, method: str, endpoint: str, data: Any = None) -> Any:
        self.calls.append((method, endpoint, data))

        if not self.token:
            return None

        if endpoint.startswith("/rest/api/3/user/search"):
            account = self.directory.get(self.decoded_query(endpoint))
            return [account] if account else []

        if endpoint.startswith("/rest/api/3/issue/"):
            tail = endpoint[len("/rest/api/3/issue/") :]
            if method == "GET" and "/" not in tail:
                return self.issues.get(tail)
            # assignee PUT / link POST — Jira answers 204, i.e. no body.
            return None

        return None

    # --- recorded-call views -------------------------------------------------

    @staticmethod
    def decoded_query(endpoint: str) -> str:
        """The ``query`` param as the SERVER would parse it."""
        _, _, qs = endpoint.partition("?")
        params = urllib.parse.parse_qs(qs, keep_blank_values=True)
        return (params.get("query") or [""])[0]

    @property
    def user_search_endpoints(self) -> list[str]:
        return [ep for _, ep, _ in self.calls if ep.startswith("/rest/api/3/user/search")]

    @property
    def user_search_queries(self) -> list[str]:
        return [self.decoded_query(ep) for ep in self.user_search_endpoints]

    @property
    def writes(self) -> list[tuple[str, str, Any]]:
        """Every mutating call — what a dry-run must leave empty."""
        return [c for c in self.calls if c[0] in ("PUT", "POST", "DELETE")]

    @property
    def assignee_writes(self) -> list[tuple[str, str, Any]]:
        return [c for c in self.writes if c[1].endswith("/assignee")]


def _make_client(transport: _FakeTransport, *, token: str) -> Any:
    """A REAL JiraClient with only its transport faked.

    The defects under test live in JiraClient's own methods, so the client
    itself must not be stubbed. Credentials are embedded in base_url and user as
    well as the token, so the F4 no-echo assertions have something to catch.
    """
    from pf.jira.client import JiraClient

    client = JiraClient(
        base_url=f"https://oauth2:{SECRET_TOKEN}@jira.example.com",
        user=f"operator:{SECRET_TOKEN}",
        token=token,
    )
    transport.token = token
    client._call_api_sync = transport  # type: ignore[method-assign]
    return client


@pytest.fixture
def jira_config(monkeypatch: pytest.MonkeyPatch):
    """Jira enabled, jira.user_map EMPTY — so a non-email identifier reaches
    Jira as typed (map_github_to_jira returns None for unmapped names)."""
    state: dict[str, Any] = {
        "jira": {"project": "PROJ", "url": "https://jira.example.com", "user_map": {}}
    }
    monkeypatch.setattr(
        "pf.common.config.load_pennyfarthing_config", lambda *_a, **_kw: state, raising=True
    )
    monkeypatch.setenv("JIRA_USER", ACCOUNT_EMAIL)

    def set_user_map(mapping: dict[str, str]) -> None:
        state["jira"]["user_map"] = mapping

    return set_user_map


def _install(monkeypatch: pytest.MonkeyPatch, transport: _FakeTransport, *, token: str) -> Any:
    """Patch every get_client boundary the CLI can reach (operations.py binds
    get_client at import time, so patching client.py alone is not enough)."""
    client = _make_client(transport, token=token)
    monkeypatch.setattr("pf.jira.client.get_client", lambda *a, **kw: client, raising=True)
    monkeypatch.setattr("pf.jira.operations.get_client", lambda *a, **kw: client, raising=True)
    return client


@pytest.fixture
def resolvable(monkeypatch: pytest.MonkeyPatch) -> _FakeTransport:
    """Directory that answers the DISPLAY NAME but not the account's own email.

    This is the F1 divergence shape: the first lookup succeeds, and a
    second lookup keyed on the substituted ``emailAddress`` finds nothing.
    """
    transport = _FakeTransport(
        directory={DISPLAY_INPUT: RESOLVABLE_ACCOUNT},
        issues={ISSUE_KEY: _issue(ISSUE_KEY), OTHER_ISSUE_KEY: _issue(OTHER_ISSUE_KEY)},
    )
    _install(monkeypatch, transport, token="fake-token")
    return transport


@pytest.fixture
def by_email(monkeypatch: pytest.MonkeyPatch) -> _FakeTransport:
    """Directory that answers BOTH the email and the display name — so the
    resolution-count assertions cannot pass merely because a lookup failed."""
    transport = _FakeTransport(
        directory={ACCOUNT_EMAIL: RESOLVABLE_ACCOUNT, DISPLAY_INPUT: RESOLVABLE_ACCOUNT},
        issues={ISSUE_KEY: _issue(ISSUE_KEY), OTHER_ISSUE_KEY: _issue(OTHER_ISSUE_KEY)},
    )
    _install(monkeypatch, transport, token="fake-token")
    return transport


@pytest.fixture
def withheld(monkeypatch: pytest.MonkeyPatch) -> _FakeTransport:
    transport = _FakeTransport(
        directory={DISPLAY_INPUT: WITHHELD_ACCOUNT},
        issues={ISSUE_KEY: _issue(ISSUE_KEY)},
    )
    _install(monkeypatch, transport, token="fake-token")
    return transport


@pytest.fixture
def runner() -> CliRunner:
    return CliRunner()


def _invoke(runner: CliRunner, args: list[str]):
    return runner.invoke(jira_group, args)


def _text(result) -> str:
    out = result.output or ""
    stderr = getattr(result, "stderr_bytes", None)
    if stderr:
        out += stderr.decode("utf-8", "replace")
    return out


# =============================================================================
# F1 — resolve the user ONCE; errors name the raw input
# =============================================================================


class TestSingleResolution:
    """The write must reuse what the read already resolved."""

    def test_real_assign_resolves_the_user_exactly_once(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL])
        assert result.exit_code == 0, _text(result)
        assert by_email.user_search_queries == [ACCOUNT_EMAIL], (
            "the real assign path must resolve the identifier ONCE; a second "
            "lookup re-derives an accountId it already has and opens a "
            f"preview/write divergence window. Queries: {by_email.user_search_queries}"
        )

    def test_write_carries_the_already_resolved_account_id(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL])
        assert len(by_email.assignee_writes) == 1, (
            f"expected exactly one assignee write: {by_email.assignee_writes}"
        )
        _, endpoint, body = by_email.assignee_writes[0]
        assert endpoint == f"/rest/api/3/issue/{ISSUE_KEY}/assignee", endpoint
        assert (body or {}).get("accountId") == ACCOUNT_ID, (
            f"the write must carry the resolved accountId, got: {body!r}"
        )

    def test_dry_run_and_real_run_resolve_the_same_number_of_times(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport
    ) -> None:
        """Identical resolution work on both sides is what makes the preview
        trustworthy. Different counts ARE the divergence window."""
        _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL, "--dry-run"])
        dry_run_lookups = len(by_email.user_search_queries)
        by_email.calls.clear()
        _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL])
        real_lookups = len(by_email.user_search_queries)
        assert real_lookups == dry_run_lookups, (
            f"dry-run resolved {dry_run_lookups}x, real run resolved {real_lookups}x — "
            "the preview cannot speak for a path that does more work than it did"
        )

    def test_dry_run_performs_no_write(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport
    ) -> None:
        _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL, "--dry-run"])
        assert by_email.writes == [], f"dry-run wrote to Jira: {by_email.writes}"


class TestSecondStageFailureTruthfulness:
    """Identifier resolvable by display name, account email not searchable —
    the shape that makes the second-stage lookup fail."""

    def test_real_run_succeeds_where_the_dry_run_previewed_success(
        self, runner: CliRunner, jira_config, resolvable: _FakeTransport
    ) -> None:
        preview = _invoke(runner, ["assign", ISSUE_KEY, DISPLAY_INPUT, "--dry-run"])
        assert preview.exit_code == 0, f"precondition: dry-run must resolve: {_text(preview)!r}"
        resolvable.calls.clear()
        result = _invoke(runner, ["assign", ISSUE_KEY, DISPLAY_INPUT])
        assert result.exit_code == 0, (
            "the dry-run previewed success and nothing changed, yet the real run "
            f"failed — the second-stage re-lookup is the only difference: {_text(result)!r}"
        )
        assert len(resolvable.assignee_writes) == 1, (
            f"the assignment never reached Jira: {resolvable.calls}"
        )

    def test_error_never_names_the_substituted_email(
        self, runner: CliRunner, jira_config, resolvable: _FakeTransport
    ) -> None:
        """162-7's rule: a not-found error names what the user typed."""
        text = _text(_invoke(runner, ["assign", ISSUE_KEY, DISPLAY_INPUT]))
        if "not found" in text.lower():
            assert f"User not found: {DISPLAY_INPUT}" in text, (
                f"error must name the raw input {DISPLAY_INPUT!r}; got: {text!r}"
            )
            assert ACCOUNT_EMAIL not in text, (
                f"error quotes a substituted email the user never typed: {text!r}"
            )

    def test_genuinely_unknown_identifier_still_names_the_raw_input(
        self, runner: CliRunner, jira_config, resolvable: _FakeTransport
    ) -> None:
        """Regression guard: fixing the double lookup must not soften the
        real not-found failure."""
        result = _invoke(runner, ["assign", ISSUE_KEY, "Nobody At All"])
        assert result.exit_code != 0, f"unknown identifier succeeded: {_text(result)!r}"
        assert "User not found: Nobody At All" in _text(result), _text(result)
        assert resolvable.writes == [], f"assigned an unresolved user: {resolvable.writes}"


# =============================================================================
# F3 — a withheld email is never displayed as the raw input
# =============================================================================


class TestWithheldEmailDisplay:
    """``or query`` turns "Jira did not tell us" into "the user's input is the
    email". Truthful options: say withheld, or name the accountId."""

    def test_display_does_not_put_the_raw_input_in_the_email_slot(
        self, runner: CliRunner, jira_config, withheld: _FakeTransport
    ) -> None:
        result = _invoke(runner, ["assign", ISSUE_KEY, DISPLAY_INPUT, "--dry-run"])
        assert result.exit_code == 0, _text(result)
        text = _text(result)
        assert f"<{DISPLAY_INPUT}>" not in text, (
            f"the input string is being displayed as the resolved Jira email address: {text!r}"
        )

    def test_display_is_truthful_about_the_withheld_address(
        self, runner: CliRunner, jira_config, withheld: _FakeTransport
    ) -> None:
        text = _text(_invoke(runner, ["assign", ISSUE_KEY, DISPLAY_INPUT, "--dry-run"]))
        assert "withheld" in text.lower() or ACCOUNT_ID in text, (
            "a withheld email must be named as withheld or replaced by the "
            f"accountId, not invented: {text!r}"
        )

    def test_result_data_does_not_invent_an_email(
        self, jira_config, withheld: _FakeTransport
    ) -> None:
        """Non-CLI callers get the same lie through result["data"]["email"]."""
        from pf.jira.operations import assign_issue

        result = assign_issue(ISSUE_KEY, DISPLAY_INPUT, dry_run=True)
        assert result.get("success") is True, f"expected success, got {result!r}"
        data = result.get("data") or {}
        assert data.get("account_id") == ACCOUNT_ID, f"missing resolved accountId: {result!r}"
        assert data.get("email") != DISPLAY_INPUT, (
            f"the raw input was recorded as the resolved email: {result!r}"
        )

    def test_real_run_assigns_the_withheld_account(
        self, runner: CliRunner, jira_config, withheld: _FakeTransport
    ) -> None:
        """The account is fully identified by accountId, so a withheld email
        must not block the write (nor unassign by passing None down)."""
        result = _invoke(runner, ["assign", ISSUE_KEY, DISPLAY_INPUT])
        assert result.exit_code == 0, _text(result)
        assert len(withheld.assignee_writes) == 1, f"expected one assignee write: {withheld.calls}"
        assert (withheld.assignee_writes[0][2] or {}).get("accountId") == ACCOUNT_ID, (
            f"withheld-email account must still be assigned by id: {withheld.assignee_writes}"
        )


# =============================================================================
# F4 — credential guard on ALL THREE dry-run paths
# =============================================================================

DRY_RUN_PATHS = [
    pytest.param(["assign", ISSUE_KEY, ACCOUNT_EMAIL, "--dry-run"], id="assign"),
    pytest.param(["sprint", "add", "276", ISSUE_KEY, "--dry-run"], id="sprint-add"),
    pytest.param(["link", ISSUE_KEY, OTHER_ISSUE_KEY, "Blocks", "--dry-run"], id="link"),
]


class TestCredentialGuardOnEveryDryRunPath:
    """With no token every read returns None, so "no credentials" and "no such
    issue" are indistinguishable at the transport. Only ``assign`` checks. The
    other two blame the operator's issue key for a tooling failure."""

    @pytest.fixture
    def tokenless(self, monkeypatch: pytest.MonkeyPatch) -> _FakeTransport:
        transport = _FakeTransport(
            directory={ACCOUNT_EMAIL: RESOLVABLE_ACCOUNT},
            issues={ISSUE_KEY: _issue(ISSUE_KEY), OTHER_ISSUE_KEY: _issue(OTHER_ISSUE_KEY)},
        )
        _install(monkeypatch, transport, token="")
        return transport

    @pytest.mark.parametrize("args", DRY_RUN_PATHS)
    def test_exits_nonzero(
        self, runner: CliRunner, jira_config, tokenless: _FakeTransport, args: list[str]
    ) -> None:
        result = _invoke(runner, args)
        assert result.exit_code != 0, (
            f"dry-run without credentials reported success: {_text(result)!r}"
        )

    @pytest.mark.parametrize("args", DRY_RUN_PATHS)
    def test_names_the_credentials_problem(
        self, runner: CliRunner, jira_config, tokenless: _FakeTransport, args: list[str]
    ) -> None:
        text = _text(_invoke(runner, args))
        assert "credential" in text.lower(), (
            f"a missing token must be reported as a credentials failure: {text!r}"
        )

    @pytest.mark.parametrize("args", DRY_RUN_PATHS)
    def test_does_not_blame_the_data(
        self, runner: CliRunner, jira_config, tokenless: _FakeTransport, args: list[str]
    ) -> None:
        text = _text(_invoke(runner, args))
        assert "not found" not in text.lower(), (
            "a tooling failure is being reported as a missing issue/user, which "
            f"sends the operator hunting a key that is fine: {text!r}"
        )

    @pytest.mark.parametrize("args", DRY_RUN_PATHS)
    def test_does_not_echo_credential_material(
        self, runner: CliRunner, jira_config, tokenless: _FakeTransport, args: list[str]
    ) -> None:
        """The base URL and user carry a token; no failure path may echo them."""
        text = _text(_invoke(runner, args))
        assert SECRET_TOKEN not in text, f"credential material leaked into output: {text!r}"

    @pytest.mark.parametrize("args", DRY_RUN_PATHS)
    def test_no_writes_without_credentials(
        self, runner: CliRunner, jira_config, tokenless: _FakeTransport, args: list[str]
    ) -> None:
        _invoke(runner, args)
        assert tokenless.writes == [], f"wrote to Jira without credentials: {tokenless.writes}"

    @pytest.mark.parametrize("args", DRY_RUN_PATHS)
    def test_with_credentials_the_dry_run_still_previews_success(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport, args: list[str]
    ) -> None:
        """Regression guard: the guard must key on the token, not break the
        happy path 162-7 built."""
        result = _invoke(runner, args)
        assert result.exit_code == 0, _text(result)
        assert by_email.writes == [], f"dry-run wrote to Jira: {by_email.writes}"


# =============================================================================
# F5 — the user-search query must be URL-encoded
# =============================================================================


class TestFindUserSyncEncodesTheQuery:
    """``f"?query={query}"`` hands curl a URL with a raw space in it; curl exits
    3 and the lookup is reported as "no such user"."""

    @pytest.fixture
    def client_and_transport(self, monkeypatch: pytest.MonkeyPatch):
        transport = _FakeTransport(directory={DISPLAY_INPUT: RESOLVABLE_ACCOUNT})
        client = _make_client(transport, token="fake-token")
        return client, transport

    def test_space_is_percent_or_plus_encoded(self, client_and_transport) -> None:
        client, transport = client_and_transport
        client.find_user_sync(DISPLAY_INPUT)
        assert transport.user_search_endpoints, "find_user_sync made no call"
        endpoint = transport.user_search_endpoints[0]
        assert "%20" in endpoint or "+" in endpoint, f"query param is not URL-encoded: {endpoint!r}"

    def test_no_raw_space_reaches_the_url(self, client_and_transport) -> None:
        client, transport = client_and_transport
        client.find_user_sync(DISPLAY_INPUT)
        endpoint = transport.user_search_endpoints[0]
        assert " " not in endpoint, (
            f"a raw space in the URL makes curl exit 3, so the lookup can never "
            f"resolve: {endpoint!r}"
        )

    def test_display_name_lookup_actually_resolves(self, client_and_transport) -> None:
        client, transport = client_and_transport
        assert client.find_user_sync(DISPLAY_INPUT) == RESOLVABLE_ACCOUNT, (
            "a display-name lookup must resolve; the encoded query has to decode "
            f"back to the input. Endpoints: {transport.user_search_endpoints}"
        )

    @pytest.mark.parametrize(
        "raw",
        [
            "Dana Reyes",
            "Dana O'Reyes",
            "dana+alias@corp.example.com",
            "Dana & Co",
            "Dana#1",
            "Dana/Reyes",
            "Dana?x=1",
        ],
    )
    def test_query_round_trips_through_the_url(self, client_and_transport, raw: str) -> None:
        """Encoding is only correct if the server would parse back exactly the
        input. ``&`` unencoded injects a second parameter; ``+`` unencoded
        decodes to a space; ``#`` truncates the URL at a fragment."""
        client, transport = client_and_transport
        client.find_user_sync(raw)
        endpoint = transport.user_search_endpoints[0]
        assert "#" not in endpoint, f"unencoded '#' truncates the URL: {endpoint!r}"
        assert transport.decoded_query(endpoint) == raw, (
            f"the query does not survive the round trip: {endpoint!r} decodes to "
            f"{transport.decoded_query(endpoint)!r}, expected {raw!r}"
        )

    def test_lookup_is_still_read_only(self, client_and_transport) -> None:
        """Regression guard on the 162-7 contract."""
        client, transport = client_and_transport
        client.find_user_sync(DISPLAY_INPUT)
        assert [m for m, _, _ in transport.calls] == ["GET"], (
            f"user lookup must be read-only: {transport.calls}"
        )


# =============================================================================
# Harness integrity — a fake that stops being reached makes every test vacuous
# =============================================================================


class TestHarnessIntegrity:
    def test_transport_replaces_both_get_client_boundaries(
        self, jira_config, by_email: _FakeTransport
    ) -> None:
        from pf.jira.client import get_client as client_get
        from pf.jira.operations import get_client as ops_get

        assert client_get() is ops_get(), "the two get_client boundaries disagree"
        assert client_get()._call_api_sync is by_email, "the fake transport was not installed"

    def test_no_real_network_call_is_possible(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport, monkeypatch
    ) -> None:
        """subprocess.run is the only way out; poison it to prove nothing uses it."""

        def _boom(*a: Any, **kw: Any) -> Any:
            raise AssertionError(f"real curl invocation attempted: {a!r}")

        monkeypatch.setattr("pf.jira.client.subprocess.run", _boom, raising=True)
        result = _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL, "--dry-run"])
        assert result.exit_code == 0, _text(result)

    def test_emptying_the_directory_turns_success_into_loud_failure(
        self, runner: CliRunner, jira_config, by_email: _FakeTransport
    ) -> None:
        by_email.directory.clear()
        result = _invoke(runner, ["assign", ISSUE_KEY, ACCOUNT_EMAIL])
        assert result.exit_code != 0, f"lookup failure did not propagate: {_text(result)!r}"
        assert f"User not found: {ACCOUNT_EMAIL}" in _text(result), _text(result)
