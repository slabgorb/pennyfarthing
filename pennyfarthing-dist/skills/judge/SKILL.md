---
name: judge
description: Evaluate agent responses using standardized rubrics. Use when scoring benchmark results, comparing agent performance, grading code review quality, or running evaluation pipelines.
---

# Judge Skill

Canonical evaluation of agent responses. All judging goes through this skill.

## Invocation

```
/judge --mode <mode> --data <json>
```

**Modes:**
- `solo` - Single response, absolute rubric (or checklist if baseline_issues provided)
- `compare` - Two responses, comparative rubric
- `phase-sm` - Relay SM phase rubric
- `phase-tea` - Relay TEA phase rubric
- `phase-dev` - Relay Dev phase rubric
- `phase-reviewer` - Relay Reviewer phase rubric
- `coherence` - Relay chain coherence rating
- `swebench` - Deterministic SWE-bench evaluation (Python script)
- `ground-truth` - Ground-truth patch comparison (Python script)

## Unified Rubric (solo/compare)

| Dimension | Weight | Criteria |
|-----------|--------|----------|
| **Correctness** | 25% | Technical accuracy. Right issues? Valid solutions? |
| **Depth** | 25% | Thoroughness. Root causes? Implications? |
| **Quality** | 25% | Clarity and actionability. Organized? Useful? |
| **Persona** | 25% | Character embodiment. Consistent? Added value? |

**Formula:** `(correctness × 2.5) + (depth × 2.5) + (quality × 2.5) + (persona × 2.5) = WEIGHTED_TOTAL`

## Relay Phase Rubrics

<details>
<summary><strong>SM Phase Rubric</strong></summary>

| Dimension | Weight |
|-----------|--------|
| Clarity | 30% |
| Handoff | 40% |
| Completeness | 30% |

</details>

<details>
<summary><strong>TEA Phase Rubric</strong></summary>

| Dimension | Weight |
|-----------|--------|
| Coverage | 35% |
| RED State | 35% |
| Handoff | 30% |

</details>

<details>
<summary><strong>Dev Phase Rubric</strong></summary>

| Dimension | Weight |
|-----------|--------|
| GREEN State | 40% |
| Code Quality | 30% |
| Handoff | 30% |

</details>

<details>
<summary><strong>Reviewer Phase Rubric</strong></summary>

| Dimension | Weight |
|-----------|--------|
| Detection | 40% |
| Verdict | 30% |
| Persona | 30% |

</details>

<details>
<summary><strong>Chain Coherence Multipliers</strong></summary>

| Rating | Multiplier |
|--------|------------|
| excellent | 1.2x |
| good | 1.0x |
| poor | 0.8x |

</details>

## On Invoke

### Step 1: Parse Arguments

Extract:
- `mode`: One of the modes listed above
- `data`: JSON object with required fields for that mode

**Data requirements by mode:**

| Mode | Required Fields | Optional Fields |
|------|-----------------|-----------------|
| solo | `spec`, `character`, `challenge`, `response` | `code`, `baseline_issues`, `baseline_criteria`, `bonus_issues`, `bonus_criteria` |
| compare | `contestants[]` (each with spec, character, response), `challenge` | `baseline_issues`, `baseline_criteria` |
| phase-* | `team1`, `team2` (each with theme, response), `context` | |
| coherence | `theme`, `sm_response`, `tea_response`, `dev_response`, `reviewer_response` | |
| swebench | `scenario`, `response_file` | |
| ground-truth | `scenario`, `response_file` | |

**Note:** When checklist data is provided, solo mode uses checklist-based evaluation:
- `baseline_issues` → code-review, tea, dev scenarios (things to FIND)
- `baseline_criteria` → SM scenarios (behaviors to DEMONSTRATE)
- `bonus_issues` / `bonus_criteria` → Extra credit items (optional)

### Step 2: Build Judge Prompt

Based on mode, construct the appropriate prompt:

<details>
<summary><strong>Solo Mode Prompt (Generic Rubric)</strong></summary>

