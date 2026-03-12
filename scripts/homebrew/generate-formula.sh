#!/usr/bin/env bash
# Generate Homebrew formula for Pennyfarthing from pyproject.toml.
# Usage: ./scripts/homebrew/generate-formula.sh [--version X.Y.Z] [--sha256 HASH]
#
# Reads version and dependencies from pyproject.toml, generates resource blocks
# for public PyPI dependencies, and outputs the Formula .rb file.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"

VERSION=""
SHA256=""
OUTPUT="${PROJECT_ROOT}/scripts/homebrew/pennyfarthing.rb"

while [[ $# -gt 0 ]]; do
    case $1 in
        --version) VERSION="$2"; shift 2 ;;
        --sha256)  SHA256="$2";  shift 2 ;;
        --output)  OUTPUT="$2";  shift 2 ;;
        *) echo "Usage: $0 [--version X.Y.Z] [--sha256 HASH] [--output FILE]"; exit 1 ;;
    esac
done

# Read version from pyproject.toml if not specified
if [[ -z "$VERSION" ]]; then
    VERSION=$(python3 -c "
import re
with open('$PROJECT_ROOT/pyproject.toml') as f:
    m = re.search(r'version\s*=\s*\"([^\"]+)\"', f.read())
    print(m.group(1) if m else '')
")
fi

if [[ -z "$VERSION" ]]; then
    echo "ERROR: Could not determine version" >&2
    exit 1
fi

echo "Generating formula for pennyfarthing $VERSION..." >&2

# Compute SHA256 from release asset if not provided
if [[ -z "$SHA256" ]]; then
    SDIST="$PROJECT_ROOT/dist/pennyfarthing_scripts-${VERSION}.tar.gz"
    if [[ -f "$SDIST" ]]; then
        SHA256=$(shasum -a 256 "$SDIST" | awk '{print $1}')
    else
        echo "WARN: No sdist found at $SDIST — using placeholder SHA256" >&2
        SHA256="REPLACE_WITH_ACTUAL_SHA256"
    fi
fi

# Generate resource blocks for Python dependencies using poet if available
RESOURCE_BLOCKS=""
if command -v poet &>/dev/null; then
    echo "Generating resource blocks with homebrew-pypi-poet..." >&2
    # Extract deps from pyproject.toml
    DEPS=$(python3 -c "
import re
with open('$PROJECT_ROOT/pyproject.toml') as f:
    content = f.read()
m = re.search(r'dependencies\s*=\s*\[(.*?)\]', content, re.DOTALL)
if m:
    for line in m.group(1).strip().split('\n'):
        line = line.strip().strip(',').strip('\"')
        if line:
            pkg = re.split(r'[><=!]', line)[0]
            print(pkg)
")
    for dep in $DEPS; do
        RESOURCE_BLOCKS+="$(poet "$dep" 2>/dev/null || echo "  # WARNING: poet failed for $dep")"
        RESOURCE_BLOCKS+=$'\n'
    done
else
    echo "WARN: homebrew-pypi-poet not found — resource blocks will need manual generation" >&2
    echo "  Install: pip install homebrew-pypi-poet" >&2
    RESOURCE_BLOCKS="  # TODO: Generate resource blocks with: poet <package-name>
  # Install poet: pip install homebrew-pypi-poet
  # Then run: poet pyyaml ruamel.yaml httpx click pydriller textual websockets textual-image watchfiles"
fi

# Generate the formula
cat > "$OUTPUT" << RUBY
class Pennyfarthing < Formula
  include Language::Python::Virtualenv

  desc "Agent orchestration framework for Claude Code"
  homepage "https://github.com/1898andCo/pennyfarthing"
  url "https://github.com/1898andCo/pennyfarthing/releases/download/v#{version}/pennyfarthing_scripts-#{version}.tar.gz"
  sha256 "$SHA256"
  license "MIT"

  depends_on "python@3.11"
  depends_on "yq"
  depends_on "jq"
  depends_on :macos

  uses_from_macos "libffi"

  $RESOURCE_BLOCKS

  def install
    virtualenv_install_with_resources
  end

  def caveats
    <<~EOS
      Pennyfarthing requires GitHub authentication (private repo).

      If you haven't already:
        gh auth login

      Or set a personal access token:
        export HOMEBREW_GITHUB_API_TOKEN=ghp_...

      To initialize a project:
        cd your-project && pf init
    EOS
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/pf --version")
  end
end
RUBY

echo "Formula written to $OUTPUT" >&2
echo "Version: $VERSION" >&2
echo "SHA256: $SHA256" >&2
