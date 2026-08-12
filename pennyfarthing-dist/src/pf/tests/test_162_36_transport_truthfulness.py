"""162-36 transport truthfulness: ``_call_api_sync`` cannot tell a 204 from a failure.

Epic: 162 — Finish & sprint-tooling truthfulness.
Root cause behind 162-35's MEDIUM findings / 162-75.

``JiraClient._call_api_sync`` shells ``curl -s`` and returns ``json.loads(stdout)``
or ``None``. Three completely different outcomes all collapse into ``None``:

  * a legitimate **204 No Content** — the normal success shape for the assignee
    PUT and the transition POST (empty body, nothing to parse),
  * a **4xx/5xx** whose body is not JSON (or is suppressed),
  * a **curl transport failure** (non-zero exit: bad URL, DNS, TLS, timeout).

Because the write callers cannot distinguish those, ``assign_issue_sync`` and
``transition_sync`` discard the transport's answer entirely and
``return {"success": True}`` UNCONDITIONALLY. So a dry-run that validated
truthfully (162-34/162-35) can be followed by a real write that silently fails
and is reported as done. The status is never asked for: nothing in the curl
argv requests ``%{http_code}``, response headers, or a failing exit on 4xx, so
the information needed to be truthful never enters the process.

A second lie falls out of the same collapse in the READ direction: a 404's JSON
error body parses perfectly, so ``get_issue_sync`` hands the caller Jira's
``{"errorMessages": [...]}`` payload as if it were an issue.

These tests fake the transport at the **subprocess/curl seam** — the process
boundary, one level below 162-35's ``_call_api_sync`` fake, because the defect
IS ``_call_api_sync``. ``_FakeCurl`` emulates real curl faithfully enough that
the tests do not dictate the fix's mechanism: it honours ``-w
"%{http_code}"``/``--write-out``, ``-i``/``--include``, and
``--fail``/``--fail-with-body`` (exit 22 on 4xx/5xx), so any of the three
standard ways to learn the status will satisfy them. No network.

Post-fix seam contract (what Dev must add):

  * ``_call_api_sync`` must capture the real outcome — curl's **exit code** AND
    the **HTTP status** — and expose it to callers as a result object, e.g.
    ``_request_sync(method, endpoint, data) -> {"success": bool, "status":
    int | None, "data": Any | None, "error": str | None}``. Result objects, not
    throws.
  * 2xx (including 204 with an empty body) is success. Non-zero curl exit or
    4xx/5xx is a FAILURE the caller surfaces truthfully, naming the status.
  * ``_call_api_sync``'s existing reader contract is preserved: parsed JSON on
    2xx, ``None`` on failure — and ``None``, not the error body, on 4xx.

Acceptance criteria covered:
- [AC-1] a write whose underlying call fails (non-zero curl exit, or 4xx/5xx)
         makes ``assign_issue_sync``/``transition_sync`` return
         ``{"success": False, "error": ...}``, never success.
- [AC-2] the failure names the real HTTP status (or the transport exit) and
         leaks no credential material.
- [AC-3] a write answered with a legitimate 204 No Content (empty body, 2xx) is
         still SUCCESS — no over-correction.
- [AC-4] readers are unchanged by the shared-transport change: 200 + JSON still
         returns the parsed result, and a reader failure still fails (and a 404
         error body is never returned as if it were data).
"""

from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from typing import Any

import pytest

ISSUE_KEY = "PROJ-1"
ACCOUNT_ID = "acct-5f3a91"
ACCOUNT_EMAIL = "dana.reyes@corp.example.com"
TRANSITION_ID = "31"
TARGET_STATUS = "Done"

# Credential material that must never reach an operator-facing error string.
SECRET_TOKEN = "s3cr3t-jira-token"

USER_SEARCH_OK = [{"accountId": ACCOUNT_ID, "emailAddress": ACCOUNT_EMAIL, "displayName": "Dana"}]
TRANSITIONS_OK = {"transitions": [{"id": TRANSITION_ID, "name": TARGET_STATUS}]}
ISSUE_OK = {"key": ISSUE_KEY, "fields": {"summary": "Fixture issue", "assignee": None}}

