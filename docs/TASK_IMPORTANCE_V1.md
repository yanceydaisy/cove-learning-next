# Task Importance V1

**2026-10-15 · user-confirmed ordinal importance.**

## Product contract

Task Importance V1 turns explicit Task → Course Evidence links into a truthful importance input without inventing a 0–100 score.

A task may link to many confirmed course-evidence items, but its importance input has exactly:

- one **primary evidence** item;
- one user-confirmed contribution tier: **low / medium / high**.

That tier becomes the task's ordinal `importance` in Today.

## What V1 deliberately does not do

- It does not copy an assessment's `weight_percent` onto the task.
- It does not infer contribution from titles, embeddings, or hidden NLP.
- It does not convert low / medium / high into a fake probability or percentage.
- It does not yet mix importance and urgency into one new ranking formula.

The existing urgency / aging / temporary-preference score therefore stays unchanged. This avoids silently choosing an arbitrary trade-off such as “importance counts 1.6× urgency.”

## Migration v5

`task_importance_inputs` stores:

- `task_id` — one row per task;
- `context_item_id` — the selected primary evidence;
- `contribution` — `low | medium | high`;
- timestamps.

A composite foreign key targets `task_context_links(task_id, context_item_id)`. Unlinking the primary evidence therefore clears its importance input automatically.

If the linked Course Context item later stops being `confirmed`, the stored row remains traceable but Today treats importance as unavailable until the user confirms a valid primary evidence again.

## API

`POST /api/tasks/:taskId/importance`

Set / replace:

```json
{
  "context_item_id": "<linked confirmed evidence uuid>",
  "contribution": "high"
}
```

Clear:

```json
{ "clear": true }
```

Only open tasks may change importance.

## Plan UI

The task Evidence panel now contains an **重要度依据** section after at least one confirmed evidence item is linked.

The user chooses:

1. one linked evidence item as the primary basis;
2. low / medium / high contribution;
3. **确认重要度**.

The UI explicitly explains that this is ordinal and that assessment weight is not copied onto the task.

## Today

Recommendations may now expose:

- `importance: "low" | "medium" | "high" | null`;
- `importance_input` with the primary evidence;
- an explanation such as `重要度：高 · 主依据：掌握状态空间模型分析`.

Tasks without a confirmed importance input stay `null`.

## Importance × Urgency plot

The coordinate view finally renders real task points, but only for tasks with confirmed ordinal importance.

- y axis: low / medium / high bands;
- x axis: the existing explainable urgency categories;
- unconfirmed tasks are omitted rather than given guessed coordinates;
- a legend identifies each plotted task.

The x/y positions are categorical visual bands, not hidden continuous scores.

## Ranking boundary

V1 does **not** change recommendation order using importance. The existing `rankTasks` score remains urgency + bounded aging + explicit same-day preference.

A later decision-policy version may define how the two dimensions should affect ordering, but that policy must be explicit and reviewable rather than smuggled in as arbitrary weights.
