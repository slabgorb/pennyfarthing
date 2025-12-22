# Architect Agent Patterns

> System design and architecture patterns

## Design Principles

### Simplicity First
- Start with the simplest solution
- Add complexity only when necessary
- Avoid premature optimization
- Prefer composition over inheritance

### Clear Boundaries
- Define explicit interfaces between components
- Minimize coupling between modules
- Use dependency injection
- Document integration points

## Architecture Decision Records

### ADR Format
```markdown
# ADR-NNN: [Title]

## Status
[Proposed | Accepted | Deprecated | Superseded]

## Context
[What is the issue we're addressing?]

## Decision
[What is the change we're making?]

## Consequences
[What are the positive and negative results?]

## Alternatives Considered
[What other options did we evaluate?]
```

### When to Create ADR
- New technology choice
- Significant pattern change
- Cross-cutting concerns
- Breaking changes

## API Design Patterns

### RESTful Conventions
```
GET    /resources          - List
GET    /resources/:id      - Get one
POST   /resources          - Create
PUT    /resources/:id      - Replace
PATCH  /resources/:id      - Update
DELETE /resources/:id      - Delete
```

### Error Response Format
```json
{
  "error": {
    "code": "RESOURCE_NOT_FOUND",
    "message": "Human readable message",
    "details": {}
  }
}
```

### Pagination Pattern
```json
{
  "data": [...],
  "pagination": {
    "total": 100,
    "page": 1,
    "per_page": 20,
    "next_cursor": "abc123"
  }
}
```

## Database Patterns

### Migration Strategy
- Forward-only migrations
- Reversible when possible
- Test rollback in staging
- Document breaking changes

### Query Patterns
```go
// Use context for timeouts
ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
defer cancel()

// Use parameterized queries
rows, err := db.QueryContext(ctx,
    "SELECT * FROM users WHERE id = $1", id)
```

## Component Design

### Service Layer Pattern
```
Handler → Service → Repository → Database
   ↓          ↓
Validation  Business Logic
```

### Interface Segregation
```go
// Small, focused interfaces
type Reader interface {
    Read(id string) (*Entity, error)
}

type Writer interface {
    Write(entity *Entity) error
}

// Compose when needed
type ReadWriter interface {
    Reader
    Writer
}
```

## Multi-Repo Coordination

### Shared Types
- Define in API repo
- Generate clients for UI
- Version together when breaking

### Cross-Repo Changes
1. API changes first (backward compatible)
2. UI updates to use new API
3. Remove old API support

## Performance Considerations

### Caching Strategy
- Cache at service boundaries
- Invalidate on write
- Use TTL for eventual consistency
- Document cache behavior

### Query Optimization
- Index frequently filtered columns
- Avoid N+1 queries
- Use EXPLAIN for complex queries
- Paginate large result sets

## Documentation Standards

### Component Documentation
```markdown
## [Component Name]

### Purpose
[What does this component do?]

### Dependencies
[What does it depend on?]

### API
[Public interface]

### Configuration
[Environment variables, settings]
```

---

*Add architecture decisions and patterns below*