# What Jira actually returns on a rejected write — valid JSON, so it parses.
FORBIDDEN_BODY = json.dumps({"errorMessages": ["You do not have permission to assign issues."]})
NOT_FOUND_BODY = json.dumps({"errorMessages": ["Issue does not exist or you do not have access."]})
SERVER_ERROR_BODY = "<html><body>500 Internal Server Error</body></html>"


# =============================================================================
# Fake curl — the process boundary, faked faithfully enough not to dictate the fix
# =============================================================================


@dataclass
class Reply:
    """One canned curl invocation outcome.

    ``exit_code`` is curl's own exit status (transport-level: 6 DNS, 7 connect,
    28 timeout, 3 bad URL). When it is non-zero there is no HTTP exchange at
    all, so ``status`` is meaningless and stdout is empty — exactly the shape
    that is currently indistinguishable from a 204.
    """

    status: int = 200
    body: str = ""
    exit_code: int = 0
    stderr: str = ""


@dataclass
class _Invocation:
    method: str
    url: str
    data: Any
    argv: list[str]
    write_out: str | None
    include_headers: bool
    fail_flag: bool


@dataclass
class _FakeCurl:
    """Stand-in for ``subprocess.run`` inside ``pf.jira.client``.

    Routes on (method, url substring) and emulates the curl options a truthful
    transport would reach for, so the tests accept any of them:

      * ``-w`` / ``--write-out`` — ``%{http_code}``/``%{response_code}`` are
        substituted and appended to stdout, after the body, as curl does.
      * ``-i`` / ``--include`` — a status line is prepended to stdout.
      * ``--fail`` / ``--fail-with-body`` — exit 22 on >=400; plain ``--fail``
        also suppresses the body, ``--fail-with-body`` keeps it. ``-w`` output
        is still emitted in both cases.

    An unrouted request is a test bug, not a pass: it raises, so a fake that
    stops being reached cannot silently make assertions vacuous.
    """

    routes: list[tuple[str, str, Reply]] = field(default_factory=list)
    calls: list[_Invocation] = field(default_factory=list)

    def route(self, method: str, contains: str, reply: Reply) -> _FakeCurl:
        self.routes.append((method.upper(), contains, reply))
        return self

    # --- subprocess.run signature -------------------------------------------

    def __call__(self, argv: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        inv = self._parse(argv)
        self.calls.append(inv)
        reply = self._match(inv)

        if reply.exit_code:
            # No HTTP exchange happened: empty stdout, diagnostics on stderr.
            return subprocess.CompletedProcess(
                argv,
                reply.exit_code,
                "",
                reply.stderr or f"curl: ({reply.exit_code}) transport failure",
            )

        failing = reply.status >= 400
        out = ""
        if inv.include_headers:
            out += f"HTTP/1.1 {reply.status} STATUS\r\ncontent-type: application/json\r\n\r\n"
        if not (failing and inv.fail_flag == "fail"):
            out += reply.body
        if inv.write_out is not None:
            out += self._render_write_out(inv.write_out, reply.status)

        returncode = 22 if failing and inv.fail_flag else 0
        return subprocess.CompletedProcess(argv, returncode, out, "")

    # --- argv parsing --------------------------------------------------------

    @staticmethod
    def _parse(argv: list[str]) -> _Invocation:
        method = "GET"
        write_out: str | None = None
        include = False
        fail_flag: Any = None
        data: Any = None
        positionals: list[str] = []
        i = 1  # argv[0] is "curl"
        while i < len(argv):
            arg = argv[i]
            if arg in ("-X", "--request"):
                method = argv[i + 1]
                i += 2
            elif arg in ("-w", "--write-out"):
                write_out = argv[i + 1]
                i += 2
            elif arg in ("-d", "--data", "--data-raw", "--data-binary", "--json"):
                data = argv[i + 1]
                i += 2
            elif arg in ("-H", "--header", "-u", "--user", "-o", "--output", "-D", "--dump-header"):
                i += 2
            elif arg == "--fail-with-body":
                fail_flag = "fail-with-body"
                i += 1
            elif arg in ("-f", "--fail"):
                fail_flag = "fail"
                i += 1
            elif arg in ("-i", "--include"):
                include = True
                i += 1
            elif arg.startswith("-"):
                i += 1  # -s, --silent, -S, -L, ...
            else:
                positionals.append(arg)
                i += 1

        assert positionals, f"curl invoked without a URL: {argv!r}"
        parsed_data: Any = data
        if isinstance(data, str):
            try:
                parsed_data = json.loads(data)
            except json.JSONDecodeError:
                parsed_data = data
        return _Invocation(
            method=method.upper(),
            url=positionals[-1],
            data=parsed_data,
            argv=list(argv),
            write_out=write_out,
            include_headers=include,
            fail_flag=fail_flag,
        )

    @staticmethod
    def _render_write_out(fmt: str, status: int) -> str:
        rendered = fmt.replace("\\n", "\n").replace("\\r", "\r").replace("\\t", "\t")
        rendered = re.sub(r"%\{(http_code|response_code)\}", str(status), rendered)
        return rendered

    def _match(self, inv: _Invocation) -> Reply:
        for method, contains, reply in self.routes:
            if method == inv.method and contains in inv.url:
                return reply
        raise AssertionError(
            f"fake curl has no route for {inv.method} {inv.url!r}; "
            f"routes: {[(m, c) for m, c, _ in self.routes]}"
        )

    # --- recorded-call views -------------------------------------------------

    @property
    def writes(self) -> list[_Invocation]:
        return [c for c in self.calls if c.method in ("PUT", "POST", "DELETE")]

    def asks_for_status(self, inv: _Invocation) -> bool:
        """Did this invocation give curl any way to report the HTTP status?"""
        return (
            (inv.write_out is not None and "%{" in inv.write_out)
            or inv.include_headers
            or inv.fail_flag is not None
        )


def _client(fake: _FakeCurl, monkeypatch: pytest.MonkeyPatch) -> Any:
    """A REAL JiraClient with only ``subprocess.run`` faked.

    The defect lives in ``_call_api_sync`` itself, so nothing above the process
    boundary may be stubbed. Credentials sit in base_url/user/token so the
    no-leak assertions have something to catch.
    """
    from pf.jira.client import JiraClient

    monkeypatch.setattr("pf.jira.client.subprocess.run", fake, raising=True)
    return JiraClient(
        base_url=f"https://oauth2:{SECRET_TOKEN}@jira.example.test",
        user=f"operator:{SECRET_TOKEN}",
        token=SECRET_TOKEN,
    )


def _assign_fake(assignee_reply: Reply) -> _FakeCurl:
    return (
        _FakeCurl()
        .route("GET", "/rest/api/3/user/search", Reply(200, json.dumps(USER_SEARCH_OK)))
        .route("PUT", f"/issue/{ISSUE_KEY}/assignee", assignee_reply)
    )


def _transition_fake(post_reply: Reply) -> _FakeCurl:
    return (
        _FakeCurl()
        .route("GET", f"/issue/{ISSUE_KEY}/transitions", Reply(200, json.dumps(TRANSITIONS_OK)))
        .route("POST", f"/issue/{ISSUE_KEY}/transitions", post_reply)
    )


def _error_text(result: dict[str, Any]) -> str:
    return str(result.get("error") or "")


# =============================================================================
# AC-1 — a failed write must NOT be reported as success
# =============================================================================

TRANSPORT_FAILURES = [
    pytest.param(Reply(exit_code=6, stderr="curl: (6) Could not resolve host"), id="curl-exit-6"),
    pytest.param(Reply(exit_code=7, stderr="curl: (7) Failed to connect"), id="curl-exit-7"),
    pytest.param(Reply(exit_code=28, stderr="curl: (28) Operation timed out"), id="curl-exit-28"),
]

HTTP_FAILURES = [
    pytest.param(Reply(400, json.dumps({"errorMessages": ["Bad request"]})), id="http-400"),
    pytest.param(Reply(403, FORBIDDEN_BODY), id="http-403"),
    pytest.param(Reply(404, NOT_FOUND_BODY), id="http-404"),
    pytest.param(Reply(500, SERVER_ERROR_BODY), id="http-500"),
    pytest.param(Reply(503, ""), id="http-503-empty"),
]


class TestAssignWriteFailureIsReported:
    """``assign_issue_sync`` discards the transport's answer and returns
    ``{"success": True}`` unconditionally. Every one of these is a write that
    did not happen, reported as a write that did."""

    @pytest.mark.parametrize("reply", TRANSPORT_FAILURES)
    def test_curl_transport_failure_fails(self, monkeypatch, reply: Reply) -> None:
        fake = _assign_fake(reply)
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert result.get("success") is False, (
            f"curl exited {reply.exit_code} — nothing reached Jira — yet the assignment "
            f"was reported as done: {result!r}"
        )
        assert _error_text(result), f"a failure must carry an error: {result!r}"

    @pytest.mark.parametrize("reply", HTTP_FAILURES)
    def test_http_error_status_fails(self, monkeypatch, reply: Reply) -> None:
        fake = _assign_fake(reply)
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert result.get("success") is False, (
            f"Jira rejected the assignee PUT with {reply.status} and the caller was "
            f"told it succeeded: {result!r}"
        )
        assert _error_text(result), f"a failure must carry an error: {result!r}"

    def test_unassign_failure_also_fails(self, monkeypatch) -> None:
        """The ``assignee_email=None`` (unassign) branch skips user lookup and
        goes straight to the write, so it needs its own coverage."""
        fake = _FakeCurl().route("PUT", f"/issue/{ISSUE_KEY}/assignee", Reply(403, FORBIDDEN_BODY))
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, None)
        assert result.get("success") is False, f"failed unassign reported as done: {result!r}"


