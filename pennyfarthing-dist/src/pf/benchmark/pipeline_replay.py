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

import json
import os
import re
import subprocess
import sys
import time
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
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


@dataclass
class PhaseResult:
    role: str
    output_text: str
    token_usage: dict[str, int] = field(default_factory=dict)
    duration_s: float = 0.0
    exit_code: int = 0


@dataclass
class PipelineResult:
    scenario_id: str
    theme: str | None
    run_id: int
    worktree_path: str
    phases: dict[str, PhaseResult] = field(default_factory=dict)
    timestamp: str = ""


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

    return Scenario(
        id=raw["id"],
        title=raw["title"],
        story_id=raw["story_id"],
        jira=raw["jira"],
        repo_path=str(project / repo["path"]),
        base_commit=repo["base_commit"],
        branch=repo.get("branch", ""),
        context_epic_path=str(project / ctx["epic"]),
        context_story_path=str(project / ctx["story"]),
        session_archive_path=(
            str(project / ctx["session_archive"])
            if ctx.get("session_archive")
            else None
        ),
        phases=raw.get("phases", ["tea", "dev", "reviewer"]),
        ground_truth=findings,
        total_weight=gt.get("total_weight", sum(f.weight for f in findings)),
        phase_prompts=raw.get("phase_prompts", {}),
        original_pipeline=raw.get("original_pipeline", {}),
    )


# ---------------------------------------------------------------------------
# Worktree management
# ---------------------------------------------------------------------------


def create_worktree(
    repo_path: Path,
    commit: str,
    worktree_path: Path,
) -> Path:
    """Create a detached git worktree at *commit*."""
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
# Prompt extraction
# ---------------------------------------------------------------------------

