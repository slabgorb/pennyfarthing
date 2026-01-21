# MSSCI-12135 Session: Import Research Workflow

**Story ID:** MSSCI-12135
**Title:** Import Research workflow
**Points:** 2
**Workflow:** trivial (SM → Dev, no TEA)
**Phase:** dev
**Repository:** pennyfarthing

## Feature Branch

- **Branch Name:** `feat/MSSCI-12135-research-workflow`
- **Base:** develop
- **Track PR:** (pending)

## Story Context

### Description

Import BMAD research workflow into Pennyfarthing's BikeLane stepped workflow system. This is a tri-modal workflow supporting three research types: market, domain, and technical.

### Source and Target

- **Source:** `~/Projects/BMAD-METHOD/src/modules/bmm/workflows/1-analysis/research/`
- **Target:** `pennyfarthing-dist/workflows/research/`

### Workflow Structure

The BMAD Research workflow is a **tri-modal stepped workflow** with:

**Type:** stepped (tri-modal)
**Modes:** create, validate, edit
**Step Architecture:**
- Each mode has dedicated step files
- Market research: 6 steps (market-steps/)
- Domain research: 6 steps (domain-steps/)
- Technical research: 6 steps (technical-steps/)

**Mode Description:**
- **Create Mode:** User conducts collaborative research discovery and execution
- **Validate Mode:** (if applicable) Validate research quality and completeness
- **Edit Mode:** (if applicable) Revise and enhance completed research

### Step Overview

#### Market Research Steps (market-steps/)
1. **step-01-init.md** - Market research initialization and type discovery
2. **step-02-customer-behavior.md** - Analyze customer behavior patterns
3. **step-02-customer-insights.md** - Gather customer insights
4. **step-03-customer-pain-points.md** - Identify pain points
5. **step-04-customer-decisions.md** - Analyze decision factors
6. **step-05-competitive-analysis.md** - Competitive landscape analysis
7. **step-06-research-completion.md** - Synthesis and completion

#### Domain Research Steps (domain-steps/)
1. **step-01-init.md** - Domain research initialization
2. **step-02-domain-analysis.md** - Analyze domain/industry
3. **step-03-competitive-landscape.md** - Industry competitive landscape
4. **step-04-regulatory-focus.md** - Regulatory analysis
5. **step-05-technical-trends.md** - Emerging technical trends
6. **step-06-research-synthesis.md** - Synthesis and completion

#### Technical Research Steps (technical-steps/)
1. **step-01-init.md** - Technical research initialization
2. **step-02-technical-overview.md** - Technology overview
3. **step-03-integration-patterns.md** - Integration and architectural patterns
4. **step-04-architectural-patterns.md** - Advanced architectural patterns
5. **step-05-implementation-research.md** - Implementation approaches
6. **step-06-research-synthesis.md** - Synthesis and completion

### Key Workflow Features

**Web Search Integration:**
- Research workflow requires web search for current data verification
- Anti-hallucination protocol: all factual claims must be source-verified
- Confidence levels required for uncertain data
- Multiple independent sources for critical claims

**Configuration-Driven Execution:**
- Config loading from `{project-root}/_bmad/bmm/config.yaml`
- Resolves: project_name, output_folder, planning_artifacts, user_name, etc.
- Template output file: `{planning_artifacts}/research/{research_type}-{topic}-research-{date}.md`

**Research Type Routing:**
After initial discovery conversation, workflow routes to appropriate sub-workflow based on selected research type.

### Migration Approach

1. **Parse BMAD workflow.md** - Extract configuration and step structure
2. **Convert step files** - Extract frontmatter, convert variable syntax if needed
3. **Generate Pennyfarthing workflow.yaml** - Create with proper stepped workflow schema
4. **Preserve tri-modal structure** - Maintain market/domain/technical separation
5. **Template preservation** - Include research.template.md for output generation
6. **Web search capability** - Ensure workflow requires and uses web search API

### Technical Notes

- Research workflow uses `web_bundle: true` in BMAD config - needs web search capability
- Step-based routing pattern (01-init.md discovers type, routes to appropriate folder)
- Tri-modal execution: each mode may have different step files
- Gate markers and completion detection via frontmatter

### Migration Tool Reference

Use migration script: `pennyfarthing-dist/scripts/migrate-bmad-workflow.sh`
- Already created in MSSCI-12132
- Handles YAML extraction and conversion
- Supports dry-run mode for validation

## Workflow State

- **Current Step:** 1 (dev phase start)
- **Last Updated:** 2026-01-21
- **Status:** in_progress

## Notes

- This is a trivial workflow (SM → Dev only) per sprint YAML
- Research workflow is foundational for product discovery
- Feeds into Product Brief and PRD workflows already imported
- Routing-based structure (market/domain/technical) not standard tri-modal

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `pennyfarthing-dist/workflows/research/workflow.yaml` - Workflow configuration with routing modes
- `pennyfarthing-dist/workflows/research/steps-market/` - 7 market research step files
- `pennyfarthing-dist/workflows/research/steps-domain/` - 6 domain research step files
- `pennyfarthing-dist/workflows/research/steps-technical/` - 6 technical research step files
- `pennyfarthing-dist/workflows/research/templates/research.template.md` - Output template
- `.claude/workflows/research` - Symlink for discovery
- `sprint/current-sprint.yaml` - Story status update

**Tests:** N/A (trivial workflow import, no code)
**PR:** #409 - feat(MSSCI-12135): Import Research workflow from BMAD
**Branch:** feat/MSSCI-12135-research-workflow (pushed)

**Handoff:** To Reviewer for code review

## Reviewer Assessment

**Decision:** APPROVED

**Verification:**
- Workflow YAML valid with routing-based modes (market/domain/technical)
- 19 step files total (7 market + 6 domain + 6 technical)
- Variable conversion complete (no `{var-name}` patterns)
- Template present with Mustache variables
- Symlink resolves correctly
- Agent assignment (Architect) appropriate for research work
- Web search requirement documented
- Lint passes

**Tests:** N/A (content-only PR, no code files)

**Security:** No concerns (markdown content only)

**Observations:**
- Dev correctly identified this as routing-based modes (not tri-modal create/validate/edit)
- Adapted workflow structure appropriately

**Handoff:** Ready for SM (Lord Varys) to finish story
