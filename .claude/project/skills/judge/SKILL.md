---
name: judge
description: Evaluate agent responses using standardized rubrics. Invoke with mode and response data.
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
- `error-detection` - TRAIL-aware scoring with per-error-type detection rates
- `phase-sm` - Relay SM phase rubric
- `phase-tea` - Relay TEA phase rubric
- `phase-dev` - Relay Dev phase rubric
- `phase-reviewer` - Relay Reviewer phase rubric
- `coherence` - Relay chain coherence rating

## Unified Rubric (solo/compare)

| Dimension | Weight | Criteria |
|-----------|--------|----------|
| **Correctness** | 25% | Technical accuracy. Right issues? Valid solutions? |
| **Depth** | 25% | Thoroughness. Root causes? Implications? |
| **Quality** | 25% | Clarity and actionability. Organized? Useful? |
| **Persona** | 25% | Character embodiment. Consistent? Added value? |

**Formula:** `(correctness × 2.5) + (depth × 2.5) + (quality × 2.5) + (persona × 2.5) = WEIGHTED_TOTAL`

## Relay Phase Rubrics

### SM Phase
| Dimension | Weight |
|-----------|--------|
| Clarity | 30% |
| Handoff | 40% |
| Completeness | 30% |

### TEA Phase
| Dimension | Weight |
|-----------|--------|
| Coverage | 35% |
| RED State | 35% |
| Handoff | 30% |

### Dev Phase
| Dimension | Weight |
|-----------|--------|
| GREEN State | 40% |
| Code Quality | 30% |
| Handoff | 30% |

### Reviewer Phase
| Dimension | Weight |
|-----------|--------|
| Detection | 40% |
| Verdict | 30% |
| Persona | 30% |

### Chain Coherence
| Rating | Multiplier |
|--------|------------|
| excellent | 1.2x |
| good | 1.0x |
| poor | 0.8x |

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
| error-detection | `spec`, `character`, `challenge`, `response`, `baseline_issues` | `code` |
| phase-* | `team1`, `team2` (each with theme, response), `context` | |
| coherence | `theme`, `sm_response`, `tea_response`, `dev_response`, `reviewer_response` | |

**Note:** When checklist data is provided, solo mode uses checklist-based evaluation:
- `baseline_issues` → code-review, tea, dev scenarios (things to FIND)
- `baseline_criteria` → SM scenarios (behaviors to DEMONSTRATE)
- `bonus_issues` / `bonus_criteria` → Extra credit items (optional)

### Step 2: Build Judge Prompt

Based on mode, construct the appropriate prompt:

#### Solo Mode Prompt

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

**If baseline_issues IS provided, use checklist rubric:**

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

Below are the known issues/requirements. Severity indicates point value:
- CRITICAL: 15 pts each (must find)
- HIGH: 10 pts each (should find)
- MEDIUM: 5 pts each (good to find)
- LOW: 2 pts each (bonus)
- (unlabeled categories like happy_path, validation: 5 pts each)

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
    "critical_found": 5,
    "high_found": 4,
    "medium_found": 3,
    "low_found": 1,
    "novel_valid": 2,
    "false_positive_count": 0,
    "subtotal": 50
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
  "weighted_total": 90.0,
  "assessment": "2-3 sentence summary of strengths and gaps"
}
```

Scoring rules:
- Detection (50 max): critical×15 + high×10 + medium×5 + low×2 + novel×5 - false_positives×5, cap at 50
- Quality (25 max): (clear_explanations/10 × 12.5) + (actionable_fixes/10 × 12.5)
- Persona (25 max): (in_character/10 × 12.5) + (professional_tone/10 × 12.5)
- weighted_total = detection.subtotal + quality.subtotal + persona.subtotal
```

**Checklist Scoring Notes:**
- Point values scale with severity: critical issues matter more than low
- Novel valid findings get BONUS (encourages thoroughness beyond expected)
- False positives get PENALTY (discourages hallucinating issues)
- Quality/Persona still matter (25% each) - not just about finding issues

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

#### Compare Mode Prompt

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

#### Error-Detection Mode Prompt (TRAIL-Aware)

This mode extends checklist-based evaluation with TRAIL error taxonomy tracking.
Analyzes detection rates by error type (reasoning, planning, execution) to identify
persona strengths and weaknesses for OCEAN correlation research.

