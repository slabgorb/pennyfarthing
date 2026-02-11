#!/bin/bash
# Convert job-fair results to benchmark format for showcase
#
# Reads: internal/results/job-fair/{theme}-*/runs/{role}/{character}/run_*.json
# Writes: internal/results/benchmarks/{scenario}/{theme}-{role}/summary.yaml

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

JOBFAIR_DIR="$PROJECT_DIR/internal/results/job-fair"
BENCHMARKS_DIR="$PROJECT_DIR/internal/results/benchmarks"
BASELINES_DIR="$PROJECT_DIR/internal/results/baselines"

# Scenario mappings (role -> scenario)
declare -A ROLE_SCENARIO
ROLE_SCENARIO[dev-codegen]="tdd-shopping-cart"
ROLE_SCENARIO[dev-debug]="astropy-12907"
ROLE_SCENARIO[reviewer]="order-service"
ROLE_SCENARIO[tea]="payment-processor-tests"
ROLE_SCENARIO[sm]="sprint-planning-conflict"
ROLE_SCENARIO[architect]="legacy-modernization"

# Scenario metadata
declare -A SCENARIO_TITLE
SCENARIO_TITLE[tdd-shopping-cart]="TDD Shopping Cart Implementation"
SCENARIO_TITLE[astropy-12907]="Astropy Issue #12907 Debug"
SCENARIO_TITLE[order-service]="Order Service Code Review"
SCENARIO_TITLE[payment-processor-tests]="Payment Processor Test Suite"
SCENARIO_TITLE[sprint-planning-conflict]="Sprint Planning Conflict Resolution"
SCENARIO_TITLE[legacy-modernization]="Legacy System Modernization"

declare -A SCENARIO_CATEGORY
SCENARIO_CATEGORY[tdd-shopping-cart]="dev"
SCENARIO_CATEGORY[astropy-12907]="dev"
SCENARIO_CATEGORY[order-service]="reviewer"
SCENARIO_CATEGORY[payment-processor-tests]="tea"
SCENARIO_CATEGORY[sprint-planning-conflict]="sm"
SCENARIO_CATEGORY[legacy-modernization]="architect"

# Get baseline stats for a scenario/role
get_baseline() {
    local scenario=$1
    local role=$2
    local baseline_file="$BASELINES_DIR/$scenario/$role/summary.yaml"

    if [[ -f "$baseline_file" ]]; then
        local mean=$(grep "mean:" "$baseline_file" | head -1 | awk '{print $2}')
        local std=$(grep "std_dev:" "$baseline_file" | head -1 | awk '{print $2}')
        echo "$mean:$std"
    else
        echo ""
    fi
}