class TestTransitionWriteFailureIsReported:
    """``transition_sync`` resolves the transition truthfully (162-34) and then
    throws away the result of the POST that actually performs it."""

    @pytest.mark.parametrize("reply", TRANSPORT_FAILURES)
    def test_curl_transport_failure_fails(self, monkeypatch, reply: Reply) -> None:
        fake = _transition_fake(reply)
        result = _client(fake, monkeypatch).transition_sync(ISSUE_KEY, TARGET_STATUS)
        assert result.get("success") is False, (
            f"curl exited {reply.exit_code} on the transition POST, reported as "
            f"transitioned: {result!r}"
        )
        assert _error_text(result), f"a failure must carry an error: {result!r}"

    @pytest.mark.parametrize("reply", HTTP_FAILURES)
    def test_http_error_status_fails(self, monkeypatch, reply: Reply) -> None:
        fake = _transition_fake(reply)
        result = _client(fake, monkeypatch).transition_sync(ISSUE_KEY, TARGET_STATUS)
        assert result.get("success") is False, (
            f"Jira rejected the transition POST with {reply.status}; the issue is "
            f"still in its old status but the caller was told otherwise: {result!r}"
        )
        assert _error_text(result), f"a failure must carry an error: {result!r}"

    def test_the_post_was_actually_attempted(self, monkeypatch) -> None:
        """Harness integrity: the failure must come from the write, not from
        the resolution step short-circuiting before it."""
        fake = _transition_fake(Reply(403, FORBIDDEN_BODY))
        _client(fake, monkeypatch).transition_sync(ISSUE_KEY, TARGET_STATUS)
        assert [w.url for w in fake.writes], f"no write was attempted: {fake.calls}"


