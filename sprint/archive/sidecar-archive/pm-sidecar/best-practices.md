# Agentic Development Best Practices

> PM sidecar knowledge: Consolidated best practices for LLM-in-the-loop programming

## Core Principles

### 1. Simplicity First
- Start with the simplest solution
- Add complexity only when demonstrably necessary
- Agents trade latency/cost for capability - make this tradeoff intentionally

### 2. Transparency
- Make reasoning visible
- Allow users to see how agents plan and decide
- Log decision points for debugging

### 3. Reliable Tool Interactions
- Clearly scoped tools
- Well-documented with examples
- Tested with diverse inputs

---

## Tool Design

### Equal Attention to Tools
> "We spent more time optimizing tools than the overall prompt" - Anthropic SWE-bench team

### Design Checklist
- [ ] Format: Use natural formats (markdown > complex JSON)
- [ ] Documentation: Include examples, edge cases, boundaries
- [ ] Testing: Validate with diverse inputs via workbench
- [ ] Error Prevention: Design patterns that make mistakes harder (poka-yoke)

### Specific Recommendations
- Require **absolute filepaths** (prevent navigation errors)
- Use **strict schemas** for all inputs/outputs
- Provide **clear error messages** with recovery guidance
- Document **what the tool cannot do**

---

## Multi-Agent Design

### Orchestrator-Worker Pattern
```
Lead Agent (strategic decisions)
    ├── Worker 1 (focused task)
    ├── Worker 2 (focused task)
    └── Worker 3 (focused task)
```

### Communication
- Use **artifacts** over pipes (subagents write to external storage)
- Pass **lightweight references** back to coordinator
- Prevents information loss, reduces token overhead

### Scaling Guidelines

| Complexity | Agents | Tool Calls |
|------------|--------|------------|
| Simple | 1 | 3-10 |
| Moderate | 2-4 | 10-15 each |
| Complex | 10+ | Divided responsibilities |

### Context Management
- Each subagent has own context window
- Prevents pollution of main conversation
- Load context just-in-time
- Budget: 500-800 lines per agent max

---

## Error Handling

### Statefulness Challenges
- Agents are non-deterministic between runs
- Same prompt can yield different results
- Makes debugging harder

### Resilience Patterns
1. **Resume from failure** (not full restarts)
2. **Combine AI adaptability with deterministic safeguards**
3. **Implement retry logic with exponential backoff**
4. **Regular checkpoints** for long-running tasks

### Error Response Design
```json
{
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "field": "state",
      "expected": "Two-letter code",
      "received": "California"
    }
  }
}
```

---

## Testing Strategies

### Levels
1. **Unit Tests**: Individual tool behavior
2. **Integration Tests**: Tool combinations
3. **End-to-End Tests**: Full agent workflows
4. **Sandbox Tests**: Safe environment for autonomy

### Evaluation Methods
- **Automated metrics**: Response quality, task completion
- **LLM-as-judge**: Consistent subjective evaluation
- **Human testing**: Edge cases automation misses

### TDD for Agents
1. Write tests with explicit input/output pairs
2. Verify tests fail initially
3. Have agent implement until tests pass
4. Iterate on failures

---

## Production Deployment

### Rainbow Deployments
- Gradually shift traffic from old to new
- Keep both versions active during rollout
- Prevents disruption to running agents

### Monitoring
- Track token usage (explains 80% of performance variance)
- Log all tool calls and results
- Monitor error rates by tool type
- Alert on unusual patterns

### Cost Management
- Agents: ~4× more tokens than chat
- Multi-agent: ~15× more tokens than chat
- Use caching (90% cost reduction with 1-hour TTL)
- Route simple queries to smaller models

---

## Security

### Consent and Control
- Explicit user consent for all data access
- Clear UIs for reviewing activities
- User approves tool invocations before execution

### Tool Safety
- Treat tool descriptions as untrusted
- Explicit approval before invocation
- Clear documentation of capabilities and risks

### Data Privacy
- No transmission without authorization
- Appropriate access controls
- Privacy-preserving design (limit visibility)

---

## Automatic vs Instructional

### When to Use Scripts (Automatic)
- Critical behavior that must not skip
- Agent-to-agent handoffs
- Environment setup
- State transitions

### When to Use Markdown (Instructional)
- Optional behavior
- Context-dependent decisions
- Requires judgment
- Can safely fail

### Example
```bash
# Script outputs directly - agent sees without following instructions
$PROJECT_ROOT/scripts/agent-session.sh start "sm"
```

vs

```markdown
## Instructions
Please load the persona from the config file...
```

---

## Workflow Selection

### Use Workflows When
- Tasks well-defined with predictable steps
- Consistency and reliability needed
- Decision path can be hardcoded
- Lower latency/cost priorities

### Use Agents When
- Problems open-ended and unpredictable
- Can't hardcode a fixed path
- LLM operates for many turns
- Flexibility needed at scale

---

## Key Metrics

| Metric | What It Measures |
|--------|------------------|
| Token usage | Primary predictor of performance |
| Task completion rate | Agent effectiveness |
| Error rate by tool | Tool reliability |
| Time to completion | Efficiency |
| User intervention rate | Agent autonomy |

---

## Sources

- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
- [Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [MCP Specification](https://modelcontextprotocol.io/specification/2025-11-25)
