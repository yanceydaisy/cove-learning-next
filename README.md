# Cove Learning · standalone horizontal slice

Fresh, isolated standalone development application (not the original Learning inside Cove Home). Current stage: private VPS preview prepared; **public HTTPS route requires one privileged activation**.

## Product surfaces
- **Home:** only the Learning wordmark and four compact doors, no fake data.
- **Today:** real pending tasks, active session and recent learning.
- **Plan:** create and complete tasks with optional study-object links.
- **Learn:** free Focus start/pause/resume/finish and append-only events.
- **Library:** Course/Project/Track and immutable original file intake (8 MB limit, SHA-256).

The UI follows Home's blue-gray glass, serif typography and restrained navigation rather than long mobile cards. It is responsive at 393×852 CSS pixels and accounts for the standalone iPhone 15 full-screen/safe-area case. Includes a dedicated manifest, icons and network-first service worker. AI, Reading anchors, Calendar and Worker are **not** implemented; no fake generated content.

## Privacy and isolation
- Live Home, current `/opt/cove/learning`, and their data are not touched.
- Independent database and originals under the ignored `./data` folder; `UMask=0077`.
- Preview API requires a randomly generated access key. The key is held in browser `sessionStorage`, not embedded in assets or query strings.
- Backend binds only to the host Docker bridge `172.18.0.1:18982`, not a public interface. Public HTTPS must terminate at Caddy.
- The default local development server instead binds to `127.0.0.1:8982`.

## Develop
Node 22.x:
```sh
npm ci
npm run build
npm test
npm run dev
```

Full browser regression is separate (Playwright Chromium and native Linux browser libraries required):
```sh
LD_LIBRARY_PATH=$PWD/.browser-deps/root/usr/lib/x86_64-linux-gnu npm run test:browser
```

Browser coverage: iPhone 15 393×852 no horizontal overflow, small cards, internal navigation, password flow, real task/focus API round-trip, 1440px desktop, and iPhone standalone 393×759 with an 852px full-screen background and 34px safe bottom.

## Private HTTPS preview activation
One-time preparation, already done:
```sh
node ops/init-preview-env.mjs  # idempotent, 0600 data/preview.env
npm run build
```

Privileged proxy/service installation, **not executable by the unprivileged remote agent**:
```sh
sudo bash /home/ubuntu/projects/cove-learning-next/ops/enable-preview.sh
```

Script behavior: backs up the existing Caddyfile, installs a separate systemd unit, validates Caddy configuration before reload, restores on configuration failure. Does not change original Home/Learning routes or restart their applications. Target:

`https://learning-next.43.133.238.9.sslip.io/`

The domain is **not** claimed live until activation and external TLS/browser validation both succeed. Do not send access keys over HTTP. Use the private browser connection dialog only after verifying HTTPS.

## Next
Real Reader reuse contract, official ChatGPT/Bridge adapter, and feature depth across all four modules, without prematurely building generic future APIs.
