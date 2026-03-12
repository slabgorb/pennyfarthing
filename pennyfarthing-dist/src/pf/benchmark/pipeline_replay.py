"""Pipeline Replay Benchmark.

Run TDD pipelines (TEA -> Dev -> Reviewer) against real code at a known
commit, then score the output against ground-truth findings from a
previous external review.

Usage via CLI:
    pf benchmark replay run <scenario.yaml> --theme firefly [--n 1]
    pf benchmark replay score <result-dir>
    pf benchmark replay compare <scenario> --themes t1,t2

Must be run from a regular terminal (not inside Claude Code).
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import yaml

# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class Finding:
    id: str
    title: str
    severity: str
    weight: int
    category: str
    phase_ideal: str
    description: str
    files: list[str] = field(default_factory=list)
    fix_commit: str | None = None


@dataclass
class Scenario:
    id: str
    title: str
    story_id: str
    jira: str
    repo_path: str
    base_commit: str
    branch: str
    context_epic_path: str
    context_story_path: str
    session_archive_path: str | None
    phases: list[str]
    ground_truth: list[Finding]
    total_weight: int
    phase_prompts: dict[str, str]
    original_pipeline: dict[str, Any] = field(default_factory=dict)
    context_type: str = "sprint"  # "sprint" (epic+story) or "repo" (claude_md)
    claude_md_path: str = ""  # For repo-context scenarios
    roots: dict[str, str] = field(default_factory=dict)  # e.g. {"repo": "../poller-cobra"}


@dataclass
class PhaseResult:
    role: str
    output_text: str
    token_usage: dict[str, int] = field(default_factory=dict)
    duration_s: float = 0.0
    exit_code: int = 0
    model_usage: dict[str, Any] = field(default_factory=dict)
    cost_usd: float = 0.0
    session_id: str | None = None


@dataclass
class PipelineResult:
    scenario_id: str
    theme: str | None
    run_id: int
    worktree_path: str
    phases: dict[str, PhaseResult] = field(default_factory=dict)
    timestamp: str = ""
    model: str | None = None


# ---------------------------------------------------------------------------
# Framework version tagging
# ---------------------------------------------------------------------------


def _framework_version(project_dir: Path) -> dict:
    """Collect PF framework version info for run metadata."""
    pf_repo = project_dir / "pennyfarthing"

    commit = "unknown"
    if (pf_repo / ".git").exists():
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=pf_repo,
                stderr=subprocess.DEVNULL,
            ).decode().strip()[:12]
        except subprocess.CalledProcessError:
            pass

    from pf import __version__
    semver = __version__

    # Hash each agent definition used in pipeline phases
    agents_dir = pf_repo / "pennyfarthing-dist" / "agents"
    agent_hashes = {}
    for role in ["tea", "dev", "reviewer"]:
        agent_file = agents_dir / f"{role}.md"
        if agent_file.exists():
            agent_hashes[role] = hashlib.sha256(
                agent_file.read_bytes()
            ).hexdigest()[:12]

    return {
        "commit": commit,
        "semver": semver,
        "agent_hashes": agent_hashes,
    }


def _bmad_version(bmad_root: Path) -> dict:
    """Collect BMAD framework version info for run metadata."""
    commit = "unknown"
    if (bmad_root / ".git").exists():
        try:
            commit = subprocess.check_output(
                ["git", "rev-parse", "HEAD"], cwd=bmad_root,
                stderr=subprocess.DEVNULL,
            ).decode().strip()[:12]
        except subprocess.CalledProcessError:
            pass

    return {
        "commit": commit,
        "source": "BMAD-METHOD",
    }


# ---------------------------------------------------------------------------
# Scenario loading
# ---------------------------------------------------------------------------


def load_scenario(path: str | Path, project_dir: str | Path | None = None) -> Scenario:
    """Load a scenario definition from YAML.

    Paths in the scenario are resolved relative to *project_dir*
    (defaults to cwd).
    """
    path = Path(path)
    raw = yaml.safe_load(path.read_text())

    project = Path(project_dir) if project_dir else Path.cwd()

    # Flatten findings from round_1 and round_2
    gt = raw.get("ground_truth", {})
    findings: list[Finding] = []
    for round_key in ("round_1", "round_2"):
        rnd = gt.get(round_key, {})
        for f in rnd.get("findings", []):
            findings.append(
                Finding(
                    id=f["id"],
                    title=f["title"],
                    severity=f["severity"],
                    weight=f["weight"],
                    category=f["category"],
                    phase_ideal=f["phase_ideal"],
                    description=f.get("description", ""),
                    files=f.get("files", []),
                    fix_commit=f.get("fix_commit"),
                )
            )

    ctx = raw.get("context", {})
    repo = raw.get("repo", {})

    # Resolve roots relative to scenario file's parent directory
    raw_roots = raw.get("roots", {})
    roots = {k: str((path.parent / v).resolve()) for k, v in raw_roots.items()}

    # Resolve repo path: roots.repo overrides repo.path
    repo_path_str = repo.get("path", "")
    if roots.get("repo"):
        resolved_repo = roots["repo"]
    else:
        resolved_repo = str(project / repo_path_str)

    # Detect context type: "sprint" has epic+story keys, "repo" has claude_md
    if "epic" in ctx:
        context_type = "sprint"
        context_epic_path = str(project / ctx["epic"])
        context_story_path = str(project / ctx["story"])
        claude_md_path = ""
    else:
        context_type = "repo"
        context_epic_path = ""
        context_story_path = ""
        # Resolve claude_md relative to the repo root
        claude_md_path = (
            str(Path(resolved_repo) / ctx["claude_md"]) if ctx.get("claude_md") else ""
        )

    return Scenario(
        id=raw["id"],
        title=raw["title"],
        story_id=raw["story_id"],
        jira=raw["jira"],
        repo_path=resolved_repo,
        base_commit=repo["base_commit"],
        branch=repo.get("branch", ""),
        context_epic_path=context_epic_path,
        context_story_path=context_story_path,
        session_archive_path=(
            str(project / ctx["session_archive"]) if ctx.get("session_archive") else None
        ),
        phases=raw.get("phases", ["tea", "dev", "reviewer"]),
        ground_truth=findings,
        total_weight=gt.get("total_weight", sum(f.weight for f in findings)),
        phase_prompts=raw.get("phase_prompts", {}),
        original_pipeline=raw.get("original_pipeline", {}),
        context_type=context_type,
        claude_md_path=claude_md_path,
        roots=roots,
    )


# ---------------------------------------------------------------------------
# Worktree management
# ---------------------------------------------------------------------------


def create_worktree(
    repo_path: Path,
    commit: str,
    worktree_path: Path,
) -> Path:
    """Create a detached git worktree at *commit*.

    Handles stale worktrees from killed runs by force-removing them first.
    """
    if worktree_path.exists():
        # Try to remove stale worktree via git
        subprocess.run(
            ["git", "worktree", "remove", "--force", str(worktree_path)],
            cwd=str(repo_path),
            capture_output=True,
            text=True,
        )
        # If dir still exists (orphaned), remove manually
        if worktree_path.exists():
            shutil.rmtree(worktree_path)

    # Prune dead worktree refs
    subprocess.run(
        ["git", "worktree", "prune"],
        cwd=str(repo_path),
        capture_output=True,
        text=True,
    )

    worktree_path.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        ["git", "worktree", "add", "--detach", str(worktree_path), commit],
        cwd=str(repo_path),
        check=True,
        capture_output=True,
        text=True,
    )
    return worktree_path


def remove_worktree(repo_path: Path, worktree_path: Path) -> None:
    """Remove a git worktree."""
    subprocess.run(
        ["git", "worktree", "remove", "--force", str(worktree_path)],
        cwd=str(repo_path),
        capture_output=True,
        text=True,
    )


# ---------------------------------------------------------------------------
# Worktree PF context setup
# ---------------------------------------------------------------------------


def setup_worktree_pf_context(worktree_path: Path, project_dir: Path) -> None:
    """Set up `.pennyfarthing/` symlink and `.claude/settings.json` in a worktree.

    This gives the worktree access to agents, gates, workflows, guides, and
    sidecars — everything ``pf`` needs to resolve subagent definitions and
    fire hooks during ``claude -p`` execution.

    The `.claude/settings.json` includes only the PreToolUse hook (pre-edit-check
    and schema-validation). UI hooks (statusline, bell-mode) and session-start
    (which contacts WheelHub) are excluded.
    """
    # Symlink .pennyfarthing/ from the project root
    pf_source = project_dir / ".pennyfarthing"
    pf_link = worktree_path / ".pennyfarthing"
    if pf_source.exists() and not pf_link.exists():
        os.symlink(pf_source, pf_link)

    # Create .claude/settings.json with minimal hook set
    claude_dir = worktree_path / ".claude"
    claude_dir.mkdir(exist_ok=True)
    settings = {
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "pf hooks pre-edit-check",
                        },
                        {
                            "type": "command",
                            "command": "pf hooks schema-validation",
                        },
                    ],
                }
            ]
        }
    }
    settings_path = claude_dir / "settings.json"
    if not settings_path.exists():
        settings_path.write_text(json.dumps(settings, indent=2) + "\n")


# ---------------------------------------------------------------------------
# Worktree verification
# ---------------------------------------------------------------------------

# Paths allowed to appear in ``git status --porcelain`` after context setup.
_ALLOWED_WORKTREE_PATHS = {
    ".pennyfarthing",
    ".claude/settings.json",
    ".claude/",
    ".claude",
    ".session/",
    "sprint/context/",
}


def verify_worktree(worktree_path: Path, expected_commit: str) -> None:
    """Verify worktree is clean after context setup.

    Checks two things:
    1. No unexpected files in ``git status --porcelain`` output.
    2. HEAD matches the expected base commit.

    Raises ``RuntimeError`` with a descriptive message on failure.
    """
    # Check for unexpected files
    status_result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=str(worktree_path),
        capture_output=True,
        text=True,
    )
    if status_result.returncode != 0:
        raise RuntimeError(
            f"git status failed in worktree {worktree_path}: {status_result.stderr.strip()}"
        )

    unexpected = []
    for line in status_result.stdout.strip().splitlines():
        if not line.strip():
            continue
        # Format: XY path (or XY path -> renamed_path)
        file_path = line[3:].split(" -> ")[0]
        if not any(
            file_path == allowed or file_path.startswith(allowed)
            for allowed in _ALLOWED_WORKTREE_PATHS
        ):
            unexpected.append(file_path)

    if unexpected:
        file_list = "\n  ".join(unexpected)
        raise RuntimeError(
            f"Worktree {worktree_path} has unexpected files after context setup:\n"
            f"  {file_list}\n"
            f"This may indicate a crashed previous run left orphaned files."
        )

    # Verify HEAD matches expected commit
    head_result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=str(worktree_path),
        capture_output=True,
        text=True,
    )
    if head_result.returncode != 0:
        raise RuntimeError(
            f"git rev-parse HEAD failed in worktree {worktree_path}: {head_result.stderr.strip()}"
        )

    actual_commit = head_result.stdout.strip()
    if not actual_commit.startswith(expected_commit) and not expected_commit.startswith(actual_commit):
        raise RuntimeError(
            f"Worktree HEAD mismatch: expected {expected_commit}, got {actual_commit}"
        )


# ---------------------------------------------------------------------------
# Prompt extraction
# ---------------------------------------------------------------------------

# XML tags stripped from agent output for benchmark prompts
_STRIP_TAGS = [
    "phase-check",
    "finding-capture",
    "exit",
    "tandem-consultation",
    "tandem-backseat",
    "team-mode",
    "research-tools",
    "user-title",
    "crew",
]

_KEEP_PREFIXES = [
    "# Agent Definition",
    "# Persona:",
    "# Agent Sidecar:",
]

_SKIP_PREFIXES = [
    "# Workflow State",
    "# Agent Behavior Guide",
    "# Sprint Context",
    "# Repos Topology",
]


def _extract_benchmark_prompt(raw: str) -> str:
    """Extract benchmark-relevant sections from ``pf agent start`` output.

    Keeps agent definition, persona, and sidecars.
    Strips workflow state, sprint context, repos topology,
    and workflow-specific XML tags.
    """
    sections = re.split(r"^(# .+)$", raw, flags=re.MULTILINE)

    parts: list[str] = []
    i = 0
    while i < len(sections):
        part = sections[i]
        if part.startswith("# "):
            header = part.strip()
            content = sections[i + 1] if i + 1 < len(sections) else ""
            keep = any(header.startswith(p) for p in _KEEP_PREFIXES)
            skip = any(header.startswith(p) for p in _SKIP_PREFIXES)
            if keep:
                parts.append(header + "\n" + content)
            elif not skip:
                parts.append(header + "\n" + content)
            i += 2
        else:
            if part.strip():
                parts.append(part)
            i += 1

    result = "\n".join(parts).strip()

    # Strip hooks frontmatter block
    result = re.sub(r"^---\nhooks:.*?^---\n", "", result, flags=re.MULTILINE | re.DOTALL)

    # Strip workflow-specific XML tags
    for tag in _STRIP_TAGS:
        result = re.sub(rf"<{tag}[^>]*>.*?</{tag}>\n*", "", result, flags=re.DOTALL)

    # Collapse excessive blank lines
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result


def extract_agent_prompt(
    role: str,
    project_dir: Path,
    *,
    persona: bool = True,
    theme: str | None = None,
) -> str:
    """Run ``pf agent start`` and extract the benchmark-relevant prompt.

    *project_dir* must be a directory with pennyfarthing installed
    (has ``.pennyfarthing/``).

    If *theme* is given, it is passed via the ``PF_THEME`` env var so
    concurrent runs don't race on the shared config file.
    """
    cmd = ["pf", "agent", "start", role]
    if not persona:
        cmd.append("--no-persona")

    env = {**os.environ}
    if theme:
        env["PF_THEME"] = theme

    result = subprocess.run(
        cmd,
        cwd=str(project_dir),
        capture_output=True,
        text=True,
        timeout=30,
        env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"pf agent start {role} failed: {result.stderr[:500]}")
    return _extract_benchmark_prompt(result.stdout)


# ---------------------------------------------------------------------------
# CLAUDE.md generation for worktree phases
# ---------------------------------------------------------------------------


def build_phase_claude_md(
    role: str,
    agent_prompt: str,
    scenario: Scenario,
) -> str:
    """Build a CLAUDE.md to drop into the worktree for a pipeline phase.

    Includes the agent definition/persona and the epic+story context so the
    agent has everything it needs without pennyfarthing installed.

    For repo-context scenarios (no epic/story), includes the repo's own
    CLAUDE.md instead.
    """
    parts = [f"# Pipeline Replay Benchmark — {role.upper()} Phase"]
    parts.append(f"\n## Agent Context\n\n{agent_prompt}\n\n---")

    if scenario.context_type == "sprint":
        epic_text = Path(scenario.context_epic_path).read_text()
        story_text = Path(scenario.context_story_path).read_text()
        parts.append(f"\n## Epic Context\n\n{epic_text}\n\n---")
        parts.append(f"\n## Story Context\n\n{story_text}\n\n---")
        parts.append("""
