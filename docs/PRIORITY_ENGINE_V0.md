# Learning Priority Engine · V0 foundation (2026-10-12)

Status: **released to `main` on 2026-10-12**. The original development branch was `feat/learning-priority-foundation`.

## Product contract

Learning is decision support, **not** an automatic executor or a math-contest accuracy benchmark. A user may temporarily prefer any task, including a low-urgency task, without changing that task's objective urgency. Never fabricate importance scores from the absence of course context.

The Today view retains the accepted Liquid Glass V5 hero and keeps 4 primary navigation tabs. Within Today, 3 internal sections replace a long activity recap: **今天**, **截止**, **全部任务**.

## Sources of ranking information

- Required per task: title (and auto-generated creation time).
- Optional at task creation or edit: course/project link, `planned_for` (client-local calendar date, YYYY-MM-DD), UTC `due_at`, `estimated_minutes`.
- Automatic: actual current time, waiting age, today's explicit user preference.
- Not yet consumed by this engine: course goals, assessment evidence, mastery gap, topic dependencies. Course Context V0 can now store confirmed goals / assessment evidence, but there is still no task-to-evidence relation. The importance coordinate therefore remains **null**, not a meaningless guess.

## Transparent heuristic, subject to future revision

`rankTasks` in `src/modules/priority/engine.ts` is pure and deterministic. Lower-cognitive-load default rules are deliberately used in place of a trained predictive model.

| Deadline state | Baseline ranking points |
| --- | ---: |
| Overdue | 100 |
| Predicted insufficient time using explicitly provided estimate | 92 |
| Within 24 hours | 85 |
| Within 3 days | 70 |
| Within 7 days | 52 |
| Later | 25 |
| Deadline unknown | 35 (neutral fallback, **not a claim of low urgency**) |

Waiting age contributes `min(14, floor(waitingDays)*2)` points (simple aging). Temporary subjective preference adds `40 * boost`, where `boost ∈ {0,1,2}`. The ranking score is an **internal ordering heuristic**, not an objective probability or accuracy statistic. Task urgency is returned separately and stays unchanged by preference. Importance stays null.

A DDL counts as “at risk” only when the user has supplied a remaining time estimate; in its absence the system uses calendar proximity but does not invent effort estimates. The engine never starts, stops, or completes work for a user.

## Temporary preference and expiry

`POST /api/tasks/:id/preference` accepts `boost: 0|1|2`. The numeric boost is an internal scheduler detail: the product UI exposes only the semantic action **“今天先做” / “已优先”** and currently maps that explicit intent to `boost=2`; cancelling maps to zero. `boost=1` remains API-compatible for existing data/tests but is not a user-facing weight control. For nonzero boosts, the browser provides `expires_at` equal to its next local midnight, encoded as UTC ISO. Server validates expiry is in the future and at most 36h out. Expired preferences are ignored by reads; an explicit zero deletes the row. Completing a task deletes its preference. This is stored in SQLite, so a refresh does not discard today's choice.

Timezone policy: v0 adopts the current device's local midnight at the moment of explicit user input. Cross-timezone devices may have different interpretations of "today"; for single-user MVP this is acceptable but should be revisited if multi-device behavior matters.

## Data and endpoints

Migration v2 adds nullable task columns `due_at`, `estimated_minutes`, `planned_for` and separate `task_preferences` with a foreign key. Existing v1 task records keep working without backfilled invented values.

- `POST /api/tasks`: optional new task fields.
- `POST /api/tasks/:id/details`: update/clear the three optional fields.
- `POST /api/tasks/:id/preference`: adjust or clear temporary boost.
- `GET /api/today?local_date=YYYY-MM-DD`: backward-compatible `openTasks` / activity projection plus `todayTasks`, `deadlineTasks`, `recommendations`, `priorityModel`.

Today is **read-only** with respect to owned domain data, and Planning owns task/preference writes. The UI uses the existing non-retried POST adapter.

## UI notes

- Plan still requires only a task title. Date, DDL, and estimate live in collapsed optional inputs and can be modified from each existing task's “设置” action.
- Today ranks and explains recommendations; preference +/- immediately persists and rerenders.
- The previous Today activity-history section is omitted by design; learning history remains in Learn.
- A genuine importance×urgency scatter plot is deferred until importance inputs are available. Do not manufacture point locations for visual completeness.

## Operational boundaries

- Do not merge, deploy, or migrate the existing public preview database before a reviewed smoke test and backup.
- The independent public preview currently has **no authentication**; never upload personal PPT, private school notes, or credentials.
- No Calendar synchronization, course-goal parser, ML prediction, or ChatGPT-specific API integration was added.

## Validation

Run `npm run build && npm test`; on an equipped VPS also run `npm run test:browser`. Added tests cover invalid data, optional metadata, preservation across restart, deadline slack, aging, temporary preference, UTC expiry, edit API and no fabricated importance.
