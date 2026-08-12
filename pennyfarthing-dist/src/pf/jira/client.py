"""
Jira client and helper functions for Pennyfarthing scripts.

Wraps the `jira` CLI tool and REST API for issue operations.
"""

import base64
import json
import os
import re
import shutil
import subprocess
import sys
from typing import Any
from urllib.parse import quote, urlencode

# Configuration


class JiraConfigError(RuntimeError):
    """Raised when a Jira operation needs config that is not present."""


class ResolvedUser(str):
    """An assignee identifier that already knows the accountId it resolved to.

    Behaves as the plain identifier string for display and comparison, so
    callers holding only an email (``claim.py``, ``story_update.py``) keep
    working, while a caller that has already run ``find_user_sync`` can hand the
    resolution down to the write instead of paying for a second lookup.
    """

    account_id: str | None

    def __new__(cls, value: str, account_id: str | None = None) -> "ResolvedUser":
        obj = super().__new__(cls, value)
        obj.account_id = account_id
        return obj


def _resolve_jira_config() -> tuple[str | None, str | None]:
    """Resolve Jira project and URL from config file or env.

    Returns a tuple of (project, url) where each value is either the configured
    string or ``None`` when unset. The framework must work in projects with no
    Jira at all, so this function does not raise; callers that need a project
    key call :func:`require_jira_project` to fail loudly at point of use.
    """
    try:
        from pf.common.config import load_pennyfarthing_config

        config = load_pennyfarthing_config()
        jira_cfg = config.get("jira") or {}
    except Exception:  # config is optional; Jira ops work without it
        jira_cfg = {}
    project = jira_cfg.get("project") or os.environ.get("JIRA_PROJECT") or None
    url = jira_cfg.get("url") or os.environ.get("JIRA_URL") or None
    return project, url


def require_jira_project(value: str | None = None) -> str:
    """Return the configured Jira project key or raise :class:`JiraConfigError`.

    Pass an explicit ``value`` (e.g. the imported ``JIRA_PROJECT`` constant) to
    avoid re-resolving config. Empty strings are treated as unset.
    """
    if value is None:
        value, _url = _resolve_jira_config()
    if not (value and value.strip()):
        raise JiraConfigError(
            "Jira project key not configured. "
            "Set jira.project in .pennyfarthing/config.local.yaml or "
            "export JIRA_PROJECT before running Jira operations."
        )
    return value.strip()


_resolved_project, _resolved_url = _resolve_jira_config()
# Module-level constants kept as strings for backward compat with existing
# importers. Callers that need fail-loud behavior must use require_jira_project.
JIRA_PROJECT: str = _resolved_project or ""
JIRA_URL: str = _resolved_url or ""


def is_jira_enabled() -> bool:
    """Return True only when both `jira.project` and `jira.url` resolve to
    non-empty `str` values via config or env.

    Re-reads config on every call so tests can monkeypatch
    `pf.common.config.load_pennyfarthing_config`.

    Non-string truthy values (e.g. `project: true` or `project: 1` in YAML)
    and whitespace-only strings (`project: '   '`) do NOT enable jira —
    AC1 of story 152-2 requires explicit non-empty string config.

    Fail-closed with defense in depth: `_resolve_jira_config` swallows
    config-load errors internally and returns `("", "")`. As a second
    layer, this predicate also wraps the resolver call so any future
    refactor that removes the inner handler still yields False rather
    than propagating an exception to gate call sites.
    """
    try:
        project, url = _resolve_jira_config()
    except Exception:
        return False
    return (
        isinstance(project, str)
        and bool(project.strip())
        and isinstance(url, str)
        and bool(url.strip())
    )


# Status mappings: Pennyfarthing -> Jira
STATUS_TO_JIRA = {
    "backlog": "To Do",
    "todo": "To Do",
    "in-progress": "In Progress",
    "in_progress": "In Progress",
    "active": "In Progress",
    "review": "In Review",
    "in-review": "In Review",
    "in_review": "In Review",
    "done": "Done",
    "completed": "Done",
    "closed": "Done",
    "cancelled": "Done",
    "blocked": "Blocked",
}

