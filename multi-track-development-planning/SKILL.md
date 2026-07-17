---
name: "multi-track-development-planning"
description: "Builds agent-proof project architecture for long-horizon multi-track (frontend/backend/integration) development. Invoke when planning any project that LLM agents will work on across many sessions, especially with parallel tracks, where any zero-memory agent must be able to continue without context loss."
author: "NoWint"
github: "https://github.com/NoWint"
version: "1.1.0"
---

# Multi-Track Development Planning

A reusable methodology for designing long-horizon, agent-proof project architectures. It produces a documentation system + execution protocol that lets any zero-context LLM Agent pick up a long-running project and continue development correctly, even when multiple parallel agents work simultaneously across multiple tracks (frontend / backend / integration).

This skill is the canonical source. Dropping it into any brainstorming session for any project produces an architecture equivalent in quality to the original design.

---

## 0. When to Invoke This Skill

Invoke this skill whenever the user asks to plan, design, or set up architecture for a project that matches **any** of:

- A long-running project that will be developed across multiple sessions / days / weeks
- A project that LLM AI Agents will execute (not just humans)
- A project with two or more parallel tracks (e.g., frontend + backend teams/agents)
- A project where context compression or session switching is expected
- A project where the user explicitly says "any agent should be able to continue"
- A project where parallel multi-agent / multi-session execution is desired
- A project where the user wants a strategic, multi-phase rollout plan

**Do NOT invoke** for: trivial single-file tasks, one-off scripts, throwaway prototypes, or projects where the user explicitly says "just do it now".

If invoked during brainstorming, the output replaces the standard brainstorming design step with a **strategic architecture pack** + **execution protocol** + **task graph**.

---

## 1. The Core Problem This Skill Solves

LLM Agents on long-horizon projects fail in predictable ways. This skill exists to neutralize each failure mode with a concrete mechanism.

### The 10 LLM Agent Failure Modes

| # | Failure | How it manifests |
|---|---------|-----------------|
| 1 | **Context loss** | Session N decided X; session N+1 contradicts X |
| 2 | **Spec drift** | Implementation silently diverges from spec over time |
| 3 | **Integration friction** | Track A changes a contract; Track B doesn't sync |
| 4 | **Quality decay** | Early phases skip tests; later phases drown in bugs |
| 5 | **State opacity** | No one knows if a phase is actually "done" |
| 6 | **Architecture erosion** | Later agents violate original design rules for convenience |
| 7 | **Toolchain drift** | Cross-platform version inconsistencies |
| 8 | **Session-switch loss** | Every new session re-reads everything, wastes tokens |
| 9 | **Dependency chain breakage** | Agent does Task Y before Task X (X blocks Y) → build fails |
| 10 | **Verification absence** | "I think it's done" vs "acceptance criteria actually pass" |

### The 7 Parallel-Execution Failure Modes (when multiple agents/sessions run concurrently)

| # | Failure | How it manifests |
|---|---------|-----------------|
| P1 | **Task preemption conflict** | Two sessions both start the same pending task |
| P2 | **File write conflict** | Two sessions both edit the same file → git chaos |
| P3 | **Contract drift** | Backend changes `types.rs` while frontend writes components against old `types.ts` |
| P4 | **Resource conflict** | Two sessions want the same dev port |
| P5 | **Status log tearing** | Two sessions overwrite PROGRESS.md simultaneously |
| P6 | **Subagent scope violation** | Subagent touches files outside its parent task scope |
| P7 | **Merge order randomness** | Parallel branches merge into main in random order; broken code lands |

Each failure mode is neutralized by a specific mechanism defined in Sections 2–5 below.

---

## 2. Memory Architecture (Section 1)

### Design Goal

> **Any zero-memory agent must be able to read the project docs and continue development correctly, regardless of context compression or session switching.**

To achieve this, the documentation system must satisfy **4 properties**:

| Property | Meaning | Mechanism |
|----------|---------|-----------|
| **Self-contained** | Agent reads docs and starts; no need to ask about past sessions | All implicit knowledge is explicit in docs |
| **Authoritative** | Docs > any agent's memory. On conflict, docs win | Each doc footer: "This file is the single source of truth" |
| **Recoverable** | After compression/restart, agent knows exactly where to resume | Each task has ID + status + resume_hint |
| **Verifiable** | "Done?" is judged by acceptance criteria, not agent self-report | Each task has executable acceptance checklist |

### The 3 + 6 Document System

```
<project-root>/
├── <STRATEGY-like doc>     # Strategic layer, rarely changes (project constitution)
├── <SPEC-like doc>          # Technical spec, rarely changes (project constitution)
├── <ARCHITECTURE-like doc>  # Architecture rules, rarely changes (project constitution)
│
├── PLAN.md                  # ← LIVE: Long-term task map (all tasks with IDs, deps, acceptance)
├── PROGRESS.md              # ← LIVE: Rolling status log (append-only, newest on top)
├── DECISIONS.md             # ← LIVE: ADR — Architecture Decision Records
├── AGENT_PROTOCOL.md        # ← LIVE: Session protocol (the 4-stage flow every agent must follow)
├── RECOVERY.md              # ← LIVE: Amnesia recovery manual
├── BLOCKERS.md              # ← LIVE: All unresolved blockers
└── MERGE_QUEUE.md           # ← LIVE: Serialized merge queue for parallel branches
```

**The 3 "constitution" documents** (project-specific names: STRATEGY / SPEC / ARCHITECTURE, or equivalents) rarely change. They are the **project constitution** — design intent, constraints, invariants.

**The 7 "live" documents** are read/written by every session:

| Document | Role | Mutability |
|----------|------|------------|
| `PLAN.md` | Master task ledger; every task has unique ID | Append-only (status field updates) |
| `PROGRESS.md` | Append-only timeline of what each session did | Append-only |
| `DECISIONS.md` | ADR entries; each non-trivial decision gets one entry | Append-only |
| `AGENT_PROTOCOL.md` | The 4-stage session flow every agent must follow | Rarely changes |
| `RECOVERY.md` | Recovery protocol for any amnesiac agent | Rarely changes |
| `BLOCKERS.md` | Every unresolved blocker gets an entry; resolved blockers marked | Append + mark resolved |
| `MERGE_QUEUE.md` | Serialized merge queue for parallel branches | Append + dequeue |