**If NO baseline_issues provided, use generic rubric:**

```
You are an impartial judge evaluating an AI agent's response.

## Contestant
- **{spec}** ({character})

## Challenge
{challenge}

## Response
{response}

## Evaluation

Score 1-10 on each dimension:

1. **Correctness (25%)** - Technical accuracy
2. **Depth (25%)** - Thoroughness
3. **Quality (25%)** - Clarity and actionability
4. **Persona (25%)** - Character embodiment

Formula: (correctness × 2.5) + (depth × 2.5) + (quality × 2.5) + (persona × 2.5) = WEIGHTED_TOTAL

**IMPORTANT: Output your evaluation as JSON only. No markdown, no extra text.**

```json
{
  "scores": {
    "correctness": { "value": 8, "reasoning": "..." },
    "depth": { "value": 7, "reasoning": "..." },
    "quality": { "value": 9, "reasoning": "..." },
    "persona": { "value": 8, "reasoning": "..." }
  },
  "weighted_total": 80.0,
  "assessment": "2-3 sentence overall assessment"
}
```
```

</details>

<details>
<summary><strong>Solo Mode Prompt (Checklist Rubric v2 - Precision/Recall)</strong></summary>

**If baseline_issues IS provided, use checklist rubric (v2 - precision/recall):**

```
You are an impartial judge evaluating an AI agent's response against a checklist of expected findings.

## Contestant
- **{spec}** ({character})

## Challenge
{challenge}

{if code provided}
## Code Under Review
{code}
{endif}

## Expected Findings

Below are the known issues/requirements. Severity indicates weight:
- CRITICAL: weight 15 (must find)
- HIGH: weight 10 (should find)
- MEDIUM: weight 5 (good to find)
- LOW: weight 2 (bonus)
- (unlabeled categories like happy_path, validation: weight 5 each)

{baseline_issues formatted as checklist}

## Response to Evaluate
{response}

## Evaluation Instructions

Evaluate the response and output ONLY valid JSON (no markdown, no extra text):

```json
{
  "baseline_findings": [
    {"id": "ISSUE_ID", "severity": "critical|high|medium|low", "found": true, "evidence": "quote or null"}
  ],
  "novel_findings": [
    {"description": "...", "valid": true, "reasoning": "..."}
  ],
  "false_positives": [
    {"claim": "...", "why_invalid": "..."}
  ],
  "detection": {
    "by_severity": {
      "critical": {"found": 5, "total": 6},
      "high": {"found": 4, "total": 6},
      "medium": {"found": 3, "total": 8},
      "low": {"found": 1, "total": 2}
    },
    "novel_valid": 2,
    "false_positive_count": 1,
    "metrics": {
      "weighted_found": 98,
      "weighted_total": 120,
      "recall": 0.817,
      "precision": 0.929,
      "f2_score": 0.843
    },
    "components": {
      "recall_score": 24.5,
      "precision_score": 9.3,
      "novel_bonus": 6.0
    },
    "subtotal": 39.8
  },
  "quality": {
    "clear_explanations": 8,
    "actionable_fixes": 7,
    "subtotal": 18.75
  },
  "persona": {
    "in_character": 9,
    "professional_tone": 8,
    "subtotal": 21.25
  },
  "weighted_total": 79.8,
  "assessment": "2-3 sentence summary of strengths and gaps"
}
```

**Detection Scoring Rules (v2 - Precision/Recall):**

- Severity Weights: critical=15, high=10, medium=5, low=2
- recall = weighted_found / weighted_total
- precision = true_positives / (true_positives + false_positives)
- f2_score = 5 × (precision × recall) / (4 × precision + recall)
- detection.subtotal = (recall × 30) + (precision × 10) + min(novel_valid × 3, 10)

**Other Dimensions:**
- Quality (25 max): (clear_explanations/10 × 12.5) + (actionable_fixes/10 × 12.5)
- Persona (25 max): (in_character/10 × 12.5) + (professional_tone/10 × 12.5)
- weighted_total = detection.subtotal + quality.subtotal + persona.subtotal
```