## Project Notes

- This is a Rust workspace. The target crate is `crates/axiathon-server/`.
- Tests go in `crates/axiathon-server/tests/`.
- Production code goes in `crates/axiathon-server/src/`.
- Run tests: `cargo test -p axiathon-server`
- Run lint: `cargo clippy -p axiathon-server`
- The crate `axiathon-core` has existing types (`AxiathonError`, `TenantId`, etc.)
""")
    else:
        # Repo-context: include the repo's own CLAUDE.md if it exists
        if scenario.claude_md_path and Path(scenario.claude_md_path).exists():
            repo_claude_md = Path(scenario.claude_md_path).read_text()
            parts.append(f"\n## Project Context\n\n{repo_claude_md}\n\n---")

    return "\n".join(parts)


# ---------------------------------------------------------------------------
# Phase execution
# ---------------------------------------------------------------------------


_EXTENSION_LANGUAGES = {
    ".ts": "typescript", ".tsx": "typescriptreact",
    ".js": "javascript", ".jsx": "javascriptreact",
    ".py": "python", ".go": "go", ".rs": "rust",
    ".json": "json", ".yaml": "yaml", ".yml": "yaml",
    ".md": "markdown", ".html": "html", ".css": "css",
    ".sh": "shellscript", ".zsh": "shellscript",
    ".sql": "sql", ".toml": "toml", ".xml": "xml",
    ".c": "c", ".h": "c", ".cpp": "cpp", ".java": "java",
    ".rb": "ruby", ".swift": "swift", ".kt": "kotlin",
}


def _detect_language(file_path: str) -> str:
    ext = Path(file_path).suffix.lower()
    return _EXTENSION_LANGUAGES.get(ext, "unknown")


def _file_stats(file_path: str) -> dict[str, Any]:
    """Return size and line count for a file, or empty dict on error."""
    try:
        p = Path(file_path)
        size = p.stat().st_size
        content = p.read_text(errors="replace")
        if "\0" in content:
            return {"file_size": size, "line_count": 0, "binary": True}
        return {"file_size": size, "line_count": content.count("\n") + 1}
    except OSError:
        return {}


def _enrich_tool_event(attrs: dict[str, str], worktree: Path | None) -> dict[str, Any]:
    """Add enrichment fields to a tool_result event based on tool type.

    Returns a dict of enrichment fields to merge into the JSONL record.
    """
    tool = attrs.get("tool_name", "")
    params_raw = attrs.get("tool_parameters", "{}")
    try:
        params = json.loads(params_raw)
    except json.JSONDecodeError:
        params = {}

    enrichment: dict[str, Any] = {"tool_name": tool}

    file_path = params.get("file_path", "")
    if tool in ("Read", "Edit", "Write") and file_path:
        enrichment["language"] = _detect_language(file_path)
        # Only stat files inside the worktree (security + relevance)
        if worktree and file_path.startswith(str(worktree)):
            enrichment.update(_file_stats(file_path))
        if tool == "Edit":
            old = params.get("old_string", "")
            new = params.get("new_string", "")
            enrichment["diff"] = {
                "added": len(new.splitlines()) - len(old.splitlines())
                if old != new else 0,
                "removed": len(old.splitlines()) - len(new.splitlines())
                if old != new else 0,
            }
    elif tool == "Bash":
        cmd = params.get("command", "")
        enrichment["command_length"] = len(cmd)
        success = attrs.get("success", "true")
        enrichment["exit_code"] = 0 if success == "true" else 1
    elif tool in ("Grep", "Glob"):
        enrichment["pattern"] = params.get("pattern", "")

    return enrichment


def _extract_tool_attrs(log_record: dict) -> dict[str, str] | None:
    """Extract tool attributes from an OTLP logRecord if it's a tool_result."""
    body = log_record.get("body", {})
    event_name = body.get("stringValue", "")
    if event_name != "claude_code.tool_result":
        return None

    attrs = {}
    for attr in log_record.get("attributes", []):
        key = attr.get("key", "")
        val = attr.get("value", {})
        attrs[key] = val.get("stringValue", val.get("intValue", ""))
    return attrs


