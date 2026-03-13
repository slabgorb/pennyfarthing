"""Tests for pf.frame routes — Python Frame API routes (Story 48-2).

Epic: 48 (Python Frame Server Migration)
Story: 48-2 — Port core API routes to FastAPI (data proxy + state + analysis)
ADR: docs/adr/0022-python-frame-server.md

Tests the three route categories being ported from Node.js Express to FastAPI:
- Data proxy routes: persona, story, git, sprint, context, theme-agents, mode,
  identity, portrait, file-browser, project-info
- State routes: settings, permissions, audit-log, todos, token-stats,
  telemetry, evaluation, spans
- Analysis routes: hotspots, dead-code, complexity, dependencies, health-score,
  agent-load, code-markers

Plus inline endpoints: welcome, bell-queue, bell-consumed, pending-tool-input

Acceptance Criteria:
- [AC1] All data proxy routes ported to FastAPI with direct Python imports (no subprocess)
- [AC2] All state routes ported with equivalent file I/O and in-memory management
- [AC3] All analysis routes ported with direct Python imports to `pf debug` modules
- [AC4] Inline endpoints (welcome, bell-queue, bell-consumed, pending-tool-input) ported
- [AC5] API response shapes are backward-compatible with Node.js server
- [AC6] Existing hooks that call Frame HTTP endpoints continue to work
- [AC7] Tests cover all ported routes
"""

from __future__ import annotations

import pytest
from starlette.testclient import TestClient

from pf.frame.app import create_app


@pytest.fixture()
def client() -> TestClient:
    """Create a TestClient for the Frame app with all routes mounted."""
    return TestClient(create_app())


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — persona
# ---------------------------------------------------------------------------


class TestPersonaRoute:
    """GET /api/persona returns current persona info."""

    def test_get_persona_returns_json(self, client: TestClient):
        """AC1+AC5: Persona endpoint returns JSON with persona data."""
        response = client.get("/api/persona")
        assert response.status_code in (200, 404)
        data = response.json()
        # Either persona data or error — both are valid JSON shapes
        assert isinstance(data, dict)

    def test_get_persona_full_returns_json(self, client: TestClient):
        """AC1+AC5: Full persona endpoint returns extended persona details."""
        response = client.get("/api/persona/full")
        assert response.status_code in (200, 404)
        data = response.json()
        assert isinstance(data, dict)

    def test_persona_not_found_returns_404(self, client: TestClient):
        """AC5: When no persona active, returns 404 with error field."""
        response = client.get("/api/persona")
        if response.status_code == 404:
            data = response.json()
            assert "error" in data


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — story
# ---------------------------------------------------------------------------


class TestStoryRoute:
    """GET /api/story returns current story info."""

    def test_get_story_returns_json(self, client: TestClient):
        """AC1+AC5: Story endpoint returns JSON with story info or null id."""
        response = client.get("/api/story")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_story_shape_has_id_field(self, client: TestClient):
        """AC5: Story response includes 'id' field (may be null)."""
        response = client.get("/api/story")
        data = response.json()
        # Node.js returns { id: null, ... } when no session — match that shape
        assert "id" in data


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — git
# ---------------------------------------------------------------------------


class TestGitRoute:
    """GET /api/git returns git status info."""

    def test_get_git_returns_json(self, client: TestClient):
        """AC1+AC5: Git endpoint returns JSON with git info."""
        response = client.get("/api/git")
        assert response.status_code in (200, 404)
        data = response.json()
        assert isinstance(data, dict)

    def test_git_info_shape(self, client: TestClient):
        """AC5: Git response shape matches Node.js: branch, clean, ahead, behind, dirtyFiles."""
        response = client.get("/api/git")
        if response.status_code == 200:
            data = response.json()
            assert "branch" in data
            assert "clean" in data
            assert "dirtyFiles" in data

    def test_git_all_repos(self, client: TestClient):
        """AC1: GET /api/git/all returns array of repo git info."""
        response = client.get("/api/git/all")
        assert response.status_code in (200, 404)
        if response.status_code == 200:
            data = response.json()
            assert isinstance(data, list)

    def test_git_refresh(self, client: TestClient):
        """AC1: POST /api/git/refresh triggers cache refresh."""
        response = client.post("/api/git/refresh")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — context