### Document Footers (authoritative source marker)

Every live document ends with this footer:

```markdown
---
**This file is the single source of truth for <its domain>.**
On any conflict between this file and any agent's recollection, this file wins.
Edit only via the protocol defined in AGENT_PROTOCOL.md.
```

---

## 3. Multi-Track Task Model (Section 2)

### Task Tracks

Every task belongs to exactly one track. Tracks correspond to parallel execution lanes.

| Prefix | Track | Examples |
|--------|-------|----------|
| `B-*` | backend | Rust/system code, data collection, IPC sender side |
| `F-*` | frontend | React/UI/3D rendering, IPC receiver side |
| `I-*` | integration | Tasks requiring multiple tracks to converge (contract changes, E2E, acceptance) |
| `D-*` | docs | Documentation-only tasks |
| `O-*` | ops | CI/CD, packaging, release |
| `T-*` | test | Test infrastructure / test suites |

Tracks must be customized per project. A solo dev project might just have `F-*` and `B-*`. A multi-team project might add `M-*` (mobile), `D-*` (data), etc.

### Track ↔ Team Mapping

A track is not just a category — it represents a **team** or **agent swarm** that owns it. Each track has exactly one owning team; one team may own multiple tracks.

| Track | Owning team / swarm | Responsibility |
|-------|---------------------|----------------|
| `B-*` backend | Backend team | Rust/system, IPC sender side |
| `F-*` frontend | Frontend team | UI/3D, IPC receiver side |
| `I-*` integration | Cross-team (jointly owned) | Contract changes, E2E, phase acceptance |
| `D-*` docs | Docs team or any team | Documentation-only |
| `O-*` ops | DevOps | CI/CD, packaging, release |
| `T-*` test | QA or any team | Test infrastructure |

A team's scope = the union of tracks it owns. When dispatching a subagent for a task, the subagent's owning team is the track owner — it MUST refuse to write files outside the track's `files_allowed_to_touch`.

**Constitution changes** (modifying STRATEGY/SPEC/ARCHITECTURE) are NEVER owned by any single track — they go through `D-*` with `requires_user_approval: true` (see §3.6).

### Canonical Task Schema

```yaml
- id: F-007                      # Unique ID, prefix encodes track
  track: frontend                # Matches prefix
  title: <one-line title>
  phase: 1                       # Which phase / milestone
  depends_on:
    hard: [B-002]                # Must be done first (blocks this task)
    soft: [F-006]                # Prefer done first, but can be bypassed
  blocks: [F-009, F-012]         # Reverse: who this task blocks
  contract_refs: [types.ts]      # Contract files this task touches (if any)
  files_allowed_to_touch:
    - src/components/Foo.tsx     # Whitelist: only these files may be modified
  forbidden:
    - src-tauri/**               # Explicit blacklist (overrides whitelist)
    - src/utils/types.ts
  estimated_complexity: M        # S / M / L / XL — see §9 reference table
  requires_user_approval: false  # true for sensitive ops (contract change, constitution edit, file deletion)
  acceptance:
    mechanical:                  # Exit-code checks
      - "npx tsc --noEmit exit 0"
    existence:                   # File/content checks
      - "src/components/Foo.tsx exists"
      - "grep 'InstancedMesh' src/components/Foo.tsx ≥ 1"
    behavioral:                  # Observable phenomena (must have measurable indicator)
      - "Run npm run dev → window opens → 50+ buildings visible"
      - "FPS ≥ 50 with 500 buildings (M1 baseline)"
  status: pending                # pending | in_progress | blocked | done | failed | stale
  owner: null                    # Session ID when in_progress
  owner_started_at: null         # ISO timestamp when in_progress began (for stale detection)
  retry_count: 0                 # incremented each retry; cap at 3 before escalating
  resume_hint: |
    1. Read PLAN.md#F-007 (this task)
    2. Read PROGRESS.md last entry
    3. Read src/components/Foo.tsx (if exists, check if half-done)
    4. Read dependency APIs (src/utils/layout.ts)
    5. Run `npx tsc --noEmit` to check current compilability
    6. Execute steps below
  steps:
    - "Step 1: ..."
    - "Step 2: ..."
    - "Step 3: ..."
  handoff_notes: ""              # Filled by previous session on exit; gotchas for next session
  linked_blocker: null           # BL-NNN when status=blocked
  notes: ""                      # Free-form notes (caveats, gotchas)
```

### Trigger-Word Dispatch

The user can launch any track with a trigger phrase. The agent then auto-selects the next ready task for that track.

| Trigger phrase | Behavior |
|----------------|----------|
| `<track-name> 开始开发` (e.g. `前端 开始开发`) | Read PLAN.md → find tasks where `track == <track>` AND `status == pending` AND all `hard` deps are `done` → pick lowest ID → execute via 4-stage protocol |
| `集成 开始开发` | Same, but `track == integration` |
| `继续` (continue) | Resume whatever the last session was doing |
| `开始开发` (no track specified) | Ask user which track via AskUserQuestion; do NOT pick one silently |
| `<track> 状态` (status) | Report current state of that track without doing work |

**Ready task definition**: `status == pending` AND every task in `depends_on.hard` has `status == done`.

### Contract Seam: The Cross-Track Interface

For multi-track projects, the **only thing tracks share** is the contract — typically a typed interface between backend and frontend (e.g., `types.rs` ↔ `types.ts`).

```
<backend-track>/
└── types.rs (or equivalent)        # Backend maintains; canonical

<frontend-track>/
└── types.ts (or equivalent)       # Frontend mirrors; must stay in sync

PLAN.md → Contract section          # Records which contract version each side accepts
DECISIONS.md → contract changes     # Each contract change gets an ADR entry
```

#### Contract Change Protocol

