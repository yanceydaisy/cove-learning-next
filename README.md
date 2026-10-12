# Cove Learning · standalone horizontal test build

Fresh independent Learning application. The public test preview deliberately **does not require login or an access key**. It uses a separate database and has no effect on Cove Home or the old Learning service.

## App
- **Default page is Today** (heading `Learning`): real tasks, active focus and recent sessions, no fabricated progress. No separate Home tab or hub page.
- The bottom bar has exactly four business tabs: Today, Plan, Learn, Library.
- Plan: create, complete and optionally link tasks to learning objects.
- Learn: Focus start, pause, resume and finish with conservative duration accounting.
- Library: Course / Project / Track plus immutable source uploads (8MB max, SHA-256).
- UI: Home-aligned blue-grey glass, serif typography, iPhone 15 393×852 responsive and standalone PWA with safe areas.

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

Regression covers desktop and 393×852 mobile, 393×759 standalone viewport with 852px screen and safe areas, no access dialogs, and real task/focus round trip.

## VPS preview

`https://learning-next.43.133.238.9.sslip.io/`

The independent proxy was installed and the original 502 issue was repaired using a private Unix socket. The preview access-key mode has been disabled and the running HTTPS API now returns 200 without credentials. UI changes are served directly from `public` (no backend restart required), with a new service-worker cache revision to refresh PWA assets. Do not restart the original `cove-learning.service`.

Related operator scripts: `ops/enable-preview.sh` and `ops/repair-proxy-socket.sh`; both require explicit authorized administrator execution. These scripts do not touch Home or the original Learning database.

## Future

Real login/authentication is required before storing personal data or promoting the preview to a product. Next modules: Reading reuse contract, genuine Bridge/ChatGPT adapter, and deeper Today/Planning/Library capabilities; avoid premature infrastructure work.
