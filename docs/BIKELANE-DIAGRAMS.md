# BikeLane Workflow Diagrams

Visual documentation of all BikeLane workflows in Pennyfarthing.

## Table of Contents

1. [Workflow Overview](#workflow-overview)
2. [Phased Workflows](#phased-workflows)
   - [TDD Workflow](#tdd-workflow)
   - [BDD Workflow](#bdd-workflow)
   - [Trivial Workflow](#trivial-workflow)
   - [Agent-Docs Workflow](#agent-docs-workflow)
3. [Stepped Workflows](#stepped-workflows)
   - [Architecture Workflow](#architecture-workflow)
   - [PRD Workflow](#prd-workflow)
   - [Generic Stepped Flow](#generic-stepped-flow)
4. [Procedural Workflows](#procedural-workflows)
5. [Workflow Selection](#workflow-selection)

---

## Workflow Overview

BikeLane is the umbrella workflow system in Pennyfarthing, supporting three workflow types.

```mermaid
flowchart TD
    subgraph BikeLane["BikeLane Workflow System"]
        direction TB

        subgraph Phased["Phased Workflows"]
            TDD["TDD"]
            BDD["BDD"]
            TRIV["Trivial"]
            ADOCS["Agent-Docs"]
        end

        subgraph Stepped["Stepped Workflows"]
            ARCH["Architecture"]
            PRD["PRD"]
            RES["Research"]
            SPRINT["Sprint Planning"]
            EPIC["Epics & Stories"]
            PBRIEF["Product Brief"]
            PCTX["Project Context"]
            IMPL["Implementation Readiness"]
            UXD["UX Design"]
            QDEV["Quick Dev"]
        end

        subgraph Procedural["Procedural Workflows"]
            BRAIN["Brainstorming"]
            CREV["Code Review"]
            RETRO["Retrospective"]
        end
    end

    CMD["/workflow start name"] --> BikeLane

    style Phased fill:#4a9eff,color:white
    style Stepped fill:#51cf66,color:white
    style Procedural fill:#ffd43b,color:black
```

---

## Phased Workflows

Phased workflows are agent-driven development cycles with automatic handoffs between agents.

### TDD Workflow

The default workflow for feature development (3+ story points).

```mermaid
flowchart LR
    subgraph Entry
        NW["/work or /new-work"]
    end

    subgraph "TDD Cycle"
        SM1["SM<br/>(Setup)"]
        TEA["TEA<br/>(RED)"]
        DEV["Dev<br/>(GREEN)"]
        REV["Reviewer"]
        SM2["SM<br/>(Finish)"]
    end

    NW --> SM1
    SM1 -->|"story ready<br/>branches created"| TEA
    TEA -->|"tests failing<br/>coverage complete"| DEV
    DEV -->|"tests passing<br/>PR created"| REV
    REV -->|"approved"| SM2
    REV -->|"rejected"| DEV
    SM2 -->|"archived"| Done([Done])

    style SM1 fill:#4a9eff,color:white
    style SM2 fill:#4a9eff,color:white
    style TEA fill:#ff6b6b,color:white
    style DEV fill:#51cf66,color:white
    style REV fill:#ffd43b,color:black
```

**Phases:**

| Phase | Agent | Gate Condition |
|-------|-------|----------------|
| setup | SM | Session file and branches created |
| red | TEA | All acceptance criteria have test coverage |
| green | Dev | All tests passing, no skipped tests |
| review | Reviewer | Code review approved |
| finish | SM | Session archived |

---

### BDD Workflow

Behavior-driven development with UX design phase for UI-focused features.

```mermaid
flowchart LR
    subgraph Entry
        NW["/workflow start bdd"]
    end

    subgraph "BDD Cycle"
        SM1["SM<br/>(Setup)"]
        UX["UX Designer<br/>(Design)"]
        TEA["TEA<br/>(RED)"]
        DEV["Dev<br/>(GREEN)"]
        REV["Reviewer"]
        SM2["SM<br/>(Finish)"]
    end

    NW --> SM1
    SM1 -->|"story ready"| UX
    UX -->|"design spec<br/>user flows"| TEA
    TEA -->|"behavior tests<br/>failing"| DEV
    DEV -->|"tests passing<br/>UX implemented"| REV
    REV -->|"approved"| SM2
    REV -->|"rejected"| DEV
    SM2 -->|"archived"| Done([Done])

    style SM1 fill:#4a9eff,color:white
    style SM2 fill:#4a9eff,color:white
    style UX fill:#be4bdb,color:white
    style TEA fill:#ff6b6b,color:white
    style DEV fill:#51cf66,color:white
    style REV fill:#ffd43b,color:black
```

**Phases:**

| Phase | Agent | Gate Condition |
|-------|-------|----------------|
| setup | SM | Session file and branches created |
| design | UX Designer | UX spec defines user flows and behaviors |
| red | TEA | Behavior scenarios have test coverage |
| green | Dev | All tests passing, UX spec implemented |
| review | Reviewer | Code review approved, UX requirements met |
| finish | SM | Session archived |

---

### Trivial Workflow

Quick fixes without full TDD ceremony (1-2 story points).

```mermaid
flowchart LR
    subgraph Entry
        NW["/workflow start trivial"]
    end

    subgraph "Trivial Cycle"
        SM1["SM<br/>(Setup)"]
        DEV["Dev<br/>(Impl)"]
        REV["Reviewer"]
        SM2["SM<br/>(Finish)"]
    end

    NW --> SM1
    SM1 -->|"story ready"| DEV
    DEV -->|"implementation<br/>existing tests pass"| REV
    REV -->|"approved"| SM2
    REV -->|"rejected"| DEV
    SM2 -->|"archived"| Done([Done])

    style SM1 fill:#4a9eff,color:white
    style SM2 fill:#4a9eff,color:white
    style DEV fill:#51cf66,color:white
    style REV fill:#ffd43b,color:black
```

**Phases:**

| Phase | Agent | Gate Condition |
|-------|-------|----------------|
| setup | SM | Session file and branches created |
| implement | Dev | Existing tests still pass |
| review | Reviewer | Code review approved |
| finish | SM | Session archived |

---

### Agent-Docs Workflow

For agent file creation, updates, and process improvements.

```mermaid
flowchart LR
    subgraph Entry
        NW["/workflow start agent-docs"]
    end

    subgraph "Agent-Docs Cycle"
        SM1["SM<br/>(Setup)"]
        ORCH["Orchestrator<br/>(Analyze)"]
        ORCH2["Orchestrator<br/>(Implement)"]
        TW["Tech Writer<br/>(Review)"]
        SM2["SM<br/>(Finish)"]
    end

    NW --> SM1
    SM1 -->|"story context"| ORCH
    ORCH -->|"audit report<br/>proposed changes"| ORCH2
    ORCH2 -->|"updated files"| TW
    TW -->|"approved"| SM2
    TW -->|"revisions needed"| ORCH2
    SM2 -->|"archived"| Done([Done])

    style SM1 fill:#4a9eff,color:white
    style SM2 fill:#4a9eff,color:white
    style ORCH fill:#20c997,color:white
    style ORCH2 fill:#20c997,color:white
    style TW fill:#868e96,color:white
```

**Phases:**

| Phase | Agent | Gate Condition |
|-------|-------|----------------|
| setup | SM | Session file created |
| analyze | Orchestrator | Changes identified and documented |
| implement | Orchestrator | Agent files parse correctly |
| review | Tech Writer | Documentation quality approved |
| finish | SM | Session archived |

---

## Stepped Workflows

Stepped workflows provide progressive disclosure with user gates. They are BMAD 6.0 compatible.

### Architecture Workflow

Collaborative architectural decision-making with A/P/C collaboration menus.

```mermaid
flowchart TD
    subgraph Entry
        START["/workflow start architecture"]
    end

    subgraph "Architecture Steps"
        S1["Step 1<br/>Initialize"]
        S1B{"Existing<br/>workflow?"}
        S1C["Step 1b<br/>Continue"]
        S2["Step 2<br/>Context"]
        G1{{"Gate 1"}}
        S3["Step 3<br/>Patterns"]
        S4["Step 4<br/>Components"]
        G2{{"Gate 2"}}
        S5["Step 5<br/>Interfaces"]
        S6["Step 6<br/>Risks"]
        G3{{"Gate 3"}}
        S7["Step 7<br/>Document"]
    end

    START --> S1
    S1 --> S1B
    S1B -->|"Yes"| S1C
    S1B -->|"No"| S2
    S1C --> S2
    S2 --> G1
    G1 -->|"Continue"| S3
    G1 -->|"Revise"| S2
    S3 --> S4
    S4 --> G2
    G2 -->|"Continue"| S5
    G2 -->|"Revise"| S4
    S5 --> S6
    S6 --> G3
    G3 -->|"Continue"| S7
    G3 -->|"Revise"| S6
    S7 --> Done([Architecture Doc])

    style G1 fill:#ffd43b,color:black
    style G2 fill:#ffd43b,color:black
    style G3 fill:#ffd43b,color:black
```

**Agent:** Architect

**Collaboration Menus:**
- **A** - Advanced Elicitation (deeper discovery)
- **P** - Party Mode (multiple perspectives)
- **C** - Continue (save and proceed)
- **R** - Revise (gather more information)

---

### PRD Workflow

Tri-modal PRD workflow supporting Create, Validate, and Edit modes.

```mermaid
flowchart TD
    subgraph Entry
        START["/workflow start prd"]
        MODE{"Select<br/>Mode"}
    end

    subgraph "Create Mode (steps-c/)"
        C1["Vision & Problem"]
        C2["User Research"]
        CG1{{"Gate"}}
        C3["Requirements"]
        C4["Features"]
        C5["Success Metrics"]
    end

    subgraph "Validate Mode (steps-v/)"
        V1["Load Existing PRD"]
        V2["Check Completeness"]
        V3["Verify Consistency"]
        V4["Report Findings"]
    end

    subgraph "Edit Mode (steps-e/)"
        E1["Load PRD"]
        E2["Identify Section"]
        E3["Make Changes"]
        E4["Revalidate"]
    end

    START --> MODE
    MODE -->|"create"| C1
    MODE -->|"validate"| V1
    MODE -->|"edit"| E1

    C1 --> C2
    C2 --> CG1
    CG1 -->|"Continue"| C3
    C3 --> C4
    C4 --> C5
    C5 --> DONE1([PRD Created])

    V1 --> V2
    V2 --> V3
    V3 --> V4
    V4 --> DONE2([Validation Report])

    E1 --> E2
    E2 --> E3
    E3 --> E4
    E4 --> DONE3([PRD Updated])

    style MODE fill:#be4bdb,color:white
    style CG1 fill:#ffd43b,color:black
```

**Agent:** PM

**Modes:**
| Mode | Purpose | Steps Directory |
|------|---------|-----------------|
| create | Build new PRD from scratch | `steps-c/` |
| validate | Review existing PRD for completeness | `steps-v/` |
| edit | Modify specific sections | `steps-e/` |

---

### Generic Stepped Flow

All stepped workflows follow this pattern.

```mermaid
flowchart TD
    subgraph "Stepped Workflow Pattern"
        START["/workflow start name"]
        S1["Step 1"]
        S2["Step 2"]
        GATE{{"User Gate"}}
        S3["Step 3"]
        SN["Step N"]
        OUTPUT["Output Artifact"]
    end

    START --> S1
    S1 --> S2
    S2 --> GATE
    GATE -->|"Continue [C]"| S3
    GATE -->|"Revise [R]"| S2
    S3 --> SN
    SN --> OUTPUT

    style GATE fill:#ffd43b,color:black
```

**Stepped Workflow Inventory:**

| Workflow | Agent | Steps | Description |
|----------|-------|-------|-------------|
| architecture | Architect | 7 | Architectural decisions with A/P/C menus |
| prd | PM | 12 | Product requirements (tri-modal) |
| research | PM | 8+ | Market/domain/technical research |
| sprint-planning | SM | 6 | Sprint planning facilitation |
| epics-and-stories | PM | 5 | Epic decomposition |
| product-brief | PM | 4 | Quick product briefs |
| project-context | Architect | 3 | Generate AI project context |
| implementation-readiness | Architect | 5 | Verify implementation readiness |
| ux-design | UX Designer | 6 | UX design workflow |
| quick-dev | Dev | 3 | Quick development steps |

---

## Procedural Workflows

Procedural workflows are flexible, agent-guided processes without strict step sequences.

```mermaid
flowchart TD
    subgraph "Procedural Workflow Pattern"
        START["/workflow start name"]
        AGENT["Agent<br/>follows checklist"]

        subgraph "Flexible Execution"
            T1["Task 1"]
            T2["Task 2"]
            T3["Task 3"]
            TN["Task N"]
        end

        OUTPUT["Output"]
    end

    START --> AGENT
    AGENT --> T1
    AGENT --> T2
    AGENT --> T3
    AGENT --> TN
    T1 & T2 & T3 & TN --> OUTPUT

    style AGENT fill:#20c997,color:white
```

**Procedural Workflow Inventory:**

| Workflow | Agent | Description |
|----------|-------|-------------|
| brainstorming | PM | 62 techniques, 100+ ideas goal |
| code-review | Reviewer | Structured code review process |
| retrospective | SM | Sprint retrospective facilitation |

---

## Workflow Selection

How to choose the right workflow.

```mermaid
flowchart TD
    START["New Work"]

    Q1{"What type<br/>of work?"}
    Q2{"Story<br/>points?"}
    Q3{"UI/UX<br/>focused?"}
    Q4{"Planning or<br/>implementation?"}
    Q5{"Needs<br/>structure?"}

    TDD["TDD Workflow"]
    BDD["BDD Workflow"]
    TRIV["Trivial Workflow"]
    ADOCS["Agent-Docs Workflow"]
    STEPPED["Stepped Workflow<br/>(choose specific)"]
    PROC["Procedural Workflow<br/>(choose specific)"]

    START --> Q1

    Q1 -->|"Feature/Bug"| Q2
    Q1 -->|"Docs/Process"| ADOCS
    Q1 -->|"Planning/Design"| Q4
    Q1 -->|"Brainstorm/Review"| Q5

    Q2 -->|"1-2 pts"| TRIV
    Q2 -->|"3+ pts"| Q3

    Q3 -->|"Yes"| BDD
    Q3 -->|"No"| TDD

    Q4 -->|"Planning"| STEPPED
    Q4 -->|"Implementation"| TDD

    Q5 -->|"Yes"| STEPPED
    Q5 -->|"No"| PROC

    style TDD fill:#4a9eff,color:white
    style BDD fill:#be4bdb,color:white
    style TRIV fill:#51cf66,color:white
    style ADOCS fill:#868e96,color:white
    style STEPPED fill:#20c997,color:white
    style PROC fill:#ffd43b,color:black
```

---

## See Also

- [WORKFLOWS.md](WORKFLOWS.md) - Complete workflow documentation
- [BIKELANE.md](BIKELANE.md) - BikeLane system deep dive
- [bmad-compatibility-matrix.md](bmad-compatibility-matrix.md) - BMAD 6.0 compatibility