```
You are an impartial judge evaluating an AI agent's response with TRAIL error taxonomy awareness.

## Contestant
- **{spec}** ({character})

## Challenge
{challenge}

{if code provided}
## Code Under Review
{code}
{endif}

## Expected Findings with TRAIL Error Types

Below are the known issues with their TRAIL error categories:
- **reasoning** - Logic and decision-making failures (incorrect inferences, contradictions)
- **planning** - Task orchestration failures (sequencing errors, dependency gaps)
- **execution** - System interaction failures (timeouts, tool misuse, API errors)

Severity indicates point value:
- CRITICAL: 15 pts each
- HIGH: 10 pts each
- MEDIUM: 5 pts each
- LOW: 2 pts each

{baseline_issues formatted as checklist with error_type tags}

## Response to Evaluate
{response}

## Evaluation Instructions

Evaluate the response tracking detection by TRAIL error type.
Output ONLY valid JSON (no markdown, no extra text):

```json
{
  "baseline_findings": [
    {"id": "ISSUE_ID", "severity": "critical|high|medium|low", "error_type": "reasoning|planning|execution|null", "found": true, "evidence": "quote or null"}
  ],
  "detection_by_type": {
    "reasoning": {"found": 4, "total": 5, "rate": 0.80},
    "planning": {"found": 1, "total": 3, "rate": 0.33},
    "execution": {"found": 1, "total": 2, "rate": 0.50},
    "untagged": {"found": 0, "total": 0, "rate": 0.00}
  },
  "type_strengths": ["reasoning"],
  "type_weaknesses": ["planning"],
  "detection": {
    "critical_found": 2,
    "high_found": 3,
    "medium_found": 2,
    "low_found": 1,
    "subtotal": 50
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
  "weighted_total": 90.0,
  "assessment": "2-3 sentence summary highlighting error-type detection patterns"
}
```

**Error-Type Scoring Rules:**
- Track each baseline_finding's error_type from the scenario
- Calculate detection rate per type: found / total for that type
- If total = 0 for a type, set rate = 0.00 (avoid division by zero)
- **type_strengths**: Types with detection rate >= 0.70 (excludes "untagged")
- **type_weaknesses**: Types with detection rate <= 0.40 (excludes "untagged")
- If an issue has no error_type tag, count it under "untagged" (tracked but not classified as strength/weakness)
- Standard scoring still applies: detection (50) + quality (25) + persona (25)

**Graceful Fallback:**
- If NO baseline_issues have error_type tags, set all type counts to 0
- Still output detection_by_type structure with zeros
- type_strengths and type_weaknesses will be empty arrays
- Assessment should note: "No TRAIL error types tagged in scenario"
```

#### Phase Mode Prompts

Use phase-specific rubrics from tables above. Evaluate both teams. Output JSON format.

#### Coherence Mode Prompt

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

### Step 3: Execute Judge via CLI

```bash
JUDGE_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

JUDGE_OUTPUT=$(claude -p --output-format json <<'JUDGE_EOF'
{constructed prompt}
JUDGE_EOF
)

JUDGE_RESPONSE=$(echo "$JUDGE_OUTPUT" | jq -r '.result')
JUDGE_INPUT_TOKENS=$(echo "$JUDGE_OUTPUT" | jq -r '.usage.input_tokens // 0')
JUDGE_OUTPUT_TOKENS=$(echo "$JUDGE_OUTPUT" | jq -r '.usage.output_tokens // 0')
```

### Step 4: Extract Scores

```bash
# All modes now output JSON - parse with jq
# Solo mode
SCORE=$(echo "$JUDGE_RESPONSE" | jq -r '.weighted_total // empty')

# Compare mode
SCORE1=$(echo "$JUDGE_RESPONSE" | jq -r '.contestants["{spec1}"].weighted_total // empty')
SCORE2=$(echo "$JUDGE_RESPONSE" | jq -r '.contestants["{spec2}"].weighted_total // empty')
WINNER=$(echo "$JUDGE_RESPONSE" | jq -r '.winner // empty')

# Error-detection mode (includes all solo fields plus TRAIL-specific)
DETECTION_BY_TYPE=$(echo "$JUDGE_RESPONSE" | jq -r '.detection_by_type // empty')
TYPE_STRENGTHS=$(echo "$JUDGE_RESPONSE" | jq -r '.type_strengths // empty')
TYPE_WEAKNESSES=$(echo "$JUDGE_RESPONSE" | jq -r '.type_weaknesses // empty')
REASONING_RATE=$(echo "$JUDGE_RESPONSE" | jq -r '.detection_by_type.reasoning.rate // 0')
PLANNING_RATE=$(echo "$JUDGE_RESPONSE" | jq -r '.detection_by_type.planning.rate // 0')
EXECUTION_RATE=$(echo "$JUDGE_RESPONSE" | jq -r '.detection_by_type.execution.rate // 0')

# Coherence mode
RATING=$(echo "$JUDGE_RESPONSE" | jq -r '.rating // empty')

# Fallback: try grep if JSON parsing fails (backwards compatibility)
if [[ -z "$SCORE" ]]; then
  SCORE=$(echo "$JUDGE_RESPONSE" | grep -oE "weighted_total[\"':]*\s*([0-9.]+)" | grep -oE "[0-9.]+" | tail -1)
fi
```

### Step 5: Validate Results

| Check | Requirement |
|-------|-------------|
| `JUDGE_TIMESTAMP` | Valid ISO8601 |
| `JUDGE_RESPONSE` | At least 200 chars |
| `SCORE` (if applicable) | Number 1-100 |
| `RATING` (if coherence) | One of: excellent, good, poor |
| `DETECTION_BY_TYPE` (if error-detection) | Valid JSON object with reasoning/planning/execution keys |
| `TYPE_STRENGTHS` (if error-detection) | Array of error type strings |
| `TYPE_WEAKNESSES` (if error-detection) | Array of error type strings |
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

**Error-detection mode returns additional fields:**

```json
{
  "success": true,
  "mode": "error-detection",
  "timestamp": "{JUDGE_TIMESTAMP}",
  "weighted_total": 85.0,
  "detection_by_type": {
    "reasoning": {"found": 4, "total": 5, "rate": 0.80},
    "planning": {"found": 1, "total": 3, "rate": 0.33},
    "execution": {"found": 1, "total": 2, "rate": 0.50},
    "untagged": {"found": 0, "total": 0, "rate": 0.00}
  },
  "type_strengths": ["reasoning"],
  "type_weaknesses": ["planning"],
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
