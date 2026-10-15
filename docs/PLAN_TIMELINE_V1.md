# Plan Timeline V1

**2026-10-16 · calendar-first Plan workspace.**

## Product shape

Plan is no longer a large task-composer card followed by a long task list.

The main page is now:

1. a compact **添加计划** action;
2. a seven-day calendar strip;
3. the selected day's chronological timeline;
4. a bottom **零散任务** area for open tasks that have a DDL but no concrete time block;
5. other unscheduled/no-DDL tasks remain available in a collapsed secondary section.

The add action opens the former composer as a modal dialog. The dialog can set the learning object, date, optional start/end time, DDL, and estimate.

## Timeline semantics

The selected date combines two explicit sources:

- recurring course slots from `weekly_schedule_entries`;
- open tasks with an explicit `scheduled_start` on that local day.

Course slots and tasks are sorted by local clock time.

For the current local day:

- the page renders the current clock time as a **现在** marker;
- items whose effective end has passed are visually muted;
- an item whose interval contains the current time is highlighted;
- future items remain full-contrast.

For past/future selected dates, items are styled consistently as past/future rather than pretending the current clock applies to that date.

## Migration v6

Tasks gain:

- `scheduled_start TEXT NULL` — canonical UTC ISO timestamp;
- `scheduled_end TEXT NULL` — canonical UTC ISO timestamp.

A new `weekly_schedule_entries` table stores recurring class slots:

- `object_id` — optional course relation;
- `title`;
- ISO weekday `1..7` (Monday..Sunday);
- local `start_time` / `end_time` as `HH:MM`;
- `effective_from`;
- optional `effective_until`;
- timestamps.

Recurring schedule dates are local calendar facts; one-off task time blocks remain UTC instants.

No user-specific timetable is hard-coded in the migration. Personal timetable data is imported separately through the domain service after deployment.

## API

- `GET /api/schedule` — list recurring slots.
- `GET /api/schedule?local_date=YYYY-MM-DD` — resolve recurring slots active on one local date.
- `POST /api/schedule` — create a recurring slot.
- `POST /api/schedule/:id` — update a recurring slot.
- Task create/update APIs additionally accept `scheduled_start` and `scheduled_end`.

A recurring slot may only reference a Learning object whose kind is `course`.

## MCP

`learning_schedule` supports:

- `list`
- `date`
- `create`
- `update`

`learning_create_task` and `learning_update_task` also accept scheduled start/end timestamps.

No schedule-delete tool is exposed in V1.

## Validation

Coverage includes:

- recurring weekday/date resolution;
- course-only recurring schedule relations;
- explicit task time-block validation;
- v5 → v6 persistence;
- HTTP schedule creation/date reads;
- MCP schedule creation/date reads;
- iPhone Plan calendar strip;
- modal task creation instead of an always-visible composer;
- real timeline rendering;
- legacy task editing / Evidence / Importance workflows.