# Status mappings: Jira -> Pennyfarthing
JIRA_TO_STATUS = {
    "To Do": "backlog",
    "Open": "backlog",
    "Backlog": "backlog",
    "In Progress": "in_progress",
    "Active": "in_progress",
    "In Review": "in_review",
    "Review": "in_review",
    "Done": "done",
    "Closed": "done",
    "Resolved": "done",
    "Blocked": "blocked",
}


def map_status_to_jira(pennyfarthing_status: str | None) -> str:
    """Map Pennyfarthing status to Jira status.

    Args:
        pennyfarthing_status: Status from sprint YAML

    Returns:
        Corresponding Jira status name
    """
    if not pennyfarthing_status:
        return "To Do"
    return STATUS_TO_JIRA.get(pennyfarthing_status.lower(), "To Do")


def map_jira_to_status(jira_status: str | None) -> str:
    """Map Jira status to Pennyfarthing status.

    Args:
        jira_status: Status name from Jira

    Returns:
        Corresponding Pennyfarthing status
    """
    if not jira_status:
        return "backlog"
    return JIRA_TO_STATUS.get(jira_status, "backlog")


def extract_jira_key(input_value: str | None) -> str | None:
    """Extract Jira key from URL or return as-is.

    Args:
        input_value: Jira key or URL containing key

    Returns:
        Extracted Jira key, or None if input is None
    """
    if not input_value:
        return None

    # Already in key format (any PROJECT-NUMBER pattern)
    key_pattern = re.compile(r"^[A-Z][A-Z0-9]+-\d+$")
    if key_pattern.match(input_value):
        return input_value

    # Extract from URL (any PROJECT-NUMBER pattern)
    url_pattern = re.compile(r"([A-Z][A-Z0-9]+-\d+)")
    match = url_pattern.search(input_value)
    return match.group(1) if match else input_value


def is_jira_cli_available() -> bool:
    """Check if the jira CLI is available.

    Returns:
        True if jira CLI is installed and accessible
    """
    return shutil.which("jira") is not None


def get_jira_field(issue_json: dict[str, Any], field_path: str, default: Any = None) -> Any:
    """Extract field from Jira issue JSON using dot notation.

    Args:
        issue_json: Issue data dict
        field_path: Dot-separated path (e.g., "fields.status.name")
        default: Default value if not found

    Returns:
        Field value or default
    """
    if not issue_json:
        return default

    parts = field_path.lstrip(".").split(".")
    value = issue_json

    for part in parts:
        if value is None:
            return default
        if isinstance(value, dict):
            value = value.get(part)
        else:
            return default

    return value if value is not None else default


def get_story_points(issue_key: str, issue_json: dict[str, Any] | None = None) -> int | None:
    """Get story points from an issue.

    Args:
        issue_key: Jira issue key
        issue_json: Optional pre-fetched issue JSON (required if no default client)

    Returns:
        Story points as int, or None if not set
    """
    if issue_json is None:
        issue_json = get_client().get_issue_sync(issue_key)
    if not issue_json:
        return None

    # customfield_10031 is Story Points (common Jira Cloud default)
    points = get_jira_field(issue_json, "fields.customfield_10031")
    return int(points) if points is not None else None


def check_dependencies(quiet: bool = False) -> dict[str, list[str]]:
    """Check if jira CLI and dependencies are available.

    Args:
        quiet: If True, suppress output

    Returns:
        Dict with 'available' and 'missing' lists
    """
    from pathlib import Path

    available = []
    missing = []

    # Check for jira CLI
    if is_jira_cli_available():
        available.append("jira")
    else:
        missing.append("jira")
        if not quiet:
            print("[ERROR] jira not found", file=sys.stderr)
            print("  Install with: brew install ankitpokhrel/jira-cli/jira-cli", file=sys.stderr)
            print("  Then run: jira init", file=sys.stderr)

    # Check for JIRA_API_TOKEN
    if os.environ.get("JIRA_API_TOKEN"):
        available.append("JIRA_API_TOKEN")
    else:
        missing.append("JIRA_API_TOKEN")
        if not quiet:
            print("[ERROR] JIRA_API_TOKEN not set", file=sys.stderr)
            print(
                "  Create token at: https://id.atlassian.com/manage-profile/security/api-tokens",
                file=sys.stderr,
            )
            print('  Then: export JIRA_API_TOKEN="your-token"', file=sys.stderr)

    # Check jira config
    config_path = Path.home() / ".config" / ".jira" / ".config.yml"
    if config_path.exists():
        available.append("jira-config")
    elif "jira" not in missing:
        missing.append("jira-config")
        if not quiet:
            print("[ERROR] jira not configured", file=sys.stderr)
            print("  Run: jira init", file=sys.stderr)

    return {"available": available, "missing": missing}


