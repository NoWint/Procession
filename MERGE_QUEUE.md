# MERGE_QUEUE.md

> Serialized merge queue for parallel branches. Process in order; new entries append to bottom.

## Queue (process top-to-bottom)

- [x] trae-20260717-001 / branch wip/trae-20260717-001-F-003 / F-003 Global styles + main.tsx + index.html — merged via b757536
- [x] trae-20260717-002 / branch wip/trae-20260717-002-frontend-batch / F-004 + F-009 + F-010 + F-013 parallel frontend batch — merged via c4b7510

---

## Merge Rules

1. Merge agent processes queue in order (top first)
2. Before each merge: `git fetch origin && git rebase origin/main` on the target branch
3. If conflict: REJECT merge, append to `BLOCKERS.md` with conflict details, return branch to owner
4. After successful merge: run full mechanical acceptance (cargo build + npx tsc)
5. On acceptance failure: revert merge, mark original task `status: failed`, append to `BLOCKERS.md`
6. Remove from queue once merged (or rejected)
7. Update `PLAN.md` Task Index + Status Counts after each merge

## Entry Template

```markdown
- [ ] session-NNN / branch wip/session-NNN-<task-id> / <task-id> <task-title>
```

## Rejection Template (append to BLOCKERS.md)

```markdown
## BL-NNN: Merge rejected for <task-id>
- Since: <date>
- Task: <task-id>
- Symptom: <conflict files OR acceptance failure list>
- Recovery: "Owner must rebase branch onto latest main, resolve conflicts (within files_allowed_to_touch scope only), re-verify acceptance, re-enqueue"
```

---
**This file is the single source of truth for merge serialization.**
