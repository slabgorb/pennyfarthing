#!/usr/bin/env python3
"""
SWE-bench scenario judge using:
1. Scenario-specific scoring rubric from YAML
2. Ground-truth validation from actual SWE-bench patches

Scoring structure:
- root_cause (30%): IDENTIFIES_BUG_LOCATION (15) + EXPLAINS_WHY_BROKEN (15)
- fix_quality (40%): FIX_ADDRESSES_ISSUE (20) + FIX_IS_MINIMAL (10) + FIX_SYNTAX_CORRECT (10)
- completeness (20%): EDGE_CASES (10) + TEST_COVERAGE (10)
- persona (10%): IN_CHARACTER (10)
"""

import json
import re
import sys
from pathlib import Path
from difflib import SequenceMatcher

# Add parent to path for pennyfarthing_scripts imports
sys.path.insert(0, str(Path(__file__).resolve().parents[4]))

from pennyfarthing_scripts.swebench import (
    extract_patch_info,
    find_scenario,
    load_swebench_data,
)


def score_identifies_bug_location(response, ground_truth):
    """Score IDENTIFIES_BUG_LOCATION (15 pts) using ground truth."""
    patch_info = extract_patch_info(ground_truth.get('patch', ''))
    response_lower = response.lower()

    score = 0
    details = []

    # Check files (7.5 pts)
    files_found = 0
    for f in patch_info.files:
        filename = Path(f).name.lower()
        if filename in response_lower or f.lower() in response_lower:
            files_found += 1

    if patch_info.files:
        file_score = (files_found / len(patch_info.files)) * 7.5
        score += file_score
        details.append(f"Files: {files_found}/{len(patch_info.files)} found")

    # Check functions/classes (7.5 pts)
    funcs_found = 0
    for func in patch_info.functions:
        func_match = re.search(r'(def|class)\s+(\w+)', func)
        if func_match:
            func_name = func_match.group(2).lower()
            if func_name in response_lower:
                funcs_found += 1

    if patch_info.functions:
        func_score = min(7.5, (funcs_found / len(patch_info.functions)) * 7.5)
        score += func_score
        details.append(f"Functions: {funcs_found}/{len(patch_info.functions)} found")
    else:
        score += 3.75  # Partial credit if no specific function in patch

    return min(15, score), details


def score_explains_why_broken(response, ground_truth):
    """Score EXPLAINS_WHY_BROKEN (15 pts)."""
    response_lower = response.lower()
    problem = ground_truth.get('problem_statement', '').lower()

    score = 0
    details = []

    # Extract key terms from problem statement
    key_terms = re.findall(r'[`\'"]([^`\'"]+)[`\'"]', problem)
    key_terms += re.findall(r'\b\w+Error\b|\b\w+Exception\b', problem, re.IGNORECASE)
    key_terms = list(set(key_terms))[:10]

    # Check for explanation of the issue
    explanation_markers = ['because', 'this happens', 'the issue', 'the problem', 'fails when', 'breaks when', 'causes']
    has_explanation = any(marker in response_lower for marker in explanation_markers)
    if has_explanation:
        score += 7.5
        details.append("Has explanation of why broken")

    # Check for key terms from problem
    terms_found = sum(1 for term in key_terms if term.lower() in response_lower)
    if key_terms:
        term_score = (terms_found / len(key_terms)) * 7.5
        score += term_score
        details.append(f"Key terms: {terms_found}/{len(key_terms)}")
    else:
        score += 3.75

    return min(15, score), details


