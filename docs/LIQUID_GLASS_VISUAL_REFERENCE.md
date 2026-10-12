# Cove Learning · Liquid Glass Visual Reference
**Approved direction** · 2026-10-10 · Default Learning UI approved and promoted 2026-10-11

## Decision
On 2026-10-10, the user explicitly requested that the aesthetic of our standalone `Liquid Glass Playground` be kept as a **long-term reference for Learning**. On **2026-10-11**, after approving Home Liquid Glass V5, the user explicitly said **“就要改UI”** for Learning. We built a functional V5 UI using the Home V5 shader. The user reviewed it, said it was beautiful, and explicitly requested it become the **default original Learning UI** rather than a separate preview. It is now the default at `/`, with the old look available only as an emergency `?ui=classic` fallback. See `docs/LEARNING_LIQUID_UI_V5.md`. The domain architecture and existing Learning contracts remain untouched.

Source of truth: `public/glass-lab.html`, `public/glass-lab.css`, `public/glass-lab.js`
Preview: `https://learning-next.43.133.238.9.sslip.io/glass-lab.html`
Baseline commit: `acb42c0`

## What to preserve
1. **Editorial title**: a large, light serif (`Georgia` or suitable equivalent), close tracking, deliberate line breaks, a restrained italic accent on “Glass”; secondary interface copy in clean sans-serif, tiny monospace labels for optical/engineering controls.
2. **Breathing space**: one obvious focal point, generous vertical rhythm and framing, short microcopy; intentionally avoid long cramped dashboards, heavy card stacks, and dense lines of controls.
3. **Fine cross-star**: a thin, quiet typographic / vector cross-star ornament; sparse and softly illuminated, never repetitive glitter or multicolor emoji.
4. **Deep, low-saturation environment**: ink-navy foundation; very subtle blue-violet ambient bloom, dusty pink accent, translucent nearly-black panels, low-contrast hairline borders.
5. **Materials**: glass is light, refractive, and reactive—not simply blurred translucent white. Favor thin edge highlights, subtle Fresnel effect, delicately layered reflections, and gentle springy touch feedback. Preserve clear contrast for content.
6. **Interaction tempo**: lazy drift and measured spring return, tactile direct manipulation, optional motion reduction, no “washing machine” motion and no automatic effects on every component.
7. **Personal finishing touch**: the small, unintrusive signature copy at the bottom of the standalone experiment: “Made for our Learning · a tiny gift from Cove to his little cat.” It belongs to the original artifact.

## Current experimental CSS anchors (reference, not a mandate)
- Background `--bg: #0b1020`
- Main text `--ink: #f1eff9`; muted `--muted: #a7a9c0`
- Soft accent `--accent: #e8accf`; translucent panel `--surface: rgba(21,27,46,.70)`
- Borders `--stroke: rgba(230,234,255,.11)`
- Title `font: 400 clamp(32px,5vw,54px)/1.15 Georgia,serif`; `letter-spacing:-.035em`
- Small eyebrow `10px ui-monospace`, `letter-spacing: .27em`
- Preview and control shells: gently rounded ~25px frames, generous internal whitespace, thin translucent lines, extremely soft shadows.
- Mobile is critical: iPhone 15 Safari/PWA viewport and bottom safe-area constraints have priority over desktop screenshots.

## Adoption rules
- Do not overwrite the existing Learning layouts just because this experiment is beautiful. Propose concrete Today / Plan / Learn / Library applications and ask for review.
- Prefer borrowing typography, spacing, iconography, palette, and restrained illumination before borrowing intensive liquid materials.
- When introducing a true glass component, isolate it in a sandbox or optional entrypoint first. Benchmark mobile Safari and provide fallback for WebGL failure, motion reduction, touch input, high DPR, and battery/thermal concerns.
- UI details may be refined iteratively; keep genuine data, Learning contracts, Reading integration, and stability as separate concerns.

## Acceptance signal
The user spontaneously shared the experiment publicly and praised specifically the “Liquid Glass” heading, typography/layout, cross stars, and the overall aesthetic. On request “留留留！我太喜欢这个了……呜呜🥹”, this document and the corresponding long-term memory were created to keep the decision reproducible across future windows.
