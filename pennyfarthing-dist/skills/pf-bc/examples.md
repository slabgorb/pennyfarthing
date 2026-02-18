# BC (Panel Focus) — Examples

## Setting Focus

```bash
# Focus on Sprint panel
pf.sh bc sprint

# Focus on Diffs panel
pf.sh bc diffs

# Focus on Acceptance Criteria
pf.sh bc ac

# Focus on Git panel
pf.sh bc git

# Preview without changing
pf.sh bc sprint --dry-run
```

## Clearing Focus

```bash
# Remove focus setting
pf.sh bc reset

# Preview
pf.sh bc reset --dry-run
```

## Named Layouts

```bash
# Save current layout as "normal"
pf.sh bc save normal

# Save current layout as "review"
pf.sh bc save review

# Save current layout as "debug"
pf.sh bc save debug

# List all saved layouts
pf.sh bc list

# Switch to review layout
pf.sh bc load review

# Switch back to normal
pf.sh bc load normal

# Delete a specific layout
pf.sh bc clear review

# Delete all layouts
pf.sh bc clear-all
```

## Common Workflows

### During code review
```bash
pf.sh bc save normal          # Save current layout first
pf.sh bc diffs                # Focus on diffs
# ... do review ...
pf.sh bc load normal          # Restore normal layout
```

### Debugging session
```bash
pf.sh bc save normal
pf.sh bc debug                # Focus debug panel
# ... debug ...
pf.sh bc reset                # Clear focus
```

### Sprint planning
```bash
pf.sh bc sprint               # Focus sprint panel
# ... review backlog ...
pf.sh bc reset
```