# =============================================================================
# AC-2 — the failure names the real status, and leaks nothing
# =============================================================================


class TestFailureNamesTheStatus:
    """ "It failed" is better than a lie, but the operator needs to know WHICH
    failure: 403 is a permissions problem to escalate, 500 is a retry, a curl
    exit is the operator's own network. The transport must capture and surface
    the status — that capture is the whole point of the fix."""

    @pytest.mark.parametrize("status", [400, 403, 404, 500])
    def test_assign_error_mentions_the_http_status(self, monkeypatch, status: int) -> None:
        fake = _assign_fake(Reply(status, FORBIDDEN_BODY))
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert str(status) in _error_text(result), (
            f"the operator cannot tell a permissions failure from an outage: {result!r}"
        )

    @pytest.mark.parametrize("status", [400, 403, 500])
    def test_transition_error_mentions_the_http_status(self, monkeypatch, status: int) -> None:
        fake = _transition_fake(Reply(status, FORBIDDEN_BODY))
        result = _client(fake, monkeypatch).transition_sync(ISSUE_KEY, TARGET_STATUS)
        assert str(status) in _error_text(result), (
            f"the transition failure does not say what Jira answered: {result!r}"
        )

    @pytest.mark.parametrize("reply", TRANSPORT_FAILURES + HTTP_FAILURES)
    def test_error_never_leaks_credentials(self, monkeypatch, reply: Reply) -> None:
        """Failure paths now build messages from curl's output and the request —
        both of which carry ``-u user:token`` and a credentialed base URL."""
        fake = _assign_fake(reply)
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert SECRET_TOKEN not in _error_text(result), (
            f"credential material leaked into the error: {result!r}"
        )

    def test_transport_asks_curl_for_the_status(self, monkeypatch) -> None:
        """The seam-shape claim, stated directly: today's argv is
        ``curl -s -X PUT -H ... -u ... -d ... URL`` — it never requests
        ``%{http_code}``, response headers, or a failing exit code, so the
        status cannot be known no matter what the callers do. Any of the three
        mechanisms satisfies this."""
        fake = _assign_fake(Reply(204, ""))
        _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert fake.calls, "no curl invocation was made"
        unequipped = [c.argv for c in fake.calls if not fake.asks_for_status(c)]
        assert not unequipped, (
            "the transport gives curl no way to report the HTTP status "
            "(-w '%{http_code}', -i, or --fail/--fail-with-body), so a 204 and a "
            f"403 arrive identically: {unequipped!r}"
        )


