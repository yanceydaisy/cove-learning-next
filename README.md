# Cove Learning · standalone horizontal test build

## Liquid Glass V5 · default Learning UI (2026-10-11)

After the user approved the glass design, **Liquid Glass V5 became the default UI** at `https://learning-next.43.133.238.9.sslip.io/`. Today / Plan / Learn / Library use the original APIs and data, now with the same full-surface refraction as Home V5. The UI now supports **日间 / 夜间 / 跟随系统** through the shared `cove.home.themeMode` preference; both the wallpaper canvas and WebGL glass material respond to the resolved theme. The **换背景** button remains in the header: images are local-only, never uploaded, and are persisted in browser IndexedDB across app restarts. One WebGL focal surface per page preserves mobile performance. The former `?ui=glass` URL remains compatible; `?ui=classic` is reserved as an emergency appearance fallback, not a separate user-facing preview. The PWA shell cache was bumped for the rollout. See `docs/LEARNING_LIQUID_UI_V5.md`.

Fresh independent Learning application. The public test preview deliberately **does not require login or an access key**. It uses a separate database and has no effect on Cove Home or the old Learning service. A separate **Learning MCP V0** capability endpoint can be enabled from a private `data/mcp-capability` file; it uses the same domain services but exposes only bounded Learning tools and no delete/upload/filesystem access. Contract: [`docs/LEARNING_MCP_V0.md`](docs/LEARNING_MCP_V0.md).

## Priority Engine V0 · deployed (2026-10-12)

Additive task metadata (optional planned date, UTC DDL, estimated minutes), explainable recommendation ranking, bounded aging, and a temporary “今天先做” user preference until the next local midnight are now part of `main`. Today keeps the same urgency/aging/preference ranking logic but uses the approved compact layout. Task Importance V1 can now enrich a task with user-confirmed ordinal importance (`low / medium / high`) without folding it into the ranking score. Contracts: [`docs/PRIORITY_ENGINE_V0.md`](docs/PRIORITY_ENGINE_V0.md) and [`docs/TASK_IMPORTANCE_V1.md`](docs/TASK_IMPORTANCE_V1.md).

## Course Context V0 · deployed (2026-10-14)

Course Context V0 adds the course-level evidence layer: confirmed or suggested objectives, assessment items, optional assessment weights, immutable Library source references, source locators, and edit / confirm / delete controls in Library. Suggested evidence must retain a source and is never treated as confirmed automatically. Task → Course Evidence V0 links tasks to confirmed evidence; Task Importance V1 lets the user choose one linked item as the primary basis and confirm a low / medium / high contribution tier. Contracts: [`docs/COURSE_CONTEXT_V0.md`](docs/COURSE_CONTEXT_V0.md), [`docs/TASK_EVIDENCE_V0.md`](docs/TASK_EVIDENCE_V0.md), and [`docs/TASK_IMPORTANCE_V1.md`](docs/TASK_IMPORTANCE_V1.md).

## Task → Course Evidence V0 · deployed (2026-10-15)

Open tasks attached to a course can now explicitly link to confirmed objectives / assessment evidence from that same course. Plan owns the relation editor; Today surfaces linked evidence in recommendation explanations. Links are factual and traceable, but do **not** change the ranking score or turn an assessment weight into task importance. Migration v4 adds only the relation table. Contract: [`docs/TASK_EVIDENCE_V0.md`](docs/TASK_EVIDENCE_V0.md).

## Task Importance V1 · deployed (2026-10-15)

Open course tasks with linked evidence can now choose one primary evidence item and a user-confirmed low / medium / high contribution tier. Today exposes that ordinal importance and plots only confirmed tasks on the Importance × Urgency coordinate view. Tasks without confirmed importance remain unplotted. The existing recommendation score is deliberately unchanged. Contract: [`docs/TASK_IMPORTANCE_V1.md`](docs/TASK_IMPORTANCE_V1.md).

