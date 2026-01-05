---
description: Discover which characters in a theme excel at each role
argument-hint: <theme> [--runs N] [--roles <list>]
---

# Job Fair

<purpose>
Run every character in a theme against representative benchmarks for each role to discover hidden talents. Like a job fair where candidates compete for positions - may the best persona win!

**Use Case:** Determine optimal role assignments or find surprisingly versatile characters.
</purpose>

<usage>
```
/job-fair <theme>
/job-fair <theme> --runs 6
/job-fair <theme> --roles dev,reviewer
```

**Arguments:**
- `theme` - Theme to evaluate (e.g., `shakespeare`, `discworld`, `the-expanse`)
- `--runs N` - Runs per combination (default: 4, max: 10)
- `--roles` - Comma-separated list of roles to test (default: all with baselines)

**Examples:**
```
# Full evaluation of shakespeare theme
/job-fair shakespeare

# Quick evaluation with fewer runs
/job-fair discworld --runs 2

# Only test dev and reviewer roles
/job-fair the-expanse --roles dev,reviewer
```
</usage>

<on-invoke>
The user invoked this command with: $ARGUMENTS

## Step 1: Parse Arguments

Extract:
- `theme`: Required, first positional argument
- `runs`: Number after `--runs` (default: 4, max: 10)
- `roles`: Comma-separated list after `--roles` (default: discover from baselines)

Validate theme exists:
```bash
THEME_FILE="pennyfarthing-dist/personas/themes/${theme}.yaml"
```

If theme doesn't exist, show available themes:
```markdown
Error: Theme '{theme}' not found.

Available themes:
- shakespeare
- discworld
- the-expanse
- ...
```

## Step 2: Load Theme Characters

Read the theme file and extract all characters:

```yaml
Read: pennyfarthing-dist/personas/themes/{theme}.yaml

Extract from agents section:
  - agent_name (role)
  - character name
  - style/expertise
```

Display:
```markdown
## Job Fair: {theme}

### Candidates

| Role | Character | Style |
|------|-----------|-------|
| sm | Prospero | Wise orchestrator |
| dev | Puck | Swift mischievous sprite |
| reviewer | Portia | Sharp legal mind |
| ... | ... | ... |

Found {N} characters ready to compete!
```

## Step 3: Discover Available Role Benchmarks

Scan for roles that have established baselines:

```bash
Glob: internal/results/baselines/*/

For each directory:
  - Extract role from path
  - Read summary.yaml for baseline mean, std, n
  - Get scenario name
```

Filter to requested roles if `--roles` provided.

Display:
```markdown
### Available Positions (Roles with Baselines)

| Role | Benchmark Scenario | Baseline | n |
|------|-------------------|----------|---|
| dev | race-condition-cache | 75.2 | 10 |
| reviewer | order-service | 78.5 | 10 |
| tea | payment-processor-tests | 72.1 | 10 |
| sm | sprint-planning-conflict | 80.3 | 10 |

Roles without baselines (skipped): architect, pm, orchestrator
```

If no baselines found:
```markdown
Error: No role baselines found.

Run `/benchmark-control <role> --scenario <name>` to establish baselines first.
```

## Step 4: Build Test Matrix

```python
characters = list(theme.agents.keys())  # All characters
roles = list(available_baselines.keys())  # Roles with benchmarks
matrix_size = len(characters) * len(roles)
total_runs = matrix_size * runs_per_combo

# Check for existing data to skip
for character in characters:
    for role in roles:
        native = (theme.agents[character].role == role)
        existing = check_existing_benchmark(theme, character, role)
        if existing and existing.n >= runs:
            skip[character][role] = True
```

Display:
```markdown
### Test Matrix

{N} characters × {M} roles = {N*M} combinations
Runs per combination: {runs}
Total runs needed: {total}
Existing data to reuse: {skip_count} combinations

Estimated time: ~{minutes} minutes
Estimated cost: ~${cost}
```

## Step 5: Confirm Execution

Use AskUserQuestion:
```yaml
questions:
  - question: "Run job fair for {theme} with {total} API calls?"
    header: "Confirm"
    multiSelect: false
    options:
      - label: "Yes, run full evaluation"
        description: "{matrix_size} combinations × {runs} runs"
      - label: "Quick mode (2 runs each)"
        description: "Faster but less reliable"
      - label: "Cancel"
        description: "Abort job fair"
```

## Step 6: Execute Role by Role

For each role with a baseline:

```markdown
### Evaluating: {ROLE} Role

Benchmark: {scenario_name} (baseline: {baseline_mean})
```

For each character, run the benchmark:

```python
for character in characters:
    char_name = theme.agents[character].character

    # Use --as for cross-role, direct for native
    if theme.agents[character].role == role:
        # Native role - might have existing data
        spec = f"{theme}:{role}"
    else:
        # Cross-role test
        spec = f"{theme}:{char_name} --as {role}"

    # Execute via solo-runner.sh
    result = run_solo(spec, scenario, runs)
    matrix[character][role] = result
```

