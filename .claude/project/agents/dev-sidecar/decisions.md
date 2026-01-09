# Dev Agent Decisions

> Pennyfarthing-specific implementation decisions

## Decision Log

### ADR-001: Cyclist Uses Claude Code CLI Subprocess (Not Anthropic API)

**Status:** Accepted

**Context:** Epic E7 requires programmatic control of Claude Code for Cyclist integration. Two approaches were considered: Claude Agent SDK (requires Anthropic API key) vs Claude Code CLI subprocess.

**Decision:** Use Claude Code CLI in programmatic mode (`claude -p --output-format stream-json`) as a subprocess. Do NOT use `@anthropic-ai/claude-agent-sdk` or require an Anthropic API key.

**Rationale:**
- Cyclist users already have Claude Code installed and authenticated
- No additional API key configuration required
- Same capabilities as the CLI they're already using
- OTEL environment variables pass through naturally to subprocess

**Implementation:**
```typescript
// Spawn Claude Code CLI subprocess
const proc = spawn('claude', [
  '-p', prompt,
  '--output-format', 'stream-json',
  '--dangerously-skip-permissions',
  '--permission-mode', permissionMode,
  ...(sessionId ? ['--resume', sessionId] : [])
], { env: { ...process.env, ...otelEnvVars } });

// Parse NDJSON stream
proc.stdout.on('data', (chunk) => {
  // Each line is a JSON message
  const messages = chunk.toString().split('\n').filter(Boolean);
  messages.forEach(line => {
    const msg = JSON.parse(line);
    // Handle msg.type: 'init', 'message', 'tool_use', 'tool_result', 'result'
  });
});
```

**Alternatives Considered:**
- `@anthropic-ai/claude-agent-sdk`: Requires API key, adds dependency
- Custom API integration: Would bypass Claude Code's agentic capabilities

**Consequences:**
- Depends on Claude Code CLI being installed
- Subprocess lifecycle management needed
- NDJSON parsing required
- Session resume via `--resume` flag

**Date:** 2026-01-06

---

### ADR-002: Consider Adopting Claude Agent SDK Message Types

**Status:** Proposed

**Context:** Cyclist wraps Claude Code CLI to provide a visual interface. Currently `src/claude-service.ts` defines SDK message types based on observation. The Claude Agent SDK now provides official TypeScript types.

**Decision:** Consider adopting the Claude Agent SDK types or aligning our types with theirs.

**Rationale:**
- Official SDK types will be maintained and documented
- The SDK uses identical NDJSON format we parse
- Types match: `SDKSystemMessage`, `SDKAssistantMessage`, `SDKToolUseMessage`, etc.

**Alternatives Considered:**
- Continue with current hand-rolled types (works but may drift from official spec)
- Use the Claude Agent SDK directly (adds dependency, may be overkill for CLI wrapper)

**Consequences:**
- Easier: Types match official documentation
- Harder: Need to verify SDK types work with CLI output (SDK may have extras)

**Date:** 2026-01-07

---

### ADR-003: Permission Mode UI via canUseTool Callback

**Status:** Proposed

**Context:** Claude Code supports four permission modes: `default`, `plan`, `acceptEdits`, `bypassPermissions`. The CLI cycles through them with Shift+Tab. Cyclist's mode button currently shows MANUAL/PLAN/ACCEPT/DANGER.

**Decision:** Consider implementing proper `canUseTool` callback support for interactive permission prompts.

**Rationale:**
- Current approach: `--dangerously-skip-permissions` bypasses all prompts
- Claude Agent SDK: `canUseTool(toolName, input) => {behavior: "allow"|"deny", ...}`
- SDK allows interactive approval without blanket skip
- Could show modal when Claude requests permission

**Alternatives Considered:**
- Keep current approach (simple, but user has no control over individual tools)
- Implement full SDK integration (more complex, provides fine-grained control)

**Consequences:**
- Easier: More user control, safer defaults
- Harder: Need UI for permission prompts, handle async approval flow

**Date:** 2026-01-07

---

*Add decisions made during implementation below*
