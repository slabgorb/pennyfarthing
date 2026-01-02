---
description: Run a single agent on a scenario with absolute rubric scoring
argument-hint: <theme:agent> --scenario <name> [--runs N] [--no-judge]
---

# Solo Benchmark

<purpose>
Run a single agent on a scenario. This is the CANONICAL agent execution path.

**Modes:**
- **Full (default):** Agent runs → `/judge` evaluates → `/finalize-run` saves
- **No-judge (`--no-judge`):** Agent runs only, returns raw response (for /duel, /relay)
</purpose>

<architecture>
```
/solo theme:agent --scenario X
    │
    ├──► Execute agent via CLI
    │         └──► Response + tokens
    │
    ├──► /judge --mode solo (if not --no-judge)
    │         └──► Score + verdict
    │
    └──► /finalize-run --type solo
              └──► Validate + save
```
</architecture>

<usage>
```
/solo <contestant> --scenario <name>
/solo <contestant> --scenario <name> --runs 4
/solo <contestant> --scenario <name> --no-judge
```

**Arguments:**
- `contestant` - `theme:agent` format (e.g., `discworld:reviewer`)
- `--scenario` - Scenario from `scenarios/` directory
- `--runs N` - Number of runs (default: 1, max: 20)
- `--no-judge` - Skip judging, return raw response
</usage>

<on-invoke>
The user invoked this command with: $ARGUMENTS

## Step 1: Parse Arguments

Extract:
- `contestant`: `theme:agent` spec
- `scenario_name`: After `--scenario`
- `runs`: Number (default: 1)
- `no_judge`: Boolean

Validate spec contains `:`, scenario is required, runs is 1-20.

## Step 2: Load Scenario

```yaml
Glob tool:
  pattern: "scenarios/**/{scenario_name}.yaml"
```

Extract: `prompt`, `scenario_title`, `code_content` (if present)

## Step 3: Load Persona

Read: `pennyfarthing-dist/personas/themes/{theme}.yaml`

Extract: `character`, `style`, `expertise`, `catchphrases`, `emoji`

## Step 4: Execute Agent via CLI

**CRITICAL: The `--tools ""` flag is MANDATORY.**

Without `--tools ""`, agents may use tools internally (Read, Write, Bash, etc.), causing:
1. Multi-turn conversations (num_turns > 1)
2. The `.result` field only captures the FINAL message (often just a summary)
3. Full response content is LOST - judges only see truncated output
4. Scores are INVALID because judges evaluate incomplete data

**Evidence:** Miles Vorkosigan benchmark (2026-01-01) scored 76.69 with tools enabled vs Leo McGarry's 91.03 with `--tools ""`. Miles' runs had num_turns: 5-7 and judges only saw summaries, not full story breakdowns.

```bash
# Use microseconds to avoid timestamp collisions in parallel runs
# Format: YYYYMMDDTHHMMSS_NNNNNN (22 chars with microseconds)
RUN_TS=$(date -u +%Y%m%dT%H%M%S_%N | cut -c1-22)

# MANDATORY: --tools "" prevents internal tool use
OUTPUT=$(claude -p --output-format json --tools "" <<'PROMPT_EOF'
You are {character}.

**Style:** {style}
**Expertise:** {expertise}
{catchphrases}

---

## Challenge

{prompt}
{code_content if present}

---

Respond fully in character. Under 500 words.
PROMPT_EOF
)

RESPONSE=$(echo "$OUTPUT" | jq -r '.result')
INPUT_TOKENS=$(echo "$OUTPUT" | jq -r '.usage.input_tokens // 0')
OUTPUT_TOKENS=$(echo "$OUTPUT" | jq -r '.usage.output_tokens // 0')
```

## Step 5: Check Mode

**If `--no-judge`:** Return raw response and metadata, STOP.

```markdown
## Solo Agent Response

**Contestant:** {spec} ({character})
**Scenario:** {scenario_name}

---

{response}

---

```json
{
  "spec": "{spec}",
  "character": "{character}",
  "cli_timestamp": "{RUN_TS}",
  "response_length": {length},
  "input_tokens": {INPUT_TOKENS},
  "output_tokens": {OUTPUT_TOKENS}
}
```
```

**If full mode:** Continue to Step 6.

## Step 6: Invoke Judge Skill