Display progress:
```
  ✓ Prospero --as dev:    72.5 ± 3.2  (-2.7)
  ✓ Puck (native):        79.8 ± 2.9  (+4.6) ⭐ BEST
  ✓ Portia --as dev:      71.8 ± 2.7  (-3.4)
  ...
```

After each role, announce the winner:
```markdown
🏆 **{ROLE} Champion: {winner}** ({score}) {upset_indicator}
```

## Step 7: Calculate Results

For each role:
```python
role_scores = [(char, matrix[char][role]) for char in characters]
role_scores.sort(by=score, descending=True)
champion = role_scores[0]
native_holder = find_native(theme, role)
upset = (champion.character != native_holder)
```

For each character:
```python
avg_score = mean([matrix[char][role] for role in roles])
best_role = max(roles, key=lambda r: matrix[char][r])
worst_role = min(roles, key=lambda r: matrix[char][r])
versatility = best_score - worst_score  # Lower = more consistent
```

## Step 8: Generate Report

Display final report:

```markdown
# 🎪 Job Fair Results: {theme}

## 🏆 Champions by Role

| Role | Champion | Score | vs Baseline | Native? | Upset? |
|------|----------|-------|-------------|---------|--------|
| dev | Puck | 79.8 | +4.6 | ✓ | - |
| reviewer | Prospero | 81.2 | +2.7 | ✗ | ⚡ Beat Portia |
| ... | ... | ... | ... | ... | ... |

## 📊 Full Results Matrix

|              | dev | reviewer | tea | sm | Avg |
|--------------|-----|----------|-----|-----|-----|
| Prospero     | 72.5 | **81.2** | 68.9 | **85.1** | 76.9 |
| Puck         | **79.8** | 74.2 | **76.1** | 71.3 | 75.4 |
| ... | ... | ... | ... | ... | ... |

## 🌟 Insights

### Multi-Role Champions
{characters winning multiple roles}

### Hidden Talents (Upsets)
{characters who beat the native role holder}

### Most Versatile
{character with highest average and lowest variance}

### Role Fit Analysis
| Character | Best Role | Worst Role | Range |
|-----------|-----------|------------|-------|
| ... | ... | ... | ... |
```

## Step 9: Save Results

```python
output_dir = f"internal/results/job-fair/{theme}-{timestamp}"
mkdir(output_dir)
```

Save files:
- `summary.yaml` - Machine-readable full results
- `report.md` - Human-readable report
- `matrix.csv` - Spreadsheet-friendly format
- `runs/{role}/{character}/` - Individual run data

**summary.yaml format:**
```yaml
theme: {theme}
timestamp: {ISO8601}
runs_per_combo: {N}

scenarios:
  dev: {scenario_name}
  reviewer: {scenario_name}
  # ...

baselines:
  dev: {mean: 75.2, std: 2.1, n: 10}
  reviewer: {mean: 78.5, std: 1.8, n: 10}
  # ...

champions:
  dev:
    character: puck
    score: 79.8
    std: 2.9
    delta: +4.6
    native: true
    upset: null
  reviewer:
    character: prospero
    score: 81.2
    std: 2.8
    delta: +2.7
    native: false
    upset: portia
  # ...

matrix:
  prospero:
    dev: {mean: 72.5, std: 3.2, n: 4}
    reviewer: {mean: 81.2, std: 2.8, n: 4}
    # ...
  puck:
    dev: {mean: 79.8, std: 2.9, n: 4}
    # ...

analysis:
  most_versatile: {character: puck, avg: 75.4, range: 8.5}
  upsets:
    - {role: reviewer, winner: prospero, beat: portia, margin: 1.1}
  multi_champions:
    - {character: puck, roles: [dev, tea]}
```

Display:
```markdown
---

✓ Results saved to: internal/results/job-fair/{theme}-{timestamp}/
✓ Report: internal/results/job-fair/{theme}-{timestamp}/report.md
✓ Data: internal/results/job-fair/{theme}-{timestamp}/summary.yaml
```

</on-invoke>

<error-handling>
**Theme not found:**
```markdown
Error: Theme '{theme}' not found.

Available themes:
{list from pennyfarthing-dist/personas/themes/*.yaml}
```

**No baselines:**
```markdown
Error: No role baselines found. Cannot run job fair without established baselines.

Create baselines first:
  /benchmark-control dev --scenario race-condition-cache
  /benchmark-control reviewer --scenario order-service
```

**Partial failure:**
```markdown
Warning: {N} combinations failed. Partial results saved.

Failed:
  - {character} --as {role}: {error}

Continuing with {M} successful combinations...
```
</error-handling>

<reference>
- Solo command with --as: `pennyfarthing-dist/commands/solo.md`
- Solo runner script: `scripts/solo-runner.sh`
- Theme files: `pennyfarthing-dist/personas/themes/*.yaml`
- Baselines: `internal/results/baselines/{scenario}/{role}/`
- Output: `internal/results/job-fair/{theme}-{timestamp}/`
</reference>
