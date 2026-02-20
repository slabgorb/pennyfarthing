#!/usr/bin/env python3
"""
Ground-truth judge for SWE-bench scenarios.

Compares Claude's proposed fix against the actual SWE-bench patch.
Scores based on:
- File identification (20%)
- Function/location identification (20%)
- Fix logic match (40%)
- Completeness (20%)
"""

import json
import re
import sys
from difflib import SequenceMatcher
from pathlib import Path

# Add parent to path for pf imports
sys.path.insert(0, str(Path(__file__).resolve().parents[4] / "pennyfarthing-dist"))

from pf.swebench import (
    extract_patch_info,
    extract_problem_keywords,
    find_scenario,
    get_meaningful_patterns,
    load_swebench_data,
)


def score_response(response_text, ground_truth):
    """Score a response against ground truth patch."""
    patch_info = extract_patch_info(ground_truth['patch'])

    scores = {
        'file_identification': 0,
        'location_identification': 0,
        'fix_logic_match': 0,
        'completeness': 0,
        'details': {}
    }

    response_lower = response_text.lower()

    # 1. FILE IDENTIFICATION (20 points)
    files_found = 0
    for f in patch_info.files:
        # Check various forms of the filename
        filename = Path(f).name
        if filename.lower() in response_lower or f.lower() in response_lower:
            files_found += 1

    if patch_info.files:
        file_score = (files_found / len(patch_info.files)) * 20
        scores['file_identification'] = min(20, file_score)
        scores['details']['files_expected'] = patch_info.files
        scores['details']['files_found'] = files_found
    else:
        scores['file_identification'] = 20  # No specific file in patch

    # 2. LOCATION IDENTIFICATION (20 points)
    # Look for function/class names mentioned in the patch
    locations_found = 0
    for func in patch_info.functions:
        # Extract the function/class name
        func_match = re.search(r'(def|class)\s+(\w+)', func)
        if func_match:
            func_name = func_match.group(2)
            if func_name.lower() in response_lower:
                locations_found += 1
        elif func.strip() and func.strip().split()[0] in response_lower:
            locations_found += 1

    if patch_info.functions:
        loc_score = (locations_found / len(patch_info.functions)) * 20
        scores['location_identification'] = min(20, loc_score)
        scores['details']['locations_expected'] = patch_info.functions[:3]
        scores['details']['locations_found'] = locations_found
    else:
        scores['location_identification'] = 10  # Partial credit

    # 3. FIX LOGIC MATCH (40 points)
    # Check if key code patterns from the fix appear in the response
    meaningful_patterns = get_meaningful_patterns(patch_info.key_patterns)

    patterns_found = 0
    for pattern in meaningful_patterns:
        if pattern.lower() in response_lower:
            patterns_found += 1

    if meaningful_patterns:
        pattern_score = (patterns_found / len(meaningful_patterns)) * 20
        scores['details']['patterns_expected'] = meaningful_patterns[:10]
        scores['details']['patterns_found'] = patterns_found
    else:
        pattern_score = 10

    # Check for actual code additions
    additions_matched = 0
    for addition in patch_info.additions[:5]:  # Check first 5 additions
        # Normalize and check
        addition_normalized = re.sub(r'\s+', ' ', addition.lower())
        response_normalized = re.sub(r'\s+', ' ', response_lower)

        # Use fuzzy matching
        similarity = SequenceMatcher(None, addition_normalized, response_normalized).ratio()
        if similarity > 0.6 or addition_normalized in response_normalized:
            additions_matched += 1

    if patch_info.additions:
        addition_score = (additions_matched / min(5, len(patch_info.additions))) * 20
        scores['details']['additions_matched'] = additions_matched
    else:
        addition_score = 10

    scores['fix_logic_match'] = min(40, pattern_score + addition_score)

    # 4. COMPLETENESS (20 points)
    # Does the response have all the elements of a good fix?
    completeness_score = 0

    # Has code block?
    if '```' in response_text:
        completeness_score += 5

    # Has test considerations?
    if 'test' in response_lower:
        completeness_score += 5

    # Mentions the specific error/issue?
    problem_keywords = extract_problem_keywords(ground_truth.get('problem_statement', ''))
    keywords_found = sum(1 for kw in problem_keywords if kw.lower() in response_lower)
    if problem_keywords:
        completeness_score += min(5, (keywords_found / len(problem_keywords)) * 5)
    else:
        completeness_score += 2.5

    # Has explanation of why fix works?
    explanation_words = ['because', 'this fixes', 'this resolves', 'the issue', 'the problem', 'solution']
    if any(word in response_lower for word in explanation_words):
        completeness_score += 5

    scores['completeness'] = min(20, completeness_score)

    # Total
    scores['total'] = round(
        scores['file_identification'] +
        scores['location_identification'] +
        scores['fix_logic_match'] +
        scores['completeness']
    , 1)

    return scores


def main():
    if len(sys.argv) < 3:
        print("Usage: ground-truth-judge.py <scenario_name> <response_file>")
        print("Example: ground-truth-judge.py flask-5014 run_20260102T134237Z.json")
        sys.exit(1)

    scenario_name = sys.argv[1]
    response_file = sys.argv[2]

    # Load SWE-bench data
    swebench_data = load_swebench_data()

    # Find scenario
    scenario = find_scenario(swebench_data, scenario_name)
    if not scenario:
        print(f"Error: Scenario '{scenario_name}' not found in SWE-bench data")
        sys.exit(1)

    # Load response
    with open(response_file) as f:
        response_data = json.load(f)

    response_text = response_data.get('result', '')
    if not response_text:
        print("Error: No 'result' field in response file")
        sys.exit(1)

    # Score
    scores = score_response(response_text, scenario)

    # Output
    print(f"\n{'='*60}")
    print(f"GROUND TRUTH EVALUATION: {scenario_name}")
    print(f"{'='*60}")
    print("\nScores:")
    print(f"  File Identification:     {scores['file_identification']:5.1f}/20")
    print(f"  Location Identification: {scores['location_identification']:5.1f}/20")
    print(f"  Fix Logic Match:         {scores['fix_logic_match']:5.1f}/40")
    print(f"  Completeness:            {scores['completeness']:5.1f}/20")
    print(f"  {'─'*40}")
    print(f"  TOTAL:                   {scores['total']:5.1f}/100")

    print("\nDetails:")
    for key, value in scores['details'].items():
        print(f"  {key}: {value}")

    # Output JSON for programmatic use
    output = {
        'scenario': scenario_name,
        'instance_id': scenario.get('instance_id'),
        'scores': scores,
        'ground_truth_patch_preview': scenario.get('patch', '')[:300]
    }

    # Save judge output
    output_path = response_file.replace('run_', 'gt_judge_')
    with open(output_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"\nSaved to: {output_path}")

    return scores


if __name__ == '__main__':
    main()
