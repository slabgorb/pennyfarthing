# Architect Agent Gotchas

> Common mistakes and pitfalls in system design

## Design Decision Pitfalls

### Premature Optimization
**Problem:** Optimizing before measuring
**Solution:** Prove there's a problem before solving it

### Over-Engineering
**Problem:** Building for hypothetical future requirements
**Warning signs:**
- "We might need this later"
- Abstractions with one implementation
- Configuration for things that never change

### Under-Engineering
**Problem:** Quick hacks that become permanent
**Solution:** Document tech debt, plan for remediation

## API Design Gotchas

### Breaking Changes Without Versioning
**Problem:** Changing API contract unexpectedly
**Solution:** Version APIs, maintain backward compatibility

### Inconsistent Naming
**Problem:** Mixed conventions across endpoints
```
# INCONSISTENT
GET /users          # plural
GET /order/:id      # singular
POST /create-item   # verb in URL

# CONSISTENT
GET /users
GET /orders/:id
POST /items
```

### Missing Pagination
**Problem:** Returning unbounded result sets
**Solution:** Always paginate list endpoints

### Leaking Internal Details
**Problem:** Exposing database IDs, internal errors
**Solution:** Use public identifiers, sanitize error messages

## Database Design Gotchas

### Missing Indexes
**Problem:** Slow queries on frequently filtered columns
**Solution:** Add indexes for WHERE, JOIN, ORDER BY columns

### N+1 Query Pattern
**Problem:** Fetching related data in loops
**Solution:** Use JOINs or batch fetching

### No Migration Strategy
**Problem:** Schema changes break running systems
**Solution:** Use forward-only migrations, test rollback

### Storing Derived Data
**Problem:** Storing calculated values that can become stale
**Solution:** Calculate on read or use materialized views with refresh

## Architecture Pattern Gotchas

### Distributed Monolith
**Problem:** Microservices that must deploy together
**Solution:** If they can't deploy independently, merge them

### Shared Database Anti-Pattern
**Problem:** Multiple services sharing tables
**Solution:** Each service owns its data, communicate via APIs

### Circular Dependencies
**Problem:** A depends on B depends on A
**Solution:** Extract shared logic, use dependency inversion

### Missing Error Boundaries
**Problem:** One component failure cascades everywhere
**Solution:** Circuit breakers, graceful degradation

## Documentation Gotchas

### No ADR for Major Decisions
**Problem:** Decisions made without recording rationale
**Solution:** Write ADR for any significant choice

### Outdated Documentation
**Problem:** Docs don't match implementation
**Solution:** Update docs with code changes, automate when possible

### Missing Integration Points
**Problem:** Undocumented service dependencies
**Solution:** Document all external dependencies and contracts

## Performance Gotchas

### Synchronous External Calls
**Problem:** Blocking on slow external services
**Solution:** Use async patterns, timeouts, circuit breakers

### Missing Caching
**Problem:** Repeatedly computing/fetching same data
**Solution:** Cache at appropriate levels with clear invalidation

### Unbounded Queues
**Problem:** Queues grow without limit under load
**Solution:** Add backpressure, limits, monitoring

## Security Design Gotchas

### Trust Boundary Violations
**Problem:** Trusting data from untrusted sources
**Solution:** Validate at every trust boundary

### Insufficient Logging
**Problem:** Can't audit security events
**Solution:** Log auth events, access attempts, changes

### Secrets in Code
**Problem:** Hardcoded credentials
**Solution:** Use secret management, environment variables

---

*Add architecture gotchas and decisions below*