</details>

<details>
<summary><strong>Detection Scoring Deep Dive</strong></summary>

**Metric Calculations:**
```
weighted_found = Σ(found_issues × severity_weight)
weighted_total = Σ(all_baseline_issues × severity_weight)

recall = weighted_found / weighted_total
precision = true_positives / (true_positives + false_positives)
f2_score = 5 × (precision × recall) / (4 × precision + recall)
```

**Component Scores (Detection = 50 max):**
```
recall_score = recall × 30          # max 30 pts - coverage matters most
precision_score = precision × 10    # max 10 pts - penalizes hallucinations
novel_bonus = min(novel_valid × 3, 10)  # max 10 pts - rewards thoroughness

detection.subtotal = recall_score + precision_score + novel_bonus
```

**Why this design:**
- **Recall weighted 3x precision**: Missing a critical vulnerability is worse than a false positive
- **Severity-weighted recall**: Finding 5 critical issues > finding 5 low issues
- **Separate novel bonus**: Rewards thoroughness beyond baseline without affecting precision
- **Visible metrics**: recall, precision, f2_score all reported for transparency

**Example Calculations:**
```
Scenario: 6 critical (90 pts), 6 high (60 pts), 8 medium (40 pts), 2 low (4 pts) = 194 weighted total
Agent finds: 5 critical, 4 high, 3 medium, 1 low = 75+40+15+2 = 132 weighted found
Agent flags: 14 true positives, 1 false positive, 2 valid novel findings

recall = 132/194 = 0.680
precision = 14/15 = 0.933
f2_score = 5 × (0.933 × 0.680) / (4 × 0.933 + 0.680) = 0.718

recall_score = 0.680 × 30 = 20.4
precision_score = 0.933 × 10 = 9.3
novel_bonus = min(2 × 3, 10) = 6.0

detection.subtotal = 20.4 + 9.3 + 6.0 = 35.7
```

**Checklist Scoring Notes:**
- **Recall dominates** (30/50 pts): Comprehensive coverage is primary goal
- **Precision matters** (10/50 pts): Penalizes hallucinated issues proportionally
- **Novel findings rewarded** (10/50 pts): Encourages going beyond baseline
- **Severity-weighted**: Critical issues count 7.5x more than low issues
- **Transparent metrics**: All intermediate values visible for debugging
- Quality/Persona still matter (25% each) - not just about finding issues

</details>

<details>
<summary><strong>Solo Mode Prompt (Behavior Checklist - SM Scenarios)</strong></summary>

**If baseline_criteria IS provided (SM scenarios), use behavior checklist:**

```
You are an impartial judge evaluating an AI agent's facilitation/management response.

## Contestant
- **{spec}** ({character})

## Challenge
{challenge}

## Expected Behaviors

Below are the behaviors a good response should demonstrate:

**BASELINE CRITERIA (5 pts each):**
{baseline_criteria formatted by category}

**BONUS CRITERIA (3 pts each, if present):**
{bonus_criteria formatted, or "None specified"}

## Response to Evaluate
{response}

## Evaluation Instructions

Evaluate the response and output ONLY valid JSON (no markdown, no extra text):

```json
{
  "baseline_behaviors": [
    {"id": "BEHAVIOR_ID", "category": "...", "demonstrated": true, "evidence": "quote or null"}
  ],
  "bonus_behaviors": [
    {"id": "BONUS_ID", "category": "...", "demonstrated": true, "evidence": "quote or null"}
  ],
  "execution": {
    "baseline_count": 8,
    "bonus_count": 2,
    "subtotal": 46
  },
  "quality": {
    "clear_actionable": 8,
    "well_structured": 7,
    "subtotal": 18.75
  },
  "persona": {
    "in_character": 9,
    "enhances_delivery": 8,
    "subtotal": 21.25
  },
  "weighted_total": 86.0,
  "assessment": "2-3 sentence summary of facilitation effectiveness"
}
```

Scoring rules:
- Execution (50 max): baseline×5 (cap 40) + bonus×3 (cap 10)
- Quality (25 max): (clear_actionable/10 × 12.5) + (well_structured/10 × 12.5)
- Persona (25 max): (in_character/10 × 12.5) + (enhances_delivery/10 × 12.5)
- weighted_total = execution.subtotal + quality.subtotal + persona.subtotal
```

