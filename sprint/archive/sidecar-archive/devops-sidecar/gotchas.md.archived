# DevOps Agent Gotchas

> Common mistakes and pitfalls in infrastructure and deployment

## CI/CD Pipeline Gotchas

### Tests Pass Locally, Fail in CI
**Common causes:**
- Different environment variables
- Missing dependencies
- Path differences
- Timezone issues
- Parallel test interference

### Long Pipeline Times
**Problem:** Feedback loop too slow
**Solutions:**
- Parallelize independent stages
- Cache dependencies
- Use faster machines for tests
- Split into fast/slow test suites

### Flaky CI
**Problem:** Random failures erode trust
**Solution:** Quarantine flaky tests, fix root causes

## Container Gotchas

### Running as Root
**Problem:** Container processes run as root
```dockerfile
# WRONG
CMD ["./app"]

# RIGHT
USER nonroot
CMD ["./app"]
```

### Large Images
**Problem:** Slow pulls, wasted storage
**Solutions:**
- Multi-stage builds
- Use alpine/distroless bases
- Remove build tools from final image

### Missing Health Checks
**Problem:** Orchestrator can't detect unhealthy containers
```dockerfile
HEALTHCHECK --interval=30s --timeout=3s \
  CMD curl -f http://localhost:8080/healthz || exit 1
```

### Secrets in Images
**Problem:** Credentials baked into image
**Solution:** Use runtime secrets, environment variables

## Deployment Gotchas

### No Rollback Plan
**Problem:** Bad deploy with no way back
**Solution:** Always have rollback procedure documented and tested

### Big Bang Deploys
**Problem:** Deploying everything at once
**Solution:** Use rolling deploys, canary releases

### Missing Health Checks
**Problem:** Bad pods receive traffic
**Solution:** Configure liveness and readiness probes

### Configuration Drift
**Problem:** Manual changes not tracked
**Solution:** Infrastructure as code, GitOps

## Monitoring Gotchas

### Alert Fatigue
**Problem:** Too many alerts, real issues missed
**Solution:** Only alert on actionable conditions

### Missing Dashboards
**Problem:** Can't see system state at a glance
**Solution:** Create dashboards for key metrics

### No Log Aggregation
**Problem:** Logs scattered across systems
**Solution:** Centralize logs (ELK, CloudWatch, etc.)

### Missing Correlation IDs
**Problem:** Can't trace requests across services
**Solution:** Pass request ID through all services

## Infrastructure as Code Gotchas

### Manual Changes
**Problem:** Changes made outside IaC
**Solution:** Require all changes through IaC, detect drift

### Missing State Locking
**Problem:** Concurrent applies corrupt state
**Solution:** Use remote state with locking

### Hardcoded Values
**Problem:** Environment-specific values in code
**Solution:** Use variables, workspaces

### No Plan Before Apply
**Problem:** Unexpected changes applied
**Solution:** Always review plan output

## Security Gotchas

### Overly Permissive IAM
**Problem:** Services have more access than needed
**Solution:** Principle of least privilege

### Unencrypted Data
**Problem:** Sensitive data in transit/at rest
**Solution:** TLS everywhere, encrypted storage

### Public S3 Buckets
**Problem:** Data accidentally exposed
**Solution:** Default to private, audit regularly

### Missing Network Segmentation
**Problem:** Flat network, lateral movement easy
**Solution:** Network policies, security groups

## Disaster Recovery Gotchas

### Untested Backups
**Problem:** Backups exist but restore never tested
**Solution:** Regular restore tests

### Missing Documentation
**Problem:** Recovery procedures not documented
**Solution:** Runbooks for all failure scenarios

### Single Point of Failure
**Problem:** One component failure breaks everything
**Solution:** Redundancy at every layer

---

*Add infrastructure gotchas and runbooks below*