# =============================================================================
# AC-3 — 204 No Content is SUCCESS (guard against over-correction)
# =============================================================================

WRITE_SUCCESSES = [
    pytest.param(Reply(204, ""), id="204-empty"),
    pytest.param(Reply(200, ""), id="200-empty-body"),
    pytest.param(Reply(201, ""), id="201-empty-body"),
]


class TestEmptyButSuccessfulWrites:
    """Empty-but-2xx is the NORMAL success shape for the assignee PUT and the
    transition POST. A fix that treats "unparseable body" as failure trades a
    false success for a false failure."""

    @pytest.mark.parametrize("reply", WRITE_SUCCESSES)
    def test_assign_succeeds(self, monkeypatch, reply: Reply) -> None:
        fake = _assign_fake(reply)
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert result.get("success") is True, (
            f"HTTP {reply.status} with an empty body is a successful write, not a "
            f"failure: {result!r}"
        )
        assert not _error_text(result), f"success must not carry an error: {result!r}"

    @pytest.mark.parametrize("reply", WRITE_SUCCESSES)
    def test_transition_succeeds(self, monkeypatch, reply: Reply) -> None:
        fake = _transition_fake(reply)
        result = _client(fake, monkeypatch).transition_sync(ISSUE_KEY, TARGET_STATUS)
        assert result.get("success") is True, (
            f"the transition POST answers {reply.status} with no body on success: {result!r}"
        )

    def test_assign_204_still_sends_the_resolved_account_id(self, monkeypatch) -> None:
        """Regression guard on the 162-35 contract: the payload must still be
        the resolved accountId, not the raw identifier."""
        fake = _assign_fake(Reply(204, ""))
        _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert len(fake.writes) == 1, f"expected one assignee write: {fake.calls}"
        assert (fake.writes[0].data or {}).get("accountId") == ACCOUNT_ID, (
            f"the write must carry the resolved accountId: {fake.writes[0].data!r}"
        )

    def test_unassign_204_succeeds(self, monkeypatch) -> None:
        fake = _FakeCurl().route("PUT", f"/issue/{ISSUE_KEY}/assignee", Reply(204, ""))
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, None)
        assert result.get("success") is True, f"a successful unassign failed: {result!r}"
        assert (fake.writes[0].data or {}).get("accountId") is None, fake.writes[0].data


# =============================================================================
# AC-4 — readers unchanged by the shared-transport change
# =============================================================================