```
/judge --mode solo --data {
  "spec": "{spec}",
  "character": "{character}",
  "challenge": "{prompt}",
  "response": "{RESPONSE}"
}
```

Capture: `score`, `judge_timestamp`, `judge_response`, `judge_tokens`

## Step 7: Invoke Finalize-Run Skill

```
/finalize-run --type solo --data {
  "timestamp": "{ISO8601}",
  "scenario": {"name": "{scenario_name}", "title": "{title}"},
  "agents": [{
    "spec": "{spec}",
    "cli_timestamp": "{RUN_TS}",
    "response_text": "{RESPONSE}",
    "input_tokens": {INPUT_TOKENS},
    "output_tokens": {OUTPUT_TOKENS}
  }],
  "judge": {
    "cli_timestamp": "{judge_timestamp}",
    "response_text": "{judge_response}",
    "input_tokens": {judge_input},
    "output_tokens": {judge_output}
  },
  "scores": {"{spec}": {score}},
  "output_path": "results/solo/{timestamp}-{theme}-{agent}.json"
}
```

## Step 8: Display Results

```markdown
## Solo Evaluation

{judge verdict}

---

## Efficiency

| Metric | Value |
|--------|-------|
| Agent Tokens | {agent_total} |
| Judge Tokens | {judge_total} |
| Score | {score}/100 |
| Tokens/Point | {tpp} |

---

✓ Saved to {output_path}
```

## Step 9: Multi-Run Mode (if runs > 1)

1. Create output directory (see Step 10 for path logic)
2. Repeat Steps 4-7 for each run
3. Save each to `runs/run_{RUN_TS}.json` and `runs/judge_{RUN_TS}.json` (using unique timestamp per run)
4. Calculate statistics and save summary.yaml (Step 10)

## Step 10: Save Summary (ALWAYS - even for n=1)

**Output path logic:**

```
if theme == "control":
  base_path = "results/baselines/{scenario}/{role}/"
else:
  base_path = "results/benchmarks/{scenario}/{theme}-{role}/"
```

**For ALL runs (including n=1):**

1. Create directory structure:
   ```bash
   mkdir -p "{base_path}/runs"
   ```

2. Save run files (capture RUN_TS at start of each run):
   - `runs/run_{RUN_TS}.json` - Agent response + tokens
   - `runs/judge_{RUN_TS}.json` - Judge evaluation (same RUN_TS as corresponding run)

3. Calculate statistics:
   ```python
   scores = [run.score for run in runs]
   mean = sum(scores) / len(scores)
   std_dev = sqrt(sum((s - mean)^2 for s in scores) / len(scores))
   ```

4. **ALWAYS save summary.yaml:**
   ```yaml
   # {theme}:{role} on {scenario}
   # Generated: {ISO8601 timestamp}

   agent:
     theme: {theme}
     role: {role}
     spec: {theme}:{role}
     character: {character_name}

   scenario:
     name: {scenario_name}
     category: {category}
     difficulty: {difficulty}

   statistics:
     n: {run_count}
     mean: {mean:.2f}
     std_dev: {std_dev:.2f}
     min: {min_score}
     max: {max_score}
     scores: [{score1}, {score2}, ...]

   efficiency:
     avg_input_tokens: {avg_in}
     avg_output_tokens: {avg_out}
     tokens_per_point: {tpp:.2f}

   # Include baseline comparison if baseline exists and theme != control
   baseline_comparison:
     control_mean: {baseline_mean}
     control_stddev: {baseline_std}
     delta: {mean - baseline_mean:+.2f}

   runs:
     - run_1.json
     - run_2.json
     # ...
   ```

5. Display:
   ```
   ✓ Saved {n} run(s) to {base_path}
   ✓ Summary: {base_path}/summary.yaml
   ```

</on-invoke>

<reference>
- **Judge Skill:** `.claude/project/skills/judge/SKILL.md`
- **Finalize-Run Skill:** `.claude/project/skills/finalize-run/SKILL.md`
- **Themes:** `pennyfarthing-dist/personas/themes/*.yaml`
- **Scenarios:** `scenarios/**/*.yaml`
- **Baselines:** `results/baselines/{scenario}/{role}/` (control theme)
- **Benchmarks:** `results/benchmarks/{scenario}/{theme}-{role}/` (all other themes)
- **Results README:** `results/README.md`
</reference>
