# DeepSeek Harness — Desktop Shell (self-contained, cross-platform)

An **Electron** desktop wrapper for DeepSeek Harness that opens the DSH web interface in a
native window, packaged for **Windows / macOS / Linux**.

This build is **self-contained ("装上就能用")**: the harness server and a matching Node runtime
are bundled into the installer. The target machine needs **nothing** — no Node installed, no
network — install, launch, done.

## What it does on launch

1. **Reuse** an already-running DSH server if one answers `http://127.0.0.1:3080`.
2. Otherwise **start the bundled harness**: it runs the bundled `node`/`node.exe` against the
   bundled `dsh` package (`lib/bin.js web`, `--no-open`) with a per-user `DSH_HOME`
   (`%APPDATA%/DeepSeek Harness Desktop/dsh-home`, or the equivalent per-OS app-data dir).
3. Waits for the port, then loads the UI. The app kills its server on quit.

The bundled Node and the bundled harness are the same major version (Node 24), so the native
addons (`node-pty`, `sharp`, `koffi`) load with no compile step. No credentials are bundled.

## Requirements

- **Windows** (nsis + portable), **macOS** (dmg + zip), or **Linux** (AppImage + deb).
- **Nothing else.** Credentials are **not** baked in — you configure your model/provider once
  in the app UI on first launch (normal app setup).

## Building per operating system

Build on the OS you target (electron-builder standard practice). Each build bundles a Node
binary for that platform, fetched automatically by `scripts/fetch-node.cjs` (nodejs.org). The
`vendor\dsh` harness already carries mac/linux/win native prebuilds, so it is shared.

```bash
cd dsh-desktop
npm install

# Windows (NSIS installer + portable exe)
npm run dist:win

# macOS (dmg + zip) — run this ON a Mac
npm run dist:mac

# Linux (AppImage + deb) — run this ON Linux
npm run dist:linux
```

To (re)stage the Node runtime for a platform manually (e.g. after switching OS):

```bash
npm run prepare:node
```

Outputs go to `dist\` (or `dist/`). `npm start` runs the app in dev, and `npm run pack` makes an
unpacked test build.

> `dist:mac`/`dist:linux` run `fetch-node` first, then `electron-builder --mac` / `--linux`.

### Notes on mac/linux builds

- They must be built on that OS (electron-builder is platform-specific; mac also prefers macOS).
- macOS apps are unsigned unless you provide a signing cert, so Gatekeeper will warn on first
  run. Linux AppImage/deb also benefit from signing for wide distribution.
- The per-OS Node binary is staged into `vendor/node/` (`node.exe` on Windows, `node` elsewhere);
  stage only the platform you are building so each installer stays lean.

## Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process: reuse-or-start over the bundled runtime, platform-aware node resolution. |
| `preload.js` | Minimal isolated preload exposing `window.dshDesktop`. |
| `vendor/dsh` | Bundled harness (multi-OS native prebuilds). |
| `vendor/node/` | Bundled Node runtime for the build OS (`node.exe` on Windows, `node` elsewhere). |
| `scripts/fetch-node.cjs` | Downloads/stages the current OS/arch Node binary into `vendor/node/`. |
| `build/icon.png` | Custom 512×512 app icon used for win/mac/linux. |
| `package.json` | Scripts, electron-builder config (win/mac/linux targets), `extraResources`. |

## Customizing

- **Icon**: replace `build/icon.png` (≥512×512).
- **URL/port**: `DSH_URL` env var (disables the local boot) or the constants in `main.js`.
- **Harness version**: replace `vendor/dsh` with a newer `@deepseek-ai/dsh`.

## Notes

- External links open in the system browser; navigation stays on the DSH origin.
- Installers are large (the harness + Node are bundled) — the price of zero dependency on target.
- Unsigned: other machines may show a SmartScreen/Gatekeeper warning on first run.
