# Cove Learning · independent dev skeleton (0.1)

**Development-only, not deployed.** This is a fresh standalone Learning project based on the 2026-10-09 architecture baseline. Existing Cove Home, live Learning and databases remain untouched.

Four functional entry points: Today, Plan, Learn, Library. The initial horizontal slice supports:
- Course/Project/Track creation with stable IDs
- Task creation/completion and optional study-object link
- Real Focus start/pause/resume/finish with session events, single-active constraint, measured intervals
- Immutable original file intake (max 8 MB) with SHA-256, ResourceVersion, and safe download
- Today projection of the *actual* tasks, sessions and resources

The following are **NOT implemented**: Reading Anchor and tabs, Ask Cove / official ChatGPT integration, Worker/RAG, Calendar synchronization, LearningBlock, AI Interpretation, reviews and independent model API. They are intentionally not simulated.

## Development
Node 22.13–22.x.

```sh
npm ci
npm run build
npm test
npm run dev
# open http://127.0.0.1:8982 on the VPS itself
```

The HTTP service binds to loopback by default and is **not** exposed through the public reverse proxy.
For a non-loopback host, LEARNING_ACCESS_KEY is required.
Use LEARNING_PORT/LEARNING_HOST/LEARNING_DATA_DIR environment variables for isolated development.
All writable data lives under `./data`, ignored by git.

## Next round
1. Validate this horizontal backbone and UX with the owner.
2. Integrate real Reading contract without cloning the renderer.
3. Add official ChatGPT/Bridge via a concrete audited adapter.
4. Expand true Library/Planning capabilities across the four spaces.
5. Only then harden for public deployment and future independent model API access.

See `docs/BOUNDARIES.md` for the current ownership contract.
