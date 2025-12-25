# Agentic Architecture Reference

> PM sidecar knowledge: Anthropic's approach to building AI agents

## Workflows vs Agents: The Fundamental Distinction

**Workflows**: LLMs and tools orchestrated through predefined code paths
- Predictable, consistent
- Ideal for well-defined tasks
- Lower latency and cost

**Agents**: LLMs dynamically direct their own processes and tool usage
- Flexible, adaptable
- Ideal for open-ended problems
- Trade latency/cost for capability

**Key Principle**: Start with the simplest solution possible. Only add agent complexity when demonstrably necessary.

---

## Five Core Workflow Patterns

### 1. Prompt Chaining
Sequential steps where each LLM call processes previous outputs.
```
Generate outline → Write sections → Edit → Translate
```

### 2. Routing
Classify inputs to direct them toward specialized handlers.
```
Query → Classifier → [General | Refunds | Technical]
```

### 3. Parallelization
Run LLM tasks simultaneously:
- **Sectioning**: Independent subtasks in parallel
- **Voting**: Same task multiple times for diverse outputs

### 4. Orchestrator-Workers
Central LLM dynamically breaks down tasks and delegates to workers.
```
Lead Agent → [Worker 1 | Worker 2 | Worker 3] → Synthesis
```

### 5. Evaluator-Optimizer
One LLM generates, another provides feedback in loops.
```
Generator ←→ Evaluator (iterate until quality threshold)
```

---

## The Agent Loop (Claude Agent SDK)

Four-stage cycle:
1. **Gather Context** - Fetch and update information
2. **Take Action** - Execute using available tools
3. **Verify Work** - Evaluate output quality
4. **Repeat** - Continue until task complete

---

## Multi-Agent Coordination

### Anthropic's Research System Architecture

**Performance**: 90.2% improvement over single-agent Claude Opus 4

**Lead Agent Responsibilities:**
- Analyze queries, develop strategies
- Spawn 3-5 subagents in parallel (not serial)
- Synthesize results
- Use extended thinking for planning

**Subagent Operations:**
- Execute searches with own context windows
- Use interleaved thinking to evaluate results
- Return focused findings (not raw data)
- 3+ parallel tool calls for speed

### Artifact-Based Communication

Rather than funneling all results through lead agent:
- Subagents store work in external systems
- Pass lightweight references back
- Prevents information loss
- Reduces token overhead

### Scaling Guidelines

| Task Complexity | Agents | Tool Calls |
|-----------------|--------|------------|
| Simple fact-finding | 1 | 3-10 |
| Direct comparisons | 2-4 | 10-15 each |
| Complex research | 10+ | Divided responsibilities |

### Token Economics

- Agents use ~4× more tokens than chat
- Multi-agent uses ~15× more than chat
- Token usage explains 80% of performance variance

---

## Tool Design Philosophy

**Critical Insight**: Tools deserve equal prompt engineering attention as overall systems.

### Design Principles

1. **Format Selection**: Prioritize natural formats (markdown > complex JSON)
2. **Clear Documentation**: Include examples, edge cases, boundaries
3. **Testing**: Validate with diverse inputs
4. **Error Prevention (Poka-Yoke)**: Design patterns that make mistakes harder

Example: Require absolute filepaths to prevent navigation errors.

---

## When to Use Each Approach

### Use Workflows When:
- Tasks are well-defined with predictable steps
- Consistency and reliability needed
- Decision path can be hardcoded
- Lower latency/cost are priorities

### Use Agents When:
- Problems are open-ended and unpredictable
- Can't hardcode a fixed path
- LLM will operate for many turns
- Flexibility needed at scale

---

## Production Considerations

### Statefulness and Error Handling
- Agents are non-deterministic between runs
- Resume from failure points (not full restarts)
- Combine AI adaptability with deterministic safeguards
- Implement retry logic and checkpoints

### Deployment
Use **rainbow deployments**: Gradually shift traffic, keep both versions active during rollout.

### Testing
- Extensive sandboxed testing
- LLM-as-judge for consistency
- Human testing for edge cases

---

## New API Capabilities (2025)

1. **Code Execution Tool**: Python sandbox for data analysis
2. **MCP Connector**: Automatic tool discovery and management
3. **Files API**: Upload once, reference across conversations
4. **Extended Prompt Caching**: 1-hour TTL (90% cost reduction, 85% latency reduction)

---

## Sources

- [Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- [Multi-Agent Research System](https://www.anthropic.com/engineering/multi-agent-research-system)
- [Claude Code Best Practices](https://www.anthropic.com/engineering/claude-code-best-practices)
