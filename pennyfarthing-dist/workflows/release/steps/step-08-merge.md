# Step 8: Merge to Main

<purpose>
Merge develop into main and create the annotated release tag. This prepares everything for push — still local, still reversible.
</purpose>

<instructions>
1. Checkout main and pull latest
2. Merge develop into main
3. Create annotated tag
4. Show the merge result and tag info
</instructions>

<output>
Merge summary and tag details. Everything is local — nothing has been pushed yet.
</output>

## Execution

### 8.1 Update Main

```bash
git checkout main
git pull origin main --ff-only || {
    echo "WARNING: Could not fast-forward main. Attempting merge..."
    git pull origin main --no-rebase
}
```

### 8.2 Merge Develop

```bash
git merge develop -m "Merge develop into main for release {new_version}"
```

### 8.3 Create Tag

```bash
TAG="v{new_version}"
git tag -a "$TAG" -m "Release {new_version}"
echo "Created tag: $TAG"
```

### 8.4 Verify

```bash
echo "=== Release State ==="
echo "Branch: $(git branch --show-current)"
echo "Tag: $(git tag -l 'v{new_version}')"
echo "HEAD: $(git log --oneline -1)"
echo ""
echo "=== Branches Ahead of Remote ==="
git log --oneline origin/main..main
echo "---"
git log --oneline origin/develop..develop
```

Everything is local. The next step pushes to the remote — that's the point of no return for git.

---

**[C]** Continue to push
**[A]** Abort (delete tag, reset main)

<!-- CYCLIST:CHOICES:C,A -->