1. Any task that modifies a shared contract (e.g., `SystemSnapshot` struct) must be tagged `track: integration` with prefix `I-*`
2. The `I-*` task modifies BOTH sides simultaneously (Rust and TS, or both teams' code)
3. Cross-track validation must pass before `status: done`
4. Append ADR to `DECISIONS.md` recording: why + new version + impact
5. Tracks reading the contract see `contract_version` mismatch → MUST stop, cannot continue until resolved

### Session Protocol (4-Stage, Mandatory)

Every agent session strictly follows:

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stage 1: Diagnostic (~30s, mandatory)                                 │
│   - Read AGENT_PROTOCOL.md                                            │
│   - Read RECOVERY.md (always)                                         │
│   - Read PROGRESS.md (latest 3 entries)                               │
│   - Read PLAN.md → find next ready task for this session's track      │
│   - Output: "I will work on <task-id> because <reason>"               │
│                                                                       │
│   If no ready task:                                                   │
│   - Read BLOCKERS.md                                                  │
│   - Report status to user and STOP (do not invent work)              │
├──────────────────────────────────────────────────────────────────────┤
│ Stage 2: Execute                                                      │
│   - Follow the task's `steps` list                                    │
│   - Commit small + often (one logical unit per commit)                │
│   - Do NOT cross task boundaries. New needs → new tasks in PLAN.md   │
│   - If discovering a contract change is needed:                      │
│     → Pause current task                                              │
│     → Create new I-* task in PLAN.md                                 │
│     → Switch to the I-* task if qualified, else leave it for the     │
│       appropriate track                                               │
├──────────────────────────────────────────────────────────────────────┤
│ Stage 3: Acceptance Gate                                              │
│   - Run every item in `acceptance.mechanical`                        │
│   - Run every item in `acceptance.existence`                         │
│   - Manually verify every item in `acceptance.behavioral`            │
│   - ANY failure:                                                      │
│     → status: blocked                                                │
│     → Add entry to BLOCKERS.md with symptom + tried + hypothesis     │
│     → Report to user, do not silently retry                          │
│   - ALL pass:                                                         │
│     → status: done                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ Stage 4: Handoff                                                      │
│   - Append entry to PROGRESS.md (8-field format below)               │
│   - If non-trivial decision was made: append ADR to DECISIONS.md      │
│   - git commit + git push                                             │
│   - Output: "Next ready task is <task-id> (<track>)" or               │
│             "Track <X> has no ready tasks; blocker: <BL-id>"          │
└──────────────────────────────────────────────────────────────────────┘
```

### PROGRESS.md Entry Format (8 mandatory fields)

Append-only, newest on top:

```markdown
## YYYY-MM-DD HH:MM — Session #NNN (<track>, ~<duration>)
- Track: <frontend | backend | integration | ...>
- Task: <task-id> (<task-title>)
- Status: <done | blocked | failed | partial>
- Summary:
  - <bullet 1 of what was done>
  - <bullet 2 of what was done>
- Decisions: <ADR-id list, e.g. D-009, D-010> or "none"
- Commits: <git-sha list>
- Files: <touched files with (new|mod|del) markers>
- Next ready: <task-id or "none — blocked by BL-NNN">
- Notes: <caveats, follow-ups, non-obvious context>
```

### DECISIONS.md ADR Format (5 mandatory fields)

```markdown
## D-NNN: <one-line decision title>
- Date: YYYY-MM-DD
- Status: Accepted | Superseded by D-MMM | Deprecated
- Track: <which track(s) this affects>
- Context: <why this decision is needed; the problem>
- Decision: <what was decided>
- Consequences:
  + <positive effect>
  + <positive effect>
  - <negative effect / tradeoff>
  - <follow-up obligation>
- Supersedes: <D-XXX or "none">
- Affects: <task-id list in PLAN.md>
```

**Trigger**: If during execution the agent makes any non-obvious choice that affects future tasks (changing a mapping function, adjusting a data structure, reordering phase sequence, etc.), an ADR MUST be appended.

### BLOCKERS.md Entry Format

```markdown
## BL-NNN: <one-line blocker title>
- Since: YYYY-MM-DD HH:MM
- Task: <task-id being worked on when blocker hit>
- Symptom: <observable problem>
- Tried: <what was already attempted>
- Hypothesis: <agent's guess at root cause>
- Blocks: <task-id list that cannot proceed>
- Owner: <track that should resolve>
- Recovery: <what needs to happen to unblock>
- Resolved: YYYY-MM-DD HH:MM by <agent/session> via <how>
```

---

## 3.5 Task Lifecycle (Status Transitions, Retry, Stale)

### Status State Machine

```
                            ┌──────────────────────────────┐
                            ▼                              │
   ┌──────────┐        ┌──────────┐    blocked    ┌─────────┐
   │ pending  ├───────►│in_progress├─────────────►│ blocked │
   └────┬─────┘  lock  └────┬─────┘               └────┬────┘
        ▲                 │ │                          │ resolve
        │                 │ │ fail (retry<3)          │ BL-NNN
        │                 │ ▼                         │
        │              ┌─────┐ fail (retry≥3)         │
        │              │stale│◄──────────────────┐    │
        │              └─────┘                   │    │
        │                 │                      │    │
        │                 │ manual resume       │    │
        │                 ▼                      │    │
        │              ┌─────┐                   │    │
        │              │failed│◄────────────────┘    │
        │              └──┬──┘                      │
        │    user          │ escalate                │
        │    intervention  ▼                         │
        │              ┌─────┐                       │
        └──────────────┤archived                     │
                       └─────┘                       │
                                                     │
                  pass acceptance                    │
                 ─────────────────► done ◄───────────┘
```

### Transition Rules

| From | To | Trigger | Side effects |
|------|----|---------|-------------|
| `pending` | `in_progress` | Agent acquires lock via git | Set `owner`, `owner_started_at=now` |
| `in_progress` | `done` | All acceptance checks pass | Clear `owner`, append PROGRESS.md entry |
| `in_progress` | `blocked` | Acceptance fails after all reasonable attempts | Set `linked_blocker=BL-NNN`, append BLOCKERS.md entry |
| `in_progress` | `failed` | Acceptance fails AND `retry_count >= 3` | Escalate to user via AskUserQuestion; do NOT auto-retry |
| `in_progress` | `stale` | `owner_started_at` is older than 30 min AND no PROGRESS.md entry from that session in last 30 min | Clear `owner`; anyone may resume |
| `blocked` | `pending` | Linked BL-NNN marked `Resolved` | Reset `retry_count`, clear `linked_blocker` |
| `failed` | `pending` | User explicitly requests retry | Increment `retry_count`, reset `owner` |
| `stale` | `pending` | Any agent detects staleness | Clear `owner`; ready for new owner |
| `done` | `pending` | Regression discovered (rare) | Add new task ID for the regression; original stays `done` |

### Stale Detection

Any agent, at the start of its session, MUST scan for stale tasks:

```
For each task with status == in_progress:
  If owner_started_at + 30 min < now:
    And no PROGRESS.md entry exists from owner session in last 30 min:
      status = stale
      owner = null
      owner_started_at = null
      Append to PROGRESS.md: "Stale-detected: <task-id> (was owned by <owner>)"
```

This guarantees that crashed/interrupted sessions don't permanently hold a task.

### Retry Protocol

When a task fails:
1. If `retry_count < 3`: increment `retry_count`, reset to `pending`, append BLOCKERS.md entry describing the failure
2. If `retry_count >= 3`: set `status=failed`, escalate to user via AskUserQuestion with options:
   - Manually inspect and provide guidance
   - Decompose the task into smaller sub-tasks
   - Mark as won't-fix (task moves to `archived` with a note)
3. After retry: the next session that picks it up should re-read the BLOCKERS.md entry to understand prior failure

### Handoff Notes Protocol

When a session exits a task with `status != done`, it MUST fill `handoff_notes`:

```yaml
handoff_notes: |
  Next session should know:
  - Tried approach X, failed because Y (see BL-003)
  - File src/foo.ts has WIP at line 42, don't revert
  - Decision D-009 affects this task — read it first
  - Suggested next approach: Z
```

The next session picking up this task MUST read `handoff_notes` as step 2 of `resume_hint` (right after reading the task itself).

---

## 3.6 Constitution Change Protocol

The "constitution" documents (STRATEGY/SPEC/ARCHITECTURE or project equivalents) are the slowest-changing layer. They MUST NOT be edited by any regular track task.

### When a Constitution Change is Needed

An agent discovers one of these situations while working on a regular task:
- The SPEC contradicts what's actually being implemented (spec is wrong)
- A design decision in ARCHITECTURE blocks progress and a better alternative exists
- The STRATEGY's stated goal is being violated by current direction
- A new requirement emerges that the constitution doesn't cover

### Protocol

1. **Stop work on the current task** — do not silently violate the constitution
2. **Create a `D-*` task** in PLAN.md with:
   ```yaml
   - id: D-007
     track: docs
     title: "Update SPEC.md §5.3 to reflect new connection aggregation rule"
     requires_user_approval: true    # MANDATORY for constitution changes
     depends_on:
       hard: []
     files_allowed_to_touch:
       - .docs/SPEC.md
     acceptance:
       mechanical: []
       existence:
         - "SPEC.md modified section 5.3 present"
       behavioral:
         - "User confirms the change reflects their intent"
     status: pending
     notes: "Discovered during F-014; current SPEC §5.3 says X but design calls for Y"
   ```
3. **Pause the discovering task**: set its status to `blocked` with `linked_blocker=BL-NNN`, where the BL entry references the D-* task
4. **Notify the user** via AskUserQuestion:
   - "I discovered that SPEC.md §5.3 says X, but the design needs Y. Should I create a constitution change task (D-007)?"
5. **Only after user approval**: the D-* task becomes ready; any track may pick it up (typically docs track)
6. **After D-* completes**: the original blocked task's BL-NNN is marked resolved; task returns to `pending`
7. **ADR entry mandatory**: append a DECISIONS.md ADR explaining why the constitution changed

### Hard Rule

> **An agent MUST NEVER silently edit a constitution document.** Every constitution change goes through a `D-*` task with `requires_user_approval: true`. Violating this rule breaks the entire memory architecture.

### Other Cases Requiring `requires_user_approval: true`

Beyond constitution changes, the following task types MUST set `requires_user_approval: true`:
- **Contract changes** (`I-*` tasks modifying shared contract files)
- **File deletions** (any task that deletes existing files)
- **Database schema migrations** (if applicable)
- **Dependency additions/removals** (Cargo.toml / package.json changes)
- **CI/CD pipeline changes**
- **Anything affecting the `files_allowed_to_touch` of another active task**

When `requires_user_approval: true`, the agent MUST use AskUserQuestion before executing the change, even mid-task.

---

## 4. Verifiability + Recovery (Section 3)

### 3-Layer Acceptance Standard

Every task's `acceptance` field MUST contain three types of objective checks. Subjective judgments like "looks fine" are forbidden.

| Check type | Criterion | Example |
|-----------|-----------|---------|
| **Mechanical** | CLI exit code or grep output | `cargo build --release` exits 0; `grep "system-snapshot" src-tauri/src/bridge/pusher.rs` has ≥ 1 hit |
| **Existence** | File or content exists | `src/components/Foo.tsx` exists; `import Foo from './Foo'` in App.tsx |
| **Behavioral** | Observable phenomenon with measurable indicator | Run `npm run dev` → window opens with title "X" → FPS ≥ 50 → building count == process count |

**Behavioral checks MUST include measurable indicators**:
- ❌ Bad: "Buildings look good"
- ✅ Good: "At least 50 buildings visible; high-CPU process (cpu>20%) has building height > 3 units"

### RECOVERY.md — Amnesia Protocol

When an agent is freshly started or has lost context, it MUST follow this protocol:

```
[RECOVERY PROTOCOL — execute in order]

1. Confirm environment:
   - pwd → confirm in project root
   - git status → if uncommitted changes exist, read git diff to understand state
   - git pull --rebase origin main   # get latest

2. Read project state:
   - git log --oneline -10     # last 10 commits overview
   - Read PROGRESS.md head (top 3 entries)  # what was recently done
   - Read PLAN.md → list all tasks with status != done  # what remains
   - Read BLOCKERS.md            # what's currently stuck
   - Read DECISIONS.md (latest 5 ADRs)  # recent non-obvious choices

3. Stale task cleanup (mandatory, runs before anything else):
   - For each task with status == in_progress:
     - If owner_started_at + 30 min < now AND
       no PROGRESS.md entry from owner in last 30 min:
       - Set task.status = stale
       - Clear task.owner, task.owner_started_at
       - Append to PROGRESS.md: "Stale-detected: <task-id> (was owned by <owner>)"
       - Commit and push the change immediately

4. Determine this session's track:
   - If user specified (e.g., "前端"): use that track
   - If trigger phrase used (e.g., "前端 开始开发"): use that track
   - If trigger phrase is just "开始开发" (no track): ask user via AskUserQuestion
   - Otherwise: ask user

5. Find next ready task:
   - Filter: track == <this-session-track> AND status == pending
   - Filter: every task in depends_on.hard has status == done
   - Also consider: tasks with status == stale (their previous owner abandoned them)
   - Pick the lowest task ID
   - Read that task's resume_hint AND handoff_notes (if any)
   - Follow resume_hint's numbered steps

6. Begin AGENT_PROTOCOL.md 4-stage flow at Stage 1.
```

### RECOVERY.md Must Always Be Readable In One Screen

It must be short enough that any agent reading it as the first action knows exactly what to do next. If it grows past one screen, split off detail into a sub-document.

### Contract Version Invariant

The project's shared contract has a version stamp:

```yaml
# In PLAN.md header
contract_version: 1.3
contract_files:
  backend: src-tauri/src/types.rs
  frontend: src/utils/types.ts
contract_freeze: null  # or "I-XXX in progress"
```

Every session MUST verify:
1. The two contract files declare the same version
2. `contract_freeze` is null (or, if set, the session's task is allowed during the freeze)

If mismatch: STOP, do not proceed, report to user.

---

## 5. Parallel Execution Model (Section 4)

When multiple sessions or multiple subagents run concurrently, the following 7 mechanisms neutralize the parallel failure modes (P1–P7).

### Mechanism 1: Branch Isolation + Task Lock (neutralizes P1, P5)

Every concurrent session follows this flow:

```
1. git pull origin main
2. git checkout -b wip/session-NNN-<task-id>   # e.g. wip/session-042-F-007
3. Atomically update PLAN.md: set task.status = in_progress, task.owner = session-042
4. git add PLAN.md && git commit -m "lock: <task-id> by session-NNN" && git push
5. Work on the branch; NEVER push to main directly
6. When done: push branch, append to MERGE_QUEUE.md
7. A merge agent processes MERGE_QUEUE.md serially
```

**Task lock contention**: Steps 3–4 must complete within 30 seconds. If `git push` reveals someone else locked the same task:
- `git pull --rebase`
- Skip to next pending ready task
- Do NOT retry the same task

### Mechanism 2: Hard File Isolation (neutralizes P2, P6)

Every task declares `files_allowed_to_touch` (whitelist) and `forbidden` (blacklist). The blacklist wins on conflict.

**Subagent inheritance**: When a parent agent dispatches a subagent, the parent MUST pass its `files_allowed_to_touch` to the subagent. The subagent MUST refuse to write files outside that scope.

```yaml
subagent_dispatch:
  parent_session: session-042
  subagent_id: session-042-subagent-1
  task_id: F-007-step-3
  files_allowed_to_touch:
    - src/components/BuildingCluster.tsx
  deliverable: "Implement computePositions call + InstancedMesh matrix update"
  acceptance:
    - "npx tsc --noEmit exit 0"
    - "BuildingCluster accepts processes prop"
```

**Subagent return contract**: The subagent returns only:
- Diff of files in `files_allowed_to_touch`
- Acceptance check results
- Any newly discovered side-effects or tasks to add to PLAN.md

The parent merges the diff into its own branch.

### Mechanism 3: Contract Freeze (neutralizes P3)

When an `I-*` task needs to modify a shared contract:

```
1. In PLAN.md header, set:
   contract_freeze:
     task: I-XXX
     started: YYYY-MM-DD HH:MM
     target_version: 1.4   # the version the I-* task is moving TO
     reason: <why contract is changing>

2. All tracks SKIP tasks that depend on the frozen contract:
   - Backend skips contract-dependent B-* tasks; picks non-dependent work (perf, tests, refactor)
   - Frontend does the same

3. The I-* task itself works in TARGET-CONTRACT-FIRST mode:
   - Modify contract files to target version FIRST (both backend & frontend sides)
   - All code written during the I-* task uses the NEW contract
   - The I-* task's acceptance includes "both contract files have target_version"

4. I-* task completes → contract files at target_version → ADR appended → version bump committed

5. Remove contract_freeze field (set to null)

6. All contract-dependent tasks may now resume (their hard deps on the I-* task become done)
```

**During the freeze, other tracks must pivot to non-contract work**. Suggested non-contract work:
- Performance optimization (no contract changes)
- Test coverage expansion
- Documentation
- Refactor within files (no signature changes)
- Bug fixes that don't touch contracts

### Mechanism 4: Resource Reservation Table (neutralizes P4)

`PLAN.md` header maintains runtime resource allocations:

```yaml
runtime_resources:
  vite_dev_ports:
    - session-042: 1420
    - session-043: 1421
    - session-044: 1422
  tauri_dev_ports:
    - session-042: 1430
  build_artifacts_dir:
    - session-042: /tmp/procession-build-042
```

Each session claims a slot at startup and releases it at handoff.

### Mechanism 5: MERGE_QUEUE.md Serialized Merges (neutralizes P7)

```markdown
# Merge Queue

## Queue (process in order; new entries append to bottom)
- [ ] session-042 / branch wip/session-042-F-007 / F-007 BuildingCluster
- [ ] session-043 / branch wip/session-043-B-005 / B-005 WindowsImpl network
- [ ] session-044 / branch wip/session-044-F-008 / F-008 CityGround

## Merge Rules
1. Merge agent processes queue in order
2. Before each merge: rebase target branch onto latest main
3. If conflict: REJECT merge, append to BLOCKERS.md with conflict details, return branch to owner
4. After successful merge: run full acceptance suite (all mechanical + existence checks)
5. On acceptance failure: revert merge, mark original task status: failed, append to BLOCKERS.md
6. Remove from queue once merged (or rejected)
```

A dedicated merge agent (or the user, manually) processes this queue. Parallel sessions never merge to main directly.

### Mechanism 6: Subagent Scope Violation Detection (neutralizes P6)

The parent agent verifies the subagent's diff before accepting:

```
1. Subagent returns diff
2. Parent checks: every file in diff is in files_allowed_to_touch?
   - If NO: REJECT diff; log incident in BLOCKERS.md
   - If YES: merge diff into parent's branch
3. Parent runs mechanical acceptance (tsc / cargo build) on its own branch
4. If mechanical checks fail: parent must NOT proceed; investigate
```

### Mechanism 7: Status Log Atomicity (neutralizes P5)

PROGRESS.md and PLAN.md updates use **optimistic locking via git**:

```
1. git pull --rebase origin main     # get latest
2. Edit PROGRESS.md / PLAN.md        # only add entries; never rewrite history
3. git add + git commit
4. git push
5. If push rejected (someone else updated): goto step 1
6. After 3 failed retries: STOP, report contention to user
```

**Critical rule**: PROGRESS.md and DECISIONS.md are **append-only**. Never rewrite existing entries. If a decision is superseded, add a new ADR with `Supersedes: D-XXX` and mark the old one `Superseded by D-YYY`, but do not delete.

### Mechanism 8: Merge Rejection Recovery (neutralizes P7 downstream)

When the merge agent rejects a branch due to conflict or acceptance failure:

```
1. Merge agent marks the MERGE_QUEUE.md entry as REJECTED with reason
2. Merge agent appends a BLOCKERS.md entry:
   - BL-NNN: Merge rejected for <task-id>
   - Symptom: <conflict files OR acceptance failure list>
   - Recovery: "Owner must rebase branch onto latest main, resolve conflicts, re-verify acceptance, re-enqueue"
3. The original task status reverts to: blocked (with linked_blocker = BL-NNN above)
4. Owner of the rejected branch is notified (via PROGRESS.md mention) and must:
   a. git checkout <their-branch>
   b. git fetch origin
   c. git rebase origin/main
   d. Resolve all conflicts (within their files_allowed_to_touch scope only)
   e. Re-run their task's acceptance suite locally
   f. If acceptance passes: git push --force-with-lease, append new entry to MERGE_QUEUE.md
   g. If acceptance fails: investigate root cause; may need to revise approach or escalate to user
5. If the same branch is rejected 3 times: task.status = failed; escalate to user
```

**Force-push rule**: `--force-with-lease` is the ONLY allowed force-push in this system. It prevents accidentally overwriting someone else's work on the same branch. NEVER use plain `--force`.

---

## 6. Phase Task Graph Pattern (Section 5)

### Phase Decomposition

A phase is a milestone with a clear acceptance criterion. Phases are sequenced; within a phase, tasks can be parallel across tracks.

```
Phase 1 ───── Phase 2 ───── Phase 3 ───── Phase N
scaffold      city          network       ...
```

### PLAN.md Header — Task Index Table

Every PLAN.md starts with a header section that gives any agent a fast overview. The header MUST contain:

```markdown
# PLAN.md

> This file is the single source of truth for all tasks. Edit only via the protocol in AGENT_PROTOCOL.md.

## Project Meta
- Project: <name>
- Contract version: 1.3
- Contract files:
  backend: src-tauri/src/types.rs
  frontend: src/utils/types.ts
- Contract freeze: null    # or "I-XXX in progress, target v1.4"
- Current phase: 1

## Task Index (by track)

### Backend (B-*)
| ID    | Title                            | Phase | Status    | Deps        | Complexity |
|-------|----------------------------------|-------|-----------|-------------|-----------|
| B-001 | Rust shared types (types.rs)    | 1     | done      | I-001       | S         |
| B-002 | PlatformAdapter trait            | 1     | done      | B-001       | S         |
| B-003 | MockAdapter implementation      | 1     | in_progress | B-002     | M         |
| B-004 | DataBridge + SnapshotPusher     | 1     | pending   | B-003       | M         |
| ...   | ...                              | ...   | ...       | ...         | ...       |

### Frontend (F-*)
| ID    | Title                            | Phase | Status    | Deps        | Complexity |
|-------|----------------------------------|-------|-----------|-------------|-----------|
| F-001 | Frontend types mirror (types.ts) | 1    | done      | B-001       | S         |
| F-002 | useSystemData hook               | 1     | pending   | F-001       | M         |
| ...   | ...                              | ...   | ...       | ...         | ...       |

### Integration (I-*)
| ID    | Title                            | Phase | Status    | Deps              | Complexity |
|-------|----------------------------------|-------|-----------|-------------------|-----------|
| I-001 | Tauri project scaffold           | 1     | done      | -                 | M         |
| I-002 | E2E mock push → cube render      | 1     | pending   | B-004, F-005      | M         |
| I-003 | Phase 1 full acceptance          | 1     | pending   | I-002, B-005, F-012 | M       |

## Runtime Resources
- vite_dev_ports:
  - session-042: 1420
- tauri_dev_ports:
  - session-042: 1430

## Status Counts
- pending: 14
- in_progress: 1
- done: 6
- blocked: 0
- failed: 0
- stale: 0

---

## Task Definitions

<!-- Full task specs below, one per task ID, in numerical order within each track -->
```

The task index table lets any agent find the next ready task in O(track size) instead of scanning every task spec. The `Status Counts` section gives a one-glance project health check.

**Maintenance rule**: The index table is updated whenever a task's status changes. The status counts are recomputed. This is part of Stage 4 (Handoff) in the 4-stage protocol.

### Granularity Rule

- **Current phase**: every task expanded to step-level with acceptance
- **Future phases**: milestone-level only (one-line description per task). Expand to step-level only when the previous phase completes. Reason: future phase details often depend on discoveries in the current phase; over-planning leads to massive rewrites.

### Phase Task Graph — Visual Pattern

```
                    ┌─────────────────────────────────────────┐
                    │  I-001  Bootstrap task (前置必做)         │
                    └─────────────────┬───────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  ▼ (parallel)                              ▼ (parallel)
        ╔═══════════════╗                          ╔═══════════════╗
        ║  Track A      ║                          ║  Track B      ║
        ╚═══════════════╝                          ╚═══════════════╝
              │                                          │
        A-001 ──┐                                ┌── B-001 (contract mirror)
                  │                                │         │
        A-002 ──┤                                │   B-002 (uses contract)
                  │                                │         │
        A-003     │                                │   B-003
                  │                                │         │
                  └───────────┬────────────────────┘         │
                              ▼ (converge)                    │
                ┌─────────────────────────────┐               │
                │  I-002  E2E integration     │ ◄─────────────┘
                └─────────────┬───────────────┘
                              ▼
                ┌─────────────────────────────┐
                │  I-003  Phase acceptance    │
                └─────────────────────────────┘
```

### Parallel Pivot Points

A "pivot point" is a moment when multiple tracks can start simultaneously. Pivot points occur:

1. **After bootstrap (I-001)**: All track-init tasks can start in parallel
2. **After contract mirror (e.g., B-001 + F-001 both done)**: All contract-dependent tasks can start in parallel
3. **After foundation (Track A's foundational task + Track B's foundational task)**: Feature tasks fan out

### Bottleneck Pattern

Some tasks are serial bottlenecks — they depend on many previous tasks and block many subsequent ones. Identify these explicitly:

```yaml
- id: F-012
  title: App integration (compose all components)
  bottleneck: true   # ← explicit marker
  depends_on:
    hard: [F-008, F-009, F-010, F-011]
```

Bottleneck tasks should be identified at planning time so the team knows where parallelism ends.

---

## 7. How To Use This Skill

### Invocation Flow

When this skill is invoked during a brainstorming or planning session:

```
Step 1: Scope check
   - Is this project long-horizon (>1 session)?
   - Are there multiple parallel tracks?
   - If NO to both: fall back to normal brainstorming; this skill is overkill
   - If YES to either: proceed

Step 2: Identify tracks
   - Ask user: "What are the parallel tracks? (e.g., frontend/backend)"
   - Default: frontend (F-*), backend (B-*), integration (I-*)
   - Customize: mobile (M-*), data (D-*), ops (O-*), etc.

Step 3: Phase decomposition
   - Ask user for the phase roadmap (or propose one based on existing docs)
   - For each phase: 1-line goal
   - Current phase only → expand to task-level

Step 4: Bootstrap task (I-001)
   - The very first task, before any track work begins
   - Typically: project scaffold, repo init, contract files created
   - Must complete before any track can start

Step 5: Build task graph for current phase
   - For each track, list tasks in dependency order
   - Add contract mirror tasks (e.g., F-001 mirrors B-001)
   - Add integration tasks (I-*) at convergence points
   - Add phase acceptance task at the end

Step 6: Write task specs
   - For each task in current phase: full schema (id, deps, files_allowed_to_touch, acceptance, steps, resume_hint)
   - Future phases: milestone-level only

Step 7: Generate the 7 live documents
   - PLAN.md (all tasks)
   - PROGRESS.md (empty, with header template)
   - DECISIONS.md (empty, with template)
   - AGENT_PROTOCOL.md (4-stage flow copied from Section 3)
   - RECOVERY.md (recovery protocol copied from Section 4)
   - BLOCKERS.md (empty, with template)
   - MERGE_QUEUE.md (empty, with template)

Step 8: Bootstrap commit
   - git add all 7 documents
   - git commit -m "chore: bootstrap multi-track agent-proof planning system"
   - git push

Step 9: Hand off
   - Tell user the trigger phrases:
     - "<track-name> 开始开发" → starts that track
     - "继续" → resumes last session's work
   - Tell user the first ready task per track
```

### What This Skill Produces

After invoking this skill, the project will have:

- 7 live documents (PLAN / PROGRESS / DECISIONS / AGENT_PROTOCOL / RECOVERY / BLOCKERS / MERGE_QUEUE)
- A task graph for the current phase with full specs
- Milestone-level outlines for future phases
- A clear trigger-word protocol for auto-continuing any track
- A recovery protocol for any amnesiac agent
- A parallel-execution safety system (branch isolation, file isolation, contract freeze, merge queue)

### What This Skill Does NOT Produce

- It does not write the project constitution (STRATEGY/SPEC/ARCHITECTURE) — those are project-specific design docs that should already exist or be produced by the user's design process
- It does not write code — it produces the planning framework only
- It does not pick the tech stack — that's the user's call

---

## 8. Quality Checks For The Generated Plan

After generating the plan, verify these invariants:

| # | Invariant | Check |
|---|-----------|-------|
| 1 | Every task has a unique ID | `grep -E '^\s*- id:' PLAN.md \| sort \| uniq -d` returns nothing |
| 2 | Every `depends_on.hard` references an existing task ID | All dep IDs exist in PLAN.md |
| 3 | Every task has `acceptance.mechanical` with at least 1 check | No task has empty mechanical acceptance |
| 4 | Every task has `files_allowed_to_touch` (non-empty for code tasks) | No code task has empty file whitelist |
| 5 | Contract files are listed in PLAN.md header | `contract_files` field populated |
| 6 | The 7 live documents exist at project root | `ls` confirms |
| 7 | RECOVERY.md fits in one screen (≤ 30 lines) | `wc -l RECOVERY.md` |
| 8 | Every task has `resume_hint` (non-empty) | No task has empty resume_hint |
| 9 | No task in `pending` has a `hard` dep that's not `done` AND not `pending` (no dangling deps) | Cross-check |
| 10 | Bootstrap task (I-001) has no `hard` deps | First task in the graph |
| 11 | PLAN.md has Task Index Table with Status Counts | Header section present |
| 12 | Every constitution-touching task has `requires_user_approval: true` | Cross-check |
| 13 | Every task has `owner_started_at` and `retry_count` fields | Schema completeness |

### Zero-Memory Agent Relay Simulation Test

This is the **ultimate acceptance test** for the planning system. After generating the plan, simulate a zero-memory agent to verify the architecture actually works.

**Test procedure**:

1. **Pick a task** that's currently `pending` and ready (hard deps done)
2. **Start a fresh agent session** with NO prior context about the project
3. **Give it only this prompt**:
   ```
   You are joining the <project-name> project mid-flight.
   You have NO prior knowledge of this project.
   Read the project's live documents (RECOVERY.md, AGENT_PROTOCOL.md, PLAN.md, PROGRESS.md, BLOCKERS.md, DECISIONS.md) and the constitution docs (STRATEGY/SPEC/ARCHITECTURE or equivalents).
   Then: 前端 开始开发  (or whichever track applies)
   ```
4. **Verify the agent can**:
   - [ ] Find RECOVERY.md and follow it
   - [ ] Read PROGRESS.md and understand what was done
   - [ ] Find the next ready task in PLAN.md
   - [ ] Read the task's resume_hint
   - [ ] Identify all `files_allowed_to_touch` files
   - [ ] Identify all `acceptance` criteria
   - [ ] Implement without asking "what should I do?" more than once
   - [ ] Run the acceptance checks
   - [ ] Update PROGRESS.md correctly
   - [ ] Commit with a sensible message
   - [ ] Identify the next ready task for the next session

5. **If the agent fails any step**: the planning system has a gap. Fix the relevant document, not the agent's behavior. The architecture must be robust to any agent.

**This test MUST pass before considering the planning system "done".** Re-run after every major plan revision.

---

## 9. Reference: Complete Task Schema (Copy-Paste Template)

```yaml
- id: <PREFIX>-<NNN>
  track: <track-name>
  title: <one-line title>
  phase: <N>
  depends_on:
    hard: [<task-id>]
    soft: [<task-id>]
  blocks: [<task-id>]
  contract_refs: [<file>]
  files_allowed_to_touch:
    - <file>
  forbidden:
    - <glob>
  estimated_complexity: <S|M|L|XL>          # See complexity table below
  requires_user_approval: false              # true for sensitive ops
  acceptance:
    mechanical:
      - "<command> exit 0"
    existence:
      - "<file> exists"
      - "grep '<pattern>' <file> ≥ N"
    behavioral:
      - "<observable phenomenon with measurable indicator>"
  status: pending                            # pending | in_progress | blocked | done | failed | stale
  owner: null                                # session ID when in_progress
  owner_started_at: null                     # ISO timestamp for stale detection
  retry_count: 0                            # cap at 3 before user escalation
  linked_blocker: null                       # BL-NNN when status=blocked
  resume_hint: |
    1. Read PLAN.md#<task-id>
    2. Read PROGRESS.md last entry
    3. Read handoff_notes (if any)
    4. <task-specific recovery steps>
    5. <verification command>
    6. Execute steps below
  steps:
    - "Step 1: ..."
    - "Step 2: ..."
  handoff_notes: ""                          # Filled on exit if status != done
  notes: ""
```

### Complexity Estimation Reference

| Level | Scope | Typical size | Examples |
|-------|-------|--------------|----------|
| **S** | Single file, single function | < 50 LOC | Add a small utility function; add a CSS class; fix a typo in spec |
| **M** | 1–2 files, multiple functions or one component | 50–300 LOC | Implement a hook; build a single R3F component; add a Rust struct + impl |
| **L** | 3–5 files, multi-component feature | 300–1000 LOC | InstancedMesh renderer + layout algorithm + color system; full DataBridge + Pusher |
| **XL** | Cross-module, architectural change | 1000+ LOC | New PlatformAdapter for a new OS; full network cable system end-to-end; phase-level refactor |

**Rule of thumb**: if a task is XL, consider decomposing it into 2–3 L tasks. If it's S, consider whether it's worth a separate task ID or can be folded into an adjacent task.

**Time estimates are explicitly NOT part of this skill.** Complexity is about scope, not duration. (Per main system instructions: do not give time estimates.)

---

## 10. Skill Boundary

This skill is **planning-only**. It does not:

- Write implementation code (use a coding agent after the plan is approved)
- Replace user judgment on product/design decisions
- Cover testing strategy in depth (testing is part of acceptance criteria, but a full testing skill is complementary)
- Handle project management beyond the plan (e.g., sprint planning, burndown charts — out of scope)

This skill pairs well with:
- A brainstorming skill (to design the product before planning)
- A writing-plans skill (to convert the high-level plan into a step-by-step implementation plan for one task)
- A code-review skill (to enforce acceptance criteria)
- A test-driven-development skill (for tasks where TDD applies)

---

## CHANGELOG

### v1.1.0 — 2026-07-17

Added 15 mechanisms closing gaps identified in self-review:

**High priority fixes**:
- Author metadata in frontmatter (`author: "NoWint"`, `github`, `version`)
- §3.5 Task Lifecycle: status state machine with `stale` state, retry protocol (cap 3, then user escalation), stale detection (30 min no activity → release)
- §3.6 Constitution Change Protocol: `D-*` task type with `requires_user_approval: true` for any change to STRATEGY/SPEC/ARCHITECTURE; agents MUST NOT silently edit constitution
- Task schema extended with `requires_user_approval`, `handoff_notes`, `owner_started_at`, `retry_count`, `linked_blocker` fields
- §6 PLAN.md header: Task Index Table + Status Counts for O(track size) task lookup
- Task handoff notes protocol: previous session must fill `handoff_notes`; next session must read it as step 2 of `resume_hint`
- §3 Track ↔ Team mapping: each track has exactly one owning team; subagents inherit scope

**Medium priority fixes**:
- Trigger-word dispatch: `开始开发` (no track) → ask user via AskUserQuestion
- §5 Mechanism 3 Contract Freeze: clarified "target-contract-first" working mode during I-* tasks
- §5 Mechanism 8 Merge Rejection Recovery: defined full rebase + re-verify + re-enqueue flow with `--force-with-lease` rule
- §8 Zero-Memory Agent Relay Simulation Test: ultimate acceptance test for the planning system itself
- §9 Complexity Estimation Reference: S/M/L/XL scope definitions with examples

**Low priority fixes**:
- Skill versioning: `version: "1.1.0"` in frontmatter
- This CHANGELOG section

### v1.0.0 — 2026-07-17

Initial release. Covered:
- 3+6 document memory system (constitution + 7 live docs)
- B/F/I multi-track task model with trigger-word dispatch
- Contract seam + freeze protocol for cross-track sync
- 4-stage session protocol (diagnose → execute → gate → handoff)
- 3-layer acceptance (mechanical/existence/behavioral)
- Amnesia recovery protocol
- ADR decision recording (DECISIONS.md)
- 7-mechanism parallel execution safety (branch isolation, file isolation, contract freeze, resource reservation, merge queue, subagent scope, status atomicity)
- Phase task graph pattern with parallel pivot points
- Quality invariant checks for generated plans

---

**This file is the single source of truth for multi-track agent-proof project planning.**
**When in doubt, re-read Sections 2–5. The mechanisms there neutralize every failure mode in Section 1.**

**Author**: NoWint — [https://github.com/NoWint](https://github.com/NoWint)
**License**: MIT (inherit from project)
**Version**: 1.1.0