class OTELFileCollector:
    """Lightweight HTTP server that accepts OTLP JSON and writes to JSONL files.

    Spins up on a random port.  Claude Code's OTEL SDK sends standard
    ``POST /v1/logs``, ``/v1/metrics``, and ``/v1/traces`` — each request
    body is appended as a single JSON line to ``{output_dir}/{phase}-otel.jsonl``.

    When *worktree_path* is set, tool_result events are enriched with file
    metadata (language, size, line count, diff stats) while the worktree
    still exists on disk.

    Usage::

        collector = OTELFileCollector(run_dir, worktree_path=wt)
        collector.start()
        # ... run claude -p with collector.endpoint and collector.env() ...
        collector.stop()
    """

    def __init__(self, output_dir: Path, *, worktree_path: Path | None = None) -> None:
        self._output_dir = output_dir
        self._output_dir.mkdir(parents=True, exist_ok=True)
        self._worktree = worktree_path
        self._phase = "unknown"
        self._lock = threading.Lock()

        parent = self

        class _Handler(BaseHTTPRequestHandler):
            def do_POST(self) -> None:  # noqa: N802
                length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(length) if length else b""

                # Determine signal type from path (logs, metrics, traces)
                signal = self.path.rstrip("/").rsplit("/", 1)[-1]

                with parent._lock:
                    phase = parent._phase

                if body:
                    payload = json.loads(body)
                    out_file = parent._output_dir / f"{phase}-otel.jsonl"
                    record: dict[str, Any] = {
                        "signal": signal,
                        "timestamp": datetime.now(UTC).isoformat(),
                        "data": payload,
                    }

                    # Enrich tool_result log records
                    if signal == "logs":
                        enrichments = []
                        for rl in payload.get("resourceLogs", []):
                            for sl in rl.get("scopeLogs", []):
                                for lr in sl.get("logRecords", []):
                                    attrs = _extract_tool_attrs(lr)
                                    if attrs:
                                        enrichments.append(
                                            _enrich_tool_event(attrs, parent._worktree)
                                        )
                        if enrichments:
                            record["enrichments"] = enrichments

                    with open(out_file, "a") as f:
                        f.write(json.dumps(record) + "\n")

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"partialSuccess":{}}')

            def log_message(self, format: str, *args: Any) -> None:  # noqa: A002
                pass  # suppress request logging

        self._server = HTTPServer(("127.0.0.1", 0), _Handler)
        self._port = self._server.server_address[1]
        self._thread: threading.Thread | None = None

    @property
    def endpoint(self) -> str:
        return f"http://127.0.0.1:{self._port}"

    @property
    def phase(self) -> str:
        with self._lock:
            return self._phase

    @phase.setter
    def phase(self, value: str) -> None:
        with self._lock:
            self._phase = value

    def env(self) -> dict[str, str]:
        """Return the 5 OTEL env vars pointing at this collector."""
        return {
            "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
            "OTEL_LOGS_EXPORTER": "otlp",
            "OTEL_METRICS_EXPORTER": "otlp",
            "OTEL_EXPORTER_OTLP_PROTOCOL": "http/json",
            "OTEL_EXPORTER_OTLP_ENDPOINT": self.endpoint,
        }

    def start(self) -> None:
        self._thread = threading.Thread(target=self._server.serve_forever, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._server.shutdown()
        if self._thread:
            self._thread.join(timeout=5)


def run_phase(
    worktree_path: Path,
    role: str,
    task_prompt: str,
    *,
    model: str | None = None,
    otel_collector: OTELFileCollector | None = None,
    project_dir: Path | None = None,
) -> PhaseResult:
    """Run a single pipeline phase via ``claude -p`` in the worktree.

    CLAUDE.md must already be in place before calling this.
    When *otel_collector* is set, injects OTEL env vars so telemetry
    flows to the file-based collector.
    When *project_dir* is set, ``CLAUDE_PROJECT_DIR`` is set so hooks
    and ``pf`` resolve the worktree as the project root.
    """
    # Wrap the task prompt so the model defers to CLAUDE.md for agent
    # workflow (especially <on-activation> which drives subagent fan-out)
    # rather than treating the task prompt as a self-contained instruction.
    wrapped_prompt = (
        "Your agent definition, workflow, and activation instructions are in "
        "this project's CLAUDE.md. Follow the workflow described there — "
        "including any subagent spawning in <on-activation>.\n\n"
        f"Your task:\n{task_prompt}"
    )
    cmd = ["claude", "-p", wrapped_prompt, "--output-format", "json"]
    if model:
        cmd.extend(["--model", model])

    # Always construct env — ensure pf is on PATH and project dir is set
    env = {**os.environ}
    pf_bin = Path.home() / ".local" / "bin"
    current_path = env.get("PATH", "")
    if str(pf_bin) not in current_path.split(os.pathsep):
        env["PATH"] = f"{pf_bin}{os.pathsep}{current_path}"
    if project_dir:
        env["CLAUDE_PROJECT_DIR"] = str(worktree_path)
    if otel_collector:
        otel_collector.phase = role
        env.update(otel_collector.env())

    start = time.monotonic()
    result = subprocess.run(
        cmd,
        cwd=str(worktree_path),
        capture_output=True,
        text=True,
        env=env,
    )
    elapsed = time.monotonic() - start

    output_text = ""
    token_usage: dict[str, int] = {}
    model_usage: dict[str, Any] = {}
    cost_usd: float = 0.0
    session_id: str | None = None

    if result.stdout.strip():
        try:
            data = json.loads(result.stdout)
            output_text = data.get("result", "")
            usage = data.get("usage", {})
            token_usage = {
                "input": usage.get("input_tokens", 0),
                "cache_creation": usage.get("cache_creation_input_tokens", 0),
                "cache_read": usage.get("cache_read_input_tokens", 0),
                "output": usage.get("output_tokens", 0),
            }
            model_usage = data.get("modelUsage", {})
            cost_usd = data.get("total_cost_usd", 0.0)
            session_id = data.get("session_id")
        except json.JSONDecodeError:
            output_text = result.stdout

    return PhaseResult(
        role=role,
        output_text=output_text,
        token_usage=token_usage,
        duration_s=round(elapsed, 2),
        exit_code=result.returncode,
        model_usage=model_usage,
        cost_usd=cost_usd,
        session_id=session_id,
    )


# ---------------------------------------------------------------------------
# Full pipeline execution
# ---------------------------------------------------------------------------


def compute_run_dir(
    output_base: Path, scenario_id: str, tag: str, run_id: int
) -> Path:
    """Compute the canonical run directory: output_base/scenario_id/tag/run-N."""
    return output_base / scenario_id / tag / f"run-{run_id}"


_REVIEWER_REJECT_RE = re.compile(r"VERDICT:\s*REJECT", re.IGNORECASE)
_REVIEWER_APPROVE_RE = re.compile(r"VERDICT:\s*APPROVE", re.IGNORECASE)

_REVIEWER_FALLBACK_REJECT_PHRASES = [
    "changes requested",
    "must be fixed before",
    "sending back to dev",
    "returning to developer",
]

_REVIEWER_VERDICT_INSTRUCTION = """

## Required Verdict

You MUST end your review with exactly one of these lines:
- `VERDICT: APPROVE` — if the code is acceptable
- `VERDICT: REJECT` — if changes are required

This verdict is mandatory and must appear on its own line at the end of your output.
"""

_REWORK_PROMPT_TEMPLATE = """\
The reviewer has requested changes. Review the feedback below and implement the required fixes.

## Reviewer Feedback

{feedback}
"""


def _detect_reviewer_rejection(output_text: str) -> bool:
    """Detect whether reviewer output indicates a rejection.

    Returns ``True`` only on clear rejection signal. Ambiguous output
    returns ``False`` to prevent infinite loops.
    """
    if _REVIEWER_REJECT_RE.search(output_text):
        return True
    if _REVIEWER_APPROVE_RE.search(output_text):
        return False
    # Fallback: check for strong rejection phrases (conservative)
    lower = output_text.lower()
    return any(phrase in lower for phrase in _REVIEWER_FALLBACK_REJECT_PHRASES)


def _build_reviewer_task_prompt(base_prompt: str) -> str:
    """Append verdict instruction to the reviewer's task prompt."""
    return base_prompt + _REVIEWER_VERDICT_INSTRUCTION


# ---------------------------------------------------------------------------
# Reviewer subagent fan-out (harness-driven)
# ---------------------------------------------------------------------------

_REVIEWER_SUBAGENTS = [
    "reviewer-edge-hunter",
    "reviewer-silent-failure-hunter",
    "reviewer-test-analyzer",
    "reviewer-comment-analyzer",
    "reviewer-type-design",
    "reviewer-security",
    "reviewer-simplifier",
]


def _run_reviewer_fanout(
    worktree_path: Path,
    project_dir: Path,
    *,
    diff: str,
    model: str | None = None,
) -> str:
    """Fan out reviewer subagents as parallel claude -p calls.

    Runs all 7 diff-based subagents concurrently using haiku, collects
    their findings, and returns a consolidated findings block to inject
    into the main reviewer prompt.

    Also runs reviewer-preflight in the worktree for tests/lint.
    """
    import concurrent.futures

    agents_dir = project_dir / ".pennyfarthing" / "agents"

    def _run_subagent(name: str) -> tuple[str, str]:
        """Run a single subagent and return (name, output)."""
        agent_file = agents_dir / f"{name}.md"
        if not agent_file.exists():
            return name, f"ERROR: agent file not found: {agent_file}"

        agent_prompt = agent_file.read_text()
        # Strip frontmatter
        agent_prompt = re.sub(
            r"^---\n.*?^---\n", "", agent_prompt,
            flags=re.MULTILINE | re.DOTALL,
        )

        task = (
            f"Analyze this diff and report findings in structured YAML.\n\n"
            f"## Agent Instructions\n\n{agent_prompt}\n\n"
            f"## Diff to Analyze\n\n```diff\n{diff}\n```\n"
        )

        cmd = ["claude", "-p", task, "--output-format", "json", "--model",
               "claude-haiku-4-5-20251001"]

        try:
            result = subprocess.run(
                cmd,
                cwd=str(worktree_path),
                capture_output=True,
                text=True,
                timeout=120,
                env={**os.environ},
            )
            # Extract text from JSON output
            try:
                parsed = json.loads(result.stdout)
                text = parsed.get("result", result.stdout)
            except (json.JSONDecodeError, TypeError):
                text = result.stdout
            return name, text
        except subprocess.TimeoutExpired:
            return name, "TIMEOUT: subagent exceeded 120s"
        except Exception as e:
            return name, f"ERROR: {e}"

    def _run_preflight() -> tuple[str, str]:
        """Run preflight checks (tests + lint) in the worktree."""
        checks = []
        # Run tests
        test_result = subprocess.run(
            ["cargo", "test", "--workspace"],
            cwd=str(worktree_path),
            capture_output=True, text=True, timeout=120,
        )
        checks.append(f"## Tests\nExit code: {test_result.returncode}\n"
                       f"```\n{test_result.stdout[-2000:]}\n```")
        if test_result.stderr:
            checks.append(f"```stderr\n{test_result.stderr[-1000:]}\n```")

        # Run clippy
        lint_result = subprocess.run(
            ["cargo", "clippy", "--workspace", "--", "-W", "clippy::all"],
            cwd=str(worktree_path),
            capture_output=True, text=True, timeout=120,
        )
        checks.append(f"## Clippy\nExit code: {lint_result.returncode}\n"
                       f"```\n{lint_result.stderr[-2000:]}\n```")

        return "reviewer-preflight", "\n".join(checks)

    print("  [FANOUT] Spawning 7 subagents + preflight...")

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(_run_subagent, name): name
            for name in _REVIEWER_SUBAGENTS
        }
        futures[pool.submit(_run_preflight)] = "reviewer-preflight"

        results: dict[str, str] = {}
        for future in concurrent.futures.as_completed(futures):
            name = futures[future]
            try:
                agent_name, output = future.result()
                results[agent_name] = output
                print(f"  [FANOUT] {agent_name} done")
            except Exception as e:
                results[name] = f"ERROR: {e}"
                print(f"  [FANOUT] {name} failed: {e}")

    # Build consolidated findings block
    parts = ["## Subagent Findings (Harness Fan-Out)\n"]
    parts.append("The following findings were produced by specialist "
                 "subagents analyzing the diff. Review each finding, "
                 "confirm or dismiss with rationale, and incorporate "
                 "confirmed findings into your assessment.\n")

    for name in ["reviewer-preflight"] + _REVIEWER_SUBAGENTS:
        tag = name.replace("reviewer-", "").upper()
        output = results.get(name, "NO OUTPUT")
        parts.append(f"### [{tag}] {name}\n\n{output}\n")

    return "\n".join(parts)


