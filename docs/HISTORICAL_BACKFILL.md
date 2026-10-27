# Historical learning backfill · 学习记录补录

New MCP tool: `learning_backfill_records` (deployed in Cove Learning Next).

For previously completed work that can be grounded in a chat log or notes, use the historical backfill tool. The existing `learning_add_record` is still used for normal one-off completed learning entries.

## Input
- `records`: 1–20 entries. Required for each: `local_date`, `started_at`, `ended_at`, `title`, `time_precision` (`exact` or `estimated`), `evidence_note`. Timestamps must include explicit timezone offsets.
- Optional: `object_id` (real course/project/track), `task_id`, `summary`, `activity_type`, `focused_minutes`, `note`, `tags`, `next_action`, `time_zone`.
- `dry_run:true`: preview and validate the proposed batch without writing.

## Guardrails
1. Never invent timestamps for missing history. Use `estimated` only for explicitly approximate, evidence-bounded intervals; otherwise skip the entry. A scheduled class alone is not proof of study.
2. Unknown focused time defaults to 0, not elapsed time. Any nonzero focused minutes are supplied explicitly and must be supported by evidence or visibly marked estimated.
3. Saved record provenance includes an evidence note, a precision label, `source=import`, and tags `历史补录` and `时间估计` / `时间已核实`.
4. Idempotent retry: same dated identity and content reuses the existing record. Existing records from the ordinary record API are also recognized by matching identity. Content discrepancies against an earlier backfill conflict; correct through `learning_update_record`.
5. The batch validates before writing; any write failure rolls the transaction back. Maximum batch size is 20.
6. The tool is reachable via the capability-protected Learning MCP endpoint; ChatGPT may need to refresh its plugin tool schema to expose newly registered tools.

Verification: `npm run build && npm test`; MCP tests exercise tool discovery, preview, create, retry, and conflict.