## App
- **Default page is Today** (heading `Learning`): the wallpaper has the same Home-style full-screen day/night overlay (day brightens, night darkens) instead of a local title card; the `开始学习` action uses a milk-white refractive glass pill, followed by side-by-side 今日任务 / 回顾总结 and a 待办任务 workspace with 列表 / 坐标图 views. The coordinate view plots only tasks with user-confirmed ordinal importance. No separate Home tab.
- Plan: a single task-composer focus with an open actionable list. Create, complete and optionally link tasks to learning objects.
- Learn: one focus stage for start, pause, resume and finish, followed by a light activity archive.
- Library: full-width learning-object stats and creation, followed by an independently spaced materials/upload section. No cramped twin cards. Original source upload stays capped at 8 MB (SHA-256).
- UI direction B2 (breathing rhythm): Today follows the approved compact sketch rather than a large hero; Learn keeps its centered focus stage, Library keeps spacious statistics/upload surfaces, and Plan remains structured. No OS-rendered color emoji in the product UI.
- Four navigation tabs with a 50px dock and 44px+ tap targets. B3 root-level iOS PWA fix uses `html, body { height: 100vh }` with standalone `--app-height:100vh` instead of a `height:100%` root and an `innerHeight`-clamped shell. This targets the iOS 26 `viewport-fit=cover` + `black-translucent` "chin gap" (a WebKit viewport offset bug). The dock now retains an 8px margin *within the CSS viewport* after the user-confirmed full-screen fix and two small upward adjustments (4px + 2px); actual physical alignment still requires user testing. Do not replace with `screen.height` forcing — that previously clipped the dock on iPhone 15.
- Network resilience (v0.11): idempotent API GETs may retry twice after short transient transport errors or 502/503/504; user-facing errors are localized, and an errored screen recovers on `online` / restored page events. POST mutations are **never auto-retried**, preventing duplicate writes when a response is lost. Automated browser regression aborts two initial Today reads, tests persistent failure and recovery.
- For physical-device diagnosis, rapidly tap the COVE / LEARNING header three times to toggle a read-only local overlay. It shows `innerHeight`, CSS `100vh`, safe-bottom, and dock position; no telemetry is sent. If the native black band remains despite full CSS viewport sizing, investigate default Apple status-bar style / reinstallation rather than further reducing dock padding.
- Library file picker uses a custom, keyboard-focusable browser input overlay and an explicit file-name label rather than the overcrowded native file control.

Reading anchors, ChatGPT / Bridge actions, Calendar, interpretation/RAG and the broader Learning roadmap are not yet implemented.

## Public test warning

**Anyone who discovers this HTTPS URL can read, add or change any preview data.** No identity control exists. Upload only disposable, non-sensitive test files; do not store private class notes, credentials or personal documents here. No indexing header and browser cross-site write checks are *not* substitutes for authentication.

The test database is under `./data` on the new isolated repo. Home and the original Learning service are separate.

The upstream binds to a private Unix socket (not TCP on the public interface) and Caddy exposes the preview via TLS. The `LEARNING_PREVIEW_PUBLIC=1` setting intentionally disables the API access key only when `LEARNING_SOCKET` is configured; production login will be a separate implementation. Cross-site `Origin` / `Sec-Fetch-Site` and JSON-only POST checks limit browser-based accidental writes but do not block direct HTTP clients.

## Run and test

Requires Node 22:

```sh
npm ci
npm run build
npm test
npm run dev
```

The local dev server binds to 127.0.0.1 by default and has no required key. The test backend is isolated and all writes live in `./data` (ignored by Git).

Chromium iPhone/PWA browser validation (Linux Playwright shared libraries must be present):

```sh
LD_LIBRARY_PATH=$PWD/.browser-deps/root/usr/lib/x86_64-linux-gnu npm run test:browser
```

Regression covers desktop and 393×852 mobile, plus iPhone 15 standalone with 393×759 and 393×700 *usable* viewports against an 852px physical screen, no access dialogs, and real task/focus round trip. It verifies the single hero, open task/activity groups, spacious Library sections, real learning-object creation, source upload, and no horizontal overflow. Keep fixed page shell and dock within the actual visible viewport (including safe-bottom inset); never use Math.max(innerHeight, screen.height), which placed the dock under an iOS PWA black bottom band. Service worker cache name must be bumped for layout fixes.

## VPS preview

`https://learning-next.43.133.238.9.sslip.io/`

The independent proxy was installed and the original 502 issue was repaired using a private Unix socket. The preview access-key mode has been disabled and the running HTTPS API now returns 200 without credentials. UI changes are served directly from `public` (no backend restart required), with a new service-worker cache revision to refresh PWA assets. Do not restart the original `cove-learning.service`.

Related operator scripts: `ops/enable-preview.sh` and `ops/repair-proxy-socket.sh`; both require explicit authorized administrator execution. These scripts do not touch Home or the original Learning database.

## Future

Real login/authentication is required before storing personal data or promoting the preview to a product. Next modules: Reading reuse contract, genuine Bridge/ChatGPT adapter, and deeper Today/Planning/Library capabilities; avoid premature infrastructure work.