def run_pipeline(
    scenario: Scenario,
    *,
    theme: str | None = None,
    run_id: int = 1,
    project_dir: Path,
    worktree_base: Path,
    output_dir: Path | None = None,
    model: str | None = None,
    otel_endpoint: str | None = None,
    max_rework_cycles: int = 0,
    bmad_root: Path | None = None,
) -> PipelineResult:
    """Run the full TEA -> Dev -> Reviewer pipeline.

    1. Creates a worktree at the scenario's base commit.
    2. Sets up ``.pennyfarthing/`` symlink and ``.claude/settings.json``
       (skipped for BMAD runs).
    3. For each phase, writes CLAUDE.md with the agent prompt + context,
       then runs ``claude -p`` with the phase task prompt.
    4. If *max_rework_cycles* > 0 and the reviewer rejects, re-runs the
       dev and reviewer phases with feedback injected.
    5. Returns the collected results.

    When *bmad_root* is set, uses the BMAD adapter to build CLAUDE.md
    from BMAD source files instead of PF agent definitions.  No
    ``.pennyfarthing/`` or PF hooks are injected — pure BMAD prompts.

    OTEL telemetry is always captured to disk as JSONL files alongside
    the phase outputs (``{phase}-otel.jsonl``).  The *otel_endpoint*
    parameter is accepted for backwards compatibility but ignored.
    """
    is_bmad = bmad_root is not None
    tag = theme or "control"
    wt_name = f"{scenario.id}-{tag}-run-{run_id}"
    wt_path = worktree_base / wt_name
    repo = Path(scenario.repo_path)

    # Load BMAD config if this is a BMAD run
    bmad_config = None
    if is_bmad:
        from pf.benchmark.bmad_adapter import BmadConfig
        bmad_config = BmadConfig(bmad_root=bmad_root)

    result = PipelineResult(
        scenario_id=scenario.id,
        theme=theme,
        run_id=run_id,
        worktree_path=str(wt_path),
        timestamp=datetime.now(UTC).isoformat(),
        model=model or "opus",
    )

    # Create worktree
    create_worktree(repo, scenario.base_commit, wt_path)

    # Set up .pennyfarthing/ and .claude/ — only for PF runs
    if not is_bmad:
        setup_worktree_pf_context(wt_path, project_dir)

    # Verify worktree is clean before proceeding
    verify_worktree(wt_path, scenario.base_commit)

    # Compute run_dir early so we can place OTEL files there
    otel_base = output_dir or (project_dir / "internal" / "results" / "pipeline-replay")
    run_dir = compute_run_dir(output_base=otel_base, scenario_id=scenario.id, tag=tag, run_id=run_id)

    # Start OTEL file collector (with enrichment while worktree exists)
    collector: OTELFileCollector | None = None
    collector = OTELFileCollector(run_dir, worktree_path=wt_path)
    collector.start()
    print(f"  [OTEL] File collector on {collector.endpoint} → {run_dir}")

    def _build_bmad_claude_md(role: str) -> str:
        """Build CLAUDE.md from BMAD source files for this phase."""
        from pf.benchmark.bmad_adapter import (
            build_bmad_dev_claude_md,
            build_bmad_reviewer_claude_md,
            translate_story_file,
        )

        epic_text = Path(scenario.context_epic_path).read_text() if scenario.context_epic_path else ""
        story_text = Path(scenario.context_story_path).read_text() if scenario.context_story_path else ""

        if role == "dev":
            # Translate PF context into BMAD story format
            story_content = translate_story_file(
                bmad_config,
                epic_context=epic_text,
                story_context=story_text,
                story_title=scenario.title,
                acceptance_criteria=scenario.phase_prompts.get("dev", ""),
            )
            return build_bmad_dev_claude_md(
                bmad_config,
                story_content=story_content,
                project_context=epic_text,
            )
        elif role == "reviewer":
            # Inject dev output so reviewer can see what was produced
            dev_output = ""
            if "dev" in result.phases:
                dev_output = result.phases["dev"].output_text
            return build_bmad_reviewer_claude_md(
                bmad_config,
                dev_output=dev_output,
            )
        else:
            # BMAD has no TEA equivalent — use a minimal prompt
            return f"# {role.upper()} Phase\n\nBegin {role} phase for: {scenario.title}\n"

    def _run_single_phase(role: str, task_prompt: str, phase_key: str | None = None) -> PhaseResult:
        """Run one phase and record it in result.phases."""
        key = phase_key or role

        if is_bmad:
            # Pure BMAD — use adapter, no PF agent defs
            claude_md = _build_bmad_claude_md(role)
        else:
            # PF path — extract agent prompt via pf agent start
            agent_prompt = extract_agent_prompt(
                role, project_dir, persona=(theme is not None), theme=theme
            )
            claude_md = build_phase_claude_md(role, agent_prompt, scenario)

        (wt_path / "CLAUDE.md").write_text(claude_md)

        print(f"  [{key.upper()}] Running phase...")
        phase_result = run_phase(
            wt_path,
            role,
            task_prompt,
            model=model,
            otel_collector=collector,
            project_dir=project_dir,
        )
        result.phases[key] = phase_result

        tokens = phase_result.token_usage
        actual_models = list(phase_result.model_usage.keys())
        model_str = actual_models[0] if actual_models else model or "?"
        cost_str = f" ${phase_result.cost_usd:.2f}" if phase_result.cost_usd else ""
        otel_str = f" sid={phase_result.session_id[:8]}" if phase_result.session_id else ""
        print(
            f"  [{key.upper()}] Done in {phase_result.duration_s}s "
            f"({tokens.get('input', 0)}+{tokens.get('output', 0)} tokens, "
            f"model={model_str}{cost_str}{otel_str})"
        )

        if phase_result.exit_code != 0:
            print(f"  [{key.upper()}] WARNING: non-zero exit ({phase_result.exit_code})")

        return phase_result

    def _run_scout(agent_name: str, focus: str) -> str:
        """Run a specialist scout on the full codebase before a phase."""
        agents_dir = project_dir / ".pennyfarthing" / "agents"
        agent_file = agents_dir / f"{agent_name}.md"
        if not agent_file.exists():
            return ""
        agent_prompt = agent_file.read_text()
        agent_prompt = re.sub(
            r"^---\n.*?^---\n", "", agent_prompt,
            flags=re.MULTILINE | re.DOTALL,
        )
        src_list = subprocess.run(
            ["find", ".", "-name", "*.rs", "-type", "f"],
            cwd=str(wt_path), capture_output=True, text=True, timeout=10,
        )
        scan_task = (
            f"{focus}\n\n"
            f"## Agent Instructions\n\n{agent_prompt}\n\n"
            f"## Source Files\n\n{src_list.stdout}\n\n"
            f"Read each file and analyze. Report findings with file path and line."
        )
        tag = agent_name.replace("reviewer-", "").upper()
        print(f"  [{tag}-SCAN] Running pre-phase scan...")
        scan_result = subprocess.run(
            ["claude", "-p", scan_task, "--output-format", "json",
             "--model", "claude-haiku-4-5-20251001"],
            cwd=str(wt_path), capture_output=True, text=True,
            timeout=120, env={**os.environ},
        )
        try:
            parsed = json.loads(scan_result.stdout)
            output = parsed.get("result", scan_result.stdout)
        except (json.JSONDecodeError, TypeError):
            output = scan_result.stdout
        print(f"  [{tag}-SCAN] Done")
        return output

    # Pre-phase scout configs: which scouts run before which phase
    _PHASE_SCOUTS: dict[str, list[tuple[str, str, str]]] = {
        "tea": [
            ("reviewer-test-analyzer",
             "Scan ALL test files for quality issues — vacuous assertions, "
             "tests that prove nothing, missing edge cases, zero-assertion tests.",
             "Pre-existing Test Quality Issues"),
        ],
        "dev": [
            ("reviewer-silent-failure-hunter",
             "Scan ALL source files for silent failures — swallowed errors, "
             "empty catches, fallbacks that hide problems. Focus on functions "
             "that return defaults instead of propagating errors.",
             "Pre-existing Silent Failures"),
            ("reviewer-security",
             "Scan ALL source files for security vulnerabilities — injection "
             "risks, raw string APIs that should use newtypes, auth bypasses.",
             "Pre-existing Security Issues"),
            ("reviewer-type-design",
             "Scan ALL source files for type design issues — stringly-typed "
             "APIs, missing newtypes, unsafe casts, weak type invariants.",
             "Pre-existing Type Design Issues"),
        ],
    }

    try:
        # Run initial phases linearly
        for role in scenario.phases:
            task_prompt = scenario.phase_prompts.get(role, f"Begin {role} phase.")

            # Run pre-phase scouts if configured (PF runs only)
            if not is_bmad and role in _PHASE_SCOUTS:
                import concurrent.futures
                scouts = _PHASE_SCOUTS[role]
                with concurrent.futures.ThreadPoolExecutor(max_workers=len(scouts)) as pool:
                    futures = {
                        pool.submit(_run_scout, name, focus): (name, heading)
                        for name, focus, heading in scouts
                    }
                    for future in concurrent.futures.as_completed(futures):
                        _, heading = futures[future]
                        findings = future.result()
                        if findings:
                            task_prompt += (
                                f"\n\n## {heading}\n\n"
                                f"The following issues were found in the existing "
                                f"codebase. Address any that fall within your scope.\n\n"
                                f"{findings}"
                            )

            # Reviewer: fan out subagents from harness, inject findings
            if role == "reviewer" and not is_bmad:
                # Get diff for subagents
                diff_result = subprocess.run(
                    ["git", "diff", scenario.base_commit + "...HEAD"],
                    cwd=str(wt_path),
                    capture_output=True, text=True, timeout=30,
                )
                diff_text = diff_result.stdout or "(no diff)"

                fanout_findings = _run_reviewer_fanout(
                    wt_path, project_dir, diff=diff_text, model=model,
                )
                task_prompt = (
                    task_prompt + "\n\n" + fanout_findings
                )
                task_prompt = _build_reviewer_task_prompt(task_prompt)
            elif role == "reviewer":
                task_prompt = _build_reviewer_task_prompt(task_prompt)

            _run_single_phase(role, task_prompt)

        # Kick-back loop: if reviewer rejected and rework cycles are enabled
        if max_rework_cycles > 0 and "reviewer" in result.phases:
            rework_cycle = 0
            while rework_cycle < max_rework_cycles:
                reviewer_output = result.phases.get(
                    f"reviewer_rework_{rework_cycle}" if rework_cycle > 0 else "reviewer",
                    result.phases.get("reviewer"),
                )
                if reviewer_output is None:
                    break

                if not _detect_reviewer_rejection(reviewer_output.output_text):
                    break

                rework_cycle += 1
                print(f"  [REWORK {rework_cycle}] Reviewer rejected — re-running dev with feedback")

                # Build rework prompt from reviewer feedback
                rework_prompt = scenario.phase_prompts.get(
                    "dev_rework",
                    _REWORK_PROMPT_TEMPLATE,
                ).format(feedback=reviewer_output.output_text)

                _run_single_phase("dev", rework_prompt, phase_key=f"dev_rework_{rework_cycle}")

                # Re-run reviewer
                reviewer_task = scenario.phase_prompts.get("reviewer", "Begin reviewer phase.")
                reviewer_task = _build_reviewer_task_prompt(reviewer_task)
                _run_single_phase("reviewer", reviewer_task, phase_key=f"reviewer_rework_{rework_cycle}")

    except Exception as exc:
        print(f"  ERROR: Pipeline failed at phase: {exc}")
        raise
    finally:
        if collector:
            collector.stop()
        # Generate diff of worktree changes
        diff_result = subprocess.run(
            ["git", "diff", "--stat"],
            cwd=str(wt_path),
            capture_output=True,
            text=True,
        )
        if diff_result.stdout.strip():
            result.phases["_diff_stat"] = PhaseResult(
                role="_diff",
                output_text=diff_result.stdout,
            )

    return result


# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------


@dataclass
class FindingScore:
    finding_id: str
    title: str
    weight: int
    phase_ideal: str
    caught: bool = False
    caught_by: str | None = None
    evidence: str = ""


@dataclass
class PipelineScore:
    scenario_id: str
    theme: str | None
    run_id: int
    findings: list[FindingScore] = field(default_factory=list)
    total_caught: int = 0
    total_findings: int = 0
    weighted_caught: int = 0
    total_weight: int = 0
    judge_version: str = ""
    score_pct: float = 0.0


JUDGE_VERSION = "v2"

JUDGE_SCORING_INSTRUCTIONS = """\
## Scoring Instructions

For EACH finding ID, determine:
1. **caught**: Was this finding addressed, tested for, or flagged?
2. **caught_by**: Which phase caught it? (tea, dev, reviewer, or null)
3. **evidence**: Brief quote or description of how it was caught.

### What counts as "caught"

A finding is "caught" if ANY of these apply:
- TEA wrote a test that would fail if the issue exists
- Dev implemented code that avoids the issue
- Reviewer explicitly flagged the issue

### Partial match rules (IMPORTANT)

Apply these rules consistently for every finding:

1. **Same vulnerability class, different instance:** If the pipeline identifies
   the same CWE or vulnerability category (e.g., CWE-209 information exposure)
   but flags a different instance than the ground truth, score as **caught**.
   The pipeline demonstrated awareness of the risk class.

2. **Same category, adjacent location:** If the pipeline flags the same type of
   issue (e.g., "vacuous test") but in a different test/file than the ground
   truth specifies, score as **caught**. The pipeline's detection capability
   was demonstrated.

3. **General vs specific:** If the pipeline flags a general concern that
   encompasses the specific ground truth finding (e.g., "error handling needs
   improvement" when the finding is about a specific swallowed error), score
   as **caught** only if the general concern is specific enough to lead a
   developer to the fix.

4. **Opposite conclusion:** If the pipeline examines the exact code in question
   but concludes it is CORRECT (e.g., "verified token exclusion works properly"
   when the finding says token exclusion is the problem), score as **not caught**.
   Examining code and reaching the wrong conclusion is worse than not examining it.

### Strict rules

- Do NOT give credit for findings the pipeline never mentioned or tested
- Do NOT infer intent — only score what was explicitly written or tested
- When in doubt between caught and not-caught, re-read the ground truth
  description and the pipeline output one more time before deciding"""