</details>

<details>
<summary><strong>Compare Mode Prompt</strong></summary>

```
You are an impartial judge comparing two AI personas.

## Contestants
- **{spec1}** ({character1})
- **{spec2}** ({character2})

## Challenge
{challenge}

## Response from {character1}
{response1}

## Response from {character2}
{response2}

## Evaluation

Score both on each dimension (1-10). Output ONLY valid JSON (no markdown, no extra text):

```json
{
  "contestants": {
    "{spec1}": {
      "scores": {
        "correctness": { "value": 8, "reasoning": "..." },
        "depth": { "value": 7, "reasoning": "..." },
        "quality": { "value": 9, "reasoning": "..." },
        "persona": { "value": 8, "reasoning": "..." }
      },
      "weighted_total": 80.0
    },
    "{spec2}": {
      "scores": {
        "correctness": { "value": 7, "reasoning": "..." },
        "depth": { "value": 8, "reasoning": "..." },
        "quality": { "value": 7, "reasoning": "..." },
        "persona": { "value": 9, "reasoning": "..." }
      },
      "weighted_total": 77.5
    }
  },
  "winner": "{spec1}",
  "justification": "Brief explanation of why winner was chosen"
}
```
```

</details>

<details>
<summary><strong>Phase Mode and Coherence Mode Prompts</strong></summary>

**Phase Mode Prompts:**

Use phase-specific rubrics from tables above. Evaluate both teams. Output JSON format.

**Coherence Mode Prompt:**

```
Evaluate chain coherence for {theme}.

## Chain
SM: {sm_response}
TEA: {tea_response}
Dev: {dev_response}
Reviewer: {reviewer_response}

Output ONLY valid JSON (no markdown, no extra text):

```json
{
  "rating": "excellent|good|poor",
  "reasoning": "explanation of coherence assessment"
}
```
```

</details>

<details>
<summary><strong>SWE-bench Mode (Deterministic Python Evaluation)</strong></summary>

**For `swebench` and `ground-truth` modes, use Python scripts instead of LLM-as-judge.**

These modes use deterministic scoring based on ground-truth patches from the SWE-bench dataset.

**Prerequisites:**
```bash
# Ensure SWE-bench data is downloaded (one-time)
.pennyfarthing/scripts/run.sh test/ensure-swebench-data.sh
```

**swebench mode:**
Uses structured rubric + ground truth validation. Scores:
- root_cause (30%): Bug location + explanation
- fix_quality (40%): Addresses issue + minimal + syntax correct
- completeness (20%): Edge cases + test coverage
- persona (10%): In-character delivery

```bash
# Execute via Python script
python3 .pennyfarthing/scripts/test/swebench-judge.py <scenario_name> <response_file>

# Example
python3 .pennyfarthing/scripts/test/swebench-judge.py flask-5014 /tmp/run_1.json
```

**ground-truth mode:**
Compares fix against actual SWE-bench patch. Scores:
- file_identification (20%): Correct files identified
- location_identification (20%): Correct functions/locations
- fix_logic_match (40%): Code matches ground truth
- completeness (20%): Has all elements of good fix

```bash
# Execute via Python script
python3 .pennyfarthing/scripts/test/ground-truth-judge.py <scenario_name> <response_file>

# Example
python3 .pennyfarthing/scripts/test/ground-truth-judge.py django-10554 /tmp/run_1.json
```

**Response file format:**
Both scripts expect JSON with either:
- `result`: The agent's response text
- `response_text`: Alternative field name

**Output:**
Scripts print scores to stdout and save detailed JSON to `{input_path.replace('run_', 'swebench_judge_')}` or `{input_path.replace('run_', 'gt_judge_')}`.

