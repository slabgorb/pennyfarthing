#!/usr/bin/env python3
"""
Import SWE-bench Verified scenarios into Pennyfarthing format.

Usage:
    python import-swebench.py [--count N] [--difficulty LEVEL]

This script:
1. Loads the cached SWE-bench data from /tmp/swebench_all.json
2. Selects a stratified sample across difficulty levels
3. Generates Pennyfarthing scenario YAML files
"""

import json
import re
import sys
from pathlib import Path
from textwrap import indent

# Difficulty mapping: SWE-bench -> Pennyfarthing
DIFFICULTY_MAP = {
    "<15 min fix": "easy",
    "15 min - 1 hour": "medium",
    "1-4 hours": "hard",
    ">4 hours": "extreme"
}

# How many to import per difficulty level
DEFAULT_COUNTS = {
    "easy": 5,
    "medium": 5,
    "hard": 3,
    "extreme": 2
}

def sanitize_name(instance_id: str) -> str:
    """Convert instance_id to valid filename."""
    # astropy__astropy-12907 -> astropy-12907
    parts = instance_id.split("__")
    if len(parts) == 2:
        return parts[1].lower()
    return instance_id.lower().replace("__", "-")

def truncate_text(text: str, max_chars: int = 4000) -> str:
    """Truncate text to max characters, preserving complete lines."""
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars]
    # Find last newline to avoid cutting mid-line
    last_nl = truncated.rfind('\n')
    if last_nl > max_chars * 0.8:
        truncated = truncated[:last_nl]
    return truncated + "\n\n[... truncated for brevity ...]"

def generate_scenario_yaml(instance: dict) -> str:
    """Generate Pennyfarthing scenario YAML from SWE-bench instance."""

    instance_id = instance['instance_id']
    repo = instance['repo']
    problem = instance['problem_statement']
    swe_difficulty = instance.get('difficulty', '15 min - 1 hour')
    pf_difficulty = DIFFICULTY_MAP.get(swe_difficulty, 'medium')
    base_commit = instance['base_commit'][:12]

    # Parse repo for cleaner name
    repo_name = repo.split('/')[-1]
    scenario_name = sanitize_name(instance_id)

    # Extract first line as title (usually issue title)
    lines = problem.strip().split('\n')
    title = lines[0][:80] if lines else f"Issue in {repo_name}"
    # Clean markdown formatting from title
    title = re.sub(r'[`*#]', '', title).strip()
    if title.startswith('- '):
        title = title[2:]

    # Truncate problem statement for scenario
    problem_truncated = truncate_text(problem, 6000)

    yaml_content = f'''---
# SWE-bench Verified Scenario
# Source: https://huggingface.co/datasets/princeton-nlp/SWE-bench_Verified
# Instance: {instance_id}

name: {scenario_name}
title: "{title}"
category: dev
difficulty: {pf_difficulty}  # SWE-bench: {swe_difficulty}
version: "1.0"

source:
  benchmark: swe-bench-verified
  instance_id: {instance_id}
  repo: {repo}
  base_commit: {base_commit}

description: |
  Real GitHub issue from {repo} requiring code changes to resolve.
  This is a human-validated problem from the SWE-bench Verified dataset.

prompt: |
  You are working on the {repo} repository at commit {base_commit}.

  A user has reported the following issue:

  ---
{indent(problem_truncated, "  ")}
  ---

  Analyze this issue and provide:
  1. Root cause analysis - what is causing the bug?
  2. Proposed fix - what code changes would resolve this?
  3. Test considerations - how would you verify the fix works?

  Provide your response with specific file paths and code changes.

scoring:
  # Adapted for SWE-bench bug-fix scenarios
  categories:
    - name: root_cause
      weight: 30
      description: "Correctly identifies the underlying cause of the bug"
      criteria:
        - id: IDENTIFIES_BUG_LOCATION
          description: "Points to correct file(s) and function(s)"
          points: 15
        - id: EXPLAINS_WHY_BROKEN
          description: "Explains why current code fails"
          points: 15

    - name: fix_quality
      weight: 40
      description: "Proposes a correct and complete fix"
      criteria:
        - id: FIX_ADDRESSES_ISSUE
          description: "Fix would resolve the reported problem"
          points: 20
        - id: FIX_IS_MINIMAL
          description: "Fix is appropriately scoped, not over-engineered"
          points: 10
        - id: FIX_SYNTAX_CORRECT
          description: "Code changes are syntactically valid"
          points: 10

    - name: completeness
      weight: 20
      description: "Considers edge cases and testing"
      criteria:
        - id: EDGE_CASES
          description: "Considers related scenarios that might break"
          points: 10
        - id: TEST_COVERAGE
          description: "Suggests appropriate test cases"
          points: 10

    - name: persona
      weight: 10
      description: "Maintains character while solving"
      criteria:
        - id: IN_CHARACTER
          description: "Response reflects persona traits"
          points: 10

# Metadata for full harness evaluation (optional)
swebench_metadata:
  fail_to_pass: {json.dumps(json.loads(instance.get('FAIL_TO_PASS', '[]'))[:3])}
  environment_version: "{instance.get('version', 'unknown')}"
'''

    return yaml_content

def select_scenarios(all_instances: list, counts: dict) -> list:
    """Select stratified sample of scenarios."""
    selected = []

    # Group by difficulty
    by_difficulty = {}
    for inst in all_instances:
        swe_diff = inst.get('difficulty', '15 min - 1 hour')
        pf_diff = DIFFICULTY_MAP.get(swe_diff, 'medium')
        by_difficulty.setdefault(pf_diff, []).append(inst)

    # Select from each difficulty, preferring repo diversity
    for difficulty, count in counts.items():
        available = by_difficulty.get(difficulty, [])

        # Sort by repo to get diversity, then take first N
        seen_repos = set()
        diverse_selection = []
        for inst in available:
            repo = inst['repo']
            if repo not in seen_repos:
                diverse_selection.append(inst)
                seen_repos.add(repo)
            if len(diverse_selection) >= count:
                break

        # If we don't have enough diverse repos, add more from any repo
        if len(diverse_selection) < count:
            for inst in available:
                if inst not in diverse_selection:
                    diverse_selection.append(inst)
                    if len(diverse_selection) >= count:
                        break

        selected.extend(diverse_selection[:count])

    return selected

def main():
    # Load cached data
    cache_file = Path('/tmp/swebench_all.json')
    if not cache_file.exists():
        print("Error: Run the download script first to create /tmp/swebench_all.json")
        sys.exit(1)

    with open(cache_file) as f:
        all_instances = json.load(f)

    print(f"Loaded {len(all_instances)} SWE-bench instances")

    # Select scenarios
    selected = select_scenarios(all_instances, DEFAULT_COUNTS)
    print(f"Selected {len(selected)} scenarios for import")

    # Output directory
    output_dir = Path(__file__).parent

    # Generate YAML files
    for inst in selected:
        scenario_name = sanitize_name(inst['instance_id'])
        output_file = output_dir / f"{scenario_name}.yaml"

        yaml_content = generate_scenario_yaml(inst)

        with open(output_file, 'w') as f:
            f.write(yaml_content)

        pf_diff = DIFFICULTY_MAP.get(inst.get('difficulty', 'medium'), 'medium')
        print(f"  Created: {scenario_name}.yaml ({pf_diff})")

    print(f"\nImport complete! {len(selected)} scenarios created in {output_dir}")

if __name__ == '__main__':
    main()
