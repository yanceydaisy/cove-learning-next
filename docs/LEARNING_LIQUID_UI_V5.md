# Cove Learning · Liquid Glass V5 UI experiment
**2026-10-11 · Explicit user request: “就要改UI”**

## What is available
- **Opt-in preview:** `https://learning-next.43.133.238.9.sslip.io/?ui=glass`
- **Existing default:** `https://learning-next.43.133.238.9.sslip.io/` (unchanged)
- **Branch:** `feat/learning-liquid-ui-preview`

This is a **working** UI, not a generated image or static mockup. The preview uses the exact same Today/Plan/Learn/Library app and real test backend, with the existing task, focus, object and resource actions intact. It does not create a new learning domain model.

## Visual implementation
- The original, user-approved **Home Liquid Glass V5** vertex/fragment shader is copied verbatim from `/home/ubuntu/projects/cove-home-liquid/home-liquid-v5.js` into the opt-in runtime via `ops/build_learning_glass.py`. The same full-card rounded-rectangle refraction, interior edge-gradient lens, upper-left/lower-right fine white glints and 3×3 Gaussian sampling remain.
- Exactly **one major WebGL surface per page**: Today focus hero, Plan composer, Learn focus stage, Library object overview. The task/history lists remain open and readable. Dock uses subtle CSS blur rather than additional GPU contexts.
- Dark ink / blue-violet atmosphere, large editorial serif titles, dusty pink accents, sparse vector ornaments, strong foreground text contrast, rounded cards and a floating four-tab dock.
- The atmospheric wallpaper is drawn to a single canvas and shared pixel-for-pixel with the WebGL texture, so refraction samples the actual wallpaper rather than an invented separate texture.
- The top **换背景** control accepts an image up to 8 MB **in memory only**, using FileReader data URIs allowed by the CSP. No upload, storage or background syncing is performed. The Home and Learning origins have separate localStorage; Learning cannot automatically read the photo stored under Home's origin.
- Respects `prefers-reduced-motion`; uses low-power WebGL contexts, 1.5 DPR texture cap, ~20fps render cap, offscreen visibility tracking, and context cleanup after page navigation. If WebGL fails, a readable CSS translucent fallback is shown.

## Safety
- The opt-in mode is gated by `?ui=glass`. Standard Learning UI and original routes are unchanged.
- Changes are **only** `public/app.js` and `public/style.css` (appended guarded preview blocks) plus test/docs/build helpers. No server restart or backend changes required.
- The separate public Learning preview remains unauthenticated. **Do not upload private files**; changing UI does not change its security posture.
- `/?ui=glass` and `/` use the same Learning preview data. Any tasks or focus sessions created in either are visible in the other.
- Home, Together, Chat, Reading, and the independent Glass Lab and dawn letter are untouched.

## Rebuild
```bash
cd /home/ubuntu/projects/cove-learning-next
python3 ops/build_learning_glass.py
node --check public/app.js
npm test
LD_LIBRARY_PATH=$PWD/.browser-deps/root/usr/lib/x86_64-linux-gnu node --import tsx --test test/glass-ui.test.ts test/browser.test.ts
```

The generator is idempotent: it replaces only its marked blocks in the existing app and stylesheet, preserving everything else. It verifies the shader still contains the V5 full-surface interior refraction, corner hairline glints and Gaussian blur. For rollback to the baseline, use Git to revert the two guarded blocks (or switch back to `main`), leaving backend data untouched.

## Acceptance status
- Automated browser tests: actual 393×852 mobile, 393×700 iPhone 15 PWA, all four pages, real task/focus/object actions, WebGL shader compilation, no fallback, no overflow, background picker, old-context cleanup, default mode unchanged.
- Existing Learning backend and browser regression tests still pass.
- **Awaiting the user's visual approval on their physical iPhone 15.** Do not silently make V5 the default until approved.