def build_judge_prompt(
    scenario: Scenario,
    pipeline_result: PipelineResult,
) -> str:
    """Build a prompt for the LLM judge to score the pipeline output."""
    # Collect all phase outputs
    phase_outputs = ""
    for role in scenario.phases:
        pr = pipeline_result.phases.get(role)
        if pr:
            phase_outputs += f"\n### {role.upper()} Phase Output\n\n{pr.output_text}\n"

    # Build findings reference
    findings_ref = ""
    for f in scenario.ground_truth:
        findings_ref += (
            f"- **{f.id}** ({f.weight}pts, ideal phase: {f.phase_ideal}): "
            f"{f.title} — {f.description.strip()}\n"
        )

    # Read the worktree code diff
    diff_text = ""
    diff_pr = pipeline_result.phases.get("_diff_stat")
    if diff_pr:
        diff_text = diff_pr.output_text

    return f"""\
You are an impartial judge evaluating a TDD pipeline's output against
known ground-truth findings. Judge version: {JUDGE_VERSION}

## Ground Truth Findings

These are issues that a previous external review identified in the same
codebase after the pipeline had APPROVED the code. For each finding,
determine whether this pipeline run caught it — either by writing a test
that would prevent it (TEA), implementing code that avoids it (Dev), or
flagging it in review (Reviewer).

{findings_ref}

## Pipeline Output

{phase_outputs}

## Code Changes Summary

{diff_text}

{JUDGE_SCORING_INSTRUCTIONS}

Output ONLY valid JSON:
{{
  "findings": [
    {{
      "finding_id": "I1",
      "caught": true,
      "caught_by": "dev",
      "evidence": "Used workspace = true in Cargo.toml"
    }},
    ...
  ],
  "assessment": "Brief 2-3 sentence summary of pipeline quality"
}}

IMPORTANT: Do not use tools. Output JSON only.
"""


def _invoke_judge(
    judge_prompt: str,
    *,
    model: str | None = None,
    project_dir: Path | None = None,
) -> str:
    """Run the LLM judge and return the raw response text."""
    cmd = ["claude", "-p", judge_prompt, "--output-format", "json", "--tools", ""]
    if model:
        cmd.extend(["--model", model])

    result = subprocess.run(
        cmd,
        cwd=str(project_dir or Path.cwd()),
        capture_output=True,
        text=True,
        timeout=180,
    )

    judge_text = ""
    if result.stdout.strip():
        try:
            data = json.loads(result.stdout)
            judge_text = data.get("result", "")
        except json.JSONDecodeError:
            judge_text = result.stdout

    if not judge_text.strip():
        print("  [JUDGE] WARNING: Empty judge response", file=sys.stderr)
        if result.stderr.strip():
            print(f"  [JUDGE] stderr: {result.stderr[:500]}", file=sys.stderr)

    return judge_text


def _parse_judge_json(judge_text: str) -> dict | None:
    """Extract JSON from judge response. Returns None on failure."""
    if not judge_text.strip():
        return None

    # 1. Direct JSON parse
    try:
        return json.loads(judge_text)
    except json.JSONDecodeError:
        pass

    # 2. Extract from markdown code block (greedy to handle nested braces)
    m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", judge_text, re.DOTALL)
    if m:
        try:
            return json.loads(m.group(1))
        except json.JSONDecodeError:
            pass

    # 3. Find the outermost { ... } in the response
    first_brace = judge_text.find("{")
    last_brace = judge_text.rfind("}")
    if first_brace != -1 and last_brace > first_brace:
        try:
            return json.loads(judge_text[first_brace : last_brace + 1])
        except json.JSONDecodeError:
            pass

    # 4. Try fixing common JSON issues (unescaped quotes in evidence strings)
    cleaned = judge_text[first_brace : last_brace + 1] if first_brace != -1 else ""
    if cleaned:
        # Replace unescaped newlines inside strings
        cleaned = re.sub(r'(?<=": ")(.*?)(?="[,\s}])', _escape_json_value, cleaned, flags=re.DOTALL)
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

    return None