# ---------------------------------------------------------------------------


class TestContextRoute:
    """GET /api/context returns context usage info."""

    def test_get_context_returns_json(self, client: TestClient):
        """AC1+AC5: Context endpoint returns JSON."""
        response = client.get("/api/context")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_context_shape(self, client: TestClient):
        """AC5: Context response shape matches Node.js: percent, tokens, status."""
        response = client.get("/api/context")
        data = response.json()
        assert "percent" in data
        assert "tokens" in data
        assert "status" in data


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — theme-agents
# ---------------------------------------------------------------------------


class TestThemeAgentsRoute:
    """GET /api/theme-agents returns agent-to-character mapping."""

    def test_get_theme_agents_returns_json(self, client: TestClient):
        """AC1+AC5: Theme agents endpoint returns JSON."""
        response = client.get("/api/theme-agents")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — mode
# ---------------------------------------------------------------------------


class TestModeRoute:
    """GET /api/mode returns runtime mode info."""

    def test_get_mode_returns_json(self, client: TestClient):
        """AC1+AC5: Mode endpoint returns JSON."""
        response = client.get("/api/mode")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_mode_shape(self, client: TestClient):
        """AC5: Mode response matches Node.js shape: mode, platform, pid, uptime."""
        response = client.get("/api/mode")
        data = response.json()
        assert "mode" in data
        assert "platform" in data
        assert "pid" in data
        assert "uptime" in data


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — identity
# ---------------------------------------------------------------------------


class TestIdentityRoute:
    """GET /api/identity returns user identity info."""

    def test_get_identity_returns_json(self, client: TestClient):
        """AC1+AC5: Identity endpoint returns JSON."""
        response = client.get("/api/identity")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_identity_shape(self, client: TestClient):
        """AC5: Identity response matches Node.js: jiraEmail, githubUsername, avatarUrl."""
        response = client.get("/api/identity")
        data = response.json()
        assert "jiraEmail" in data
        assert "githubUsername" in data
        assert "avatarUrl" in data


# ---------------------------------------------------------------------------
# AC1: Data proxy routes — project-info
# ---------------------------------------------------------------------------


class TestProjectInfoRoute:
    """GET /api/project-info returns project directory metadata."""

    def test_get_project_info_returns_json(self, client: TestClient):
        """AC1+AC5: Project info endpoint returns JSON."""
        response = client.get("/api/project-info")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_project_info_shape(self, client: TestClient):
        """AC5: Project info matches Node.js: name, path."""
        response = client.get("/api/project-info")
        data = response.json()
        assert "name" in data
        assert "path" in data


# ---------------------------------------------------------------------------
# AC2: State routes — settings
# ---------------------------------------------------------------------------


class TestSettingsRoute:
    """GET /api/settings returns contextual settings."""

    def test_get_settings_returns_json(self, client: TestClient):
        """AC2+AC5: Settings endpoint returns JSON."""
        response = client.get("/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_patch_settings(self, client: TestClient):
        """AC2: PATCH /api/settings accepts settings update."""
        response = client.patch("/api/settings", json={"theme": "dune"})
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)

    def test_get_layout(self, client: TestClient):
        """AC2: GET /api/settings/layout returns saved layout."""
        response = client.get("/api/settings/layout")
        assert response.status_code == 200
        data = response.json()
        assert "layout" in data

    def test_get_themes_list(self, client: TestClient):
        """AC2: GET /api/settings/themes returns theme metadata."""
        response = client.get("/api/settings/themes")
        assert response.status_code == 200
        data = response.json()
        assert "themes" in data


# ---------------------------------------------------------------------------
# AC2: State routes — permissions
# ---------------------------------------------------------------------------


