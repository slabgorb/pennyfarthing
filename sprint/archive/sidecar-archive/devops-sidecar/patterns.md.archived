# DevOps Agent Patterns

> Infrastructure and deployment patterns

## CI/CD Patterns

### Pipeline Structure
```yaml
stages:
  - lint        # Fast feedback
  - test        # Unit + integration
  - build       # Compile/bundle
  - deploy-dev  # Auto-deploy to dev
  - deploy-prod # Manual approval
```

### Build Principles
- Reproducible builds
- Immutable artifacts
- Version everything
- Cache dependencies

## Container Patterns

### Dockerfile Best Practices
```dockerfile
# Multi-stage build
FROM golang:1.21 AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /app/bin

FROM alpine:3.18
COPY --from=builder /app/bin /app/bin
ENTRYPOINT ["/app/bin"]
```

### Image Tagging
```
registry/app:latest      # Mutable, dev only
registry/app:v1.2.3      # Immutable release
registry/app:sha-abc123  # Commit-specific
```

## Environment Management

### Environment Variables
```bash
# Required
DATABASE_URL=postgres://...
API_KEY=...

# Optional with defaults
LOG_LEVEL=${LOG_LEVEL:-info}
PORT=${PORT:-8080}
```

### Secret Management
- Never commit secrets
- Use environment variables or secret stores
- Rotate regularly
- Audit access

## Deployment Strategies

### Rolling Deployment
- Gradual replacement
- Zero downtime
- Easy rollback
- Good for stateless services

### Blue-Green Deployment
- Two identical environments
- Instant switchover
- Full rollback capability
- Higher resource cost

## Monitoring Patterns

### Health Checks
```go
// Liveness - is the process running?
GET /healthz → 200 OK

// Readiness - can it handle traffic?
GET /readyz → 200 OK (all deps healthy)
```

### Logging Standards
```json
{
  "ts": "2024-12-22T10:00:00Z",
  "level": "info",
  "msg": "Request processed",
  "request_id": "abc123",
  "duration_ms": 45
}
```

### Metrics
- Request rate (requests/second)
- Error rate (errors/request)
- Duration (p50, p95, p99)
- Saturation (CPU, memory, connections)

## Infrastructure as Code

### Terraform Patterns
```hcl
# Use modules for reusability
module "api" {
  source = "./modules/service"
  name   = "api"
  env    = var.environment
}

# Use workspaces for environments
# terraform workspace select prod
```

### State Management
- Remote state (S3, GCS)
- State locking
- Never edit state manually
- Backup before changes

## Disaster Recovery

### Backup Strategy
- Regular automated backups
- Test restores periodically
- Document recovery procedures
- Define RTO/RPO targets

### Runbook Format
```markdown
## [Incident Type]

### Symptoms
[How to identify this issue]

### Impact
[What is affected]

### Resolution Steps
1. [Step 1]
2. [Step 2]

### Escalation
[Who to contact if unresolved]
```

## Local Development

### Docker Compose Setup
```yaml
services:
  api:
    build: ./api
    ports: ["8080:8080"]
    environment:
      - DATABASE_URL=postgres://...
    depends_on: [db]

  db:
    image: postgres:15
    volumes: [pgdata:/var/lib/postgresql/data]
```

### Just Commands
```just
# Standard commands
test:     Run all tests
lint:     Run linters
build:    Build application
dev:      Start development server
```

## Claude Code Configuration

### Hook Path Resolution
Always use `$CLAUDE_PROJECT_DIR` for hook commands in settings.local.json:

```json
{
  "hooks": {
    "SessionStart": [{
      "hooks": [{
        "type": "command",
        "command": "\"$CLAUDE_PROJECT_DIR\"/scripts/hooks/session-start.sh"
      }]
    }]
  }
}
```

**Why:** `$CLAUDE_PROJECT_DIR` is set by Claude Code to the directory where it was started. Relative paths break when Claude runs from subdirectories.

**Anti-pattern:** Don't use `git rev-parse --show-toplevel` as fallback - returns wrong root in nested repos.

---

*Add infrastructure patterns and runbooks below*
