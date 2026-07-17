# AGENT_PROTOCOL.md

> Every agent session MUST follow this 4-stage protocol. No exceptions.
> Read this file at the start of every session (after RECOVERY.md).

## The 4-Stage Session Flow

```
┌──────────────────────────────────────────────────────────────────────┐
│ Stage 1: Diagnostic (~30s, mandatory)                                 │
│   - Read RECOVERY.md (always, even if you think you remember)         │
│   - Read PROGRESS.md (latest 3 entries)                               │
│   - Read PLAN.md → Task Index + Status Counts                          │
│   - Run stale task cleanup (see RECOVERY.md step 6)                    │
│   - Find next ready task for this session's track                     │
│   - Output: "I will work on <task-id> because <reason>"               │
│                                                                       │
│   If no ready task:                                                   │
│   - Read BLOCKERS.md                                                  │
│   - Report status to user via AskUserQuestion and STOP                │
│     (do NOT invent work)                                              │
├──────────────────────────────────────────────────────────────────────┤
│ Stage 2: Execute                                                      │
│   - Read the task's `resume_hint` AND `handoff_notes` (if any)        │
│   - Follow the task's `steps` list                                    │
│   - Commit small + often (one logical unit per commit)                │
│   - Do NOT cross task boundaries. New needs → new tasks in PLAN.md    │
│   - If contract change needed:                                        │
│     → Pause current task                                              │
│     → Create new I-* task in PLAN.md                                 │
│     → Mark current task blocked (linked_blocker = new BL-NNN)         │
│   - If constitution change needed (SPEC/STRATEGY/ARCHITECTURE):       │
│     → Create D-* task with `requires_user_approval: true`             │
│     → Stop work, ask user via AskUserQuestion                         │
├──────────────────────────────────────────────────────────────────────┤
│ Stage 3: Acceptance Gate                                              │
│   - Run every `acceptance.mechanical` check (CLI exit codes)         │
│   - Run every `acceptance.existence` check (file/content presence)    │
│   - Manually verify every `acceptance.behavioral` check (observable)  │
│   - ANY failure:                                                       │
│     → If retry_count < 3: status = blocked, linked_blocker = BL-NNN  │
│       Append BLOCKERS.md entry with symptom + tried + hypothesis      │
│     → If retry_count >= 3: status = failed, escalate to user          │
│   - ALL pass:                                                         │
│     → status = done                                                   │
│   - Fill `handoff_notes` if exiting without done                      │
├──────────────────────────────────────────────────────────────────────┤
│ Stage 4: Handoff                                                      │
│   - Append entry to PROGRESS.md (8-field format below)                │
│   - If non-trivial decision was made: append ADR to DECISIONS.md       │
│   - Update PLAN.md Task Index (status + counts)                       │
│   - git add + git commit + git push                                   │
│   - Output: "Next ready task is <task-id> (<track>)" or               │
│             "Track <X> has no ready tasks; blocker: <BL-id>"          │
└──────────────────────────────────────────────────────────────────────┘
```

## PROGRESS.md Entry Format (8 mandatory fields)

```markdown
## YYYY-MM-DD HH:MM — Session #NNN (<track>, ~<duration>)
- Track: <frontend | backend | integration | docs | ops | test>
- Task: <task-id> (<task-title>)
- Status: <done | blocked | failed | partial | stale>
- Summary:
  - <bullet 1 of what was done>
  - <bullet 2 of what was done>
- Decisions: <ADR-id list> or "none"
- Commits: <git-sha list>
- Files: <touched files with (new|mod|del) markers>
- Next ready: <task-id or "none — blocked by BL-NNN">
- Notes: <caveats, follow-ups, non-obvious context>
```

## Task Lifecycle (state machine)

```
pending → in_progress (lock acquired) → done (acceptance pass)
                                    ↘ blocked (BL-NNN) → pending (BL resolved)
                                    ↘ failed (retry ≥ 3) → archived (user decision)
                                    ↘ stale (30 min no activity) → pending (auto)
```

See PLAN.md task schema for full field definitions.

## Critical Rules

1. **Never skip Stage 1** — even if you "remember" the project, run diagnostic
2. **Never cross task boundaries** — new needs → new tasks in PLAN.md
3. **Never silently edit constitution** (STRATEGY/SPEC/ARCHITECTURE) — always D-* + user approval
4. **Never force-push main** — use branch + MERGE_QUEUE.md; `--force-with-lease` only on own branch
5. **Never rewrite PROGRESS.md or DECISIONS.md history** — append-only
6. **Always verify contract version matches** between `src-tauri/src/types.rs` and `src/utils/types.ts`
7. **Always use AskUserQuestion** when stuck, not "best guess" — silent guessing breaks the architecture

## Parallel Execution Notes

If you detect another session is working (via PLAN.md `owner` field):
- Do NOT touch their `files_allowed_to_touch`
- Do NOT pick the same task
- Use branch isolation: `git checkout -b wip/session-NNN-<task-id>`
- After done: append to `MERGE_QUEUE.md`, do NOT merge to main directly

See `multi-track-development-planning/SKILL.md` §5 for full parallel execution model.

## Subagent Dispatch

When dispatching a subagent, MUST pass:
- `parent_session`: your session ID
- `subagent_id`: unique ID
- `task_id`: sub-task ID (e.g., `F-007-step-3`)
- `files_allowed_to_touch`: inherit from parent task
- `deliverable`: specific outcome expected
- `acceptance`: sub-task-level checks

Subagent returns only: diff + acceptance results + newly discovered tasks.

---
**This file is the single source of truth for session protocol. Every agent must read it.**