# GitHub username to Jira email mapping.
# Configure per-project in .pennyfarthing/config.local.yaml under jira.user_map:
#   jira:
#     user_map:
#       github_user: jira-email@example.com
GITHUB_TO_JIRA_MAP: dict[str, str] = {}


def _load_user_map() -> dict[str, str]:
    """Load GitHub→Jira user map from project config."""
    try:
        from pf.common.config import load_pennyfarthing_config

        config = load_pennyfarthing_config()
        return config.get("jira", {}).get("user_map", {})
    except Exception:
        return {}


def map_github_to_jira(github_user: str | None) -> str | None:
    """Map GitHub username to Jira email.

    Checks jira.user_map in config.local.yaml only. There is deliberately NO
    fallback to the operator's own email: an unmapped username used to resolve
    to whoever ran the command, so assigning to a teammate silently targeted
    the operator (gh #146). An unmapped username returns None so callers can
    fail loudly or query Jira with the raw identifier.

    Args:
        github_user: GitHub username

    Returns:
        Jira email address, or None if input is None or unmapped
    """
    if github_user is None:
        return None

    return _load_user_map().get(github_user)


def get_current_user_email() -> str:
    """Get the current user's Jira email address.

    Resolution order:
    1. JIRA_USER environment variable
    2. git config user.email
    3. Default fallback

    Returns:
        Email address string
    """
    jira_user = os.environ.get("JIRA_USER")
    if jira_user:
        return jira_user

    try:
        result = subprocess.run(
            ["git", "config", "user.email"],
            capture_output=True,
            text=True,
            timeout=5,
        )
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip()
    except Exception:
        pass

    return "user@example.com"


# =============================================================================
# JiraClient - Unified REST API client
# =============================================================================


