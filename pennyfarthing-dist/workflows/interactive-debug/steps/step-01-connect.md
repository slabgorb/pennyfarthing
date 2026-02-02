# Step 1: Connect to Frontend

<step-meta>
number: 1
name: connect
gate: false
</step-meta>

## Purpose

Detect if a dev server is running, offer to connect or launch one, and verify Playwright MCP is working.

## Mandatory Execution Rules

- READ the complete step file before taking any action
- NEVER skip server detection
- VERIFY Playwright MCP before proceeding

## Server Detection

**Check if dev server is already running:**

```bash
lsof -ti:{dev_port} 2>/dev/null
```

### If Server IS Running

Present to user:

> I detected a server running on port {dev_port}.
>
> - **[C] Connect** - Use the existing server at {dev_url}
> - **[N] New** - Kill it and start fresh with `{dev_command}`
> - **[U] URL** - Specify a different URL to connect to

### If Server is NOT Running

Present to user:

> No server detected on port {dev_port}.
>
> - **[S] Start** - Launch with `{dev_command}`
> - **[U] URL** - Specify a different URL (server running elsewhere)
> - **[M] Manual** - I'll start the server myself, then continue

**If user chooses Start:**
- Run `{dev_command}` in background
- Wait for server to be ready (poll {dev_url} with curl)
- Confirm server is up before proceeding

## Playwright MCP Verification

**After server connection is established, verify Playwright MCP:**

1. Use the Playwright MCP tool to navigate to {dev_url}
2. Take a screenshot to confirm connection works

**If Playwright MCP is not available:**

> Playwright MCP is not configured. This workflow requires browser automation.
>
> Please add `@anthropic/mcp-playwright` to your Claude MCP settings and restart.

**STOP workflow if Playwright MCP unavailable.**

## Output

Confirm to user:

```
Connected to: {actual_url}
Playwright MCP: Verified
Screenshot: [display screenshot]

Ready to explore the UI.
```

## Collaboration Menu

- **[C] Continue** - Proceed to UI exploration
- **[R] Reconnect** - Try a different URL or restart server

## Next Step

After user confirms connection, proceed to UI exploration.
