# Model Context Protocol (MCP) Reference

> PM sidecar knowledge: The open standard for AI-tool integration

## Overview

**MCP** is an open standard (November 2024, Anthropic) for connecting AI systems to external tools and data sources. Now part of the Linux Foundation's Agentic AI Foundation (AAIF).

**Adopted by**: Anthropic, OpenAI, Google, Microsoft, AWS, Cloudflare, Bloomberg

---

## Architecture

### Communication Model

Uses **JSON-RPC 2.0** for all client-server communication.

**Participants:**
- **Hosts**: LLM applications (Claude Desktop, Claude Code)
- **Clients**: Connectors managing MCP communication
- **Servers**: Services exposing context, tools, and capabilities

### Transport Mechanisms

| Transport | Use Case | Notes |
|-----------|----------|-------|
| **STDIO** | Local servers | Never write to stdout (corrupts JSON-RPC) |
| **Streamable HTTP** | Remote servers | Modern standard, supports SSE streaming |
| **SSE** | Legacy | Deprecated as of 2025-03-26 |

---

## Protocol Primitives

### Server Primitives

#### Resources
File-like data structures (API responses, files, database records).

```json
// Discovery
{ "method": "resources/list" }

// Retrieval
{ "method": "resources/read", "params": { "uri": "config://app" } }
```

#### Tools
Executable functions LLMs can invoke (with user approval).

```json
// List available tools
{ "method": "tools/list" }

// Execute tool
{ "method": "tools/call", "params": { "name": "get_weather", "arguments": { "city": "NYC" } } }
```

#### Prompts
Pre-written templates for LLM interactions.

```json
{ "method": "prompts/list" }
{ "method": "prompts/get", "params": { "name": "code_review" } }
```

### Client Primitives

- **Roots**: Server inquiries into URI/filesystem boundaries
- **Sampling**: Server requests for LLM invocation
- **Elicitation**: Server requests for user information

---

## JSON-RPC Message Formats

### Request
```json
{
  "jsonrpc": "2.0",
  "id": "unique-id",
  "method": "tools/call",
  "params": {}
}
```

### Success Response
```json
{
  "jsonrpc": "2.0",
  "id": "unique-id",
  "result": {}
}
```

### Error Response
```json
{
  "jsonrpc": "2.0",
  "id": "unique-id",
  "error": { "code": -32602, "message": "Invalid params" }
}
```

### Notification (no response expected)
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/changed",
  "params": {}
}
```

---

## Tool Definition Examples

### Python (FastMCP)
```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("weather")

@mcp.tool()
async def get_alerts(state: str) -> str:
    """Get weather alerts for a US state.

    Args:
        state: Two-letter US state code (e.g. CA, NY)
    """
    # Implementation
    return result
```

### TypeScript
```typescript
server.registerTool(
  "get_alerts",
  {
    description: "Get weather alerts for a state",
    inputSchema: {
      state: z.string().length(2).describe("Two-letter state code"),
    },
  },
  async ({ state }) => ({
    content: [{ type: "text", text: await fetchAlerts(state) }],
  })
);
```

---

## Capability Negotiation

During initialization:

1. Client sends `initialize` with capabilities
2. Server responds with its capabilities
3. Client sends `initialized` notification

Both parties advertise supported features. Prevents runtime errors from unsupported operations.

---

## Security Principles

1. **User Consent**: Explicit approval for all data access
2. **Data Privacy**: No transmission without authorization
3. **Tool Safety**: Clear approval required before invocation
4. **LLM Sampling Controls**: User approval for sampling requests

---

## Configuration

### Claude Desktop (macOS)
```
~/Library/Application Support/Claude/claude_desktop_config.json
```

```json
{
  "mcpServers": {
    "weather": {
      "command": "uv",
      "args": ["--directory", "/path/to/weather", "run", "weather.py"]
    }
  }
}
```

### Claude Code
```bash
claude mcp add github --scope user
```

---

## Available SDKs

| SDK | Stars | Notes |
|-----|-------|-------|
| Python | 20.8k | Most popular, FastMCP framework |
| TypeScript | 11.1k | Built-in Zod validation |
| Go | 3.5k | Google collaboration |
| C# | 3.7k | Microsoft collaboration |
| Kotlin | 1.2k | JetBrains partnership |
| Rust | - | Systems programming |

**Development Tools:**
- MCP Inspector (8k stars): Visual testing
- mcp-servers repo (74.8k stars): Official examples

---

## Best Practices

1. **Never write to stdout in STDIO servers** (corrupts JSON-RPC)
2. Use absolute paths in configurations
3. Define strict schemas for all tools/resources
4. Implement comprehensive error handling
5. Require explicit user consent
6. Validate all inputs with schemas

---

## Sources

- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
- [GitHub](https://github.com/modelcontextprotocol)
- [Anthropic MCP Docs](https://docs.anthropic.com/en/docs/agents-and-tools/mcp)
