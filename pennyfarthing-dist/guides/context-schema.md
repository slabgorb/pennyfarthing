# Context Schema

<info>
Machine-readable schema defining the structure of context documents that Prime assembles for agent activation. The schema is the single source of truth for what components exist, how they are validated, and which tiers include them.
</info>

## File Location

```
pennyfarthing-dist/schemas/context-schema.yaml
```

## Schema Structure

The context schema has three top-level sections:

### Tiers

Defines the four context tiers and which components each includes:

| Tier | ~Tokens | Components |
|------|---------|------------|
| **FULL** | 4000 | All 9 components |
| **REFRESH** | 600 | workflow_state, sprint_context, repos_topology, session_header |
| **HANDOFF** | 700 | workflow_state, agent_definition, persona_compressed, repos_topology |
| **MINIMAL** | 200 | workflow_state only |

### Components

Each component defines:

| Field | Required | Description |
|-------|----------|-------------|
| `description` | Yes | What this component provides |
| `type` | Yes | Content type: `structured`, `markdown`, `text`, `formatted_text`, `collection` |
| `source` | Yes | Where content comes from (module+function or file path) |
| `required` | Yes | Whether the component must be present |
| `condition` | No | Feature flag that must be enabled (e.g., `character_voice_enabled`) |
| `fields` | No | For structured types, the expected fields with types and constraints |
| `validation` | No | Rules for validating the component content |
| `items` | No | For collection types, the expected child items |

### Assembly Order

The order in which components appear in the final context payload, matching the agent attention curve documented in `docs/agent-context-heatmap.md`.

## Component Types

| Type | Description | Example |
|------|-------------|---------|
| `structured` | Python dataclass with typed fields | `workflow_state` |
| `markdown` | Markdown file with XML tags and sections | `agent_definition`, `behavior_guide` |
| `text` | Plain formatted text | `sprint_context`, `repos_topology` |
| `formatted_text` | Text assembled from structured data | `persona`, `persona_compressed` |
| `collection` | Directory of related files | `sidecars` |

## Consumers

| Consumer | Story | Purpose |
|----------|-------|---------|
| Context Validator | 129-3 | `pf validate context` — validates all context documents against schema |
| Template Generator | 129-4 | `pf context template` — generates blank context documents from schema |

## Validation Rules

Components can specify validation rules that the validator (129-3) will enforce:

- **`min_length`**: Minimum character count
- **`required_sections`**: XML tags or markdown headings that must be present
- **`recommended_sections`**: Sections that should be present (warn if missing)
- **`pattern`**: Regex the content must match
- **`required_fields`**: Fields that must be present in structured content
- **`recommended_tags`**: XML tags that items should use

## Template Generator Usage

Generate blank context document templates from the schema:

```bash
pf context template                          # All components → ./context-templates/
pf context template --tier FULL              # FULL tier components only
pf context template --tier MINIMAL           # Just workflow_state
pf context template -o ./my-templates        # Custom output directory
pf context template --overwrite              # Replace existing files
```

Generated files use appropriate extensions per component type:

| Type | Extension | Example |
|------|-----------|---------|
| `structured` | `.yaml` | `workflow_state.yaml` |
| `markdown` | `.md` | `agent_definition.md` |
| `text` | `.txt` | `sprint_context.txt` |
| `formatted_text` | `.txt` | `persona.txt` |
| `collection` | `.yaml` | `sidecars.yaml` |

Each template includes inline comments documenting the component's description, required fields, validation rules, and expected content format.

## Related

- [Prime Guide](prime.md) — How context is loaded and assembled
- [Session Schema](session-schema.md) — Schema for session files (a context source)
- [Workflow Schema](workflow-schema.md) — Schema for workflow definitions
- Story 129-3: Build Context Validator Python Module and CLI
- Story 129-4: Generate Context Document Templates from Schema
