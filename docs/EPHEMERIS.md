# 刻序 / EPHEMERIS

The approved half-dial is the regular Learning archive at `/#/archive`, reached through the Today “轨迹” link. The standalone `/trace-dial` uses the same component.

## Frontend

`mountEphemeris(scope, {embedded})` mounts the dial and returns its cleanup function. The regular view uses an open ShadowRoot for stylesheet isolation, shares the main theme/navigation, and disposes listeners, fetches, animation frames, resize observation and pending timers on navigation. The native view is a transparent drawing over Learning's existing wallpaper, without a second header or any page/inner scrolling. The visible radius remains 75% of the phone width when available height permits, and shrinks only to fit shorter screens. Needle/hub negative space uses SVG masks. Long record details are fully reachable through tap-to-page controls. The regular topbar is compact and sits closer to the safe-area edge.

Month/day/time selection remains independent of drawing motion. The per-frame underdamped spring may overshoot visually, while selected values stay fixed. Month loading never restarts an in-flight spring. The middle scale stays fixed; only a month/year change can redistribute dates.

Every mount starts from one current local date/time snapshot, regardless of the most recent saved event. RESET returns to the current date/time. Manual browsing stays at the selected time; there is no timer that pulls it back. Footer month/day/event labels and indexes share an aligned row.

The backend month query uses device-local month boundaries converted to ISO instants. Year controls allow historical records to remain reachable. Stale month requests are aborted/ignored. Loading, an empty month and a failed request have distinct states.

## Backend fields and identity

Migration 10 adds:

- `tasks.completed_at`: written on completion and cleared on reopening. Existing task timestamps are not backfilled as exact completion times.
- `learning_records.focus_session_id`: optional link to one complete, finished focus session; one record per session.
- `learning_records.time_zone`: optional IANA zone; when supplied, the record's local date must match its start in that zone.
- `learning_records.idempotency_key`: optional retry key. Reusing a key with the same normalized payload returns the same record; different contents return a conflict.

Records retain local date, start/end, derived elapsed minutes, focused minutes, title, summary, activity type, course/project/track, task, next action, note, tags, source and created/updated timestamps. New timestamps must include an offset or Z and are normalized to UTC.

## HTTP

- `GET /api/trace?from=<ISO>&to=<ISO>`: a half-open window of at most 32 days. Both bounds are required together; omitting both selects the current UTC month. No 100-record cutoff is applied to this read model.
- `GET /api/learning-records`: supports local_date/object_id/task_id, limit (up to 200) and offset.
- `GET /api/learning-records/:id`: one record.
- `POST /api/learning-records`: create.
- `POST /api/learning-records/:id`: correct supplied fields while retaining omitted fields, source and identity.

Trace response: `range`, `generated_at`, `latest_at`, `events`.

An event supplies stable identity, kind/activity_type, title, occurred/start/end timestamps, elapsed_ms, focused_ms, intervals, summary/note/next_action/tags, object/task associations, linked focus session, local date/time zone, source/status and time_source.

A task is a point. Legacy tasks are explicitly marked `legacy_updated_at`; the UI says the completion time is unrecorded. Records produce proportional elapsed-time arcs. Focus arcs use observed start/resume/pause/finish intervals, leaving pauses blank. Recovery drops the unobserved running interval. A focus session explicitly linked to a record is shown once.

## MCP

- `learning_add_record` accepts the new optional link/zone/retry fields.
- `learning_update_record` corrects a factual record by id.
- `learning_get_trace` reads the same bounded trace model as the UI.

## Verification

`npm test`: 23 domain, HTTP and MCP cases, including pause gaps, recovery, cross-month intervals, more than 100 monthly records, retries, record corrections and legacy task precision.

`npm run test:trace-dial`: real backend fixtures, proportional arcs, leap dates, touch picking, overshoot/settling, fixed scales, responsive width, native route, theme sync and remount lifecycle.

`npm run build` compiles the server and tests.

The broader pre-existing `test:browser` suite currently fails at its Today start-button glass selector assertion (line 46). Running it against the unchanged pre-integration HEAD reproduces that failure. This rollout does not change the homepage material selector or its appearance.
