# Cove Learning · Liquid Glass V5 — default UI

**2026-10-11 · User approved and requested direct promotion to the original Learning interface.**

## Live behavior
- **Default:** `https://learning-next.43.133.238.9.sslip.io/` opens the Liquid Glass V5 UI.
- **Legacy links:** `/?ui=glass` still opens the same UI, but is no longer needed.
- **Emergency appearance rollback:** `/?ui=classic` displays the previous look, using the same app and data.
- **PWA:** `./?source=pwa` opens V5; service worker shell cache is `cove-learning-v0.23-20261016-plan-live-now`. Theme color follows the resolved day/night appearance instead of being forced to navy.

## Design and functionality
The exact Home V5 optical shader is extracted from `/home/ubuntu/projects/cove-home-liquid/home-liquid-v5.js` by `ops/build_learning_glass.py`. It includes rounded full-card refraction, subtle center-to-edge lens distortion, two fine white corner glints, and a mild Gaussian backdrop sample on the hero card. One WebGL focal surface is used per Learning page. All four original pages and their real API actions remain intact:

- **Today:** compact Learning header with no local title-card mask; readability comes from the Home-style full-screen wallpaper overlay. The start action is a milk-white WebGL liquid-glass pill, followed by side-by-side daily tasks / review and backlog list / coordinate views.
- **Plan:** calendar-first seven-day selector, current-time daily timeline for recurring classes and scheduled tasks, DDL backlog, plus a modal task composer.
- **Learn:** refractive focus stage, focus timer and session events.
- **Library:** refractive object overview, course/project creation and resources.

The wallpaper is drawn to one canvas and used by both CSS and the WebGL shader so the refracted texture matches the visible background. Its palette resolves to a pale misty day surface or the original navy-violet night surface; `system`, `light`, and `dark` reuse the shared Home appearance preference. The top **换背景** control accepts images up to 8 MB through FileReader data URLs. Images are **never uploaded**. The selected wallpaper is persisted locally in browser IndexedDB and restored on later app launches.

Performance: reduced-motion support, 1.5 DPR texture cap, 20fps maximum, offscreen visibility tracking, and old-context disposal on page navigation. If WebGL is unavailable, the card falls back to translucent CSS.

## Deployment and tests
The original Learning URL serves the V5 design without a preview query. The original V5 rollout itself did not change Learning domain models; later additive releases now include Evidence / Importance and Plan Timeline V1 while preserving the same Home / Together / Reading / Chat isolation. PWA cache version increments ensure installed copies can receive updated assets.

Validation: `npm test`, `npm run build`, and the Playwright browser tests `test/browser.test.ts` and `test/glass-ui.test.ts`. Browser tests cover the 393×852 iPhone view, 393×700 PWA view, real task/focus/library workflows, local-only photo selection, legacy link compatibility, emergency classic mode, no horizontal overflow, WebGL availability, and PWA cache metadata.

For rollback to the previous *code*, use the Git commit preceding the default promotion; the temporary `?ui=classic` is only an appearance fallback. Do not revert Learning database or data files.

**User preference:** For future Learning UI changes, edit the original UI directly; do not create additional preview URLs or duplicate pages unless explicitly requested.