def _escape_json_value(m: re.Match) -> str:
    """Escape newlines and quotes inside a JSON string value."""
    val = m.group(0)
    val = val.replace("\\", "\\\\").replace("\n", "\\n").replace("\r", "\\r")
    val = val.replace('"', '\\"')
    return val


@dataclass
class JudgeValidation:
    """Result of validating a judge response against expected findings."""

    valid: bool
    findings: dict  # parsed judge_data
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)


def validate_judge_response(
    judge_data: dict | None,
    expected_ids: list[str],
) -> JudgeValidation:
    """Validate judge JSON structure and completeness."""
    if judge_data is None:
        return JudgeValidation(
            valid=False,
            findings={},
            errors=["Could not parse judge response as JSON"],
        )

    errors: list[str] = []
    warnings: list[str] = []

    # Check top-level structure
    findings_list = judge_data.get("findings")
    if not isinstance(findings_list, list):
        return JudgeValidation(
            valid=False,
            findings=judge_data,
            errors=["Missing or non-list 'findings' key"],
        )

    if len(findings_list) == 0:
        return JudgeValidation(
            valid=False,
            findings=judge_data,
            errors=["Empty findings list"],
        )

    # Check each finding has required fields
    valid_phases = {"tea", "dev", "reviewer", None}
    found_ids: set[str] = set()

    for i, f in enumerate(findings_list):
        fid = f.get("finding_id", f"<missing at index {i}>")
        found_ids.add(fid)

        if "caught" not in f:
            errors.append(f"{fid}: missing 'caught' field")
        elif not isinstance(f["caught"], bool):
            # Accept truthy/falsy but warn
            warnings.append(f"{fid}: 'caught' is {type(f['caught']).__name__}, not bool")

        if f.get("caught") and f.get("caught_by") not in valid_phases:
            warnings.append(
                f"{fid}: caught_by='{f.get('caught_by')}' not in {{tea, dev, reviewer}}"
            )

        if "evidence" not in f:
            warnings.append(f"{fid}: missing 'evidence' field")

    # Check completeness — all expected finding IDs present
    missing = set(expected_ids) - found_ids
    if missing:
        errors.append(f"Missing finding IDs: {sorted(missing)}")

    extra = found_ids - set(expected_ids)
    if extra:
        warnings.append(f"Extra finding IDs (ignored): {sorted(extra)}")

    return JudgeValidation(
        valid=len(errors) == 0,
        findings=judge_data,
        errors=errors,
        warnings=warnings,
    )


def score_with_judge(
    scenario: Scenario,
    pipeline_result: PipelineResult,
    *,
    model: str | None = None,
    project_dir: Path | None = None,
    max_retries: int = 2,
) -> PipelineScore:
    """Score a pipeline run using an LLM judge.

    Validates the judge response and retries on parse/validation failure
    up to *max_retries* times.
    """
    judge_prompt = build_judge_prompt(scenario, pipeline_result)
    expected_ids = [f.id for f in scenario.ground_truth]

    judge_data: dict | None = None
    validation: JudgeValidation | None = None

    for attempt in range(1 + max_retries):
        judge_text = _invoke_judge(
            judge_prompt,
            model=model,
            project_dir=project_dir,
        )
        judge_data = _parse_judge_json(judge_text)
        validation = validate_judge_response(judge_data, expected_ids)

        if validation.valid:
            break

        if attempt < max_retries:
            error_summary = "; ".join(validation.errors)
            print(
                f"  [JUDGE] Attempt {attempt + 1} failed validation: {error_summary}. Retrying...",
                file=sys.stderr,
            )
        else:
            print(
                f"  [JUDGE] WARNING: All {1 + max_retries} attempts failed validation.",
                file=sys.stderr,
            )
            for err in validation.errors:
                print(f"  [JUDGE]   - {err}", file=sys.stderr)
            if judge_text:
                print(
                    f"  [JUDGE]   First 300 chars: {judge_text[:300]}",
                    file=sys.stderr,
                )

    if validation and validation.warnings:
        for w in validation.warnings:
            print(f"  [JUDGE] WARN: {w}", file=sys.stderr)

    # Map judge results to ground truth (works even with partial/empty data)
    judge_findings = {f["finding_id"]: f for f in (judge_data or {}).get("findings", [])}

    scored_findings: list[FindingScore] = []
    for gt_finding in scenario.ground_truth:
        jf = judge_findings.get(gt_finding.id, {})
        scored_findings.append(
            FindingScore(
                finding_id=gt_finding.id,
                title=gt_finding.title,
                weight=gt_finding.weight,
                phase_ideal=gt_finding.phase_ideal,
                caught=bool(jf.get("caught", False)),
                caught_by=jf.get("caught_by"),
                evidence=jf.get("evidence", ""),
            )
        )

    total_caught = sum(1 for f in scored_findings if f.caught)
    weighted_caught = sum(f.weight for f in scored_findings if f.caught)

    return PipelineScore(
        scenario_id=scenario.id,
        theme=pipeline_result.theme,
        run_id=pipeline_result.run_id,
        findings=scored_findings,
        total_caught=total_caught,
        total_findings=len(scored_findings),
        weighted_caught=weighted_caught,
        total_weight=scenario.total_weight,
        score_pct=round(weighted_caught / scenario.total_weight * 100, 1)
        if scenario.total_weight
        else 0.0,
        judge_version=JUDGE_VERSION,
    )


# ---------------------------------------------------------------------------
# Result persistence
# ---------------------------------------------------------------------------


def save_result(
    pipeline_result: PipelineResult,
    score: PipelineScore | None,
    output_dir: Path,
    *,
    project_dir: Path | None = None,
    bmad_root: Path | None = None,
) -> Path:
    """Save pipeline result and score to disk."""
    tag = pipeline_result.theme or "control"
    run_dir = compute_run_dir(output_dir, pipeline_result.scenario_id, tag, pipeline_result.run_id)
    run_dir.mkdir(parents=True, exist_ok=True)

    # Save phase outputs
    for role, pr in pipeline_result.phases.items():
        if role.startswith("_"):
            continue
        (run_dir / f"{role}-output.txt").write_text(pr.output_text)

    # Save pipeline metadata
    # Collect actual models used across phases
    models_used = set()
    for pr in pipeline_result.phases.values():
        if not pr.role.startswith("_"):
            models_used.update(pr.model_usage.keys())

    total_cost = sum(
        pr.cost_usd for pr in pipeline_result.phases.values() if not pr.role.startswith("_")
    )

    meta = {
        "scenario_id": pipeline_result.scenario_id,
        "theme": pipeline_result.theme,
        "run_id": pipeline_result.run_id,
        "timestamp": pipeline_result.timestamp,
        "model_requested": pipeline_result.model,
        "models_used": sorted(models_used) if models_used else [pipeline_result.model or "unknown"],
        "total_cost_usd": round(total_cost, 4) if total_cost else None,
        "worktree_path": pipeline_result.worktree_path,
        "framework_version": (
            _bmad_version(bmad_root) if bmad_root
            else _framework_version(project_dir) if project_dir
            else None
        ),
        "phases": {
            role: {
                "token_usage": pr.token_usage,
                "model_usage": pr.model_usage or None,
                "cost_usd": round(pr.cost_usd, 4) if pr.cost_usd else None,
                "duration_s": pr.duration_s,
                "exit_code": pr.exit_code,
                "session_id": pr.session_id,
            }
            for role, pr in pipeline_result.phases.items()
            if not role.startswith("_")
        },
    }
    (run_dir / "pipeline.yaml").write_text(
        yaml.dump(meta, default_flow_style=False, sort_keys=False)
    )

    # Save score if available
    if score:
        score_data = {
            "scenario_id": score.scenario_id,
            "theme": score.theme,
            "run_id": score.run_id,
            "model": pipeline_result.model,
            "judge_version": score.judge_version,
            "total_caught": score.total_caught,
            "total_findings": score.total_findings,
            "weighted_caught": score.weighted_caught,
            "total_weight": score.total_weight,
            "score_pct": score.score_pct,
            "findings": [asdict(f) for f in score.findings],
        }
        (run_dir / "score.yaml").write_text(
            yaml.dump(score_data, default_flow_style=False, sort_keys=False)
        )

    # Save worktree diff
    diff_pr = pipeline_result.phases.get("_diff_stat")
    if diff_pr:
        (run_dir / "diff-stat.txt").write_text(diff_pr.output_text)

    # Generate and save events summary from OTEL data
    from pf.benchmark.events import generate_events_summary

    phase_names = [r for r in pipeline_result.phases if not r.startswith("_")]
    events_summary = generate_events_summary(run_dir, phase_names)
    (run_dir / "events-summary.yaml").write_text(
        yaml.dump(events_summary, default_flow_style=False, sort_keys=False)
    )

    return run_dir


