# BLOCKERS.md

> Append-only log of every unresolved blocker. Mark `Resolved:` when fixed.
> Any agent MUST check this file before starting work.

## Active Blockers

(none — project just bootstrapped)

## Resolved Blockers

(none yet)

---

## Entry Template (copy when adding)

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
**This file is the single source of truth for blockers. Append-only.**
