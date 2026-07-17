# DECISIONS.md

> Architecture Decision Records (ADR). Append-only. Newest on top. Each non-trivial decision gets one entry.

## Active Decisions

### D-002: Track-to-Team Mapping
- Date: 2026-07-17
- Status: Accepted
- Track: integration
- Context: Procession has two-person team (严梓峻 backend, 夏天 frontend). Need to map tracks to owners for accountability.
- Decision: `B-*` (backend) → 严梓峻; `F-*` (frontend) → 夏天; `I-*` (integration) → jointly owned (whoever picks up first); `D-*` (docs) → either team.
- Consequences:
  + Clear ownership per task
  + Integration tasks need coordination protocol (already in AGENT_PROTOCOL.md)
  - Solo contributors on each track means single point of failure per track (mitigated by stale detection)
- Supersedes: none
- Affects: All PLAN.md tasks

### D-001: Adopt multi-track-development-planning skill
- Date: 2026-07-17
- Status: Accepted
- Track: integration
- Context: Long-horizon project (6-10 weeks), LLM agents will execute across many sessions, parallel frontend/backend tracks. Need agent-proof planning system.
- Decision: Apply `multi-track-development-planning` skill (v1.1.0, https://github.com/NoWint/multi-track-development-planning). Generate the 7 live documents + Phase 1 task graph per skill §7.
- Consequences:
  + Any zero-memory agent can continue via RECOVERY.md
  + Parallel execution safe via 8 mechanisms
  + Quality enforced via 3-layer acceptance
  - Overhead: every session follows 4-stage protocol; ~30 min handoff overhead per session
- Supersedes: none
- Affects: All PLAN.md tasks, all future sessions

## Superseded / Deprecated Decisions

(none yet)

---

## Entry Template (copy when adding a new ADR)

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

## When to Append an ADR

MUST append when making any non-obvious choice that affects future tasks:
- Changing a mapping function (e.g., `cpuToHeight` formula)
- Adjusting a data structure (`SystemSnapshot` field additions/removals)
- Reordering phase sequence
- Changing acceptance criteria mid-task
- Choosing between alternative implementations
- Resolving a blocker in a non-obvious way

DO NOT append for: routine code changes, typo fixes, formatting, or anything already specified in SPEC.md.

---
**This file is the single source of truth for non-obvious design decisions. Append-only.**
