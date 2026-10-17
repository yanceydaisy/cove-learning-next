# Cove Learning MCP V0

**2026-10-15 · Streamable HTTP capability endpoint.**

## Purpose

Learning MCP lets an authorized ChatGPT / MCP client work directly with the standalone Cove Learning domain model instead of driving the browser UI.

It uses the same `LearningApplication` services as the web API, so domain validation, evidence constraints, ordinal importance semantics, focus transitions, and SQLite persistence remain authoritative in one place.

No Plugin is created by this repository. This document describes only the MCP server endpoint.

## Transport

- Protocol: MCP Streamable HTTP via the official `@modelcontextprotocol/sdk`.
- Endpoint shape: `https://learning-next.43.133.238.9.sslip.io/mcp/<capability>`.
- The capability is a random high-entropy path segment stored only in `data/mcp-capability` with mode `0600`.
- The capability value is never committed to Git.
- Unknown / incomplete MCP paths return the same generic 404 shape as a missing interface.
- Stateful MCP sessions expire after 30 minutes of inactivity.
- At most 32 concurrent MCP sessions are retained.

Treat the full capability URL like a password. Rotating the capability file and restarting Learning invalidates the old URL.

## V0 tools

Read / inspect:

- `learning_today`
- `learning_list_tasks`
- `learning_list_objects`
- `learning_list_resources`

Create / update:

- `learning_create_task`
- `learning_update_task`
- `learning_complete_task`
- `learning_task_evidence` — list / link / unlink
- `learning_set_importance` — primary evidence + low / medium / high, or clear
- `learning_focus` — active / recent / start / pause / resume / finish
- `learning_course_context` — list / create / update
- `learning_schedule` — list / resolve one date / create / update recurring class slots
- `learning_create_object` — course / project / track; Project can carry status / stage / progress / next action / blocker
- `learning_update_object` — update object copy and Project metadata

## Deliberate V0 omissions

The MCP does **not** expose:

- task deletion;
- learning-object deletion;
- course-context deletion;
- raw file upload;
- raw file download;
- arbitrary SQLite or filesystem access;
- Home, WeChat, Bridge, VPS shell, or any other Cove subsystem.

This keeps the MCP capability bounded to Learning.

## Semantics

### Evidence and importance

The MCP does not bypass Learning's evidence rules. A task can only link confirmed evidence from its own course. Importance can only use an already-linked confirmed item as its primary basis and remains ordinal `low / medium / high`.

Assessment `weight_percent` is not copied into task importance, and Importance V1 does not silently change the urgency / aging recommendation score.

### Plan schedule

`learning_schedule` uses local calendar weekdays/times for recurring class slots. `learning_create_task` / `learning_update_task` may additionally set explicit UTC `scheduled_start` / `scheduled_end` timestamps for one-off task time blocks. A recurring slot can only link to a `course` object.

### Project metadata

Project objects can carry a lightweight truthful state without pretending milestones exist: `project_status` (`idea / active / paused / done`), `project_stage`, `progress_percent`, `next_action`, and `blocker`. Courses and tracks reject these Project-only fields. Milestones remain a future normalized domain rather than being flattened into text columns.

### Focus

`learning_focus` follows the same focus-session state machine as the app. For pause / resume / finish, a client may omit `session_id` to target the current active session.

### Destructive annotations

`learning_complete_task` is marked destructive because it changes the task lifecycle. Delete tools are intentionally absent.

## Runtime integration

The MCP endpoint is served by the existing Learning Node process and therefore reuses the existing private Unix socket behind Caddy. No additional public TCP port or Caddy hostname is needed.

At startup, `src/server.ts` loads the capability from:

1. `LEARNING_MCP_CAPABILITY`, when explicitly supplied; otherwise
2. `<LEARNING_DATA_DIR>/mcp-capability`, when that file exists.

If neither exists, MCP is disabled while the normal Learning web/API service continues to work.

## Validation

`test/mcp.test.ts` uses the official MCP `Client` and `StreamableHTTPClientTransport` to verify:

- wrong capability path returns 404;
- tool discovery succeeds;
- V0 exposes no delete / remove / upload tool;
- recurring schedule creation and local-date resolution work through MCP;
- course → objective → scheduled task → evidence → importance works end to end;
- Today returns the confirmed importance;
- Focus start / active / finish works through MCP.

Run:

```bash
npm run build
npm test
```
