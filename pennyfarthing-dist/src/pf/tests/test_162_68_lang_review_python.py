"""Failing tests (RED) for story 162-68 — stale repos.yaml language config.

Defect: .pennyfarthing/repos.yaml declared `language: javascript` / `language: typescript`
for a Python-only framework, so resolve_lang_review_extensions() never attached python.md.

Acceptance criteria:
- Setting `languages: [python]` on a repo entry causes resolve_lang_review_extensions
  to attach "gates/lang-review/python".
- The old singular `language: javascript` form does NOT attach python.md.

Test discipline: uses tmp_path only — never reads the live orchestrator repos.yaml,
never relies on cwd or PROJECT_ROOT env var (get-project-root-env-first gotcha).
The project_root argument is always passed explicitly.
"""

from __future__ import annotations

from pathlib import Path

import yaml

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _write_repos_yaml(root: Path, repos: dict) -> None:
    """Write a repos.yaml to a tmp project root."""
    pf_dir = root / ".pennyfarthing"
    pf_dir.mkdir(parents=True, exist_ok=True)
    (pf_dir / "repos.yaml").write_text(
        yaml.dump({"repos": repos}, default_flow_style=False)
    )


def _plant_python_gate(root: Path) -> None:
    """Create a minimal lang-review/python.md gate in .pennyfarthing/gates/."""
    gate_dir = root / ".pennyfarthing" / "gates" / "lang-review"
    gate_dir.mkdir(parents=True, exist_ok=True)
    (gate_dir / "python.md").write_text(
        '<gate name="lang-review/python" model="sonnet">\n'
        "  <purpose>Python code review checklist</purpose>\n"
        "  <pass>Code follows Python best practices</pass>\n"
        "  <fail>Fix Python-specific issues</fail>\n"
        "</gate>\n"
    )


# ---------------------------------------------------------------------------
# AC1: languages: [python] causes resolver to attach python.md
# ---------------------------------------------------------------------------


class TestLangReviewPythonAttaches:
    """resolve_lang_review_extensions returns gates/lang-review/python when
    languages: [python] is set on a repo entry."""

    def test_languages_list_attaches_python_gate(self, tmp_path: Path) -> None:
        """Primary AC: languages: [python] → gates/lang-review/python returned."""
        _plant_python_gate(tmp_path)
        _write_repos_yaml(
            tmp_path,
            {
                "myrepo": {
                    "path": ".",
                    "type": "orchestrator",
                    "default_branch": "main",
                    "branch_strategy": "trunk-based",
                    "languages": ["python"],
                }
            },
        )

        from pf.handoff.gate_file import resolve_lang_review_extensions

        result = resolve_lang_review_extensions(project_root=tmp_path)

        assert result["success"], f"resolver failed: {result.get('error')}"
        assert "gates/lang-review/python" in result["data"], (
            f"expected gates/lang-review/python in {result['data']}"
        )

    def test_named_repo_with_languages_list_attaches_python(self, tmp_path: Path) -> None:
        """Explicit repo_name= lookup also works with languages list."""
        _plant_python_gate(tmp_path)
        _write_repos_yaml(
            tmp_path,
            {
                "orchestrator": {
                    "path": ".",
                    "type": "orchestrator",
                    "default_branch": "main",
                    "branch_strategy": "trunk-based",
                    "languages": ["python"],
                },
                "framework": {
                    "path": "framework",
                    "type": "framework",
                    "default_branch": "develop",
                    "branch_strategy": "gitflow",
                    "languages": ["python"],
                },
            },
        )

        from pf.handoff.gate_file import resolve_lang_review_extensions

        result = resolve_lang_review_extensions(
            repo_name="orchestrator", project_root=tmp_path
        )

        assert result["success"], f"resolver failed: {result.get('error')}"
        assert "gates/lang-review/python" in result["data"], (
            f"expected gates/lang-review/python in {result['data']}"
        )

    def test_both_repos_python_deduped(self, tmp_path: Path) -> None:
        """Two repos with languages: [python] produce a single python gate (set dedup)."""
        _plant_python_gate(tmp_path)
        _write_repos_yaml(
            tmp_path,
            {
                "orchestrator": {
                    "path": ".",
                    "type": "orchestrator",
                    "default_branch": "main",
                    "branch_strategy": "trunk-based",
                    "languages": ["python"],
                },
                "pennyfarthing": {
                    "path": "pennyfarthing",
                    "type": "framework",
                    "default_branch": "develop",
                    "branch_strategy": "gitflow",
                    "languages": ["python"],
                },
            },
        )

        from pf.handoff.gate_file import resolve_lang_review_extensions

        result = resolve_lang_review_extensions(project_root=tmp_path)

        assert result["success"], f"resolver failed: {result.get('error')}"
        python_gates = [g for g in result["data"] if "python" in g]
        assert len(python_gates) == 1, (
            f"expected exactly one python gate (dedup), got {result['data']}"
        )


# ---------------------------------------------------------------------------
# AC2: old singular `language: javascript` does NOT attach python.md
# ---------------------------------------------------------------------------


class TestStaleLanguageScalarDoesNotAttachPython:
    """Regression: the old language: javascript / language: typescript config
    must NOT cause python.md to be attached."""

    def test_language_javascript_does_not_attach_python(self, tmp_path: Path) -> None:
        """language: javascript (old stale config) must not attach python gate."""
        _plant_python_gate(tmp_path)
        _write_repos_yaml(
            tmp_path,
            {
                "myrepo": {
                    "path": ".",
                    "type": "orchestrator",
                    "default_branch": "main",
                    "branch_strategy": "trunk-based",
                    "language": "javascript",
                }
            },
        )

        from pf.handoff.gate_file import resolve_lang_review_extensions

        result = resolve_lang_review_extensions(project_root=tmp_path)

        assert result["success"], f"resolver failed: {result.get('error')}"
        assert "gates/lang-review/python" not in result["data"], (
            "javascript language must not attach python.md"
        )

    def test_language_typescript_does_not_attach_python(self, tmp_path: Path) -> None:
        """language: typescript (old stale config) must not attach python gate."""
        _plant_python_gate(tmp_path)
        _write_repos_yaml(
            tmp_path,
            {
                "myrepo": {
                    "path": ".",
                    "type": "orchestrator",
                    "default_branch": "main",
                    "branch_strategy": "trunk-based",
                    "language": "typescript",
                }
            },
        )

        from pf.handoff.gate_file import resolve_lang_review_extensions

        result = resolve_lang_review_extensions(project_root=tmp_path)

        assert result["success"], f"resolver failed: {result.get('error')}"
        assert "gates/lang-review/python" not in result["data"], (
            "typescript language must not attach python.md"
        )