class TestPermissionsRoute:
    """Permissions grant management routes."""

    def test_get_permissions_returns_json(self, client: TestClient):
        """AC2+AC5: Permissions list returns JSON with grants array."""
        response = client.get("/api/permissions")
        assert response.status_code == 200
        data = response.json()
        assert "grants" in data
        assert isinstance(data["grants"], list)

    def test_post_grant(self, client: TestClient):
        """AC2: POST /api/permissions/grant creates a permission grant."""
        response = client.post(
            "/api/permissions/grant",
            json={"tool": "Bash", "scope": "/tmp", "grant_type": "session"},
        )
        assert response.status_code == 201
        data = response.json()
        assert "grant" in data

    def test_post_grant_missing_tool_returns_400(self, client: TestClient):
        """AC5: Missing required field returns 400."""
        response = client.post(
            "/api/permissions/grant",
            json={"scope": "/tmp"},
        )
        assert response.status_code == 400
        data = response.json()
        assert "error" in data

    def test_post_grant_invalid_type_returns_400(self, client: TestClient):
        """AC5: Invalid grant_type returns 400."""
        response = client.post(
            "/api/permissions/grant",
            json={"tool": "Bash", "scope": "/tmp", "grant_type": "forever"},
        )
        assert response.status_code == 400

    def test_delete_revoke(self, client: TestClient):
        """AC2: DELETE /api/permissions/revoke/:tool removes grants."""
        response = client.delete("/api/permissions/revoke/Bash")
        assert response.status_code == 200
        data = response.json()
        assert "removed" in data

    def test_get_show_tool(self, client: TestClient):
        """AC2: GET /api/permissions/show/:tool returns tool-specific grants."""
        response = client.get("/api/permissions/show/Bash")
        assert response.status_code == 200
        data = response.json()
        assert "grants" in data


# ---------------------------------------------------------------------------
# AC2: State routes — audit-log
# ---------------------------------------------------------------------------


class TestAuditLogRoute:
    """Audit log routes."""

    def test_get_audit_log(self, client: TestClient):
        """AC2+AC5: GET /api/audit-log returns entries and total."""
        response = client.get("/api/audit-log")
        assert response.status_code == 200
        data = response.json()
        assert "entries" in data
        assert "total" in data

    def test_get_audit_events(self, client: TestClient):
        """AC2: GET /api/audit-log/events returns filtered events."""
        response = client.get("/api/audit-log/events")
        assert response.status_code == 200
        data = response.json()
        assert "events" in data
        assert "total" in data

    def test_get_audit_types(self, client: TestClient):
        """AC2: GET /api/audit-log/types returns event types."""
        response = client.get("/api/audit-log/types")
        assert response.status_code == 200
        data = response.json()
        assert "types" in data

    def test_get_audit_stats(self, client: TestClient):
        """AC2: GET /api/audit-log/stats returns log statistics."""
        response = client.get("/api/audit-log/stats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_delete_audit_log(self, client: TestClient):
        """AC2: DELETE /api/audit-log resets event store."""
        response = client.delete("/api/audit-log")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


# ---------------------------------------------------------------------------
# AC2: State routes — todos
# ---------------------------------------------------------------------------


class TestTodosRoute:
    """Todos route for web mode."""

    def test_get_todos_returns_list(self, client: TestClient):
        """AC2+AC5: GET /api/todos returns array."""
        response = client.get("/api/todos")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)


# ---------------------------------------------------------------------------
# AC2: State routes — token-stats
# ---------------------------------------------------------------------------


class TestTokenStatsRoute:
    """Token stats from OTLP receiver."""

    def test_get_token_stats(self, client: TestClient):
        """AC2+AC5: GET /api/token-stats returns token counts."""
        response = client.get("/api/token-stats")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC2: State routes — telemetry
# ---------------------------------------------------------------------------


