# Cove Learning · 核心字段与关联契约（2026-10-28）

从 Node/TypeScript 与 SQLite migrations 1–12 梳理，以下明确区分已实现、未实现；前端不可将未接入功能当作已完成。

## 实体所有权

| Entity | 实有字段 | 状态 / 时间 | 关联边界 |
| --- | --- | --- | --- |
| Course / Project / Track | id, kind, title, description; Project 另有 stage, progress_percent, next_action, blocker | created_at, updated_at; project_status=idea/active/paused/done | Catalog owns learning_objects |
| Task | id, title, description, task_type, object_id, due_at, estimated_minutes, remaining_minutes, planned_for, scheduled_start/end, available_from | status=open/done; workflow_state=todo/in_progress/waiting/blocked; completed_at | Planning owns tasks；Course Evidence、Resource 多对多关联 |
| Plan | 日期视图、周期课程、任务时间块 | weekday + HH:MM + effective range；任务按 UTC instant 映射 | Plan 是投影，绝不独立复制 Task / Course |
| Focus | id, state, started_at, accumulated_ms, ended_at, object_id | running/paused/finished | Activity owns focus_sessions + learning_events；暂停不计入真实专注 |
| LearningRecord | id, local_date, started_at, ended_at, elapsed_minutes, focused_minutes, title, summary, activity_type, note, next_action, tags | source=manual/focus/mcp/import; time_zone, focus_session_id, idempotency_key | Activity owns learning_records；object_id、task_id、多个 Resource |
| Resource | id, title, mime_type, created_at; version id, sha256, size_bytes | immutable original revision 1 | Library owns resources / versions；CourseContext 可引用来源，Task / Record 多对多关联 |

## 资源关联（migration 12）

使用两张双向 FK 且主键唯一的多对多表：
- task_resource_links(task_id, resource_id, created_at)
- learning_record_resource_links(record_id, resource_id, created_at)

HTTP 端点：GET/POST /api/tasks/:id/resources 与 GET/POST /api/learning-records/:id/resources。POST JSON = {"resource_id":"UUID","linked":true/false}。结果：{kind,target_id,count,items}；items 含 resource_id/title/mime_type/version_id/sha256/size_bytes/linked_at。反复 link/unlink 幂等，资料原件不受影响。

MCP 工具：learning_resource_links，参数 action=list|link|unlink, kind=task|record, target_id, resource_id（list 可省）。MCP 继续仅暴露元数据，不允许读取原件字节。

## 语义与校验约束

1. Project 的 project_status、Task 的 status 与 workflow_state 语义不同，任务完成时间以 completed_at 为准。
2. planned_for 仅是日期；scheduled_start/end 与 due_at 是 UTC 时间点。课程周期安排 HH:MM 是本地钟表时间。MCP Plan 接口默认偏移 +480，调用方可覆盖，不作为永久存储值。
3. elapsed_minutes 由真实起止间隔计算；focused_minutes 不等于 elapsed_minutes。未知专注不能凭想象当做全时段专注。历史补录须具备证据与时间精度标识。
4. CourseContext 的 suggested/confirmed 是证据审核状态。任务重要度必须链接已确认的本课程证据；不能拿推荐权重当事实。
5. 文件原件不可变、SHA256 校验；任务/记录被删除只级联删除关联，不删除 Resource。
6. 迁移有 checksum，**只能追加，不要改写 migrations 1–11**；更新运行服务前务必对现用数据库做一致性备份。

## 已知未完成

- 资料库文件夹 / 分类 / 标签的后端模型；目前只存不可变原件与 revision 1。
- Reading PDF/EPUB 选区、页码、锚点的可复查精细关联；此版只连 Resource ID。
- Worker / 非专注陪伴的静态执行与独立模型配置，仍未真正上线。
- 完整的推荐/调度策略与解释性闭环。
- UI 中 Today/Trace 的资源显示需要前端主动读取新关联端点，**不会仅凭后端迁移自动出现**。
