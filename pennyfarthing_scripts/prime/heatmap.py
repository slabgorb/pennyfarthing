"""
Agent activation heatmap — visualize context distribution and attention.

Parses raw prime output into sections, applies a U-shaped attention model
(Liu et al. "Lost in the Middle"), and renders a terminal heat map showing
where the LLM's attention falls across each agent's activation context.

Usage:
    pf agent heatmap sm           # Single agent detail view
    pf agent heatmap --all        # Summary across all agents
    pf agent heatmap --all --csv  # Machine-readable output
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
from dataclasses import dataclass, field

# ── Section Categories ──────────────────────────────────────────────

CATEGORY_ICONS = {
    "routing": "🔀",
    "identity": "🆔",
    "guardrail": "🛑",
    "procedure": "📝",
    "reference": "📋",
    "persona": "🎭",
    "shared": "📦",
    "learned": "🧠",
}

# Tags that always map to a specific category regardless of context
TAG_CATEGORIES: dict[str, str] = {
    # Identity / discipline
    "role": "identity",
    "minimalist-discipline": "identity",
    "coordination-discipline": "identity",
    "systems-thinking": "identity",
    # Guardrails
    "critical": "guardrail",
    "merge-gate": "guardrail",
    "gate": "guardrail",
    "self-review": "guardrail",
    # Routing
    "on-activation": "routing",
    "phase-check": "routing",
    # Procedures
    "finish-flow": "procedure",
    "session-new-flow": "procedure",
    "empty-backlog-flow": "procedure",
    "exit": "procedure",
    "workflow": "procedure",
    # Reference
    "helpers": "reference",
    "parameters": "reference",
    "workflow-routing": "reference",
    "skills": "reference",
    "delegation": "reference",
    "assessment-template": "reference",
    "tandem-consultation": "reference",
    "handoffs": "reference",
    "workflows": "reference",
    "coordination": "reference",
    "workflow-participation": "reference",
    # Persona
    "persona": "persona",
    "user-title": "persona",
    "crew": "persona",
    # Shared (behavior guide)
    "tandem-protocol": "shared",
    "agent-exit-protocol": "shared",
    "wrong-phase-detection": "shared",
    "info": "shared",
}

# Top-level header → default category (for content directly under the header)
HEADER_CATEGORIES: dict[str, str] = {
    "Workflow State": "routing",
    "Sprint Context": "shared",
    "Repos Topology": "shared",
}

# Primary agents (ordered by typical workflow position)
PRIMARY_AGENTS = [
    "sm", "tea", "dev", "reviewer", "architect",
    "pm", "tech-writer", "ux-designer", "devops",
    "orchestrator", "ba",
]

SUBAGENTS = [
    "sm-setup", "sm-finish", "sm-file-summary",
    "reviewer-preflight", "testing-runner", "tandem-backseat",
]


# ── Data Model ──────────────────────────────────────────────────────

@dataclass
class Section:
    """A parsed section from prime output."""

    name: str
    start_line: int
    end_line: int
    chars: int
    tokens: int
    category: str
    component: str  # which prime component this belongs to


@dataclass
class AgentHeatmap:
    """Complete heatmap data for one agent."""

    agent: str
    sections: list[Section] = field(default_factory=list)
    total_tokens: int = 0
    total_chars: int = 0


# ── Attention Model ─────────────────────────────────────────────────

def attention_score(position_pct: float) -> float:
    """U-shaped attention model based on "Lost in the Middle" (Liu et al. 2023).

    Returns a score 0.0-1.0 where higher = more likely to be attended to.
    Peaks at start (primacy) and end (recency), valley around 55-65%.
    """
    # Primacy: strong at start, decays linearly
    primacy = max(0.0, 1.0 - position_pct * 1.8)
    # Recency: rises in final third
    recency = max(0.0, (position_pct - 0.5) * 2.0) ** 1.5
    return min(1.0, max(0.15, primacy + recency * 0.7))


def heat_blocks(score: float) -> str:
    """Score → colored heat blocks."""
    if score >= 0.85:
        return "🟥🟥🟥"
    if score >= 0.65:
        return "🟧🟧🟧"
    if score >= 0.45:
        return "🟨🟨🟨"
    if score >= 0.30:
        return "🟩🟩🟩"
    return "🟦🟦🟦"


def size_bar(tokens: int, max_tokens: int, width: int = 15) -> str:
    """Token count → fixed-width bar."""
    if max_tokens == 0:
        return "░" * width
    filled = int((tokens / max_tokens) * width)
    return "█" * filled + "░" * (width - filled)


# ── Parser ──────────────────────────────────────────────────────────

def _estimate_tokens(text: str) -> int:
    """Estimate tokens using ~4 characters per token."""
    if not text:
        return 0
    return max(1, len(text) // 4)


def parse_sections(raw_output: str) -> list[Section]:
    """Parse raw prime output into categorized sections.

    Detection strategy:
    1. Only KNOWN H1 headers create component boundaries
    2. XML opening tags define sections within components
    3. Unknown H1 headers fold into the current section
    4. Category is determined by tag name → TAG_CATEGORIES mapping
    """
    lines = raw_output.split("\n")
    sections: list[Section] = []

    # Known component-boundary H1 prefixes
    COMPONENT_HEADERS = [
        "Workflow State",
        "Agent Definition",
        "Persona:",
        "Agent Behavior Guide",
        "Sprint Context",
        "Repos Topology",
        "Agent Sidecar:",
        "Active Session:",
    ]

    def _is_component_header(text: str) -> bool:
        return any(text.startswith(prefix) for prefix in COMPONENT_HEADERS)

    # State
    current_component = "preamble"
    current_section_name = "preamble"
    current_section_start = 1
    current_section_category = "routing"
    current_section_lines: list[str] = []
    in_agent_def = False
    in_behavior_guide = False

    def _flush_section(end_line: int) -> None:
        """Emit the current section."""
        text = "\n".join(current_section_lines)
        chars = len(text)
        tokens = _estimate_tokens(text)
        if tokens > 0 and current_section_name != "preamble":
            sections.append(Section(
                name=current_section_name,
                start_line=current_section_start,
                end_line=end_line,
                chars=chars,
                tokens=tokens,
                category=current_section_category,
                component=current_component,
            ))

    tag_open_re = re.compile(r"^<([a-z][-a-z0-9]*)(?:\s[^>]*)?>$")

    for i, line in enumerate(lines, start=1):
        stripped = line.strip()

        # ── H1 header detection (only known component boundaries) ──
        if stripped.startswith("# "):
            header_text = stripped[2:].strip()

            if not _is_component_header(header_text):
                # Not a component boundary — fold into current section
                current_section_lines.append(line)
                continue

            _flush_section(i - 1)

            # Determine component and default category
            if header_text.startswith("Workflow State"):
                current_component = "workflow_state"
                current_section_category = "routing"
                current_section_name = "Workflow State"
                in_agent_def = False
                in_behavior_guide = False
            elif header_text.startswith("Agent Definition"):
                current_component = "agent_definition"
                current_section_category = "identity"
                current_section_name = "Agent Definition"
                in_agent_def = True
                in_behavior_guide = False
            elif header_text.startswith("Persona:"):
                current_component = "persona"
                current_section_category = "persona"
                current_section_name = header_text
                in_agent_def = False
                in_behavior_guide = False
            elif header_text.startswith("Agent Behavior Guide"):
                current_component = "behavior_guide"
                current_section_category = "shared"
                current_section_name = "BG: Preamble"
                in_agent_def = False
                in_behavior_guide = True
            elif header_text.startswith("Sprint Context"):
                current_component = "sprint_context"
                current_section_category = "shared"
                current_section_name = "Sprint Context"
                in_agent_def = False
                in_behavior_guide = False
            elif header_text.startswith("Repos Topology"):
                current_component = "repos_topology"
                current_section_category = "shared"
                current_section_name = "Repos Topology"
                in_agent_def = False
                in_behavior_guide = False
            elif header_text.startswith("Agent Sidecar:"):
                current_component = "sidecars"
                current_section_category = "learned"
                sidecar_file = header_text.split(":", 1)[1].strip()
                current_section_name = f"Sidecar: {sidecar_file.replace('.md', '').title()}"
                in_agent_def = False
                in_behavior_guide = False
            elif header_text.startswith("Active Session:"):
                current_component = "session"
                current_section_category = "routing"
                current_section_name = "Active Session"
                in_agent_def = False
                in_behavior_guide = False

            current_section_start = i
            current_section_lines = [line]
            continue

        # ── XML tag detection (within agent def, behavior guide, or persona) ──
        if in_agent_def or in_behavior_guide or current_component == "persona":
            m = tag_open_re.match(stripped)
            if m:
                tag_name = m.group(1)
                _flush_section(i - 1)

                # Look up category
                if tag_name in TAG_CATEGORIES:
                    current_section_category = TAG_CATEGORIES[tag_name]
                elif in_behavior_guide:
                    current_section_category = "shared"
                elif in_agent_def:
                    current_section_category = "reference"

                # Build section name
                if in_behavior_guide:
                    current_section_name = f"BG: {_pretty_tag(tag_name)}"
                elif current_component == "persona":
                    current_section_name = f"Persona: {_pretty_tag(tag_name)}"
                else:
                    current_section_name = _pretty_tag(tag_name)

                current_section_start = i
                current_section_lines = [line]
                continue

        # ── Default: accumulate into current section ────────────
        current_section_lines.append(line)

    # Flush final section
    _flush_section(len(lines))

    return sections


def _pretty_tag(tag: str) -> str:
    """Convert XML tag name to display name."""
    return tag.replace("-", " ").title()


# ── Runner ──────────────────────────────────────────────────────────

def capture_agent_output(agent_name: str) -> str:
    """Run pf agent start and capture raw output."""
    result = subprocess.run(
        ["pf", "agent", "start", agent_name],
        capture_output=True,
        text=True,
        timeout=30,
    )
    return result.stdout


def build_heatmap(agent_name: str) -> AgentHeatmap:
    """Build complete heatmap for one agent."""
    raw = capture_agent_output(agent_name)
    sections = parse_sections(raw)
    total_tokens = sum(s.tokens for s in sections)
    total_chars = sum(s.chars for s in sections)
    return AgentHeatmap(
        agent=agent_name,
        sections=sections,
        total_tokens=total_tokens,
        total_chars=total_chars,
    )


# ── Renderers ───────────────────────────────────────────────────────

def render_detail(hm: AgentHeatmap) -> str:
    """Render detailed section-by-section heat map for one agent."""
    out: list[str] = []
    w = 100

    out.append("=" * w)
    out.append(f"  {hm.agent.upper()} AGENT HEAT MAP — Section-by-Section with Attention Model")
    out.append(f"  Total: ~{hm.total_tokens:,} tokens across {hm.sections[-1].end_line if hm.sections else 0} lines")
    out.append("=" * w)
    out.append("")
    out.append('  Attention model: U-shaped ("Lost in the Middle" — Liu et al. 2023)')
    out.append("  Start of context = HIGH attention | Middle = LOW | End = MODERATE")
    out.append("")

    max_tok = max((s.tokens for s in hm.sections), default=1)

    header = f"  {'Pos':>4}  {'Section':<34} {'Cat':>2}  {'Tokens':>5}  {'%Tot':>5}  {'Size':<15}  {'Attn':>5}  {'Heat'}"
    out.append(header)
    out.append("  " + "─" * (w - 2))

    running = 0
    for s in hm.sections:
        mid = running + s.tokens / 2
        pct_pos = mid / hm.total_tokens if hm.total_tokens else 0
        attn = attention_score(pct_pos)
        pct_tot = s.tokens / hm.total_tokens * 100 if hm.total_tokens else 0
        icon = CATEGORY_ICONS.get(s.category, "  ")
        bar = size_bar(s.tokens, max_tok)
        heat = heat_blocks(attn)

        out.append(
            f"  {running:>4}  {s.name:<34} {icon}  {s.tokens:>5}  {pct_tot:>4.1f}%  {bar}  {attn:>5.2f}  {heat}"
        )
        running += s.tokens

    out.append("  " + "─" * (w - 2))
    out.append("")

    # ── Category summary ────────────────────────────────────────
    cats: dict[str, dict] = {}
    running = 0
    for s in hm.sections:
        cat = s.category
        if cat not in cats:
            cats[cat] = {"tokens": 0, "sections": 0, "attn_sum": 0.0}
        cats[cat]["tokens"] += s.tokens
        cats[cat]["sections"] += 1
        mid = running + s.tokens / 2
        pct_pos = mid / hm.total_tokens if hm.total_tokens else 0
        cats[cat]["attn_sum"] += attention_score(pct_pos)
        running += s.tokens

    out.append("  CATEGORY SUMMARY:")
    out.append("  " + "─" * 75)
    out.append(f"  {'Category':<14} {'Icon':>4}  {'Tokens':>6}  {'% Total':>7}  {'Sections':>8}  {'Avg Attn':>8}  {'Verdict'}")

    cat_order = ["routing", "identity", "guardrail", "procedure", "reference", "persona", "shared", "learned"]
    for cat in cat_order:
        if cat not in cats:
            continue
        d = cats[cat]
        avg_attn = d["attn_sum"] / d["sections"] if d["sections"] else 0
        pct = d["tokens"] / hm.total_tokens * 100 if hm.total_tokens else 0
        icon = CATEGORY_ICONS.get(cat, "  ")
        if avg_attn >= 0.6:
            verdict = "WELL-PLACED ✓"
        elif avg_attn >= 0.35:
            verdict = "attention dip ⚠️"
        else:
            verdict = "LOST IN MIDDLE ❌"
        out.append(f"  {cat:<14} {icon:>4}  {d['tokens']:>6}  {pct:>6.1f}%  {d['sections']:>8}  {avg_attn:>8.2f}  {verdict}")

    out.append("")

    # ── Duplication detection ───────────────────────────────────
    agent_def_sections = {s.name.lower() for s in hm.sections if s.component == "agent_definition"}
    bg_sections = {s.name.lower() for s in hm.sections if s.component == "behavior_guide"}

    dups = []
    # Check for exit protocol duplication
    if any("exit" in n for n in agent_def_sections) and any("exit" in n for n in bg_sections):
        dups.append(("Exit protocol (agent def)", "BG: Agent Exit Protocol"))
    if any("phase" in n for n in agent_def_sections) and any("phase" in n or "wrong" in n for n in bg_sections):
        dups.append(("Phase Check (agent def)", "BG: Wrong Phase Detection"))

    if dups:
        out.append("  DUPLICATION DETECTED:")
        out.append("  ┌────────────────────────────────┬────────────────────────────────────┐")
        out.append("  │ Agent Def (high attn)           │ Behavior Guide (low attn)          │")
        out.append("  ├────────────────────────────────┼────────────────────────────────────┤")
        for ad, bg in dups:
            out.append(f"  │ {ad:<30} │ {bg:<34} │")
        out.append("  └────────────────────────────────┴────────────────────────────────────┘")
        out.append("")

    return "\n".join(out)


def render_summary(heatmaps: list[AgentHeatmap]) -> str:
    """Render summary heat map across all agents."""
    out: list[str] = []
    w = 100

    out.append("=" * w)
    out.append("  AGENT ACTIVATION HEAT MAP — All Agents Summary")
    out.append("=" * w)
    out.append("")

    # Gather per-agent category totals
    components = ["routing", "identity", "guardrail", "procedure", "reference", "persona", "shared", "learned"]
    comp_labels = ["Route", "Ident", "Guard", "Proced", "Refer", "Perso", "Shared", "Learn"]

    # Find max per category across all agents
    cat_maxes: dict[str, int] = dict.fromkeys(components, 0)
    agent_cats: dict[str, dict[str, int]] = {}
    for hm in heatmaps:
        agent_cats[hm.agent] = dict.fromkeys(components, 0)
        for s in hm.sections:
            agent_cats[hm.agent][s.category] = agent_cats[hm.agent].get(s.category, 0) + s.tokens
        for c in components:
            cat_maxes[c] = max(cat_maxes[c], agent_cats[hm.agent].get(c, 0))

    # Header
    header = f"  {'Agent':<14}"
    for label in comp_labels:
        header += f" {label:>7}"
    header += f"  {'TOTAL':>6}  {'Unique%':>7}  {'Bar'}"
    out.append(header)
    out.append("  " + "─" * (w - 2))

    max_total = max((hm.total_tokens for hm in heatmaps), default=1)
    shared_cats = {"shared"}

    for hm in sorted(heatmaps, key=lambda h: h.total_tokens, reverse=True):
        row = f"  {hm.agent:<14}"
        unique = 0
        for c in components:
            val = agent_cats[hm.agent].get(c, 0)
            mx = cat_maxes[c]
            if val == 0:
                row += "      · "
            else:
                # Heat relative to max in that category
                ratio = val / mx if mx else 0
                if ratio > 0.8:
                    h = "🟥"
                elif ratio > 0.6:
                    h = "🟧"
                elif ratio > 0.4:
                    h = "🟨"
                elif ratio > 0.2:
                    h = "🟩"
                else:
                    h = "🟦"
                row += f" {h}{val:>5}"
            if c not in shared_cats:
                unique += val
        pct = unique / hm.total_tokens * 100 if hm.total_tokens else 0
        bar = size_bar(hm.total_tokens, max_total, width=20)
        row += f"  {hm.total_tokens:>6}  {pct:>5.1f}%  {bar}"
        out.append(row)

    out.append("")

    # Efficiency ranking
    out.append("  ATTENTION EFFICIENCY (unique content / total):")
    for hm in sorted(heatmaps, key=lambda h: h.total_tokens, reverse=True):
        unique = sum(v for c, v in agent_cats[hm.agent].items() if c not in shared_cats)
        total = hm.total_tokens
        pct = unique / total * 100 if total else 0
        if pct >= 65:
            emoji = "🟢"
        elif pct >= 55:
            emoji = "🟡"
        else:
            emoji = "🔴"
        ad = agent_cats[hm.agent].get("identity", 0) + agent_cats[hm.agent].get("guardrail", 0) + agent_cats[hm.agent].get("procedure", 0) + agent_cats[hm.agent].get("reference", 0) + agent_cats[hm.agent].get("routing", 0)
        sc = agent_cats[hm.agent].get("learned", 0)
        out.append(f"    {emoji} {hm.agent:<14} {unique:>4}/{total:>4} = {pct:>5.1f}%  (agent_def≈{ad}, sidecars={sc})")

    out.append("")
    out.append("  KEY: 🟢 >65% unique  🟡 55-65%  🔴 <55% (diluted by boilerplate)")
    out.append("")

    # Shared boilerplate analysis
    shared_tokens = [agent_cats[hm.agent].get("shared", 0) for hm in heatmaps]
    if shared_tokens:
        avg_shared = sum(shared_tokens) // len(shared_tokens)
        min_total = min(hm.total_tokens for hm in heatmaps)
        out.append(f"  BOILERPLATE: ~{avg_shared} shared tokens per agent = {avg_shared/min_total*100:.0f}% of smallest ({min_total} tok)")

    return "\n".join(out)


def render_csv(heatmaps: list[AgentHeatmap]) -> str:
    """Render CSV output for machine consumption."""
    rows = ["agent,section,component,category,tokens,start_line,end_line"]
    for hm in heatmaps:
        for s in hm.sections:
            rows.append(f"{hm.agent},{s.name},{s.component},{s.category},{s.tokens},{s.start_line},{s.end_line}")
    return "\n".join(rows)


# ── CLI Entry Point ─────────────────────────────────────────────────

def run_heatmap(
    agent_name: str | None = None,
    show_all: bool = False,
    csv_output: bool = False,
    json_output: bool = False,
) -> int:
    """Main entry point for heatmap command."""
    try:
        if show_all:
            agents = PRIMARY_AGENTS
            heatmaps = []
            for a in agents:
                sys.stderr.write(f"  Scanning {a}...\n")
                heatmaps.append(build_heatmap(a))
            sys.stderr.write("\n")

            if csv_output:
                print(render_csv(heatmaps))
            elif json_output:
                data = []
                for hm in heatmaps:
                    data.append({
                        "agent": hm.agent,
                        "total_tokens": hm.total_tokens,
                        "sections": [
                            {
                                "name": s.name,
                                "component": s.component,
                                "category": s.category,
                                "tokens": s.tokens,
                                "start_line": s.start_line,
                                "end_line": s.end_line,
                            }
                            for s in hm.sections
                        ],
                    })
                print(json.dumps(data, indent=2))
            else:
                print(render_summary(heatmaps))
        elif agent_name:
            hm = build_heatmap(agent_name)
            if json_output:
                data = {
                    "agent": hm.agent,
                    "total_tokens": hm.total_tokens,
                    "sections": [
                        {
                            "name": s.name,
                            "component": s.component,
                            "category": s.category,
                            "tokens": s.tokens,
                            "start_line": s.start_line,
                            "end_line": s.end_line,
                            "attention": round(
                                attention_score(
                                    (sum(ss.tokens for ss in hm.sections[:j]) + s.tokens / 2) / hm.total_tokens
                                ),
                                3,
                            ),
                        }
                        for j, s in enumerate(hm.sections)
                    ],
                }
                print(json.dumps(data, indent=2))
            else:
                print(render_detail(hm))
        else:
            sys.stderr.write("Usage: pf agent heatmap <AGENT> | pf agent heatmap --all\n")
            return 1
    except subprocess.TimeoutExpired:
        sys.stderr.write("Error: agent start timed out\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"Error: {e}\n")
        return 1

    return 0
