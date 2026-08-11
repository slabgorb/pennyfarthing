# Step 6: Validation & Output

<step-meta>
number: 6
name: validate
gate: true
</step-meta>

<purpose>
Run the scenario validator against the assembled YAML, handle any field mapping required for validator compatibility, and write the final file to the correct benchmark directory.
</purpose>

<prerequisites>
- Complete scenario YAML assembled and user-approved (step 5)
- Internal consistency checks passed
</prerequisites>

<instructions>
1. Prepare the YAML for validation:
   - The validator expects `name` (maps from scenario `name` field)
   - The validator expects `title` (use the scenario `name` as title)
   - The validator expects `prompt` (maps from `instructions` field)
   - Ensure `category` is one of: code-review, architecture, dev, tea, sm, pm, reviewer, general
   - Ensure `difficulty` is one of: easy, medium, hard, extreme
2. Run `scenario_validator.py` against the assembled data
3. If validation fails:
   - Display specific error messages
   - Go back to step 5 to fix issues
   - Re-validate after fixes
4. If validation passes:
   - Write the final YAML to `{benchmarks_root}/{scenario_category}/{scenario_id}-{slug}.yaml`
   - Confirm the file was written successfully
   - Display the output path
5. Optionally suggest running a quick benchmark test with the new scenario
</instructions>

<actions>
- Validate: run `pf.benchmark.scenario_validator.validate_scenario` on the assembled data using the guarded interpreter (fence below)
- Write: `{benchmarks_root}/{scenario_category}/{scenario_id}-{slug}.yaml`
</actions>

Run the validator with the pf launcher's own interpreter. A bare interpreter
resolves to whatever is first on PATH — usually a project `.venv` that has no
pf installed, so the import dies with ModuleNotFoundError (gh #112). The
scenario data is fed on stdin through a single-quoted heredoc, so nothing in it
is expanded by the shell or interpolated into the Python source (CWE-78).

```bash
# pf.* modules live in the pf CLI's OWN venv (uv-tool install), NOT the project
# .venv - derive the interpreter from the launcher shebang, never activate .venv.
PF_PY="$(sed -n '1s/^#!//p' "$(command -v pf)")"
"${PF_PY:?PF_PY not set - could not resolve the pf launcher interpreter}" -c "
import json, sys, yaml
from pf.benchmark.scenario_validator import validate_scenario
print(json.dumps(validate_scenario(yaml.safe_load(sys.stdin)), indent=2))
" <<'SCENARIOEOF'
{assembled scenario YAML, with the validator field mapping below applied}
SCENARIOEOF
```

## Validator Field Mapping

The `scenario_validator.py` requires these fields:
- `name` — scenario name (direct)
- `title` — use the `name` field value
- `category` — must be in VALID_CATEGORIES
- `difficulty` — must be in VALID_DIFFICULTIES
- `prompt` — maps from the `instructions` field

When preparing for validation, create a dict with both original fields and mapped fields:
```python
validator_data = {
    "name": scenario["name"],
    "title": scenario["name"],        # mapped
    "category": scenario["category"],
    "difficulty": scenario["difficulty"],
    "prompt": scenario["instructions"], # mapped
}
# Include red_herrings if present
if "red_herrings" in scenario:
    validator_data["red_herrings"] = scenario["red_herrings"]
```

## Output Path

Final file path: `{benchmarks_root}/{scenario_category}/{scenario_id}-{slug}.yaml`

Examples:
- `pennyfarthing/benchmarks/test-cases/architecture/arch-002-event-sourcing.yaml`
- `pennyfarthing/benchmarks/test-cases/pm/pm-003-roadmap-conflict.yaml`
- `pennyfarthing/benchmarks/test-cases/sm/sm-002-platform-migration.yaml`

## Post-Creation

After successful creation, suggest:
- "Run `/pf-benchmark` with this scenario to test it"
- "Create another scenario with `/pf-workflow start scenario-builder`"

<output>
- Validation result (pass/fail with details)
- Final YAML file written to benchmarks directory
- Output file path for reference
</output>

<gate>
## Completion Criteria
- [ ] Validator passes with no errors
- [ ] File written to correct `{benchmarks_root}/{category}/` directory
- [ ] File path displayed to user
- [ ] Scenario is ready for benchmark use
</gate>

## Failure Modes

- Not mapping `instructions` to `prompt` for the validator
- Not mapping `name` to `title` for the validator
- Writing to the wrong directory
- Not handling validator errors (looping back to fix)
- Writing a file that overwrites an existing scenario without warning
