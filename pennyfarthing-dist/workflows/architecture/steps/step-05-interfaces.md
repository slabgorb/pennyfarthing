# Step 5: Interface Definition

<step-meta>
number: 5
name: interface-definition
gate: false
</step-meta>

## Purpose

Define the APIs, contracts, and communication patterns between components.

## Instructions

1. **Define External APIs**:
   - What APIs does the system expose?
   - What authentication/authorization is needed?
   - What are the request/response formats?

2. **Define Internal Contracts**:
   - How do components communicate?
   - Synchronous (HTTP, gRPC) or asynchronous (events, queues)?
   - What are the message formats?

3. **Establish Conventions**:
   - Naming conventions
   - Error handling patterns
   - Versioning strategy

## Actions

- Design: API contracts (OpenAPI, protobuf, or pseudocode)
- Document: Event schemas if using async
- Define: Error codes and handling

## Output

Add to session file:

```markdown
## Interface Definitions

### External APIs

| Endpoint | Method | Purpose | Auth |
|----------|--------|---------|------|
| /api/v1/resource | GET | List resources | Bearer |
| /api/v1/resource | POST | Create resource | Bearer |

### Internal Communication

| From | To | Type | Contract |
|------|----|----- |----------|
| A | B | HTTP | GET /internal/data |
| B | C | Event | DataUpdated { id, payload } |

### Conventions
- **Naming**: [snake_case, camelCase, etc.]
- **Errors**: [HTTP codes, error envelope format]
- **Versioning**: [URL path, header, etc.]
```

## Next Step

Proceed to Risk Assessment to identify potential issues.