# XML tags stripped from agent output for benchmark prompts
_STRIP_TAGS = [
    "helpers",
    "parameters",
    "phase-check",
    "on-activation",
    "assessment-templates",
    "finding-capture",
    "exit",
    "tandem-consultation",
    "tandem-backseat",
    "team-mode",
    "research-tools",
    "skills",
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
    result = re.sub(
        r"^---\nhooks:.*?^---\n", "", result, flags=re.MULTILINE | re.DOTALL
    )

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
        raise RuntimeError(
            f"pf agent start {role} failed: {result.stderr[:500]}"
        )
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
    """
    epic_text = Path(scenario.context_epic_path).read_text()
    story_text = Path(scenario.context_story_path).read_text()

    return f"""\
# Pipeline Replay Benchmark — {role.upper()} Phase

## Agent Context

{agent_prompt}

---

## Epic Context

{epic_text}

---

## Story Context

{story_text}

---

## Project Notes

- This is a Rust workspace. The target crate is `crates/axiathon-server/`.
- Tests go in `crates/axiathon-server/tests/`.
- Production code goes in `crates/axiathon-server/src/`.
- Run tests: `cargo test -p axiathon-server`
- Run lint: `cargo clippy -p axiathon-server`
- The crate `axiathon-core` has existing types (`AxiathonError`, `TenantId`, etc.)
"""


# ---------------------------------------------------------------------------
# Phase execution
# ---------------------------------------------------------------------------


def run_phase(
    worktree_path: Path,
    role: str,
    task_prompt: str,
    *,
    model: str | None = None,
) -> PhaseResult:
    """Run a single pipeline phase via ``claude -p`` in the worktree.

    CLAUDE.md must already be in place before calling this.
    """
    cmd = ["claude", "-p", task_prompt, "--output-format", "json"]
    if model:
        cmd.extend(["--model", model])

    start = time.monotonic()
    result = subprocess.run(
        cmd,
        cwd=str(worktree_path),
        capture_output=True,
        text=True,
    )
    elapsed = time.monotonic() - start

    output_text = ""
    token_usage: dict[str, int] = {}

    if result.stdout.strip():
        try:
            data = json.loads(result.stdout)
            output_text = data.get("result", "")
            usage = data.get("usage", {})
            token_usage = {
                "input": usage.get("input_tokens", 0),
                "output": usage.get("output_tokens", 0),
            }
        except json.JSONDecodeError:
            output_text = result.stdout

    return PhaseResult(
        role=role,
        output_text=output_text,
        token_usage=token_usage,
        duration_s=round(elapsed, 2),
        exit_code=result.returncode,
    )


# ---------------------------------------------------------------------------
# Full pipeline execution
# ---------------------------------------------------------------------------


def run_pipeline(
    scenario: Scenario,
    *,
    theme: str | None = None,
    run_id: int = 1,
    project_dir: Path,
    worktree_base: Path,
    model: str | None = None,
) -> PipelineResult:
    """Run the full TEA -> Dev -> Reviewer pipeline.

    1. Creates a worktree at the scenario's base commit.
    2. For each phase, writes CLAUDE.md with the agent prompt + context,
       then runs ``claude -p`` with the phase task prompt.
    3. Returns the collected results.
    """
    tag = theme or "control"
    wt_name = f"{scenario.id}-{tag}-run-{run_id}"
    wt_path = worktree_base / wt_name
    repo = Path(scenario.repo_path)

    result = PipelineResult(
        scenario_id=scenario.id,
        theme=theme,
        run_id=run_id,
        worktree_path=str(wt_path),
        timestamp=datetime.now(UTC).isoformat(),
    )

    # Create worktree
    create_worktree(repo, scenario.base_commit, wt_path)

    try:
        for role in scenario.phases:
            # Extract production-faithful agent prompt
            agent_prompt = extract_agent_prompt(
                role, project_dir, persona=(theme is not None), theme=theme
            )

            # Write CLAUDE.md into worktree
            claude_md = build_phase_claude_md(role, agent_prompt, scenario)
            (wt_path / "CLAUDE.md").write_text(claude_md)

            # Get the task prompt for this phase
            task_prompt = scenario.phase_prompts.get(role, f"Begin {role} phase.")

            print(f"  [{role.upper()}] Running phase...")
            phase_result = run_phase(
                wt_path,
                role,
                task_prompt,
                model=model,
            )
            result.phases[role] = phase_result

            tokens = phase_result.token_usage
            print(
                f"  [{role.upper()}] Done in {phase_result.duration_s}s "
                f"({tokens.get('input', 0)}+{tokens.get('output', 0)} tokens)"
            )

            if phase_result.exit_code != 0:
                print(f"  [{role.upper()}] WARNING: non-zero exit ({phase_result.exit_code})")

    except Exception as exc:
        print(f"  ERROR: Pipeline failed at phase: {exc}")
        raise
    finally:
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


def score_with_judge(
    scenario: Scenario,
    pipeline_result: PipelineResult,
    *,
    model: str | None = None,
    project_dir: Path | None = None,
) -> PipelineScore:
    """Score a pipeline run using an LLM judge."""
    judge_prompt = build_judge_prompt(scenario, pipeline_result)

    cmd = ["claude", "-p", judge_prompt, "--output-format", "json", "--tools", ""]
    if model:
        cmd.extend(["--model", model])

    result = subprocess.run(
        cmd,
        cwd=str(project_dir or Path.cwd()),
        capture_output=True,
        text=True,
        timeout=120,
    )

    # Parse judge output
    judge_text = ""
    if result.stdout.strip():
        try:
            data = json.loads(result.stdout)
            judge_text = data.get("result", "")
        except json.JSONDecodeError:
            judge_text = result.stdout

    if not judge_text.strip():
        print(f"  [JUDGE] WARNING: Empty judge response", file=sys.stderr)
        if result.stderr.strip():
            print(f"  [JUDGE] stderr: {result.stderr[:500]}", file=sys.stderr)

    # Parse the JSON from judge response
    scored_findings: list[FindingScore] = []
    try:
        # Try direct JSON parse first
        judge_data = json.loads(judge_text)
    except json.JSONDecodeError:
        # Try extracting JSON from markdown code block
        m = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", judge_text, re.DOTALL)
        if m:
            judge_data = json.loads(m.group(1))
        else:
            # Last resort: regex for the findings array
            judge_data = {"findings": []}
            if judge_text.strip():
                print(
                    f"  [JUDGE] WARNING: Could not parse judge JSON. "
                    f"First 300 chars: {judge_text[:300]}",
                    file=sys.stderr,
                )

    # Map judge results to ground truth
    judge_findings = {
        f["finding_id"]: f for f in judge_data.get("findings", [])
    }

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
) -> Path:
    """Save pipeline result and score to disk."""
    tag = pipeline_result.theme or "control"
    run_dir = (
        output_dir
        / pipeline_result.scenario_id
        / tag
        / f"run-{pipeline_result.run_id}"
    )
    run_dir.mkdir(parents=True, exist_ok=True)

    # Save phase outputs
    for role, pr in pipeline_result.phases.items():
        if role.startswith("_"):
            continue
        (run_dir / f"{role}-output.txt").write_text(pr.output_text)

    # Save pipeline metadata
    meta = {
        "scenario_id": pipeline_result.scenario_id,
        "theme": pipeline_result.theme,
        "run_id": pipeline_result.run_id,
        "timestamp": pipeline_result.timestamp,
        "worktree_path": pipeline_result.worktree_path,
        "phases": {
            role: {
                "token_usage": pr.token_usage,
                "duration_s": pr.duration_s,
                "exit_code": pr.exit_code,
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
        themes[tag].append({
            "run_id": sc.run_id,
            "total_caught": sc.total_caught,
            "weighted_caught": sc.weighted_caught,
            "score_pct": sc.score_pct,
            "caught_by_phase": _phase_attribution(sc),
        })

    # Detection heatmap across themes
    heatmap: dict[str, dict[str, str | None]] = {}
    for gt in scenario.ground_truth:
        heatmap[gt.id] = {}
        for sc in scores:
            tag = sc.theme or "control"
            finding = next(
                (f for f in sc.findings if f.finding_id == gt.id), None
            )
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
