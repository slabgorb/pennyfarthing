#!/bin/bash
# Solo Benchmark Runner
# Executes a single agent benchmark with proper pipe syntax (NOT heredocs)
# Usage: ./scripts/solo-runner.sh <theme:agent> <scenario> [output_dir] [--as <role>]
#
# Cross-role mode:
#   ./scripts/solo-runner.sh shakespeare:prospero race-condition /tmp --as dev
#   This runs Prospero (normally SM) as a dev on the scenario.

set -e

SPEC="$1"
SCENARIO="$2"
OUTPUT_DIR="${3:-/tmp/solo-results}"
ROLE_OVERRIDE=""

# Check for --as flag (can be in position 4 or after output_dir)
if [[ "$4" == "--as" && -n "$5" ]]; then
    ROLE_OVERRIDE="$5"
elif [[ "$3" == "--as" && -n "$4" ]]; then
    # Handle case where output_dir is omitted: theme:agent scenario --as role
    OUTPUT_DIR="/tmp/solo-results"
    ROLE_OVERRIDE="$4"
fi

if [[ -z "$SPEC" || -z "$SCENARIO" ]]; then
    echo "Usage: $0 <theme:agent> <scenario> [output_dir] [--as <role>]" >&2
    echo "" >&2
    echo "Cross-role mode:" >&2
    echo "  $0 shakespeare:prospero scenario /tmp --as dev" >&2
    exit 1
fi

# Valid roles for --as validation
VALID_ROLES="sm dev reviewer architect tea pm orchestrator tech-writer ux-designer devops ba"

if [[ -n "$ROLE_OVERRIDE" ]]; then
    if ! echo "$VALID_ROLES" | grep -qw "$ROLE_OVERRIDE"; then
        echo "Error: Invalid role '$ROLE_OVERRIDE'. Must be one of: $VALID_ROLES" >&2
        exit 1
    fi
fi

# Parse spec
THEME="${SPEC%%:*}"
AGENT="${SPEC##*:}"

if [[ "$THEME" == "$AGENT" ]]; then
    echo "Error: Invalid spec format. Expected theme:agent, got: $SPEC" >&2
    exit 1
fi

# Find paths
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PERSONA_FILE="$PROJECT_DIR/pennyfarthing-dist/personas/themes/${THEME}.yaml"
SCENARIO_FILE=$(find "$SCRIPT_DIR/../scenarios" -name "${SCENARIO}.yaml" 2>/dev/null | head -1)

if [[ ! -f "$PERSONA_FILE" ]]; then
    echo "Error: Theme not found: $PERSONA_FILE" >&2
    exit 1
fi

if [[ -z "$SCENARIO_FILE" || ! -f "$SCENARIO_FILE" ]]; then
    echo "Error: Scenario not found: $SCENARIO" >&2
    exit 1
fi

# Function to find which role a character belongs to (case-insensitive search)
find_character_in_theme() {
    local theme_file="$1"
    local query="$2"

    # Search all agents for matching character (case-insensitive)
    # Use (?i) prefix for case-insensitive matching in yq
    yq -r ".agents | to_entries[] | select(.value.character | test(\"(?i)$query\")) | .key" "$theme_file" | head -1
}

# Determine source role and effective role
CROSS_ROLE=false
if [[ -n "$ROLE_OVERRIDE" ]]; then
    # Cross-role mode: AGENT is a character name, not a role
    CHARACTER_QUERY="$AGENT"
    SOURCE_ROLE=$(find_character_in_theme "$PERSONA_FILE" "$CHARACTER_QUERY")

    if [[ -z "$SOURCE_ROLE" ]]; then
        echo "Error: Character '$CHARACTER_QUERY' not found in theme '$THEME'" >&2
        echo "Available characters:" >&2
        yq -r '.agents | to_entries[] | "  - \(.key): \(.value.character)"' "$PERSONA_FILE" >&2
        exit 1
    fi

    EFFECTIVE_ROLE="$ROLE_OVERRIDE"
    CROSS_ROLE=true
    # Use SOURCE_ROLE for persona lookup
    LOOKUP_ROLE="$SOURCE_ROLE"
else
    # Standard mode: AGENT is the role name
    SOURCE_ROLE="$AGENT"
    EFFECTIVE_ROLE="$AGENT"
    LOOKUP_ROLE="$AGENT"
fi

# Create output directory and temp dir
mkdir -p "$OUTPUT_DIR"
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

# Generate run ID
TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)
RUN_ID=$(echo "$SPEC-$SCENARIO-$$" | md5sum | head -c 8)

# Extract persona info using yq (use LOOKUP_ROLE for persona, EFFECTIVE_ROLE for task)
CHARACTER=$(yq -r ".agents.${LOOKUP_ROLE}.character // \"Unknown\"" "$PERSONA_FILE")
STYLE=$(yq -r ".agents.${LOOKUP_ROLE}.style // \"Professional\"" "$PERSONA_FILE")
EXPERTISE=$(yq -r ".agents.${LOOKUP_ROLE}.expertise // \"Software development\"" "$PERSONA_FILE")
CATCHPHRASES=$(yq -r ".agents.${LOOKUP_ROLE}.catchphrases // [] | .[]" "$PERSONA_FILE" 2>/dev/null | sed 's/^/  - /' | head -5)