def build_comparison_summary(
    scenario: Scenario,
    scores: list[PipelineScore],
    output_dir: Path,
) -> Path:
    """Build a cross-theme comparison summary."""
    summary_path = output_dir / scenario.id / "comparison.yaml"
    summary_path.parent.mkdir(parents=True, exist_ok=True)

    themes: dict[str, list[dict]] = {}
    for sc in scores:
        tag = sc.theme or "control"
        if tag not in themes:
            themes[tag] = []
        themes[tag].append(
            {
                "run_id": sc.run_id,
                "total_caught": sc.total_caught,
                "weighted_caught": sc.weighted_caught,
                "score_pct": sc.score_pct,
                "caught_by_phase": _phase_attribution(sc),
            }
        )

    # Detection heatmap across themes
    heatmap: dict[str, dict[str, str | None]] = {}
    for gt in scenario.ground_truth:
        heatmap[gt.id] = {}
        for sc in scores:
            tag = sc.theme or "control"
            finding = next((f for f in sc.findings if f.finding_id == gt.id), None)
            heatmap[gt.id][tag] = finding.caught_by if finding and finding.caught else None

    data = {
        "scenario_id": scenario.id,
        "themes": themes,
        "detection_heatmap": heatmap,
        "ground_truth_summary": [
            {"id": f.id, "title": f.title, "weight": f.weight, "phase_ideal": f.phase_ideal}
            for f in scenario.ground_truth
        ],
    }

    summary_path.write_text(
        f"# Pipeline Replay Comparison: {scenario.id}\n"
        + yaml.dump(data, default_flow_style=False, sort_keys=False)
    )
    return summary_path


def _phase_attribution(score: PipelineScore) -> dict[str, int]:
    """Count findings caught per phase."""
    counts: dict[str, int] = {"tea": 0, "dev": 0, "reviewer": 0}
    for f in score.findings:
        if f.caught and f.caught_by in counts:
            counts[f.caught_by] += 1
    return counts


# ---------------------------------------------------------------------------
# Multi-judge support
# ---------------------------------------------------------------------------


def reconstruct_pipeline_result(run_dir: Path, scenario: Scenario) -> PipelineResult | None:
    """Reconstruct a PipelineResult from saved files in a run directory."""
    meta_file = run_dir / "pipeline.yaml"
    if not meta_file.exists():
        return None

    meta = yaml.safe_load(meta_file.read_text())
    phases: dict[str, PhaseResult] = {}
    for role in scenario.phases:
        output_file = run_dir / f"{role}-output.txt"
        if output_file.exists():
            phase_meta = meta.get("phases", {}).get(role, {})
            phases[role] = PhaseResult(
                role=role,
                output_text=output_file.read_text(),
                token_usage=phase_meta.get("token_usage", {}),
                duration_s=phase_meta.get("duration_s", 0),
                exit_code=phase_meta.get("exit_code", 0),
            )

    diff_file = run_dir / "diff-stat.txt"
    if diff_file.exists():
        phases["_diff_stat"] = PhaseResult(role="_diff", output_text=diff_file.read_text())

    return PipelineResult(
        scenario_id=meta["scenario_id"],
        theme=meta.get("theme"),
        run_id=meta["run_id"],
        worktree_path=meta.get("worktree_path", ""),
        phases=phases,
        timestamp=meta.get("timestamp", ""),
        model=meta.get("model"),
    )


def get_existing_judge_passes(run_dir: Path) -> list[int]:
    """Find which judge passes already exist (judge_1.yaml, judge_2.yaml, etc)."""
    passes = []
    for f in run_dir.iterdir():
        if f.name.startswith("judge_") and f.name.endswith(".yaml"):
            try:
                n = int(f.stem.split("_")[1])
                passes.append(n)
            except (IndexError, ValueError):
                pass
    return sorted(passes)


def run_judge_pass(
    run_dir: Path,
    scenario: Scenario,
    pass_num: int,
    model: str | None = None,
    project_dir: Path | None = None,
) -> dict | None:
    """Run a single additional judge pass and save as judge_{pass_num}.yaml.

    Does NOT overwrite score.yaml. Each pass is stored independently.
    """
    pipeline_result = reconstruct_pipeline_result(run_dir, scenario)
    if pipeline_result is None:
        return None

    proj = project_dir or Path.cwd()
    score = score_with_judge(scenario, pipeline_result, model=model, project_dir=proj)

    score_data = {
        "scenario_id": score.scenario_id,
        "theme": score.theme,
        "run_id": score.run_id,
        "model": pipeline_result.model,
        "judge_model": model or "default",
        "judge_version": JUDGE_VERSION,
        "judge_pass": pass_num,
        "total_caught": score.total_caught,
        "total_findings": score.total_findings,
        "weighted_caught": score.weighted_caught,
        "total_weight": score.total_weight,
        "score_pct": score.score_pct,
        "findings": [asdict(f) for f in score.findings],
    }

    out_file = run_dir / f"judge_{pass_num}.yaml"
    out_file.write_text(yaml.dump(score_data, default_flow_style=False, sort_keys=False))
    return score_data


def compute_majority_vote(run_dir: Path, scenario: Scenario) -> dict | None:
    """Compute majority-vote score from score.yaml + all judge_N.yaml passes.

    Writes majority_vote.yaml alongside the individual scores. Returns None
    if fewer than 2 judges exist.
    """
    all_scores = []

    # score.yaml counts as the first judge (pass 0)
    score_file = run_dir / "score.yaml"
    if score_file.exists():
        all_scores.append(yaml.safe_load(score_file.read_text()))

    # Load all judge_N.yaml
    for pass_num in get_existing_judge_passes(run_dir):
        jf = run_dir / f"judge_{pass_num}.yaml"
        all_scores.append(yaml.safe_load(jf.read_text()))

    if len(all_scores) < 2:
        return None

    n_judges = len(all_scores)
    majority = n_judges // 2 + 1

    gt_map = {f.id: f for f in scenario.ground_truth}

    majority_findings = []
    for fid in [f.id for f in scenario.ground_truth]:
        caught_votes = 0
        caught_by_votes: dict[str, int] = {}
        evidences = []

        for sc in all_scores:
            finding = next((f for f in sc.get("findings", []) if f["finding_id"] == fid), None)
            if finding and finding.get("caught"):
                caught_votes += 1
                by = finding.get("caught_by", "unknown")
                caught_by_votes[by] = caught_by_votes.get(by, 0) + 1
                if finding.get("evidence"):
                    evidences.append(finding["evidence"])

        caught = caught_votes >= majority
        caught_by = (
            max(caught_by_votes, key=caught_by_votes.get) if caught and caught_by_votes else None
        )

        majority_findings.append(
            {
                "finding_id": fid,
                "title": gt_map[fid].title,
                "weight": gt_map[fid].weight,
                "phase_ideal": gt_map[fid].phase_ideal,
                "caught": caught,
                "caught_by": caught_by,
                "evidence": evidences[0] if evidences else "",
                "votes": f"{caught_votes}/{n_judges}",
            }
        )

    total_caught = sum(1 for f in majority_findings if f["caught"])
    weighted_caught = sum(f["weight"] for f in majority_findings if f["caught"])
    total_weight = scenario.total_weight

    # Copy framework_version from pipeline.yaml if present
    fw_version = None
    pipeline_file = run_dir / "pipeline.yaml"
    if pipeline_file.exists():
        pipeline_meta = yaml.safe_load(pipeline_file.read_text())
        fw_version = pipeline_meta.get("framework_version")

    result = {
        "judge_method": "majority_vote",
        "n_judges": n_judges,
        "majority_threshold": majority,
        "model": all_scores[0].get("model"),
        "judge_version": JUDGE_VERSION,
        "framework_version": fw_version,
        "total_caught": total_caught,
        "total_findings": len(majority_findings),
        "weighted_caught": weighted_caught,
        "total_weight": total_weight,
        "score_pct": (round(weighted_caught / total_weight * 100, 1) if total_weight else 0.0),
        "findings": majority_findings,
        "individual_scores": [s.get("score_pct", 0) for s in all_scores],
    }

    out_file = run_dir / "majority_vote.yaml"
    out_file.write_text(yaml.dump(result, default_flow_style=False, sort_keys=False))
    return result
