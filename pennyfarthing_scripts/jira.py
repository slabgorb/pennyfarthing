"""
Jira CLI wrapper for Pennyfarthing scripts.

Wraps the `jira` CLI tool for issue operations.
"""

import json
import os
import re
import shutil
import subprocess
import sys
from typing import Any

# Configuration
JIRA_PROJECT = os.environ.get("JIRA_PROJECT", "MSSCI")
JIRA_URL = os.environ.get("JIRA_URL", "https://1898andco.atlassian.net")

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
    "In Review": "review",
    "Review": "review",
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

    # Already in key format
    key_pattern = re.compile(rf"^{JIRA_PROJECT}-\d+$")
    if key_pattern.match(input_value):
        return input_value

    # Extract from URL
    url_pattern = re.compile(rf"({JIRA_PROJECT}-\d+)")
    match = url_pattern.search(input_value)
    return match.group(1) if match else input_value


def is_jira_cli_available() -> bool:
    """Check if the jira CLI is available.

    Returns:
        True if jira CLI is installed and accessible
    """
    return shutil.which("jira") is not None


def get_issue(issue_key: str) -> dict[str, Any] | None:
    """Fetch issue details from Jira.

    Args:
        issue_key: Jira issue key (e.g., "MSSCI-12398")

    Returns:
        Issue data as dict, or None if not found
    """
    if not is_jira_cli_available():
        return None

    result = subprocess.run(
        ["jira", "issue", "view", issue_key, "--output", "json"],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        return None

    try:
        return json.loads(result.stdout)
    except json.JSONDecodeError:
        return None


def update_issue_status(issue_key: str, status: str) -> bool:
    """Transition an issue to a new status.

    Args:
        issue_key: Jira issue key
        status: Target status name

    Returns:
        True if successful, False otherwise
    """
    if not is_jira_cli_available():
        return False

    result = subprocess.run(
        ["jira", "issue", "move", issue_key, status],
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


def add_comment(issue_key: str, comment: str) -> bool:
    """Add a comment to an issue.

    Args:
        issue_key: Jira issue key
        comment: Comment text

    Returns:
        True if successful, False otherwise
    """
    if not is_jira_cli_available():
        return False

    result = subprocess.run(
        ["jira", "issue", "comment", "add", issue_key, "--body", comment],
        capture_output=True,
        text=True,
    )

    return result.returncode == 0


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
        issue_json: Optional pre-fetched issue JSON

    Returns:
        Story points as int, or None if not set
    """
    if issue_json is None:
        issue_json = get_issue(issue_key)
    if not issue_json:
        return None

    # customfield_10031 is Story Points for 1898andco Jira
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
            print("  Create token at: https://id.atlassian.com/manage-profile/security/api-tokens", file=sys.stderr)
            print("  Then: export JIRA_API_TOKEN=\"your-token\"", file=sys.stderr)

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


# GitHub username to Jira email mapping
GITHUB_TO_JIRA_MAP = {
    "slabgorb": "keith.avery@1898andco.io",
    "arcaven": "michael.pursifull@1898andco.io",
    "RoseSecurity": "michael.rosenfeld@1898andco.io",
    "Zious11": "jared.richards@1898andco.io",
    "drbothen": "joshua.magady@1898andco.io",
}


def map_github_to_jira(github_user: str | None) -> str | None:
    """Map GitHub username to Jira email.

    Args:
        github_user: GitHub username

    Returns:
        Jira email address, or None if input is None
    """
    if github_user is None:
        return None

    return GITHUB_TO_JIRA_MAP.get(github_user, f"{github_user}@1898andco.io")


# =============================================================================
# JiraClient - Unified REST API client
# =============================================================================


class JiraClient:
    """Unified Jira REST API client with sync and async support.

    Consolidates REST API access previously scattered across:
    - jira_sync.py (httpx async)
    - jira_epic_creation.py (curl subprocess)

    Usage (sync):
        client = JiraClient()
        issue = client.get_issue("MSSCI-12345")

    Usage (async):
        client = JiraClient()
        issue = await client.get_issue_async("MSSCI-12345")
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
        self.user = user or os.environ.get("JIRA_USER", "keith.avery@1898andco.io")
        self.token = token or os.environ.get("JIRA_API_TOKEN", "")

    def _get_auth_header(self) -> dict[str, str]:
        """Build authorization header for REST API.

        Returns:
            Dict with Authorization header, or empty dict if no token
        """
        if not self.token:
            return {}

        import base64

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
            endpoint: API endpoint (e.g., /rest/api/3/issue/MSSCI-123)
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
            "-X", method,
            "-H", "Accept: application/json",
            "-H", "Content-Type: application/json",
            "-u", f"{self.user}:{self.token}",
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
            issue_key: Jira issue key (e.g., MSSCI-12345)

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

    def update_issue_sync(
        self, issue_key: str, fields: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Update issue fields synchronously.

        Args:
            issue_key: Jira issue key
            fields: Fields to update

        Returns:
            Response JSON or None on failure
        """
        return self._call_api_sync(
            "PUT", f"/rest/api/3/issue/{issue_key}", {"fields": fields}
        )

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

    async def transition_async(
        self, issue_key: str, target_status: str
    ) -> dict[str, Any]:
        """Transition issue to target status asynchronously.

        Args:
            issue_key: Jira issue key
            target_status: Target status name (e.g., "In Progress", "Done")

        Returns:
            Result dict with success status and optional reason
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
                        "reason": f"Could not get transitions: {response.status_code}",
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
                        "reason": f"No transition to '{target_status}' available",
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
                    "reason": f"Transition failed: {response.status_code}",
                }

            except httpx.HTTPError as e:
                return {"success": False, "reason": str(e)}

    async def update_fields_async(
        self, issue_key: str, fields: dict[str, Any]
    ) -> dict[str, Any]:
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
                return {"success": False, "reason": f"HTTP {response.status_code}"}

            except httpx.HTTPError as e:
                return {"success": False, "reason": str(e)}

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

        # customfield_10031 is Story Points for 1898andco Jira
        return await self.update_fields_async(
            issue_key, {"customfield_10031": points}
        )


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