# Generate character slug for cross-role output paths
CHARACTER_SLUG=$(echo "$CHARACTER" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//' | sed 's/-$//')

# Extract scenario info to files (avoids shell escaping issues)
yq -r '.prompt' "$SCENARIO_FILE" > "$TMPDIR/prompt.txt"
yq -r '.code // ""' "$SCENARIO_FILE" > "$TMPDIR/code.txt"

# Build agent prompt file directly
cat > "$TMPDIR/agent_prompt.txt" << AGENT_PROMPT_EOF
You are ${CHARACTER}.

**Style:** ${STYLE}
**Expertise:** ${EXPERTISE}
**Catchphrases:**
${CATCHPHRASES}

---

## Challenge

$(cat "$TMPDIR/prompt.txt")

## Code

\`\`\`go
$(cat "$TMPDIR/code.txt")
\`\`\`

---

Respond fully in character. Under 500 words.

**IMPORTANT:** Provide your complete response directly. Do not attempt to use tools, read files, or make function calls.
AGENT_PROMPT_EOF

# Execute agent via claude CLI with PIPE SYNTAX
AGENT_OUTPUT=$(cat "$TMPDIR/agent_prompt.txt" | claude -p --output-format json --tools "" 2>/dev/null || echo '{"error": "CLI failed"}')

# Extract agent results
echo "$AGENT_OUTPUT" | jq -r '.result // .error // "No response"' > "$TMPDIR/response.txt"
INPUT_TOKENS=$(echo "$AGENT_OUTPUT" | jq -r '.usage.input_tokens // 0')
OUTPUT_TOKENS=$(echo "$AGENT_OUTPUT" | jq -r '.usage.output_tokens // 0')
RESPONSE_LENGTH=$(wc -c < "$TMPDIR/response.txt" | tr -d ' ')
# Extract model usage for per-model token tracking
echo "$AGENT_OUTPUT" | jq -c '.modelUsage // {}' > "$TMPDIR/agent_model_usage.json"
AGENT_COST=$(echo "$AGENT_OUTPUT" | jq -r '.total_cost_usd // 0')

# Validate response
if [[ $RESPONSE_LENGTH -lt 100 ]]; then
    echo "Error: Response too short ($RESPONSE_LENGTH chars)" >&2
    cat "$TMPDIR/response.txt" >&2
    exit 1
fi

# Save agent response using jq to properly escape the response
jq -n \
  --arg run_id "$RUN_ID" \
  --arg spec "$SPEC" \
  --arg theme "$THEME" \
  --arg agent "$AGENT" \
  --arg character "$CHARACTER" \
  --arg character_slug "$CHARACTER_SLUG" \
  --arg source_role "$SOURCE_ROLE" \
  --arg effective_role "$EFFECTIVE_ROLE" \
  --argjson cross_role "$CROSS_ROLE" \
  --arg scenario "$SCENARIO" \
  --arg timestamp "$TIMESTAMP" \
  --rawfile response "$TMPDIR/response.txt" \
  --argjson response_length "$RESPONSE_LENGTH" \
  --argjson input_tokens "$INPUT_TOKENS" \
  --argjson output_tokens "$OUTPUT_TOKENS" \
  --slurpfile model_usage "$TMPDIR/agent_model_usage.json" \
  --argjson cost_usd "$AGENT_COST" \
  '{
    run_id: $run_id,
    spec: $spec,
    theme: $theme,
    agent: $agent,
    character: $character,
    character_slug: $character_slug,
    source_role: $source_role,
    effective_role: $effective_role,
    cross_role: $cross_role,
    scenario: $scenario,
    timestamp: $timestamp,
    response: $response,
    response_length: $response_length,
    input_tokens: $input_tokens,
    output_tokens: $output_tokens,
    model_usage: $model_usage[0],
    cost_usd: $cost_usd
  }' > "$OUTPUT_DIR/agent_${RUN_ID}.json"

# Build judge prompt file
JUDGE_TIMESTAMP=$(date -u +%Y-%m-%dT%H:%M:%SZ)

cat > "$TMPDIR/judge_prompt.txt" << JUDGE_PROMPT_EOF
You are an impartial judge evaluating an AI agent's response.

## Contestant
- **${SPEC}** (${CHARACTER})

## Challenge
$(cat "$TMPDIR/prompt.txt")

## Response
$(cat "$TMPDIR/response.txt")

## Evaluation

Score 1-10 on each dimension:

1. **Correctness (25%)** - Technical accuracy
2. **Depth (25%)** - Thoroughness
3. **Quality (25%)** - Clarity and actionability
4. **Persona (25%)** - Character embodiment

Formula: (correctness × 2.5) + (depth × 2.5) + (quality × 2.5) + (persona × 2.5) = WEIGHTED_TOTAL

**IMPORTANT: Output your evaluation as JSON only. No markdown, no extra text.**

{
  "scores": {
    "correctness": { "value": N, "reasoning": "..." },
    "depth": { "value": N, "reasoning": "..." },
    "quality": { "value": N, "reasoning": "..." },
    "persona": { "value": N, "reasoning": "..." }
  },
  "weighted_total": NN.N,
  "assessment": "2-3 sentence overall assessment"
}
JUDGE_PROMPT_EOF

# Execute judge via pipe syntax
JUDGE_OUTPUT=$(cat "$TMPDIR/judge_prompt.txt" | claude -p --output-format json --tools "" 2>/dev/null || echo '{"error": "Judge CLI failed"}')

# Extract judge results
echo "$JUDGE_OUTPUT" | jq -r '.result // .error // "No response"' > "$TMPDIR/judge_response.txt"
JUDGE_INPUT_TOKENS=$(echo "$JUDGE_OUTPUT" | jq -r '.usage.input_tokens // 0')
JUDGE_OUTPUT_TOKENS=$(echo "$JUDGE_OUTPUT" | jq -r '.usage.output_tokens // 0')
echo "$JUDGE_OUTPUT" | jq -c '.modelUsage // {}' > "$TMPDIR/judge_model_usage.json"
JUDGE_COST=$(echo "$JUDGE_OUTPUT" | jq -r '.total_cost_usd // 0')

# Extract score from judge response - try JSON first, then regex fallback
SCORE=$(cat "$TMPDIR/judge_response.txt" | jq -r '.weighted_total // empty' 2>/dev/null || true)
if [[ -z "$SCORE" ]]; then
    # Fallback: extract from text
    SCORE=$(grep -oE '"weighted_total"[^0-9]*([0-9.]+)' "$TMPDIR/judge_response.txt" | grep -oE '[0-9.]+' | tail -1 || true)
fi
if [[ -z "$SCORE" ]]; then
    # Last resort: look for any WEIGHTED_TOTAL pattern
    SCORE=$(grep -oE 'WEIGHTED_TOTAL[^0-9]*([0-9.]+)' "$TMPDIR/judge_response.txt" | grep -oE '[0-9.]+' | tail -1 || true)
fi

if [[ -z "$SCORE" || "$SCORE" == "null" ]]; then
    echo "Error: Could not extract score from judge response" >&2
    cat "$TMPDIR/judge_response.txt" >&2
    exit 1
fi

# Save judge response using jq
jq -n \
  --arg run_id "$RUN_ID" \
  --arg spec "$SPEC" \
  --arg scenario "$SCENARIO" \
  --arg timestamp "$JUDGE_TIMESTAMP" \
  --argjson score "$SCORE" \
  --rawfile judge_response "$TMPDIR/judge_response.txt" \
  --argjson input_tokens "$JUDGE_INPUT_TOKENS" \
  --argjson output_tokens "$JUDGE_OUTPUT_TOKENS" \
  --slurpfile model_usage "$TMPDIR/judge_model_usage.json" \
  --argjson cost_usd "$JUDGE_COST" \
  '{
    run_id: $run_id,
    spec: $spec,
    scenario: $scenario,
    timestamp: $timestamp,
    score: $score,
    judge_response: $judge_response,
    input_tokens: $input_tokens,
    output_tokens: $output_tokens,
    model_usage: $model_usage[0],
    cost_usd: $cost_usd
  }' > "$OUTPUT_DIR/judge_${RUN_ID}.json"

# Output summary JSON to stdout
jq -n \
  --argjson success true \
  --arg run_id "$RUN_ID" \
  --arg spec "$SPEC" \
  --arg theme "$THEME" \
  --arg character "$CHARACTER" \
  --arg character_slug "$CHARACTER_SLUG" \
  --arg source_role "$SOURCE_ROLE" \
  --arg effective_role "$EFFECTIVE_ROLE" \
  --argjson cross_role "$CROSS_ROLE" \
  --arg scenario "$SCENARIO" \
  --argjson score "$SCORE" \
  --argjson agent_tokens "$((INPUT_TOKENS + OUTPUT_TOKENS))" \
  --argjson judge_tokens "$((JUDGE_INPUT_TOKENS + JUDGE_OUTPUT_TOKENS))" \
  --slurpfile agent_model_usage "$TMPDIR/agent_model_usage.json" \
  --slurpfile judge_model_usage "$TMPDIR/judge_model_usage.json" \
  --argjson agent_cost "$AGENT_COST" \
  --argjson judge_cost "$JUDGE_COST" \
  --arg agent_file "$OUTPUT_DIR/agent_${RUN_ID}.json" \
  --arg judge_file "$OUTPUT_DIR/judge_${RUN_ID}.json" \
  '{
    success: $success,
    run_id: $run_id,
    spec: $spec,
    theme: $theme,
    character: $character,
    character_slug: $character_slug,
    source_role: $source_role,
    effective_role: $effective_role,
    cross_role: $cross_role,
    scenario: $scenario,
    score: $score,
    agent_tokens: $agent_tokens,
    judge_tokens: $judge_tokens,
    agent_model_usage: $agent_model_usage[0],
    judge_model_usage: $judge_model_usage[0],
    total_cost_usd: ($agent_cost + $judge_cost),
    agent_file: $agent_file,
    judge_file: $judge_file
  }'
