"""Core logic for deprecating npm package versions.

Handles:
- npm deprecate command execution
- CHANGELOG.md deprecation entry insertion
- Git notes creation on version tags
"""

from __future__ import annotations

import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path


def deprecate_version(
    project_root: Path,
    version: str,
    reason: str,
    *,
    dry_run: bool = False,
    package_name: str = "pennyfarthing",
) -> dict:
    """Deprecate a published npm package version.

    Steps:
    1. Validate inputs and CHANGELOG existence
    2. Validate version exists in npm registry
    3. Check if already deprecated
    4. Run npm deprecate to mark version in registry
    5. Append deprecation entry to CHANGELOG.md
    6. Create git note on the version tag

    Returns:
        Result dict per ADR-0008: {success, data?, error?, steps?}
    """
    # --- Input validation ---
    if not version or not version.strip():
        return {"success": False, "error": "Version is required"}

    if not reason or not reason.strip():
        return {"success": False, "error": "Reason is required"}

    changelog_path = project_root / "CHANGELOG.md"
    if not changelog_path.is_file():
        return {"success": False, "error": "CHANGELOG.md not found in project root"}

    # --- Validate version exists in npm ---
    ver_result = subprocess.run(
        ["npm", "view", f"{package_name}@{version}", "version"],
        capture_output=True,
        text=True,
    )
    if ver_result.returncode != 0:
        return {
            "success": False,
            "error": f"Version {version} not found in npm registry",
        }

    version_str = ver_result.stdout.strip()

    # --- Dry run: return planned steps without executing ---
    if dry_run:
        return {
            "success": True,
            "dry_run": True,
            "steps": [
                {
                    "action": "npm_deprecate",
                    "detail": f"Would deprecate {package_name}@{version}",
                },
                {
                    "action": "changelog_update",
                    "detail": f"Would add [DEPRECATED] marker to {version}",
                },
                {
                    "action": "git_notes",
                    "detail": f"Would add note to v{version}",
                },
            ],
        }

    # --- Check if already deprecated (only for real runs) ---
    dep_result = subprocess.run(
        ["npm", "view", f"{package_name}@{version}", "deprecated"],
        capture_output=True,
        text=True,
    )
    dep_msg = dep_result.stdout.strip()
    if dep_result.returncode == 0 and dep_msg and dep_msg != version_str:
        return {
            "success": False,
            "error": f"Version {version} is already deprecated: {dep_msg}",
        }

    # --- Execute deprecation ---
    steps = []

    # Step 1: npm deprecate
    npm_result = subprocess.run(
        ["npm", "deprecate", f"{package_name}@{version}", reason],
        capture_output=True,
        text=True,
    )
    if npm_result.returncode != 0:
        return {
            "success": False,
            "error": f"npm deprecate failed: {npm_result.stderr.strip()}",
            "steps": [
                {
                    "action": "npm_deprecate",
                    "detail": f"{package_name}@{version}",
                    "success": False,
                },
            ],
        }
    steps.append({
        "action": "npm_deprecate",
        "detail": f"{package_name}@{version}",
        "success": True,
    })

    # Step 2: Update CHANGELOG.md
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    changelog_ok = _update_changelog(changelog_path, version, reason, today)
    steps.append({
        "action": "changelog_update",
        "detail": f"Added [DEPRECATED] marker to {version}",
        "success": changelog_ok,
    })

    # Step 3: Add git note
    note_msg = f"Deprecated: {reason}\nDate: {today}\nPackage: {package_name}@{version}"
    git_result = subprocess.run(
        ["git", "notes", "add", "-m", note_msg, f"v{version}"],
        capture_output=True,
        text=True,
        cwd=str(project_root),
    )
    git_ok = git_result.returncode == 0
    steps.append({
        "action": "git_notes",
        "detail": f"Note added to v{version}" if git_ok else git_result.stderr.strip(),
        "success": git_ok,
    })

    all_ok = all(s.get("success", True) for s in steps)
    return {"success": all_ok, "steps": steps}


def _update_changelog(
    changelog_path: Path,
    version: str,
    reason: str,
    today: str,
) -> bool:
    """Add [DEPRECATED] marker and deprecation notice to a version section."""
    content = changelog_path.read_text()

    # Find the version header line: ## [X.Y.Z] - YYYY-MM-DD
    pattern = re.compile(
        rf"(## \[{re.escape(version)}\] - \d{{4}}-\d{{2}}-\d{{2}})"
    )
    match = pattern.search(content)
    if not match:
        return False

    old_header = match.group(1)
    new_header = f"{old_header} [DEPRECATED]"

    # Add deprecation notice after the header's existing content.
    # Find the next section boundary (--- or ## [) after the header.
    header_end = match.end()
    next_section = re.search(r"\n(?:---|\n## \[)", content[header_end:])
    if next_section:
        insert_pos = header_end + next_section.start()
    else:
        insert_pos = len(content)

    deprecation_notice = f"\n\n### Deprecated\n\n- **Version deprecated ({today})** — {reason}\n"

    # Replace header and insert notice
    content = content[:match.start()] + new_header + content[header_end:insert_pos] + deprecation_notice + content[insert_pos:]

    changelog_path.write_text(content)
    return True