class TestReadersStillParse2xxJson:
    """``_call_api_sync`` is shared by every read caller. Adding status capture
    must not disturb the "parsed JSON on 2xx" contract they all depend on —
    including when the status is appended to stdout by ``-w``, which a naive
    implementation would feed straight into ``json.loads``."""

    def test_get_issue_returns_the_parsed_issue(self, monkeypatch) -> None:
        fake = _FakeCurl().route("GET", f"/issue/{ISSUE_KEY}", Reply(200, json.dumps(ISSUE_OK)))
        assert _client(fake, monkeypatch).get_issue_sync(ISSUE_KEY) == ISSUE_OK

    def test_search_returns_the_parsed_issue_list(self, monkeypatch) -> None:
        payload = {"issues": [ISSUE_OK], "total": 1}
        fake = _FakeCurl().route("GET", "/search/jql", Reply(200, json.dumps(payload)))
        assert _client(fake, monkeypatch).search_issues_sync("project = PROJ") == [ISSUE_OK]

    def test_get_transitions_returns_the_parsed_list(self, monkeypatch) -> None:
        fake = _FakeCurl().route(
            "GET", f"/issue/{ISSUE_KEY}/transitions", Reply(200, json.dumps(TRANSITIONS_OK))
        )
        got = _client(fake, monkeypatch).get_transitions_sync(ISSUE_KEY)
        assert got == TRANSITIONS_OK["transitions"], got

    def test_find_user_returns_the_first_account(self, monkeypatch) -> None:
        fake = _FakeCurl().route("GET", "/user/search", Reply(200, json.dumps(USER_SEARCH_OK)))
        assert _client(fake, monkeypatch).find_user_sync(ACCOUNT_EMAIL) == USER_SEARCH_OK[0]

    def test_create_issue_returns_the_created_issue(self, monkeypatch) -> None:
        created = {"id": "10001", "key": ISSUE_KEY}
        fake = _FakeCurl().route("POST", "/rest/api/3/issue", Reply(201, json.dumps(created)))
        got = _client(fake, monkeypatch).create_issue_sync({"fields": {"summary": "x"}})
        assert got == created, got