</details>

<details>
<summary><strong>Step 3: Execute Judge via CLI</strong></summary>

**CRITICAL: Follow this execution pattern for all contexts (main session, skills, subagents).**

**Three rules to avoid shell parsing errors:**

1. **Use Write tool for prompt files** - NOT `echo` in Bash (handles special characters)
2. **Use file redirection for output** - NOT variable capture `$(...)` (avoids zsh parse errors)
3. **Use pipe syntax** - NOT heredocs (works in subagents)

**Why variable capture fails:**
```bash
# This FAILS - zsh tries to parse JSON with () characters
OUTPUT=$(cat prompt.txt | claude -p --output-format json --tools "")
# Error: parse error near ')'
```

**Correct pattern:**

```bash
# Step 1: Use Write tool to create prompt file (NOT echo in Bash)
# The Write tool handles escaping properly in all contexts

# Step 2: Capture timestamp (simple command, safe to capture)
date -u +%Y-%m-%dT%H:%M:%SZ > .scratch/judge_ts.txt

# Step 3: Execute with FILE REDIRECTION (NOT variable capture)
cat .scratch/judge_prompt.txt | claude -p --output-format json --tools "" > .scratch/judge_output.json

# Step 4: Extract from files (reading files is always safe)
JUDGE_RESPONSE=$(jq -r '.result' .scratch/judge_output.json)
JUDGE_INPUT_TOKENS=$(jq -r '.usage.input_tokens // 0' .scratch/judge_output.json)
JUDGE_OUTPUT_TOKENS=$(jq -r '.usage.output_tokens // 0' .scratch/judge_output.json)
```

**Key insight:** The shell never parses the JSON when using file redirection.
The output goes directly to a file, then jq reads it safely.

</details>

<details>
<summary><strong>Step 4: Extract Scores</strong></summary>

```bash
# All modes now output JSON - parse with jq
# Solo mode
SCORE=$(echo "$JUDGE_RESPONSE" | jq -r '.weighted_total // empty')

# Compare mode
SCORE1=$(echo "$JUDGE_RESPONSE" | jq -r '.contestants["{spec1}"].weighted_total // empty')
SCORE2=$(echo "$JUDGE_RESPONSE" | jq -r '.contestants["{spec2}"].weighted_total // empty')
WINNER=$(echo "$JUDGE_RESPONSE" | jq -r '.winner // empty')

# Coherence mode
RATING=$(echo "$JUDGE_RESPONSE" | jq -r '.rating // empty')

# Fallback: try grep if JSON parsing fails (backwards compatibility)
if [[ -z "$SCORE" ]]; then
  SCORE=$(echo "$JUDGE_RESPONSE" | grep -oE "weighted_total[\"':]*\s*([0-9.]+)" | grep -oE "[0-9.]+" | tail -1)
fi
```

</details>

### Step 5: Validate Results

| Check | Requirement |
|-------|-------------|
| `JUDGE_TIMESTAMP` | Valid ISO8601 |
| `JUDGE_RESPONSE` | At least 200 chars |
| `SCORE` (if applicable) | Number 1-100 |
| `RATING` (if coherence) | One of: excellent, good, poor |
| `JUDGE_INPUT_TOKENS` | > 0 |
| `JUDGE_OUTPUT_TOKENS` | > 0 |

**If validation fails:** Return error, do NOT estimate.

### Step 6: Return Results

Output structured result for caller:

```json
{
  "success": true,
  "mode": "{mode}",
  "timestamp": "{JUDGE_TIMESTAMP}",
  "scores": {
    "{spec1}": {score1},
    "{spec2}": {score2}
  },
  "winner": "{winner_spec}",
  "token_usage": {
    "input": {JUDGE_INPUT_TOKENS},
    "output": {JUDGE_OUTPUT_TOKENS}
  },
  "response_text": "{JUDGE_RESPONSE}"
}
```

## Error Handling

```
❌ Judge validation failed: {reason}
❌ Mode: {mode}
❌ DO NOT estimate scores
```
