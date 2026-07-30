"""Tests for 155-11 (gh #112): sm-finish must invoke pf.* via the launcher's own
interpreter (PF_PY), never the project .venv.

The sm-finish agent template runs its Python helpers with ``source
.venv/bin/activate && python -m pf.*``. When Pennyfarthing is installed as a uv
tool, ``pf`` lives in the tool's isolated venv, not the project ``.venv`` —
every call dies with ModuleNotFoundError and the haiku subagent thrashes for
~30 tool calls retrying interpreter variations (observed live on SideQuest).

AC RECORD (the story context file defers AC definition to TEA — this docstring
is the authoritative AC record for 155-11; see Design Deviations in the session
file):

- AC1: the template derives ``PF_PY`` from the ``pf`` launcher's shebang.
  Behaviorally: every ``PF_PY=`` assignment in the template, executed with a
  fake uv-tool launcher on PATH, resolves to the launcher's shebang
  interpreter — including when the launcher's directory contains a space
  (quoting, lang-review #5) and when the CWD project has a decoy ``.venv``
  whose python cannot import pf.
- AC2: every pf.* invocation site goes through ``"$PF_PY"``: no ``source
  .venv/bin/activate`` in any bash fence, no bare ``python``/``python3``
  executing pf.* code.
- AC3: every bash fence that executes pf.* code is self-contained — it derives
  ``PF_PY`` inside the same fence (subagents may run fences independently).
- AC4: the derived interpreter imports all four pf modules the template uses
  (``pf.common.pr_config``, ``pf.findings.summary``, ``pf.git.repos``,
  ``pf.preflight``), from a project whose ``.venv`` does NOT contain pf.
- AC5: projects where pf IS pip-installed into the project ``.venv`` keep
  working. Covered implicitly: AC1 proves the derivation never consults the
  CWD/``.venv`` at all (decoy present, result unaffected), so the resolution
  is independent of project-venv contents in both directions. No dedicated
  test — logged as a Design Deviation.

Story: 155-11 (epic 155, Finish/merge/archive truthfulness)
"""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import pytest

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

# src/pf/tests -> src/pf -> src -> pennyfarthing-dist
DIST_DIR = Path(__file__).resolve().parents[3]
TEMPLATE = DIST_DIR / "agents" / "sm-finish.md"

# The four modules sm-finish.md executes (gh #112).
TEMPLATE_MODULES = "pf.common.pr_config, pf.findings.summary, pf.git.repos, pf.preflight"

BASH_FENCE_RE = re.compile(r"```bash\n(.*?)```", re.DOTALL)
PF_PY_ASSIGN_RE = re.compile(r"^\s*(?:export\s+)?PF_PY=.+$", re.MULTILINE)
# A bare python/python3 running a module or inline code (not "$PF_PY" ...).
BARE_PYTHON_EXEC_RE = re.compile(r'(?<![\w/"$-])python3?\s+-[mc]\b')
# A line that executes pf code: `-m pf.<module>` or an inline `-c` payload.
PF_EXEC_LINE_RE = re.compile(r"-m pf\.|(?<![\w-])-c\b")


def _template_text() -> str:
    return TEMPLATE.read_text(encoding="utf-8")


def _bash_fences() -> list[str]:
    return BASH_FENCE_RE.findall(_template_text())


def _pf_exec_fences() -> list[str]:
    """Fences that execute pf.* Python code (module run or inline import)."""
    return [f for f in _bash_fences() if "-m pf." in f or "from pf." in f]


def _preview(fence: str) -> str:
    return fence.strip().splitlines()[0][:80]


# ---------------------------------------------------------------------------
# Behavioral fixtures: fake uv-tool launcher + decoy project .venv
# ---------------------------------------------------------------------------


def _make_fake_env(tmp_path: Path) -> tuple[Path, Path]:
    """Return (bin_dir, project_dir).

    bin_dir holds a fake ``pf`` launcher whose shebang is this test run's real
    interpreter (uv-tool style: absolute path into the tool's own venv). The
    directory name contains a space so an unquoted ``$(command -v pf)`` breaks
    (lang-review #5). project_dir has a decoy ``.venv`` whose python always
    fails with ModuleNotFoundError — the SideQuest scenario from gh #112.
    """
    bin_dir = tmp_path / "tool bin"
    bin_dir.mkdir()
    launcher = bin_dir / "pf"
    launcher.write_text(f"#!{sys.executable}\n# fake uv-tool pf launcher\n", encoding="utf-8")
    launcher.chmod(0o755)

    proj = tmp_path / "proj"
    venv_bin = proj / ".venv" / "bin"
    venv_bin.mkdir(parents=True)
    for name in ("python", "python3"):
        stub = venv_bin / name
        stub.write_text(
            "#!/bin/sh\n"
            "echo 'ModuleNotFoundError: No module named pf' >&2\n"
            "exit 1\n",
            encoding="utf-8",
        )
        stub.chmod(0o755)
    activate = venv_bin / "activate"
    activate.write_text(f'export PATH="{venv_bin}:$PATH"\n', encoding="utf-8")

    return bin_dir, proj