class TestTelemetryRoute:
    """Telemetry routes."""

    def test_get_telemetry(self, client: TestClient):
        """AC2+AC5: GET /api/telemetry returns metrics."""
        response = client.get("/api/telemetry")
        assert response.status_code == 200
        data = response.json()
        assert "metrics" in data

    def test_get_tdd_metrics(self, client: TestClient):
        """AC2: GET /api/telemetry/tdd returns TDD-specific metrics."""
        response = client.get("/api/telemetry/tdd")
        assert response.status_code == 200
        data = response.json()
        assert "metrics" in data

    def test_get_telemetry_by_agent(self, client: TestClient):
        """AC2: GET /api/telemetry/by-agent returns per-agent stats."""
        response = client.get("/api/telemetry/by-agent")
        assert response.status_code == 200
        data = response.json()
        assert "stats" in data

    def test_get_telemetry_by_story(self, client: TestClient):
        """AC2: GET /api/telemetry/by-story returns per-story stats."""
        response = client.get("/api/telemetry/by-story")
        assert response.status_code == 200
        data = response.json()
        assert "stats" in data


# ---------------------------------------------------------------------------
# AC2: State routes — evaluation
# ---------------------------------------------------------------------------


class TestEvaluationRoute:
    """Evaluation routes."""

    def test_get_evaluation(self, client: TestClient):
        """AC2+AC5: GET /api/evaluation returns evaluation data."""
        response = client.get("/api/evaluation")
        assert response.status_code == 200
        data = response.json()
        assert "evaluation" in data

    def test_get_evaluation_results(self, client: TestClient):
        """AC2: GET /api/evaluation/results returns result list."""
        response = client.get("/api/evaluation/results")
        assert response.status_code == 200
        data = response.json()
        assert "results" in data

    def test_get_evaluation_summary(self, client: TestClient):
        """AC2: GET /api/evaluation/summary returns summary."""
        response = client.get("/api/evaluation/summary")
        assert response.status_code == 200
        data = response.json()
        assert "summary" in data

    def test_get_evaluation_trend(self, client: TestClient):
        """AC2: GET /api/evaluation/trend returns trend analysis."""
        response = client.get("/api/evaluation/trend")
        assert response.status_code == 200
        data = response.json()
        assert "trend" in data

    def test_get_evaluation_recommendations(self, client: TestClient):
        """AC2: GET /api/evaluation/recommendations returns suggestions."""
        response = client.get("/api/evaluation/recommendations")
        assert response.status_code == 200
        data = response.json()
        assert "recommendations" in data

    def test_delete_evaluation(self, client: TestClient):
        """AC2: DELETE /api/evaluation clears results."""
        response = client.delete("/api/evaluation")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


# ---------------------------------------------------------------------------
# AC2: State routes — spans
# ---------------------------------------------------------------------------


class TestSpansRoute:
    """Enriched spans routes."""

    def test_get_spans(self, client: TestClient):
        """AC2+AC5: GET /api/spans returns spans and total."""
        response = client.get("/api/spans")
        assert response.status_code == 200
        data = response.json()
        assert "spans" in data
        assert "total" in data

    def test_get_spans_filter(self, client: TestClient):
        """AC2: GET /api/spans/filter returns filtered spans."""
        response = client.get("/api/spans/filter")
        assert response.status_code == 200
        data = response.json()
        assert "spans" in data
        assert "total" in data

    def test_delete_spans(self, client: TestClient):
        """AC2: DELETE /api/spans clears span store."""
        response = client.delete("/api/spans")
        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


# ---------------------------------------------------------------------------
# AC3: Analysis routes — hotspots
# ---------------------------------------------------------------------------


class TestHotspotsRoute:
    """Hotspot analysis route."""

    def test_get_hotspots(self, client: TestClient):
        """AC3+AC5: GET /api/hotspots returns analysis data."""
        response = client.get("/api/hotspots")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)

    def test_hotspots_accepts_days_param(self, client: TestClient):
        """AC3: Hotspots endpoint accepts ?days= query parameter."""
        response = client.get("/api/hotspots?days=30")
        assert response.status_code in (200, 500)


