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
from pathlib import Path
from difflib import SequenceMatcher

def load_swebench_data(cache_path="/tmp/swebench_all.json"):
    """Load SWE-bench data from cache."""
    with open(cache_path, 'r') as f:
        return json.load(f)

def find_scenario(data, scenario_name):
    """Find scenario in SWE-bench data by name."""
    # Normalize name (flask-5014 -> pallets__flask-5014)
    for item in data:
        instance_id = item.get('instance_id', '')
        # Try various matching strategies
        if scenario_name in instance_id.replace('__', '-'):
            return item
        if scenario_name.replace('-', '__') in instance_id:
            return item
    return None

def extract_patch_elements(patch_text):
    """Extract key elements from a patch."""
    elements = {
        'files': [],
        'functions': [],
        'additions': [],
        'deletions': [],
        'key_patterns': []
    }

    current_file = None
    for line in patch_text.split('\n'):
        # File changes
        if line.startswith('diff --git'):
            match = re.search(r'b/(.+)$', line)
            if match:
                current_file = match.group(1)
                elements['files'].append(current_file)

        # Function/class context
        if line.startswith('@@'):
            match = re.search(r'@@.*@@\s*(.+)$', line)
            if match:
                elements['functions'].append(match.group(1).strip())

        # Additions
        if line.startswith('+') and not line.startswith('+++'):
            clean_line = line[1:].strip()
            if clean_line and not clean_line.startswith('#'):
                elements['additions'].append(clean_line)
                # Extract key patterns (function calls, variable names, etc.)
                patterns = re.findall(r'\b\w+\b', clean_line)
                elements['key_patterns'].extend(patterns)

        # Deletions
        if line.startswith('-') and not line.startswith('---'):
            clean_line = line[1:].strip()
            if clean_line and not clean_line.startswith('#'):
                elements['deletions'].append(clean_line)

    # Deduplicate
    elements['key_patterns'] = list(set(elements['key_patterns']))

    return elements

def score_response(response_text, ground_truth):
    """Score a response against ground truth patch."""
    gt_elements = extract_patch_elements(ground_truth['patch'])

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
    for f in gt_elements['files']:
        # Check various forms of the filename
        filename = Path(f).name
        if filename.lower() in response_lower or f.lower() in response_lower:
            files_found += 1

    if gt_elements['files']:
        file_score = (files_found / len(gt_elements['files'])) * 20
        scores['file_identification'] = min(20, file_score)
        scores['details']['files_expected'] = gt_elements['files']
        scores['details']['files_found'] = files_found
    else:
        scores['file_identification'] = 20  # No specific file in patch

    # 2. LOCATION IDENTIFICATION (20 points)
    # Look for function/class names mentioned in the patch
    locations_found = 0
    for func in gt_elements['functions']:
        # Extract the function/class name
        func_match = re.search(r'(def|class)\s+(\w+)', func)
        if func_match:
            func_name = func_match.group(2)
            if func_name.lower() in response_lower:
                locations_found += 1
        elif func.strip() and func.strip().split()[0] in response_lower:
            locations_found += 1

    if gt_elements['functions']:
        loc_score = (locations_found / len(gt_elements['functions'])) * 20
        scores['location_identification'] = min(20, loc_score)
        scores['details']['locations_expected'] = gt_elements['functions'][:3]
        scores['details']['locations_found'] = locations_found
    else:
        scores['location_identification'] = 10  # Partial credit

    # 3. FIX LOGIC MATCH (40 points)
    # Check if key code patterns from the fix appear in the response
    key_patterns = gt_elements['key_patterns']
    # Filter to meaningful patterns (not common words)
    common_words = {'if', 'else', 'return', 'self', 'def', 'class', 'for', 'in', 'not', 'and', 'or', 'is', 'none', 'true', 'false'}
    meaningful_patterns = [p for p in key_patterns if p.lower() not in common_words and len(p) > 2]

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
    for addition in gt_elements['additions'][:5]:  # Check first 5 additions
        # Normalize and check
        addition_normalized = re.sub(r'\s+', ' ', addition.lower())
        response_normalized = re.sub(r'\s+', ' ', response_lower)

        # Use fuzzy matching
        similarity = SequenceMatcher(None, addition_normalized, response_normalized).ratio()
        if similarity > 0.6 or addition_normalized in response_normalized:
            additions_matched += 1

    if gt_elements['additions']:
        addition_score = (additions_matched / min(5, len(gt_elements['additions']))) * 20
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

def extract_problem_keywords(problem_statement):
    """Extract key technical terms from problem statement."""
    if not problem_statement:
        return []

    # Find quoted strings, function names, error messages
    keywords = []

    # Find quoted terms
    quoted = re.findall(r'[`\'"]([^`\'"]+)[`\'"]', problem_statement)
    keywords.extend(quoted)

    # Find CamelCase or snake_case identifiers
    identifiers = re.findall(r'\b[A-Z][a-z]+[A-Z]\w*\b|\b\w+_\w+\b', problem_statement)
    keywords.extend(identifiers)

    return list(set(keywords))[:10]

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
    with open(response_file, 'r') as f:
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
    print(f"\nScores:")
    print(f"  File Identification:     {scores['file_identification']:5.1f}/20")
    print(f"  Location Identification: {scores['location_identification']:5.1f}/20")
    print(f"  Fix Logic Match:         {scores['fix_logic_match']:5.1f}/40")
    print(f"  Completeness:            {scores['completeness']:5.1f}/20")
    print(f"  {'─'*40}")
    print(f"  TOTAL:                   {scores['total']:5.1f}/100")

    print(f"\nDetails:")
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