# Process a single theme
process_theme() {
    local theme=$1
    echo "Processing theme: $theme"

    # Find all job-fair run directories for this theme
    local run_dirs=$(find "$JOBFAIR_DIR" -maxdepth 1 -type d -name "${theme}-*" 2>/dev/null)

    if [[ -z "$run_dirs" ]]; then
        echo "  No run directories found for $theme"
        return
    fi

    # For each role we track
    for role in dev-codegen dev-debug reviewer tea sm architect; do
        local scenario="${ROLE_SCENARIO[$role]}"
        local map_role="$role"

        # Map dev-codegen and dev-debug to dev for directory lookup
        local dir_role="$role"

        # Collect all scores for this theme/role
        local scores=()
        local characters=()
        local total_input_tokens=0
        local total_output_tokens=0
        local run_count=0

        # Find the native character for this role from the theme
        local theme_file="$PROJECT_DIR/pennyfarthing-dist/personas/themes/${theme}.yaml"
        local lookup_role="$role"
        [[ "$role" == "dev-codegen" || "$role" == "dev-debug" ]] && lookup_role="dev"

        local native_char=""
        if [[ -f "$theme_file" ]]; then
            native_char=$(yq ".agents.${lookup_role}.character // \"\"" "$theme_file" 2>/dev/null | tr -d '"')
        fi

        # Scan all run directories
        for run_dir in $run_dirs; do
            local role_dir="$run_dir/runs/$dir_role"

            if [[ ! -d "$role_dir" ]]; then
                continue
            fi

            # For each character directory
            for char_dir in "$role_dir"/*/; do
                [[ ! -d "$char_dir" ]] && continue

                # Read run files
                for run_file in "$char_dir"/run_*.json; do
                    [[ ! -f "$run_file" ]] && continue

                    local score=$(python3 -c "import json; d=json.load(open('$run_file')); print(d.get('score', 0))" 2>/dev/null)
                    local char=$(python3 -c "import json; d=json.load(open('$run_file')); print(d.get('character', ''))" 2>/dev/null)
                    local input_tok=$(python3 -c "import json; d=json.load(open('$run_file')); print(d.get('agent_tokens', 0))" 2>/dev/null)

                    if [[ -n "$score" && "$score" != "0" ]]; then
                        scores+=("$score")
                        [[ -z "${characters[0]}" ]] && characters+=("$char")
                        total_input_tokens=$((total_input_tokens + input_tok))
                        run_count=$((run_count + 1))
                    fi
                done
            done
        done

        # Skip if no scores found
        if [[ ${#scores[@]} -eq 0 ]]; then
            continue
        fi

        # Calculate statistics
        local n=${#scores[@]}
        local sum=0
        local min=100
        local max=0

        for s in "${scores[@]}"; do
            sum=$(echo "$sum + $s" | bc)
            [[ $(echo "$s < $min" | bc) -eq 1 ]] && min=$s
            [[ $(echo "$s > $max" | bc) -eq 1 ]] && max=$s
        done

        local mean=$(echo "scale=2; $sum / $n" | bc)

        # Calculate std dev
        local sq_sum=0
        for s in "${scores[@]}"; do
            local diff=$(echo "$s - $mean" | bc)
            sq_sum=$(echo "$sq_sum + ($diff * $diff)" | bc)
        done
        local variance=$(echo "scale=4; $sq_sum / $n" | bc)
        local std_dev=$(echo "scale=2; sqrt($variance)" | bc)

        # Get baseline
        local baseline_role="$lookup_role"
        local baseline=$(get_baseline "$scenario" "$baseline_role")
        local baseline_mean=""
        local baseline_std=""
        local delta=""

        if [[ -n "$baseline" ]]; then
            baseline_mean=$(echo "$baseline" | cut -d: -f1)
            baseline_std=$(echo "$baseline" | cut -d: -f2)
            delta=$(echo "scale=2; $mean - $baseline_mean" | bc)
        fi

        # Create output directory
        local output_dir="$BENCHMARKS_DIR/$scenario/${theme}-${lookup_role}"
        mkdir -p "$output_dir"

        # Format scores array
        local scores_str=$(printf ", %.0f" "${scores[@]}")
        scores_str="[${scores_str:2}]"

        # Determine character (use native if available)
        local char_name="${native_char:-${characters[0]:-Unknown}}"

        # Write summary.yaml
        cat > "$output_dir/summary.yaml" << EOF
# ${theme}:${lookup_role} on ${scenario}
# Generated from job-fair data: $(date -u +%Y-%m-%dT%H:%M:%SZ)

agent:
  theme: ${theme}
  role: ${lookup_role}
  spec: ${theme}:${lookup_role}
  character: ${char_name}

scenario:
  name: ${scenario}
  title: ${SCENARIO_TITLE[$scenario]}
  category: ${SCENARIO_CATEGORY[$scenario]}
  difficulty: medium

statistics:
  n: ${n}
  mean: ${mean}
  std_dev: ${std_dev}
  min: ${min}
  max: ${max}
  scores: ${scores_str}
EOF

        # Add baseline comparison if available
        if [[ -n "$baseline_mean" ]]; then
            cat >> "$output_dir/summary.yaml" << EOF

baseline_comparison:
  control_mean: ${baseline_mean}
  control_stddev: ${baseline_std}
  delta: ${delta}
EOF
        fi

        echo "  Created: $output_dir/summary.yaml (n=$n, mean=$mean)"
    done
}

# Main
echo "Converting job-fair results to benchmark format..."
echo ""

# Get list of themes from consolidated
themes=$(ls -d "$JOBFAIR_DIR/consolidated"/*/ 2>/dev/null | xargs -n1 basename)

for theme in $themes; do
    process_theme "$theme"
    echo ""
done

echo "Done!"
