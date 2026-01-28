# Step 3: Execute Commits

Create branches, commit changes, and merge to develop for each approved group.

## Objective

Execute the approved change groupings following the branch workflow:
1. Stash all changes
2. For each group: branch → stage → commit → merge (or PR for tracked)
3. Track progress and handle failures gracefully

## Two Execution Paths

| Type | Flow | Merge Method |
|------|------|--------------|
| **Quick** | branch → commit → local merge | Fast-forward |
| **Tracked** | Jira → branch → commit → push → PR → squash merge | PR squash |

## Critical Rules

**NEVER commit directly to develop.** Branch protection hooks will reject it.

**NEVER force push.** Data loss is not recoverable.

**NEVER commit secrets.** Check for .env, credentials, API keys.

## Execution

### 3.1 Stash All Changes

```bash
# Stash everything to start clean - MARK CLEARLY
git stash push -m "CLEANUP-WIP: git-cleanup-$(date +%Y%m%d-%H%M%S)"
```

**Verify stash worked:**
```bash
git stash list  # Should show your CLEANUP-WIP entry
```

### 3.2 For Each Group

Execute this sequence for each approved group:

#### Create Branch

```bash
# Ensure on develop and up to date
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b {branch_name}
```

#### Apply and Stage Changes

```bash
# Pop stash
git stash pop

# Stage only files for this group
git add {file1} {file2} ...

# Re-stash remaining changes - MARK CLEARLY
git stash push -m "CLEANUP-WIP: remaining changes"
```

#### Show Diff for Verification

```bash
# Show what will be committed
git diff --cached --stat
```

#### Commit

```bash
git commit -m "$(cat <<'EOF'
{type}({scope}): {description}

{body if needed}
EOF
)"
```

#### Merge to Develop (Quick Path)

```bash
# Switch to develop
git checkout develop

# Merge the branch (creates merge commit)
git merge {branch_name} --no-ff -m "Merge {branch_name}"

# Or fast-forward merge for clean history
git merge {branch_name}

# Delete local branch
git branch -d {branch_name}
```

### 3.3 For Tracked Groups (Standalone Path)

Groups marked for Jira tracking follow the full PR workflow:

#### Create Jira Story

```bash
# Create story in Jira
JIRA_KEY=$(jira issue create \
  --project MSSCI \
  --type Story \
  --summary "{title}" \
  --body "{description}" \
  --label pennyfarthing \
  --custom story-points="{points}" \
  --no-input 2>&1 | grep -oE 'MSSCI-[0-9]+' | head -1)

echo "Created: $JIRA_KEY"

# Add to current sprint and mark done
jira sprint add {sprint_id} "$JIRA_KEY"
jira issue move "$JIRA_KEY" "Done"
```

#### Create Branch with Jira Key

```bash
SLUG=$(echo "{title}" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr -cd 'a-z0-9-' | cut -c1-30)
BRANCH="feat/${JIRA_KEY}-${SLUG}"
git checkout -b "$BRANCH"
```

#### Commit with Jira Reference

```bash
git commit -m "$(cat <<'EOF'
feat: {title} ({JIRA_KEY})

{description}
EOF
)"
```

#### Push and Create PR

```bash
git push -u origin "$BRANCH"

gh pr create \
  --title "feat: {title} (${JIRA_KEY})" \
  --body "## Summary
{description}

## Jira
[${JIRA_KEY}](https://1898andco.atlassian.net/browse/${JIRA_KEY})

## Test plan
- [x] Changes verified locally

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

#### Merge PR and Cleanup

```bash
gh pr merge --squash --delete-branch
git checkout develop
git pull origin develop
```

### 3.4 Progress Tracking

Report progress after each group:

```
## Execution Progress

| Group | Type | Status | Branch | Jira |
|-------|------|--------|--------|------|
| Sprint cleanup | Quick | ✅ Done | chore/sprint-update | - |
| Docs update | Quick | ✅ Done | docs/update-readme | - |
| Prime module | Tracked | ✅ Done | feat/MSSCI-12500-prime | MSSCI-12500 |
| Config changes | Quick | ⏳ Pending | - | - |
```

### 3.5 Error Handling

If a commit fails:
1. **Hook rejection**: Check commit message format, try again
2. **Merge conflict**: Report to user, offer to abort or resolve
3. **Test failure**: Report which tests failed, offer to proceed or abort

**CRITICAL: Before panicking about lost work, CHECK STASH:**
```bash
git stash list              # Work is probably here!
git stash show -p stash@{0} # See what's in it
git stash pop               # Restore it
```

When a pre-commit hook blocks a commit, staged changes may be auto-stashed. Always check.

## Output

After all groups processed:

```
## Execution Complete

Commits created: {n}
Branches merged: {n}
Remaining stashed: {yes/no}

Ready to verify and push?
```

---

**[A]** Abort (revert all changes, restore stash)
**[C]** Continue to verification

<!-- GATE -->
<!-- CYCLIST:CHOICES:A,C -->