class JiraClient:
    """Unified Jira REST API client with sync and async support.

    Consolidates all Jira REST API access.

    Usage (sync):
        client = JiraClient()
        issue = client.get_issue_sync("PROJ-12345")

    Usage (async):
        client = JiraClient()
        issue = await client.get_issue_async("PROJ-12345")
    """

    def __init__(
        self,
        base_url: str | None = None,
        user: str | None = None,
        token: str | None = None,
    ):
        """Initialize Jira client.

        Args:
            base_url: Jira instance URL (defaults to JIRA_URL env/constant)
            user: Jira user email (defaults to JIRA_USER env)
            token: API token (defaults to JIRA_API_TOKEN env)
        """
        self.base_url = base_url or JIRA_URL
        self.user = user or os.environ.get("JIRA_USER", "user@example.com")
        # Use explicit token if provided (even empty), otherwise fall back to env var
        self.token = token if token is not None else os.environ.get("JIRA_API_TOKEN", "")

    def _get_auth_header(self) -> dict[str, str]:
        """Build authorization header for REST API.

        Returns:
            Dict with Authorization header, or empty dict if no token
        """
        if not self.token:
            return {}

        credentials = base64.b64encode(f"{self.user}:{self.token}".encode()).decode()
        return {"Authorization": f"Basic {credentials}"}

    def _get_headers(self, content_type: bool = False) -> dict[str, str]:
        """Build full headers for API request.

        Args:
            content_type: Include Content-Type header for POST/PUT

        Returns:
            Headers dict
        """
        headers = self._get_auth_header()
        headers["Accept"] = "application/json"
        if content_type:
            headers["Content-Type"] = "application/json"
        return headers

    # -------------------------------------------------------------------------
    # Sync methods (using subprocess curl for reliability)
    # -------------------------------------------------------------------------

    def _call_api_sync(
        self,
        method: str,
        endpoint: str,
        data: dict[str, Any] | None = None,
    ) -> dict[str, Any] | None:
        """Call Jira REST API synchronously.

        Args:
            method: HTTP method (GET, POST, PUT)
            endpoint: API endpoint (e.g., /rest/api/3/issue/PROJ-123)
            data: Request body data

        Returns:
            Response JSON if successful, None otherwise
        """
        if not self.token:
            return None

        url = f"{self.base_url}{endpoint}"

        curl_args = [
            "curl",
            "-s",
            "-X",
            method,
            "-H",
            "Accept: application/json",
            "-H",
            "Content-Type: application/json",
            "-u",
            f"{self.user}:{self.token}",
        ]

        if data:
            curl_args.extend(["-d", json.dumps(data)])

        curl_args.append(url)

        result = subprocess.run(curl_args, capture_output=True, text=True)

        if result.returncode != 0:
            return None

        try:
            return json.loads(result.stdout)
        except json.JSONDecodeError:
            return None

    def get_issue_sync(self, issue_key: str) -> dict[str, Any] | None:
        """Fetch issue from Jira synchronously.

        Args:
            issue_key: Jira issue key (e.g., PROJ-12345)

        Returns:
            Issue JSON dict or None if not found
        """
        return self._call_api_sync("GET", f"/rest/api/3/issue/{issue_key}")

    def create_issue_sync(self, payload: dict[str, Any]) -> dict[str, Any] | None:
        """Create a Jira issue synchronously.

        Args:
            payload: Issue creation payload with fields

        Returns:
            Created issue JSON (with key, id) or None on failure
        """
        return self._call_api_sync("POST", "/rest/api/3/issue", payload)

    def update_issue_sync(self, issue_key: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        """Update issue fields synchronously.

        Args:
            issue_key: Jira issue key
            fields: Fields to update

        Returns:
            Response JSON or None on failure
        """
        return self._call_api_sync("PUT", f"/rest/api/3/issue/{issue_key}", {"fields": fields})

    def get_transitions_sync(self, issue_key: str) -> list[dict[str, Any]] | None:
        """List the transitions currently available on an issue, read-only.

        The single resolution rule shared by dry-run previews and real
        transitions. GET only — it never mutates.

        Args:
            issue_key: Jira issue key

        Returns:
            List of transition dicts, or None if the transitions could not be
            read (missing issue / API failure) — so callers never mistake
            "could not read" for "no transition available".
        """
        transitions_data = self._call_api_sync("GET", f"/rest/api/3/issue/{issue_key}/transitions")
        if not transitions_data:
            return None
        return transitions_data.get("transitions", [])

    def transition_sync(self, issue_key: str, target_status: str) -> dict[str, Any]:
        """Transition issue to target status synchronously.

        Fetches available transitions, finds the matching one, and executes it.

        Args:
            issue_key: Jira issue key
            target_status: Target status name (e.g., "In Progress", "Done")

        Returns:
            Result dict with success status and optional reason
        """
        transitions = self.get_transitions_sync(issue_key)
        if transitions is None:
            return {"success": False, "error": "Could not get transitions"}

        transition_id = None
        for t in transitions:
            if t.get("name", "").lower() == target_status.lower():
                transition_id = t.get("id")
                break

        if not transition_id:
            available = [t.get("name") for t in transitions]
            return {
                "success": False,
                "error": f"No transition to '{target_status}' available. Available: {available}",
            }

        self._call_api_sync(
            "POST",
            f"/rest/api/3/issue/{issue_key}/transitions",
            {"transition": {"id": transition_id}},
        )
        # Transition POST returns empty body on success (204)
        # _call_api_sync returns None on empty response, which is OK here
        return {"success": True}

    def find_user_sync(self, query: str) -> dict[str, Any] | None:
        """Look up a Jira user, read-only.

        The single resolution rule shared by dry-run previews and real
        assignments. GET only — it never mutates.

        Args:
            query: Email address, display name, or account id to search for

        Returns:
            The first matching account dict (accountId, emailAddress,
            displayName), or None when nothing matches and None when the
            call fails (no credentials, transport error). Never raises.
        """
        # The query is user-supplied: display names contain spaces (curl exits 3
        # on a raw space) and "&", "#", "+" change the URL's meaning entirely.
        endpoint = "/rest/api/3/user/search?" + urlencode({"query": query}, quote_via=quote)
        users = self._call_api_sync("GET", endpoint)
        if not users or not isinstance(users, list):
            return None
        first = users[0]
        return first if isinstance(first, dict) else None

    def assign_issue_sync(self, issue_key: str, assignee_email: str | None) -> dict[str, Any]:
        """Assign issue to a user synchronously via REST API.

        Args:
            issue_key: Jira issue key
            assignee_email: Jira user email, or None to unassign

        Returns:
            Result dict with success status
        """
        # Jira Cloud REST API uses accountId, but we can search by email
        if assignee_email:
            # A caller that already resolved the account (operations.assign_issue)
            # hands the accountId down with it; re-looking it up here would
            # search by a string the user never typed and could fail after a
            # dry-run previewed success.
            account_id = getattr(assignee_email, "account_id", None)
            if not account_id:
                account = self.find_user_sync(assignee_email)
                if not account:
                    return {
                        "success": False,
                        "error": f"User not found: {assignee_email}",
                    }
                account_id = account.get("accountId")
        else:
            account_id = None

        payload = {"accountId": account_id}
        self._call_api_sync("PUT", f"/rest/api/3/issue/{issue_key}/assignee", payload)
        # Assign PUT returns empty body on success (204)
        return {"success": True}

    def add_comment_sync(self, issue_key: str, comment: str) -> dict[str, Any]:
        """Add a comment to a Jira issue via REST API.

        Args:
            issue_key: Jira issue key
            comment: Comment body text

        Returns:
            Result dict with success status
        """
        payload = {
            "body": {
                "type": "doc",
                "version": 1,
                "content": [
                    {
                        "type": "paragraph",
                        "content": [{"type": "text", "text": comment}],
                    }
                ],
            }
        }
        result = self._call_api_sync(
            "POST",
            f"/rest/api/3/issue/{issue_key}/comment",
            payload,
        )
        if result is None:
            # POST comment returns the created comment on success;
            # _call_api_sync returns None on empty/failed response
            # but also returns None on JSON decode failure for 201 with empty body.
            # Treat None as success since the API may return 201 with no body.
            pass
        return {"success": True}

    def add_to_sprint_sync(self, sprint_id: int | str, issue_key: str) -> dict[str, Any]:
        """Add issue to a sprint via Agile REST API.

        Args:
            sprint_id: Jira sprint ID (numeric)
            issue_key: Jira issue key

        Returns:
            Result dict with success status
        """
        self._call_api_sync(
            "POST",
            f"/rest/agile/1.0/sprint/{sprint_id}/issue",
            {"issues": [issue_key]},
        )
        # Returns empty body on success (204)
        return {"success": True}

    def search_issues_sync(
        self, jql: str, fields: list[str] | None = None, max_results: int = 100
    ) -> list[dict[str, Any]]:
        """Search issues using JQL synchronously.

        Args:
            jql: JQL query string
            fields: Fields to return (defaults to key, summary, status)
            max_results: Maximum results to return

        Returns:
            List of issue dicts
        """
        import urllib.parse

        if fields is None:
            fields = ["key", "summary", "status", "customfield_10031"]

        encoded_jql = urllib.parse.quote(jql)
        fields_param = ",".join(fields)
        # Jira Cloud deprecated /rest/api/3/search — use /rest/api/3/search/jql
        result = self._call_api_sync(
            "GET",
            f"/rest/api/3/search/jql?jql={encoded_jql}&fields={fields_param}"
            f"&maxResults={max_results}",
        )
        if not result:
            return []
        return result.get("issues", [])

    def link_issues_sync(
        self, inward_key: str, outward_key: str, link_type: str = "Relates"
    ) -> dict[str, Any]:
        """Link two issues synchronously.

        Args:
            inward_key: Inward issue key (parent/blocker)
            outward_key: Outward issue key (child/blocked)
            link_type: Link type name (e.g., "Relates", "Blocks", "Parent-Child")

        Returns:
            Result dict with success status
        """
        self._call_api_sync(
            "POST",
            "/rest/api/3/issueLink",
            {
                "type": {"name": link_type},
                "inwardIssue": {"key": inward_key},
                "outwardIssue": {"key": outward_key},
            },
        )
        # Returns empty body on success (201)
        return {"success": True}

    # -------------------------------------------------------------------------
    # Async methods (using httpx for parallel operations)
    # -------------------------------------------------------------------------

    async def get_issue_async(self, issue_key: str) -> dict[str, Any] | None:
        """Fetch issue from Jira asynchronously.

        Args:
            issue_key: Jira issue key

        Returns:
            Issue JSON dict or None if not found
        """
        import httpx

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}"
        headers = self._get_headers()

        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(url, headers=headers, timeout=30.0)
                if response.status_code == 200:
                    return response.json()
                return None
            except httpx.HTTPError:
                return None

    async def transition_async(self, issue_key: str, target_status: str) -> dict[str, Any]:
        """Transition issue to target status asynchronously.

        Args:
            issue_key: Jira issue key
            target_status: Target status name (e.g., "In Progress", "Done")

        Returns:
            Result dict with success status and optional error
        """
        import httpx

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}/transitions"
        headers = self._get_headers(content_type=True)

        async with httpx.AsyncClient() as client:
            try:
                # Get available transitions
                response = await client.get(url, headers=headers, timeout=30.0)
                if response.status_code != 200:
                    return {
                        "success": False,
                        "error": f"Could not get transitions: {response.status_code}",
                    }

                transitions = response.json().get("transitions", [])
                transition_id = None
                for t in transitions:
                    if t.get("name", "").lower() == target_status.lower():
                        transition_id = t.get("id")
                        break

                if not transition_id:
                    return {
                        "success": False,
                        "error": f"No transition to '{target_status}' available",
                    }

                # Execute transition
                response = await client.post(
                    url,
                    headers=headers,
                    json={"transition": {"id": transition_id}},
                    timeout=30.0,
                )

                if response.status_code in (200, 204):
                    return {"success": True}
                return {
                    "success": False,
                    "error": f"Transition failed: {response.status_code}",
                }

            except httpx.HTTPError as e:
                return {"success": False, "error": str(e)}

    async def update_fields_async(self, issue_key: str, fields: dict[str, Any]) -> dict[str, Any]:
        """Update issue fields asynchronously.

        Args:
            issue_key: Jira issue key
            fields: Fields dict to update

        Returns:
            Result dict with success status
        """
        import httpx

        url = f"{self.base_url}/rest/api/3/issue/{issue_key}"
        headers = self._get_headers(content_type=True)

        async with httpx.AsyncClient() as client:
            try:
                response = await client.put(
                    url,
                    headers=headers,
                    json={"fields": fields},
                    timeout=30.0,
                )

                if response.status_code in (200, 204):
                    return {"success": True}
                return {"success": False, "error": f"HTTP {response.status_code}"}

            except httpx.HTTPError as e:
                return {"success": False, "error": str(e)}

    async def sync_story_points_async(
        self,
        issue_key: str,
        points: int,
        current_points: int | None = None,
    ) -> dict[str, Any]:
        """Sync story points to Jira asynchronously.

        Args:
            issue_key: Jira issue key
            points: Story points to set
            current_points: Current Jira points (to check if sync needed)

        Returns:
            Result dict with success status
        """
        if current_points is not None and current_points == points:
            return {"success": True, "already_synced": True}

        # customfield_10031 is Story Points (common Jira Cloud default)
        return await self.update_fields_async(issue_key, {"customfield_10031": points})


# Module-level client instance for convenience
_default_client: JiraClient | None = None


def get_client() -> JiraClient:
    """Get or create the default JiraClient instance.

    Returns:
        Shared JiraClient instance
    """
    global _default_client
    if _default_client is None:
        _default_client = JiraClient()
    return _default_client
