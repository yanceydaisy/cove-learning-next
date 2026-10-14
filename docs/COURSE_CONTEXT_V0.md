# Course Context V0

Status: deployed to `main` on 2026-10-14.

## Product contract

Course Context is the evidence layer that will eventually make task importance explainable.

It does **not** assign an importance score by itself. A course can have goals and assessment evidence while task `importance` remains `null` until a task-level evidence link exists.

The model follows four rules:

1. Course context belongs to an existing `learning_objects(kind='course')`.
2. Manual entries are confirmed by default.
3. Future extraction from PPT / syllabus should create `suggested` entries that preserve their source and require user confirmation.
4. Only confirmed evidence may be consumed by a future Importance Engine.

## Data model

Migration v3 adds `course_context_items`.

Each item stores:

- `object_id`: owning course.
- `kind`: `objective` or `assessment`.
- `title`: source-preserving human-readable statement.
- `weight_percent`: optional assessment weight, never allowed on an objective.
- `source_resource_id`: optional pointer to the immutable Library source.
- `source_locator`: optional location such as “第 2 页 / 第一章目标”.
- `source_excerpt`: optional extracted evidence text.
- `status`: `suggested` or `confirmed`.
- timestamps.

A suggested entry must keep a source resource. Manual confirmed evidence may exist without a source.

Deleting a source file in a future Library workflow will set the foreign key to null rather than deleting the context item.

## API

- `GET /api/courses/:id/context`
  - returns the course, ordered context items, and confirmed-evidence counts.
- `POST /api/courses/:id/context`
  - creates an objective or assessment item.
- `POST /api/course-context/:id`
  - updates title, weight, source, locator, excerpt, or status.
- `POST /api/course-context/:id/remove`
  - deletes one context item.

Only course objects accept context. Projects and tracks are rejected.

## UI

Library keeps its existing learning-object and source-file sections.

For course rows, **课程档案** opens a third internal section with:

- learning objectives,
- assessment items,
- optional assessment weight,
- optional source file and source location,
- confirmation state,
- edit / confirm / delete controls.

The UI explicitly states that unconfirmed evidence does not enter importance judgment.

## Why Importance is still null

Course-level evidence is necessary but not sufficient to place a task on an Importance axis.

For example, knowing that a course contains the objective “掌握状态空间模型分析” does not prove that a task titled “整理笔记” directly advances that objective. V0 therefore refuses to infer task relevance from title similarity or from course membership alone.

The next stage should add an explicit / derived task-to-evidence relation. Only then can Importance V0 consume:

- confirmed objective relevance;
- confirmed assessment relevance / weight.

Knowledge-gap and dependency signals remain future inputs after real Learning Events exist.

## Validation

Current branch validation includes:

- course-only ownership;
- objective / assessment constraints;
- source existence;
- suggested evidence requires a source;
- assessment weight 0–100;
- edit / confirm / delete;
- restart persistence;
- schema migration count;
- HTTP endpoints;
- mobile Library workflow;
- PWA / four-workspace regression.

The public preview remains on stable `main` until an explicit deployment step.
