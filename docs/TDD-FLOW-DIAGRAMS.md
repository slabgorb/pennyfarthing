# TDD Flow Diagrams

Visual documentation of Pennyfarthing's blessed TDD path workflow.

## Table of Contents

1. [High-Level TDD Flow](#high-level-tdd-flow)
2. [Agent State Machine](#agent-state-machine)
3. [Subagent Delegation Pattern](#subagent-delegation-pattern)
4. [SM Workflow Detail](#sm-workflow-detail)
5. [Complete Handoff Sequence](#complete-handoff-sequence)
6. [Session File Lifecycle](#session-file-lifecycle)

---

## High-Level TDD Flow

The blessed path through the TDD workflow.

```mermaid
flowchart LR
    subgraph Entry
        NW["/new-work"]
    end

    subgraph "TDD Cycle"
        SM1["SM<br/>(Setup)"]
        TEA["TEA<br/>(RED)"]
        DEV["Dev<br/>(GREEN)"]
        REV["Reviewer"]
        SM2["SM<br/>(Finish)"]
    end

    NW --> SM1
    SM1 -->|"story ready"| TEA
    TEA -->|"tests failing"| DEV
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

---

## Agent State Machine

Phase transitions tracked in the session file.

```mermaid
stateDiagram-v2
    [*] --> sm_setup: /new-work

    sm_setup --> tea: SM completes setup
    tea --> dev: TEA writes failing tests (RED)
    dev --> review: Dev implements (GREEN) + PR

    review --> approved: Reviewer approves
    review --> dev: Reviewer rejects

    approved --> [*]: SM archives story

    note right of sm_setup
        Phase: sm
        Status: setup
    end note

    note right of tea
        Phase: tea
        Status: in-progress
    end note

    note right of dev
        Phase: dev
        Status: in-progress
    end note

    note right of review
        Phase: review
        Status: review
    end note

    note right of approved
        Phase: approved
        Status: approved
    end note
```

---

## Subagent Delegation Pattern

Opus agents delegate mechanical work to Haiku subagents.

```mermaid
flowchart TB
    subgraph "Opus Agent (Reasoning)"
        SM["SM Agent<br/>(Prospero)"]
        TEA_A["TEA Agent"]
        DEV_A["Dev Agent"]
        REV_A["Reviewer Agent"]
    end

    subgraph "Haiku Subagents (Mechanical)"
        WSC["workflow-status-check"]
        GSS["generic-sm-setup"]
        GSF["generic-sm-finish"]
        SFS["sm-file-summary"]
        SMH["sm-handoff"]
        GH["generic-handoff"]
        TR["testing-runner"]
        RP["reviewer-preflight"]
    end

    SM --> WSC
    SM --> GSS
    SM --> GSF
    SM --> SFS
    SM --> SMH

    TEA_A --> GH
    TEA_A --> TR

    DEV_A --> GH
    DEV_A --> TR

    REV_A --> RP
    REV_A --> GH
    REV_A --> TR

    style SM fill:#9c27b0,color:white
    style TEA_A fill:#9c27b0,color:white
    style DEV_A fill:#9c27b0,color:white
    style REV_A fill:#9c27b0,color:white
```

---

## SM Workflow Detail

SM handles both story setup and story completion.

```mermaid
flowchart TB
    subgraph "On Activation"
        A1[SM Activated] --> A2[workflow-status-check]
        A2 --> A3{Detected State?}
    end

    subgraph "NEW_WORK Flow"
        N1[generic-sm-setup MODE=research<br/>Scan backlog] --> N2[SM presents options]
        N2 --> N3[User selects story]
        N3 --> N4[sm-file-summary<br/>Read relevant files]
        N4 --> N5[SM writes context doc]
        N5 --> N6[generic-sm-setup MODE=setup<br/>Jira + branches + session]
        N6 --> N7{Story Size?}
        N7 -->|"1-2 pts<br/>trivial"| N8[Handoff to Dev]
        N7 -->|"3+ pts"| N9[Handoff to TEA]
    end

    subgraph "FINISH Flow"
        F1[generic-sm-finish PHASE=preflight<br/>Check PR, lint, Jira] --> F2[SM writes summary]
        F2 --> F3[generic-sm-finish PHASE=execute<br/>Archive + Jira Done]
        F3 --> F4[Story Complete]
    end

    A3 -->|"NEW_WORK_STATE"| N1
    A3 -->|"FINISH_STATE"| F1
    A3 -->|"IN_PROGRESS_STATE"| IP[Report: Another agent<br/>should pick up]

    style A2 fill:#ff9800,color:white
    style N1 fill:#ff9800,color:white
    style N4 fill:#ff9800,color:white
    style N6 fill:#ff9800,color:white
    style F1 fill:#ff9800,color:white
    style F3 fill:#ff9800,color:white
```

---

## Complete Handoff Sequence

Full sequence diagram showing agent interactions and subagent calls.

```mermaid
sequenceDiagram
    autonumber
    participant U as User
    participant SM as SM (Opus)
    participant SMH as SM Subagents (Haiku)
    participant TEA as TEA (Opus)
    participant TEAH as TEA Subagents (Haiku)
    participant DEV as Dev (Opus)
    participant DEVH as Dev Subagents (Haiku)
    participant REV as Reviewer (Opus)
    participant REVH as Reviewer Subagents (Haiku)
    participant SF as Session File
    participant GIT as Git/PR

    %% Story Setup
    rect rgb(74, 158, 255)
        Note over U,SF: Story Setup Phase
        U->>SM: /new-work
        SM->>SMH: workflow-status-check
        SMH-->>SM: NEW_WORK_STATE
        SM->>SMH: generic-sm-setup MODE=research
        SMH-->>SM: Available stories
        SM->>U: Present options
        U->>SM: Select story
        SM->>SMH: sm-file-summary
        SMH-->>SM: File summaries
        SM->>SF: Write context doc
        SM->>SMH: generic-sm-setup MODE=setup
        SMH->>SF: Write session file
        SMH->>GIT: Create branches
        SMH-->>SM: Setup complete
    end

    %% TEA Phase
    rect rgb(255, 107, 107)
        Note over TEA,SF: RED Phase (Tests)
        SM->>TEA: Handoff (or user invokes /tea)
        TEA->>SF: Read session
        TEA->>TEA: Write failing tests
        TEA->>TEAH: testing-runner
        TEAH-->>TEA: Tests RED (expected)
        TEA->>SF: Write TEA Assessment
        TEA->>TEAH: generic-handoff CURRENT_PHASE=red
        TEAH->>SF: Update Phase: green
        TEAH-->>TEA: Handoff complete
    end

    %% Dev Phase
    rect rgb(81, 207, 102)
        Note over DEV,GIT: GREEN Phase (Implementation)
        TEA->>DEV: Handoff (or user invokes /dev)
        DEV->>SF: Read session + TEA Assessment
        DEV->>DEV: Implement code
        DEV->>DEVH: testing-runner
        DEVH-->>DEV: Tests GREEN
        DEV->>GIT: Create PR
        DEV->>SF: Write Dev Assessment
        DEV->>DEVH: generic-handoff CURRENT_PHASE=green
        DEVH->>SF: Update Phase: review
        DEVH-->>DEV: Handoff complete
    end

    %% Review Phase
    rect rgb(255, 212, 59)
        Note over REV,SF: Review Phase
        DEV->>REV: Handoff (or user invokes /reviewer)
        REV->>REVH: reviewer-preflight
        REVH-->>REV: PR data, test status
        REV->>REV: Review code
        alt Approved
            REV->>SF: Write Reviewer Assessment (APPROVED)
            REV->>REVH: generic-handoff VERDICT=approved
            REVH->>SF: Update Phase: approved
            REVH-->>REV: Ready for SM finish
        else Rejected
            REV->>SF: Write Reviewer Assessment (REJECTED)
            REV->>REVH: generic-handoff VERDICT=rejected
            REVH->>SF: Update Phase: implement (back)
            REVH-->>REV: Routed back to Dev
            REV->>DEV: Issues to fix
        end
    end

    %% Finish Phase
    rect rgb(74, 158, 255)
        Note over SM,SF: Finish Phase
        REV->>SM: Handoff (or user invokes /sm)
        SM->>SMH: workflow-status-check
        SMH-->>SM: FINISH_STATE
        SM->>SMH: generic-sm-finish PHASE=preflight
        SMH-->>SM: PR merged, ready
        SM->>SF: Write summary
        SM->>SMH: generic-sm-finish PHASE=execute
        SMH->>SF: Archive session
        SMH-->>SM: Story complete
        SM->>U: Done!
    end
```

---

## Session File Lifecycle

How the session file evolves through each phase.

```mermaid
flowchart TB
    subgraph "1. SM Setup"
        S1["**Phase:** sm<br/>**Status:** setup<br/>**Story:** 2-1<br/>**Branch:** feat/2-1-..."]
    end

    subgraph "2. TEA (RED)"
        S2["**Phase:** tea<br/>**Status:** in-progress<br/>+ **TEA Assessment**<br/>Tests: 5 written, RED"]
    end

    subgraph "3. Dev (GREEN)"
        S3["**Phase:** dev<br/>**Status:** in-progress<br/>+ **Dev Assessment**<br/>Tests: 5/5 GREEN<br/>PR: #42"]
    end

    subgraph "4. Review"
        S4["**Phase:** review<br/>**Status:** review<br/>+ **Reviewer Assessment**<br/>Verdict: APPROVED"]
    end

    subgraph "5. Approved"
        S5["**Phase:** approved<br/>**Status:** approved<br/>Ready for finish"]
    end

    subgraph "6. Archived"
        S6["Session archived to<br/>sprint/archive/"]
    end

    S1 --> S2 --> S3 --> S4 --> S5 --> S6

    style S1 fill:#4a9eff,color:white
    style S2 fill:#ff6b6b,color:white
    style S3 fill:#51cf66,color:white
    style S4 fill:#ffd43b,color:black
    style S5 fill:#4a9eff,color:white
    style S6 fill:#868e96,color:white
```

---

## Scale-Adaptive Routing

Story size determines workflow routing.

```mermaid
flowchart TB
    SM[SM evaluates story]

    SM --> SIZE{Story Points?}

    SIZE -->|"1-2 pts<br/>(trivial)"| TRIVIAL[Skip TEA]
    SIZE -->|"3-5 pts<br/>(standard)"| STANDARD[Full TDD]
    SIZE -->|"8+ pts<br/>(complex)"| COMPLEX[Full TDD]

    TRIVIAL --> DEV[Dev implements]
    STANDARD --> TEA[TEA writes tests]
    COMPLEX --> TEA

    TEA --> DEV2[Dev implements]
    DEV --> REV[Reviewer]
    DEV2 --> REV

    REV --> SM2[SM finishes]

    style TRIVIAL fill:#ffd43b,color:black
    style STANDARD fill:#51cf66,color:white
    style COMPLEX fill:#ff6b6b,color:white
```

---

## Context-Aware Auto-Handoff

Agents check context usage before auto-invoking next agent.

```mermaid
flowchart TB
    DONE[Agent completes work]
    DONE --> CHECK[check-context.sh]
    CHECK --> CONTEXT{Context Usage?}

    CONTEXT -->|"< 70%"| AUTO[Auto-invoke next agent]
    CONTEXT -->|"> 70%"| DEFER[Recommend fresh session]

    AUTO --> NEXT[Next agent continues<br/>in same session]
    DEFER --> MSG["'Context high.<br/>Run /agent in new session'"]

    style AUTO fill:#51cf66,color:white
    style DEFER fill:#ff6b6b,color:white
```

---

## Error Recovery Flow

How handoff failures are handled.

```mermaid
flowchart TB
    AGENT[Agent spawns subagent]
    AGENT --> RESULT{Subagent Result?}

    RESULT -->|"status: success"| SUCCESS[Continue workflow]
    RESULT -->|"status: blocked"| BLOCKED[Handle error]

    BLOCKED --> DIAGNOSE{Fixable by caller?}

    DIAGNOSE -->|"Yes"| FIX[Fix issue]
    FIX --> RETRY{Retry count?}
    RETRY -->|"< 2"| AGENT
    RETRY -->|">= 2"| ESCALATE

    DIAGNOSE -->|"No"| ESCALATE[Escalate to user]

    ESCALATE --> USER[Show structured error<br/>+ required action]

    style SUCCESS fill:#51cf66,color:white
    style BLOCKED fill:#ff6b6b,color:white
    style ESCALATE fill:#ffd43b,color:black
```

---

## Subagent Inventory

Quick reference for all official subagents.

| Subagent | Purpose | Called By |
|----------|---------|-----------|
| `workflow-status-check` | Detect workflow state | SM, all agents |
| `generic-sm-setup` | Research backlog (MODE=research) or setup story (MODE=setup) | SM |
| `generic-sm-finish` | Preflight checks (PHASE=preflight) or execute finish (PHASE=execute) | SM |
| `sm-file-summary` | Summarize files for context | SM |
| `sm-handoff` | SM → TEA/Dev handoff with Jira/branch verification | SM |
| `testing-runner` | Run tests in any repo | TEA, Dev, Reviewer |
| `generic-handoff` | Workflow-driven phase transitions | TEA, Dev, Reviewer |
| `reviewer-preflight` | Gather PR data before review | Reviewer |

---

## Quick Reference

### Entry Point
```
/new-work  →  SM activates  →  workflow-status-check  →  route based on state
```

### Blessed Path
```
SM (setup) → TEA (RED) → Dev (GREEN) → Reviewer → SM (finish)
```

### Phase Values
| Phase | Agent | Next Agent |
|-------|-------|------------|
| `sm` | SM setup | TEA (or Dev if trivial) |
| `tea` | TEA writing tests | Dev |
| `dev` | Dev implementing | Reviewer |
| `review` | Reviewer reviewing | SM (approved) or Dev (rejected) |
| `approved` | Ready for finish | SM |

### Handoff Protocol
1. Agent completes work
2. Agent writes Assessment to session file
3. Agent spawns handoff subagent
4. Subagent updates Phase, workflow checkboxes
5. Agent offers next agent handoff (or defers if context > 70%)
