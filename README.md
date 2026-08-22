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

## Releases & auto-update

The Windows build ships with **automatic updates** via `electron-updater` + **GitHub Releases**.
The app checks the repo's latest release every time it launches; if a newer version exists it
downloads it and installs on restart.

- **Update source** is embedded (`resources\app-update.yml`) from `package.json` → `build.publish`
  (`provider: github`, `owner`, `repo`). Point an existing release at:
  `https://github.com/<owner>/<repo>/releases/latest`.
- **Only the installed (NSIS `Setup.exe`) build auto-updates.** The portable single-file and the
  `win-unpacked` build do **not** — `electron-updater` needs a proper install location. So install
  with `Setup.exe` to receive updates.

### Publish a new release

```powershell
# 1. bump the version in package.json (e.g. 1.0.0 -> 1.0.1)
# 2. set a GitHub token that can write to the repo
$env:GH_TOKEN = "your fine-grained token (Contents: read & write)"
# 3. build + upload to GitHub Releases
npm run release:win
```

`release:win` = `electron-builder --win --publish always`. It builds the NSIS installer + the
portable exe, then uploads them plus `latest.yml` (the update metadata) to the repo's GitHub
Releases under a tag `v<version>`. After that, any installed older version auto-updates on next
launch.

> Auto-update needs the target machine to reach GitHub. On networks where github.com is
> intermittent/blocked (common in CN), the app may need a proxy/VPN to fetch updates.

## Files

| File | Purpose |
|------|---------|
| `main.js` | Electron main process: reuse-or-start over the bundled runtime, platform-aware node resolution. |
| `preload.js` | Minimal isolated preload exposing `window.dshDesktop`. |
| `vendor/dsh` | Bundled harness (multi-OS native prebuilds). |
| `vendor/node/` | Bundled Node runtime for the build OS (`node.exe` on Windows, `node` elsewhere). |
| `scripts/fetch-node.cjs` | Downloads/stages the current OS/arch Node binary into `vendor/node/`. |
| `scripts/fetch-harness.cjs` | Copies the globally-installed `@deepseek-ai/dsh` harness into `vendor/dsh/`. |
| `build/icon.png` | 512×512 app icon (DeepSeek whale) used for win/mac/linux. |
| `package.json` | Scripts, electron-builder config (win/mac/linux targets), `extraResources`. |

## Customizing

- **Icon**: replace `build/icon.png` (≥512×512).
- **URL/port**: `DSH_URL` env var (disables the local boot) or the constants in `main.js`.
- **Harness version**: replace `vendor/dsh` with a newer `@deepseek-ai/dsh`.

## Notes

- **Fresh clone**: run `npm install` then `npm run setup` to stage the harness + Node into
  `vendor/` (they're gitignored) before building.
- External links open in the system browser; navigation stays on the DSH origin.
- Installers are large (the harness + Node are bundled) — the price of zero dependency on target.
- Unsigned: other machines may show a SmartScreen/Gatekeeper warning on first run.
- Credentials are **not** bundled; configure your model/provider once in the app UI on first launch.