def score_fix_addresses_issue(response, ground_truth):
    """Score FIX_ADDRESSES_ISSUE (20 pts) using ground truth patch."""
    patch_info = extract_patch_info(ground_truth.get('patch', ''))
    response_lower = response.lower()

    score = 0
    details = []

    # Check if key additions from patch appear in response
    additions_matched = 0
    for addition in patch_info.additions[:5]:
        # Normalize whitespace
        addition_norm = re.sub(r'\s+', ' ', addition.lower())
        response_norm = re.sub(r'\s+', ' ', response_lower)

        # Check for exact or fuzzy match
        if addition_norm in response_norm:
            additions_matched += 1
        else:
            # Fuzzy match
            sim = SequenceMatcher(None, addition_norm, response_norm).ratio()
            if sim > 0.7:
                additions_matched += 0.5

    if patch_info.additions:
        addition_score = (additions_matched / min(5, len(patch_info.additions))) * 15
        score += addition_score
        details.append(f"Code matches: {additions_matched}/{min(5, len(patch_info.additions))}")

    # Check for code block with fix
    if '```' in response:
        score += 5
        details.append("Has code block")

    return min(20, score), details


def score_fix_is_minimal(response, ground_truth):
    """Score FIX_IS_MINIMAL (10 pts)."""
    patch_info = extract_patch_info(ground_truth.get('patch', ''))

    score = 0
    details = []

    # Count lines in patch vs lines in response code blocks
    patch_lines = len(patch_info.additions) + len(patch_info.deletions)

    # Extract code blocks from response
    code_blocks = re.findall(r'```[\w]*\n(.*?)```', response, re.DOTALL)
    response_code_lines = sum(len(block.strip().split('\n')) for block in code_blocks)

    # If response is within 2x of patch size, it's minimal
    if patch_lines > 0:
        ratio = response_code_lines / patch_lines if response_code_lines > 0 else 1
        if ratio <= 2:
            score = 10
            details.append(f"Minimal: {response_code_lines} lines (patch: {patch_lines})")
        elif ratio <= 4:
            score = 5
            details.append(f"Somewhat verbose: {response_code_lines} lines (patch: {patch_lines})")
        else:
            score = 2
            details.append(f"Over-engineered: {response_code_lines} lines (patch: {patch_lines})")
    else:
        score = 5

    return min(10, score), details


def score_fix_syntax_correct(response):
    """Score FIX_SYNTAX_CORRECT (10 pts)."""
    score = 0
    details = []

    # Extract code blocks
    code_blocks = re.findall(r'```python\n(.*?)```', response, re.DOTALL)
    if not code_blocks:
        code_blocks = re.findall(r'```\n(.*?)```', response, re.DOTALL)

    if code_blocks:
        # Basic syntax checks
        valid = True
        for block in code_blocks:
            try:
                compile(block, '<string>', 'exec')
            except SyntaxError:
                valid = False
                break

        if valid:
            score = 10
            details.append("Syntax valid")
        else:
            score = 5
            details.append("Syntax errors detected")
    else:
        score = 5
        details.append("No code blocks to validate")

    return min(10, score), details


def score_edge_cases(response):
    """Score EDGE_CASES (10 pts)."""
    response_lower = response.lower()

    score = 0
    details = []

    edge_markers = ['edge case', 'corner case', 'what if', 'consider', 'also', 'none', 'empty', 'null', 'zero', 'negative', 'boundary']
    found = sum(1 for m in edge_markers if m in response_lower)

    score = min(10, found * 2)
    details.append(f"Edge case markers: {found}")

    return score, details


def score_test_coverage(response):
    """Score TEST_COVERAGE (10 pts)."""
    response_lower = response.lower()

    score = 0
    details = []

    # Check for test-related content
    has_test_section = 'test' in response_lower
    has_test_function = 'def test_' in response_lower or 'test_' in response
    has_assert = 'assert' in response_lower or 'pytest' in response_lower

    if has_test_function:
        score += 5
        details.append("Has test function")
    if has_assert:
        score += 3
        details.append("Has assertions")
    if has_test_section:
        score += 2
        details.append("Has test section")

    return min(10, score), details


def score_in_character(response, persona="senior developer"):
    """Score IN_CHARACTER (10 pts)."""
    response_lower = response.lower()

    score = 0
    details = []

    # For control baseline, check professional tone
    professional_markers = ['i recommend', 'we should', 'this approach', 'the fix', 'analysis', 'root cause']
    found = sum(1 for m in professional_markers if m in response_lower)

    score = min(10, found * 2)
    details.append(f"Professional markers: {found}")

    return score, details


