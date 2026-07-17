# RECOVERY.md

> Any amnesiac agent reads this file FIRST. Keep ≤ 30 lines.

## Protocol

1. `pwd && git status` → if uncommitted changes, read `git diff` first
2. `git pull --rebase origin main`
3. `git log --oneline -10`
4. Read `PROGRESS.md` head (top 3 entries)
5. Read `PLAN.md` Task Index + Status Counts (top of file)
6. Scan `PLAN.md` for any task with `status: in_progress` AND `owner_started_at` older than 30 min → set to `stale` (clear `owner`)
7. Read `BLOCKERS.md`
8. Read `DECISIONS.md` (latest 5 ADRs)
9. Determine track:
   - If trigger was `前端 开始开发` → track = frontend
   - If trigger was `后端 开始开发` → track = backend
   - If trigger was `集成 开始开发` → track = integration
   - If trigger was `开始开发` (no track) → ask user via AskUserQuestion
10. Find next ready task: `track == X` AND `status: pending` AND all `hard` deps `done`; pick lowest ID
11. Read that task's `resume_hint` AND `handoff_notes`
12. Begin `AGENT_PROTOCOL.md` 4-stage flow at Stage 1

## Quick Reference

- Trigger phrases: `前端 开始开发` / `后端 开始开发` / `集成 开始开发` / `继续` / `<track> 状态`
- 4-stage flow: Diagnose → Execute → Gate → Handoff (see `AGENT_PROTOCOL.md`)
- Acceptance has 3 layers: mechanical / existence / behavioral
- Constitution (STRATEGY/SPEC/ARCHITECTURE) changes need `D-*` task + `requires_user_approval: true`

---
**This file is the single source of truth for amnesia recovery. Keep it short.**