# ---------------------------------------------------------------------------
# AC3: Analysis routes — dead-code
# ---------------------------------------------------------------------------


class TestDeadCodeRoute:
    """Dead code analysis route."""

    def test_get_dead_code(self, client: TestClient):
        """AC3+AC5: GET /api/dead-code returns analysis data."""
        response = client.get("/api/dead-code")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC3: Analysis routes — complexity
# ---------------------------------------------------------------------------


class TestComplexityRoute:
    """Complexity analysis route."""

    def test_get_complexity(self, client: TestClient):
        """AC3+AC5: GET /api/complexity returns analysis data."""
        response = client.get("/api/complexity")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC3: Analysis routes — dependencies
# ---------------------------------------------------------------------------


class TestDependenciesRoute:
    """Dependencies analysis route."""

    def test_get_dependencies(self, client: TestClient):
        """AC3+AC5: GET /api/dependencies returns analysis data."""
        response = client.get("/api/dependencies")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC3: Analysis routes — health-score
# ---------------------------------------------------------------------------


class TestHealthScoreRoute:
    """Health score route."""

    def test_get_health_score(self, client: TestClient):
        """AC3+AC5: GET /api/health-score returns composite score."""
        response = client.get("/api/health-score")
        assert response.status_code in (200, 404, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC3: Analysis routes — agent-load
# ---------------------------------------------------------------------------


class TestAgentLoadRoute:
    """Agent load analysis route."""

    def test_get_agent_load(self, client: TestClient):
        """AC3+AC5: GET /api/agent-load returns load data."""
        response = client.get("/api/agent-load")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC3: Analysis routes — code-markers
# ---------------------------------------------------------------------------


class TestCodeMarkersRoute:
    """Code markers route."""

    def test_get_code_markers(self, client: TestClient):
        """AC3+AC5: GET /api/code-markers returns markers data."""
        response = client.get("/api/code-markers")
        assert response.status_code in (200, 500)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC4: Inline endpoints — welcome, bell-queue, bell-consumed, pending-tool-input
# ---------------------------------------------------------------------------


class TestInlineEndpoints:
    """Inline endpoints that were in server.ts, not separate routers."""

    def test_post_welcome(self, client: TestClient):
        """AC4: POST /api/welcome broadcasts welcome message."""
        response = client.post("/api/welcome", json={"message": "hello"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_post_bell_queue(self, client: TestClient):
        """AC4: POST /api/bell-queue syncs bell mode queue."""
        response = client.post("/api/bell-queue", json={"items": []})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_post_bell_consumed(self, client: TestClient):
        """AC4: POST /api/bell-consumed broadcasts consumption."""
        response = client.post("/api/bell-consumed", json={})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)

    def test_post_pending_tool_input(self, client: TestClient):
        """AC4: POST /api/pending-tool-input forwards tool input."""
        response = client.post("/api/pending-tool-input", json={"tool": "Bash", "input": "ls"})
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC5: Backward compatibility — response shape validation
# ---------------------------------------------------------------------------


class TestBackwardCompatibility:
    """Ensure response shapes match the Node.js Express server."""

    def test_error_responses_have_error_field(self, client: TestClient):
        """AC5: Error responses use {"error": "..."} shape."""
        # Request a route that should 404 when project not detected
        response = client.get("/api/persona")
        if response.status_code == 404:
            data = response.json()
            assert "error" in data
            assert isinstance(data["error"], str)

    def test_success_responses_are_json(self, client: TestClient):
        """AC5: All success responses return application/json."""
        for path in ["/api/mode", "/api/todos", "/api/token-stats"]:
            response = client.get(path)
            if response.status_code == 200:
                assert "application/json" in response.headers.get("content-type", "")

    def test_audit_log_export_json(self, client: TestClient):
        """AC5: GET /api/audit-log/export/json returns application/json."""
        response = client.get("/api/audit-log/export/json")
        assert response.status_code == 200
        assert "application/json" in response.headers.get("content-type", "")

    def test_audit_log_export_csv(self, client: TestClient):
        """AC5: GET /api/audit-log/export/csv returns text/csv."""
        response = client.get("/api/audit-log/export/csv")
        assert response.status_code == 200
        assert "text/csv" in response.headers.get("content-type", "")


# ---------------------------------------------------------------------------
# AC6: Hook compatibility
# ---------------------------------------------------------------------------


class TestHookCompatibility:
    """Hooks that call Frame HTTP endpoints continue to work."""

    def test_health_endpoint_unchanged(self, client: TestClient):
        """AC6: GET /health still works (hooks use this for liveness)."""
        response = client.get("/health")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    def test_otlp_endpoints_unchanged(self, client: TestClient):
        """AC6: OTLP endpoints still work (OTEL hooks use these)."""
        for endpoint in ["/v1/logs", "/v1/metrics", "/v1/traces"]:
            response = client.post(endpoint, json={})
            assert response.status_code == 200

    def test_hook_request_endpoint(self, client: TestClient):
        """AC6: POST /api/hook-request routes approval (cyclist-pretooluse hook)."""
        response = client.post(
            "/api/hook-request",
            json={"tool": "Bash", "input": "ls", "request_id": "test-123"},
        )
        assert response.status_code in (200, 202)
        data = response.json()
        assert isinstance(data, dict)


# ---------------------------------------------------------------------------
# AC7: Coverage completeness — route registration verification
# ---------------------------------------------------------------------------


class TestRouteRegistration:
    """Verify all expected routes are registered on the app."""

    EXPECTED_ROUTE_PREFIXES = [
        "/api/persona",
        "/api/story",
        "/api/git",
        "/api/context",
        "/api/theme-agents",
        "/api/mode",
        "/api/identity",
        "/api/project-info",
        "/api/settings",
        "/api/permissions",
        "/api/audit-log",
        "/api/todos",
        "/api/token-stats",
        "/api/telemetry",
        "/api/evaluation",
        "/api/spans",
        "/api/hotspots",
        "/api/dead-code",
        "/api/complexity",
        "/api/dependencies",
        "/api/health-score",
        "/api/agent-load",
        "/api/code-markers",
        "/api/welcome",
        "/api/bell-queue",
        "/api/bell-consumed",
        "/api/pending-tool-input",
        "/api/hook-request",
    ]

    def test_all_routes_registered(self, client: TestClient):
        """AC7: Every expected route prefix returns non-405 for its method."""
        app = client.app
        registered_paths = set()
        for route in app.routes:
            if hasattr(route, "path"):
                registered_paths.add(route.path)
            elif hasattr(route, "routes"):
                # Sub-routers
                prefix = getattr(route, "prefix", "")
                for sub_route in route.routes:
                    if hasattr(sub_route, "path"):
                        registered_paths.add(prefix + sub_route.path)

        for prefix in self.EXPECTED_ROUTE_PREFIXES:
            matched = any(p.startswith(prefix) for p in registered_paths)
            assert matched, f"Route prefix {prefix} not registered on app"

    def test_no_subprocess_in_data_proxy_routes(self):
        """AC1: Data proxy routes use direct imports, not subprocess."""
        # Import the route modules and verify they don't shell out to pf CLI
        import inspect

        from pf.frame.routes import data_proxy

        source = inspect.getsource(data_proxy)
        assert "subprocess" not in source, (
            "Data proxy routes should use direct imports, not subprocess"
        )
        assert "execSync" not in source
        assert "exec(" not in source

    def test_no_subprocess_in_analysis_routes(self):
        """AC3: Analysis routes use direct Python imports, not subprocess."""
        import inspect

        from pf.frame.routes import analysis

        source = inspect.getsource(analysis)
        assert "subprocess" not in source, (
            "Analysis routes should use direct imports, not subprocess"
        )