class TestReaderFailuresStillFail:
    """A read that could not be performed must stay distinguishable from a read
    that returned nothing — the 162-34 rule that made dry-runs truthful."""

    @pytest.mark.parametrize("reply", TRANSPORT_FAILURES)
    def test_get_issue_returns_none_on_transport_failure(self, monkeypatch, reply: Reply) -> None:
        fake = _FakeCurl().route("GET", f"/issue/{ISSUE_KEY}", reply)
        assert _client(fake, monkeypatch).get_issue_sync(ISSUE_KEY) is None

    @pytest.mark.parametrize("status", [401, 403, 404, 500])
    def test_get_issue_never_returns_the_error_body_as_an_issue(
        self, monkeypatch, status: int
    ) -> None:
        """Jira's error payload is valid JSON, so ``json.loads`` succeeds and the
        error dict is handed back as if it were the issue. Callers then read
        ``.get("fields")`` off an error and see an issue with no fields."""
        fake = _FakeCurl().route("GET", f"/issue/{ISSUE_KEY}", Reply(status, NOT_FOUND_BODY))
        got = _client(fake, monkeypatch).get_issue_sync(ISSUE_KEY)
        assert got is None, f"HTTP {status} error body returned as an issue: {got!r}"

    @pytest.mark.parametrize("reply", TRANSPORT_FAILURES)
    def test_get_transitions_returns_none_on_transport_failure(
        self, monkeypatch, reply: Reply
    ) -> None:
        """None means "could not read", never "no transition available" (162-34)."""
        fake = _FakeCurl().route("GET", f"/issue/{ISSUE_KEY}/transitions", reply)
        assert _client(fake, monkeypatch).get_transitions_sync(ISSUE_KEY) is None

    @pytest.mark.parametrize("status", [403, 404, 500])
    def test_get_transitions_returns_none_on_http_error(self, monkeypatch, status: int) -> None:
        fake = _FakeCurl().route(
            "GET", f"/issue/{ISSUE_KEY}/transitions", Reply(status, NOT_FOUND_BODY)
        )
        assert _client(fake, monkeypatch).get_transitions_sync(ISSUE_KEY) is None

    @pytest.mark.parametrize("status", [400, 403, 500])
    def test_search_returns_empty_on_http_error(self, monkeypatch, status: int) -> None:
        fake = _FakeCurl().route("GET", "/search/jql", Reply(status, NOT_FOUND_BODY))
        assert _client(fake, monkeypatch).search_issues_sync("bad jql") == []

    def test_find_user_returns_none_on_http_error(self, monkeypatch) -> None:
        fake = _FakeCurl().route("GET", "/user/search", Reply(403, FORBIDDEN_BODY))
        assert _client(fake, monkeypatch).find_user_sync(ACCOUNT_EMAIL) is None

    def test_transition_reports_unreadable_transitions(self, monkeypatch) -> None:
        """A failed resolution read must still fail loudly at the write caller."""
        fake = _FakeCurl().route("GET", f"/issue/{ISSUE_KEY}/transitions", Reply(exit_code=7))
        result = _client(fake, monkeypatch).transition_sync(ISSUE_KEY, TARGET_STATUS)
        assert result.get("success") is False, result
        assert fake.writes == [], f"wrote after an unreadable resolution: {fake.writes}"

    def test_assign_reports_unresolvable_user_without_writing(self, monkeypatch) -> None:
        fake = _FakeCurl().route("GET", "/user/search", Reply(200, "[]"))
        result = _client(fake, monkeypatch).assign_issue_sync(ISSUE_KEY, "nobody@example.test")
        assert result.get("success") is False, result
        assert "nobody@example.test" in _error_text(result), result
        assert fake.writes == [], f"assigned an unresolved user: {fake.writes}"

    def test_no_token_short_circuits_without_invoking_curl(self, monkeypatch) -> None:
        """Preserved contract: with no credentials nothing leaves the process."""
        from pf.jira.client import JiraClient

        fake = _FakeCurl()
        monkeypatch.setattr("pf.jira.client.subprocess.run", fake, raising=True)
        client = JiraClient(base_url="https://jira.example.test", user="u", token="")
        assert client.get_issue_sync(ISSUE_KEY) is None
        assert client.assign_issue_sync(ISSUE_KEY, None).get("success") is False, (
            "a write with no credentials cannot have happened"
        )
        assert fake.calls == [], f"curl was invoked without credentials: {fake.calls}"


# =============================================================================
# Harness integrity — prove the fake is the only exit and that it can fail
# =============================================================================


class TestHarnessIntegrity:
    def test_real_subprocess_is_never_used(self, monkeypatch) -> None:
        fake = _assign_fake(Reply(204, ""))
        client = _client(fake, monkeypatch)
        import pf.jira.client as client_mod

        assert client_mod.subprocess.run is fake, "the fake transport was not installed"
        client.assign_issue_sync(ISSUE_KEY, ACCOUNT_EMAIL)
        assert fake.calls, "the fake was never reached — assertions would be vacuous"

    def test_unrouted_request_is_a_loud_failure(self, monkeypatch) -> None:
        fake = _FakeCurl()
        with pytest.raises(AssertionError, match="no route"):
            _client(fake, monkeypatch).get_issue_sync(ISSUE_KEY)

    def test_fake_emulates_write_out_status_capture(self, monkeypatch) -> None:
        """Prove the fake honours ``-w '%{http_code}'`` so the fix has a real
        mechanism available to it, and that the tests are not unsatisfiable."""
        fake = _FakeCurl().route("GET", "/probe", Reply(204, ""))
        out = fake(["curl", "-s", "-w", "\\n%{http_code}", "https://jira.example.test/probe"])
        assert out.returncode == 0
        assert out.stdout.strip() == "204", out.stdout

    def test_fake_emulates_fail_with_body_exit_22(self, monkeypatch) -> None:
        fake = _FakeCurl().route("GET", "/probe", Reply(403, FORBIDDEN_BODY))
        out = fake(["curl", "-s", "--fail-with-body", "https://jira.example.test/probe"])
        assert out.returncode == 22, out
        assert "permission" in out.stdout, out.stdout