def _derive_pf_py(assignment: str, bin_dir: Path, proj: Path) -> str:
    """Execute one PF_PY= assignment line from the template in a clean bash."""
    result = subprocess.run(
        ["bash", "-c", f'{assignment}\nprintf "%s" "$PF_PY"'],
        capture_output=True,
        text=True,
        cwd=proj,
        env={"PATH": f"{bin_dir}:/usr/bin:/bin", "HOME": str(proj)},
        check=False,
    )
    assert result.returncode == 0, (
        f"PF_PY derivation failed (rc={result.returncode}): {assignment!r}\n"
        f"stderr: {result.stderr}"
    )
    return result.stdout.strip()


def _assignment_lines() -> list[str]:
    """All unique PF_PY= assignment lines in the template, order-preserved."""
    seen: dict[str, None] = {}
    for line in PF_PY_ASSIGN_RE.findall(_template_text()):
        seen.setdefault(line.strip())
    return list(seen)


# ---------------------------------------------------------------------------
# AC2: no project-venv activation, no bare python running pf code
# ---------------------------------------------------------------------------


class TestNoProjectVenvInvocation:
    def test_no_project_venv_activation_in_fences(self):
        """No bash fence sources the project .venv (gh #112 root cause)."""
        offenders = [
            _preview(f) for f in _bash_fences() if "source .venv/bin/activate" in f
        ]
        assert offenders == [], (
            "sm-finish.md still activates the project .venv before pf.* calls "
            f"(ModuleNotFoundError on uv-tool installs, gh #112): {offenders}"
        )

    def test_no_bare_python_runs_pf_code(self):
        """pf.* code is never executed by a bare python/python3 interpreter."""
        offenders = []
        for fence in _pf_exec_fences():
            for line in fence.splitlines():
                if BARE_PYTHON_EXEC_RE.search(line):
                    offenders.append(line.strip()[:80])
        assert offenders == [], (
            "sm-finish.md executes pf.* code with a bare python interpreter "
            "(resolves to the project .venv, not the pf launcher's venv): "
            f"{offenders}"
        )

    def test_pf_invocations_use_pf_py(self):
        """Every line that executes pf code routes through $PF_PY."""
        offenders = []
        for fence in _pf_exec_fences():
            for line in fence.splitlines():
                if PF_EXEC_LINE_RE.search(line) and "PF_PY" not in line:
                    offenders.append(line.strip()[:80])
        assert offenders == [], (
            f"pf.* execution lines missing $PF_PY: {offenders}"
        )


# ---------------------------------------------------------------------------
# AC3: each pf-executing fence is self-contained
# ---------------------------------------------------------------------------


class TestFenceSelfContainment:
    def test_pf_exec_fences_derive_pf_py_locally(self):
        """Each fence that executes pf.* code derives PF_PY in that fence.

        Subagents may run fences independently, so a derivation in an earlier
        fence does not carry over (AC3, gh #112 suggested fix).
        """
        fences = _pf_exec_fences()
        assert fences, "sm-finish.md no longer executes any pf.* code — scope changed?"
        offenders = [
            _preview(f) for f in fences if not PF_PY_ASSIGN_RE.search(f)
        ]
        assert offenders == [], (
            "pf-executing fences without a local PF_PY= derivation "
            f"(not self-contained): {offenders}"
        )


# ---------------------------------------------------------------------------
# AC1 + AC4: the derivation resolves the launcher shebang, ignores project venv
# ---------------------------------------------------------------------------


class TestPfPyDerivation:
    def test_derivation_resolves_launcher_shebang(self, tmp_path):
        """Every PF_PY= assignment resolves to the pf launcher's shebang
        interpreter — with a space in the launcher dir and a decoy project
        .venv in CWD."""
        assignments = _assignment_lines()
        assert assignments, (
            "sm-finish.md defines no PF_PY derivation — pf.* is still invoked "
            "via the project .venv (gh #112)"
        )
        bin_dir, proj = _make_fake_env(tmp_path)
        for assignment in assignments:
            derived = _derive_pf_py(assignment, bin_dir, proj)
            assert derived == sys.executable, (
                f"PF_PY derivation {assignment!r} resolved to {derived!r}, "
                f"expected the launcher shebang interpreter {sys.executable!r}"
            )
            assert str(proj / ".venv") not in derived, (
                f"PF_PY derivation consulted the project .venv: {derived!r}"
            )

    def test_derived_interpreter_imports_template_modules(self, tmp_path):
        """The derived interpreter imports all four pf modules the template
        uses, from a project whose .venv cannot import pf (AC4)."""
        assignments = _assignment_lines()
        assert assignments, (
            "sm-finish.md defines no PF_PY derivation — pf.* is still invoked "
            "via the project .venv (gh #112)"
        )
        baseline = subprocess.run(
            [sys.executable, "-c", "import pf"], capture_output=True, check=False
        )
        if baseline.returncode != 0:
            pytest.skip(
                "test runner's own interpreter cannot import pf — the fake "
                "launcher fixture cannot host the AC4 check in this environment"
            )
        bin_dir, proj = _make_fake_env(tmp_path)
        derived = _derive_pf_py(assignments[0], bin_dir, proj)
        result = subprocess.run(
            [derived, "-c", f"import {TEMPLATE_MODULES}"],
            capture_output=True,
            text=True,
            cwd=proj,
            check=False,
        )
        assert result.returncode == 0, (
            "derived PF_PY interpreter cannot import the template's pf "
            f"modules: {result.stderr.strip()[:200]}"
        )


if __name__ == "__main__":
    sys.exit(pytest.main([__file__, "-v"]))