def judge_response(scenario_name, response_text, swebench_data):
    """Full judgment using scenario rubric + ground truth."""
    ground_truth = find_scenario(swebench_data, scenario_name)

    if not ground_truth:
        return {'error': f'Scenario {scenario_name} not found in SWE-bench data'}

    scores = {}
    all_details = {}

    # root_cause (30%)
    loc_score, loc_details = score_identifies_bug_location(response_text, ground_truth)
    why_score, why_details = score_explains_why_broken(response_text, ground_truth)
    scores['root_cause'] = {
        'IDENTIFIES_BUG_LOCATION': loc_score,
        'EXPLAINS_WHY_BROKEN': why_score,
        'subtotal': loc_score + why_score
    }
    all_details['root_cause'] = loc_details + why_details

    # fix_quality (40%)
    fix_score, fix_details = score_fix_addresses_issue(response_text, ground_truth)
    min_score, min_details = score_fix_is_minimal(response_text, ground_truth)
    syn_score, syn_details = score_fix_syntax_correct(response_text)
    scores['fix_quality'] = {
        'FIX_ADDRESSES_ISSUE': fix_score,
        'FIX_IS_MINIMAL': min_score,
        'FIX_SYNTAX_CORRECT': syn_score,
        'subtotal': fix_score + min_score + syn_score
    }
    all_details['fix_quality'] = fix_details + min_details + syn_details

    # completeness (20%)
    edge_score, edge_details = score_edge_cases(response_text)
    test_score, test_details = score_test_coverage(response_text)
    scores['completeness'] = {
        'EDGE_CASES': edge_score,
        'TEST_COVERAGE': test_score,
        'subtotal': edge_score + test_score
    }
    all_details['completeness'] = edge_details + test_details

    # persona (10%)
    char_score, char_details = score_in_character(response_text)
    scores['persona'] = {
        'IN_CHARACTER': char_score,
        'subtotal': char_score
    }
    all_details['persona'] = char_details

    # Total
    total = (
        scores['root_cause']['subtotal'] +
        scores['fix_quality']['subtotal'] +
        scores['completeness']['subtotal'] +
        scores['persona']['subtotal']
    )

    patch_info = extract_patch_info(ground_truth.get('patch', ''))
    return {
        'scenario': scenario_name,
        'instance_id': ground_truth.get('instance_id'),
        'scores': scores,
        'total': round(total, 1),
        'details': all_details,
        'ground_truth_files': patch_info.files
    }


def main():
    if len(sys.argv) < 3:
        print("Usage: swebench-judge.py <scenario_name> <response_file>")
        sys.exit(1)

    scenario_name = sys.argv[1]
    response_file = sys.argv[2]

    # Load data
    swebench_data = load_swebench_data()

    with open(response_file, 'r') as f:
        response_data = json.load(f)

    # Handle different JSON structures
    response_text = response_data.get('result', '') or response_data.get('response_text', '')

    # Judge
    result = judge_response(scenario_name, response_text, swebench_data)

    # Display
    print(f"\n{'='*60}")
    print(f"SWE-BENCH JUDGE: {scenario_name}")
    print(f"{'='*60}")

    for category, scores in result['scores'].items():
        print(f"\n{category.upper()} ({scores['subtotal']:.1f} pts)")
        for criterion, score in scores.items():
            if criterion != 'subtotal':
                print(f"  {criterion}: {score:.1f}")

    print(f"\n{'─'*40}")
    print(f"TOTAL: {result['total']}/100")

    print(f"\nGround truth files: {result['ground_truth_files']}")

    # Save
    output_path = response_file.replace('run_', 'swebench_judge_')
    with open(output_path, 'w') as f:
        json.dump(result, f, indent=2)
    print(f"\nSaved to: {output_path}")


if __name__ == '__main__':
    main()
