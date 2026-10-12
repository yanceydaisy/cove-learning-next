# Cove Learning — First independent development baseline

This is an isolated, un-deployed development workspace. The running Cove Home/Learning and its database are not modified.

## Product priority
For our actual use first; a standalone product later. Four UI spaces: Today, Plan, Learn, Library.
Do not build a second Chat, Reading engine, or Calendar. AI integration first targets official ChatGPT via a future Bridge adapter; independent model APIs are a later product option.

## Owners
- Catalog: Course / Project / Track (future Topic graph).
- Planning: Task / LearningBlock (Calendar external authority).
- Library: Resource / immutable ResourceVersion / future Original & Interpretation.
- Activity: FocusSession / append-only LearningEvent.
- Today: read-only aggregation of owned facts, not a second task/session database.

## Iteration 0
A thin *horizontal* implementation: create objects, tasks and original resources, run actual focus sessions, show a truthful Today projection. No fake AI, no invented reading anchors, no simulated calendar sync, no mastery percentages. Four navigation surfaces exist together; visual refinement comes later.
The initial resource importer stores originals; Reading document viewing and anchors are NOT implemented. The attachment to ChatGPT Official is NOT implemented yet.

## Current architecture decisions
Modular monolith; modules own their writes, references use stable IDs, all state changes are transactional, UTC timestamps, immutable source blobs. HTTP is an adapter, never owns state transitions. Port/adapters for Reading, Chat/Bridge and Calendar will be added when concrete contracts have been audited. This is not a multi-tenant system.

## Safety
Dev HTTP binds to 127.0.0.1 by default. Binding to a non-loopback interface requires LEARNING_ACCESS_KEY. No production deployment, no existing data migrations.
