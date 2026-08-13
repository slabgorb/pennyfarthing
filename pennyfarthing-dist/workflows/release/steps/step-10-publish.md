# Step 10: Reinstall pf CLI

<purpose>
Reinstall the pf CLI from the updated source so the new version is live locally.
Consumer projects will pick up the new version on their next `pf init`.
</purpose>

<instructions>
1. Reinstall the pf CLI (editable) via `just update-pf`
2. Verify the installed version matches the release
3. Run `pf init` on the current project to update local files (skip in dogfooding dev repos)
</instructions>

<output>
Installed pf version and init confirmation.
</output>

## Execution

### 10.1 Reinstall pf CLI

The CLI is installed as an **editable uv-tool** — it tracks the source tree live, so
after the VERSION bump `pf --version` already reports the new number. Reinstall to be
explicit (and to pick up any packaging/entry-point changes):

```bash
just update-pf
```

> **Note:** `pipx install -e pennyfarthing-dist/` is stale — the CLI lives at the repo
> root (`pyproject` derives its version from `pf.__version__`) and is managed by
> `just update-pf` (editable uv-tool install), not pipx.

### 10.2 Verify Version

```bash
pf --version
# Should show: pf, version {new_version}
```

### 10.3 Update Current Project

For **consumer projects**, refresh the copied content dirs:

```bash
pf init .
```

> **Skip in dogfooding dev repos** (the orchestrator that inlines `pennyfarthing/`):
> `.pennyfarthing/` already symlinks to `pennyfarthing-dist/`, so the release is live
> without `pf init` — running it there only churns settings/symlinks.

---


<switch tool="AskUserQuestion">
  <case value="continue-to-github-release" next="step-11-finalize">
    Continue to GitHub release
  </case>
  <case value="skip-github-release" next="step-11-finalize">
    Skip GitHub release
  </case>
</switch>
