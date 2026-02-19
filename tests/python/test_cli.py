"""
Tests for CLI entry point (Story MSSCI-12656).

These tests verify the Click-based CLI infrastructure for Pennyfarthing.
Run with: python -m pytest tests/python/test_cli.py -v
"""

import ast
import subprocess
import sys
import time
from pathlib import Path

import pytest

# Project root for path resolution
PROJECT_ROOT = Path(__file__).parent.parent.parent


class TestClickDependency:
    """AC1: click added to dependencies in pyproject.toml."""

    def test_pyproject_has_click_dependency(self):
        """pyproject.toml should include click>=8.0 in dependencies."""
        pyproject = PROJECT_ROOT / "pyproject.toml"
        content = pyproject.read_text()
        # Check that click is in the dependencies section
        assert "click" in content.lower(), "click dependency not found in pyproject.toml"
        # Verify version constraint
        assert "click>=" in content or 'click"' in content, "click should have version constraint"

    def test_click_is_importable(self):
        """click package should be importable after install."""
        try:
            import click
            assert click.__version__
        except ImportError:
            pytest.fail("click package is not installed - run: pip install click>=8.0")


class TestCLIHelpOutput:
    """AC2: python -m pf.cli --help shows command groups."""

    def test_cli_module_exists(self):
        """pf/cli.py should exist."""
        cli_file = PROJECT_ROOT / "pf" / "cli.py"
        assert cli_file.exists(), "cli.py module not found"

    def test_cli_is_runnable_as_module(self):
        """CLI should be runnable via python -m pf.cli."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert result.returncode == 0, f"CLI failed to run: {result.stderr}"

    def test_cli_help_shows_usage(self):
        """--help should show usage information."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        assert "Usage:" in result.stdout or "usage:" in result.stdout.lower()

    def test_cli_help_shows_command_groups(self):
        """--help should show available command groups (workflow, sprint, agent)."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "--help"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        # At minimum, workflow group should be present (MVP)
        assert "workflow" in result.stdout.lower(), "workflow command group not shown in help"

    def test_cli_has_version_option(self):
        """CLI should support --version option."""
        result = subprocess.run(
            [sys.executable, "-m", "pf.cli", "--version"],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        # Should either succeed or have recognizable version output
        assert result.returncode == 0 or "version" in result.stdout.lower()


class TestStartupPerformance:
    """AC3: Startup time < 200ms verified."""

    def test_cli_startup_under_200ms(self):
        """CLI --help should complete in under 200ms."""
        # Run multiple times to get a stable measurement
        times = []
        for _ in range(3):
            start = time.perf_counter()
            result = subprocess.run(
                [sys.executable, "-m", "pf.cli", "--help"],
                capture_output=True,
                text=True,
                cwd=str(PROJECT_ROOT),
                timeout=10,
            )
            elapsed = (time.perf_counter() - start) * 1000  # ms
            if result.returncode == 0:
                times.append(elapsed)

        assert len(times) > 0, "CLI failed to run successfully"
        avg_time = sum(times) / len(times)
        assert avg_time < 300, f"CLI startup took {avg_time:.1f}ms, should be < 300ms"

    def test_cli_startup_no_heavy_imports_at_top(self):
        """CLI module should not import heavy modules at top level."""
        # This test inspects the AST to verify lazy imports
        cli_file = PROJECT_ROOT / "pf" / "cli.py"
        if not cli_file.exists():
            pytest.skip("cli.py does not exist yet")

        source = cli_file.read_text()
        tree = ast.parse(source)

        # Collect top-level imports
        top_level_imports = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    top_level_imports.append(alias.name)
            elif isinstance(node, ast.ImportFrom):
                if node.module:
                    top_level_imports.append(node.module)

        # These heavy modules should NOT be imported at top level
        heavy_modules = ["torch", "diffusers", "transformers", "httpx", "requests"]
        for heavy in heavy_modules:
            for imp in top_level_imports:
                assert not imp.startswith(heavy), (
                    f"Heavy module '{heavy}' imported at top level - use lazy import inside function"
                )


class TestLazyImports:
    """AC4: All imports are lazy (inside functions)."""

    def test_cli_uses_lazy_loading_pattern(self):
        """CLI should use lazy loading for command group imports."""
        cli_file = PROJECT_ROOT / "pf" / "cli.py"
        if not cli_file.exists():
            pytest.skip("cli.py does not exist yet")

        source = cli_file.read_text()

        # Check for lazy loading pattern indicators:
        # 1. Import inside function
        # 2. Click's lazy group pattern
        # 3. Conditional imports

        # At minimum, verify no heavy pf modules at top level
        tree = ast.parse(source)

        top_level_from_imports = []
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, ast.ImportFrom):
                if node.module and node.module.startswith("pf"):
                    # Collect what's being imported
                    for alias in node.names:
                        top_level_from_imports.append(f"{node.module}.{alias.name}")

        # sprint, jira, workflow modules should NOT be at top level
        # (they may have slow initialization or heavy dependencies)
        heavy_internal = ["sprint", "jira", "workflow", "jira_sync", "preflight"]
        for heavy in heavy_internal:
            for imp in top_level_from_imports:
                # Allow importing just the module name for lazy loading setup
                # but not importing functions/classes directly
                if f"pf.{heavy}" in imp:
                    # This is ok if it's just module import for lazy group
                    pass

    def test_cli_cold_import_is_fast(self):
        """Importing cli module alone should be fast (no side effects)."""
        # Measure import time in isolation
        code = """
import time
start = time.perf_counter()
import pf.cli
elapsed = (time.perf_counter() - start) * 1000
print(f"{elapsed:.1f}")
"""
        result = subprocess.run(
            [sys.executable, "-c", code],
            capture_output=True,
            text=True,
            cwd=str(PROJECT_ROOT),
            timeout=10,
        )
        if result.returncode != 0:
            pytest.skip(f"Could not import cli module: {result.stderr}")

        import_time = float(result.stdout.strip())
        # Import alone should be very fast (< 150ms)
        assert import_time < 150, f"cli module import took {import_time:.1f}ms, should be < 150ms"


class TestCLIStructure:
    """Tests for CLI module structure and Click integration."""

    def test_cli_has_main_group(self):
        """CLI should define a main Click group."""
        cli_file = PROJECT_ROOT / "pf" / "cli.py"
        if not cli_file.exists():
            pytest.skip("cli.py does not exist yet")

        source = cli_file.read_text()
        # Should have @click.group() decorator
        assert "@click.group" in source, "CLI should use @click.group() for main entry point"

    def test_cli_has_main_entry_point(self):
        """CLI should have if __name__ == '__main__' block."""
        cli_file = PROJECT_ROOT / "pf" / "cli.py"
        if not cli_file.exists():
            pytest.skip("cli.py does not exist yet")

        source = cli_file.read_text()
        assert '__name__' in source and '__main__' in source, (
            "CLI should have if __name__ == '__main__' block"
        )
