# Task → Course Evidence V0

**2026-10-15 · explicit relation layer.**

## Why this exists

Course Context V0 can store confirmed course objectives and assessment evidence, but course-level evidence alone is not enough to infer task importance. A task must first state which confirmed evidence it actually supports.

V0 therefore adds an explicit relation from a task to confirmed evidence in the task's own course.

It deliberately does **not** infer links from task-title similarity, course membership, embeddings, or hidden NLP guesses.

## Migration v4

`task_context_links`:

- `task_id` → `tasks(id)`, cascade delete.
- `context_item_id` → `course_context_items(id)`, cascade delete.
- `created_at`.
- composite primary key `(task_id, context_item_id)`.
- reverse lookup index on `(context_item_id, task_id)`.

The database foreign keys protect referential integrity. The service layer additionally enforces course and confirmation semantics.

## Relation rules

A new link is accepted only when:

1. the task exists and is still open;
2. the task is attached to a `learning_object` whose kind is `course`;
3. the evidence item belongs to that exact same course;
4. the evidence item is `confirmed`.

Repeated link requests are idempotent.

Unlinking is also idempotent. Existing links are preserved when a task is completed so history remains traceable. If the evidence item is deleted, the relation is removed by foreign-key cascade. If a linked evidence item later becomes `suggested`, the relation remains visible as stale evidence but Today no longer consumes it.

## API

- `GET /api/tasks/:taskId/evidence`
  - returns the task, its course when applicable, current links, and all currently confirmed evidence available in that course.
- `POST /api/tasks/:taskId/evidence`
  - body: `{ "context_item_id": "<uuid>", "linked": true|false }`
  - links or unlinks one evidence item.

## Plan UI

Open course tasks receive a compact **证据** action.

The evidence panel:

- shows only confirmed evidence as selectable options;
- shows objective / assessment type, assessment weight when present, and source locator when available;
- marks current links;
- explains that the relation records a fact and does not convert assessment weight into task importance.

Project, track, and unbound tasks do not receive a course-evidence editor.

## Today / Priority contract

Today now enriches open recommendations with confirmed linked evidence and adds explainable reasons such as:

- `关联课程目标：掌握状态空间模型分析`
- `关联考核：期末考试（60%）`

The relation **does not change the ranking score in V0** and task `importance` remains `null`.

This is intentional. “This task supports an assessment weighted 60%” is evidence about the assessment, not proof that the task itself should receive an importance coordinate of 60.

The coordinate plot therefore remains empty. When links exist, the UI explicitly says that contribution semantics are still missing rather than claiming that no relation exists.

## Next semantic step

The next importance layer needs an explicit, explainable definition of task contribution, for example a primary evidence relation or a small user-confirmable contribution tier. Only after that contract exists should Priority Engine derive an importance coordinate and place real task points on the importance × urgency plot.

## Validation

Run:

```bash
npm run build
npm test
LD_LIBRARY_PATH=/home/ubuntu/projects/cove-learning-next/.browser-deps/root/usr/lib/x86_64-linux-gnu npm run test:browser
```

Coverage includes same-course confirmation constraints, idempotent link/unlink, persistence across restart, Today evidence explanations, no fabricated importance, the Plan evidence editor, and the mobile Today evidence flow.
