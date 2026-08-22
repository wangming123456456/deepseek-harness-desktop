// DeepSeek Harness — Desktop Shell (fully self-contained)
// Bundles the harness server + a portable Node runtime, so the target machine
// needs NOTHING installed (no Node, no network) — "install and it just works".
//
// On launch:
//   1. Reuse an already-running DSH server if one answers DSH_URL.
//   2. Otherwise start the bundled harness: run the bundled node.exe on the
//      bundled `dsh` package's lib/bin.js (web profile) with a per-user DSH_HOME.
//   3. Wait for the port, then load the UI.
//
// The bundled node.exe and the harness against it are both Node 24 (ABI 137), so
// the native addons (node-pty, sharp, koffi) load correctly.

const { app, BrowserWindow, shell, Menu, dialog } = require('electron')
let autoUpdater = null
try { ({ autoUpdater } = require('electron-updater')) } catch (e) { console.error('electron-updater unavailable:', e && e.message) }
const { spawn } = require('node:child_process')
const { request } = require('node:http')
const path = require('node:path')
const fs = require('node:fs')

const DSH_URL = process.env.DSH_URL || 'http://127.0.0.1:3080'
const STARTUP_TIMEOUT_MS = 45000

// --- bundled runtime locations -------------------------------------------

/** Root of the bundled runtime. Tries, in order: packaged resources/vendor,
 *  dev __dirname/vendor, and a flat resources layout (resources/dsh + resources/node). */
function bundledRoot() {
  const candidates = [
    path.join(process.resourcesPath, 'vendor'), // packaged (extraResources -> vendor/*)
    path.join(__dirname, 'vendor')              // development (npm start)
  ]
  const nodeName = process.platform === 'win32' ? 'node.exe' : 'node'
  for (const c of candidates) {
    if (fs.existsSync(path.join(c, 'node', nodeName)) && fs.existsSync(path.join(c, 'dsh', 'lib', 'bin.js'))) return c
  }
  // Flat fallback: runtime placed directly under resources/ (older extraResources layout).
  if (fs.existsSync(path.join(process.resourcesPath, 'node', nodeName)) && fs.existsSync(path.join(process.resourcesPath, 'dsh', 'lib', 'bin.js'))) return process.resourcesPath
  return candidates[1]
}

function bundledNode() {
  const name = process.platform === 'win32' ? 'node.exe' : 'node'
  return path.join(bundledRoot(), 'node', name)
}
function bundledDsh()  { return path.join(bundledRoot(), 'dsh', 'lib', 'bin.js') }

/** Per-user, writable DSH_HOME (kept outside the install dir). */
function dshHome() { return path.join(app.getPath('userData'), 'dsh-home') }

// --- helpers -------------------------------------------------------------

function httpGet(url, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const req = request(url, { method: 'GET' }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, status: res.statusCode, body }))
      res.on('error', () => resolve({ ok: false }))
    })
    req.on('error', () => resolve({ ok: false }))
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve({ ok: false }) })
    req.end()
  })
}

function isHarnessPage(body) {
  return body.includes('__DSH_BOOT__') || /DeepSeek Harness|dsh/i.test(body)
}

async function isDshRunning() {
  try { const res = await httpGet(DSH_URL, 3000); return res.ok && isHarnessPage(res.body) } catch { return false }
}

/** Seed the minimal `web` profile config if it does not already exist. */
function seedProfile(home) {
  const profileDir = path.join(home, 'profiles', 'web')
  if (fs.existsSync(path.join(profileDir, 'package.json'))) return profileDir
  fs.mkdirSync(profileDir, { recursive: true })
  fs.writeFileSync(path.join(profileDir, 'package.json'), JSON.stringify({
    name: 'dsh-profile-web',
    private: true,
    dependencies: {},
    dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app'] } }
  }, null, 2))
  fs.writeFileSync(path.join(profileDir, 'cordis.yml'), '# dsh profile root - an empty entry list. The tree is composed as patches.\n[]\n')
  fs.writeFileSync(path.join(profileDir, 'cordis.patch.yml'), '# Your patch layer for this dsh profile.\n[]\n')
  fs.writeFileSync(path.join(profileDir, 'pnpm-workspace.yaml'), 'packages:\n  - .\n\nnodeLinker: hoisted\nautoInstallPeers: false\n')
  return profileDir
}

function startServer(node, dshBin, home) {
  const env = { ...process.env, DSH_HOME: home }
  const child = spawn(node, [dshBin, 'web', '--no-open'], { env, windowsHide: true, stdio: 'ignore' })
  child.on('error', (err) => console.error('server error:', err.message))
  return child
}

async function waitForServer(url, timeoutMs, intervalMs = 500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try { const res = await httpGet(url, 2000); if (res.ok && isHarnessPage(res.body)) return true } catch { /* polling */ }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

// --- window --------------------------------------------------------------

let serverChild = null

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#F5F5F7',
    title: 'DeepSeek Harness',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  })
  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (target.startsWith('http')) shell.openExternal(target)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (event, target) => {
    if (target !== url && !target.startsWith(url)) { event.preventDefault(); if (target.startsWith('http')) shell.openExternal(target) }
  })
  win.loadURL(url)
  return win
}

function buildMenu() {
  Menu.setApplicationMenu(process.platform === 'darwin'
    ? Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }])
    : null)
}

// --- auto-update ---------------------------------------------------------

function setupAutoUpdates() {
  if (!app.isPackaged || !autoUpdater) return
  try {
    autoUpdater.logger = console
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.on('error', (err) => console.error('update error:', (err && err.message) || err))
    // A new version downloaded & ready — restart to apply it.
    autoUpdater.on('update-downloaded', (info) => {
      dialog.showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: `Version ${info.version} downloaded.`,
        detail: 'The app will restart to install the update.',
        buttons: ['Restart now', 'Later']
      }).then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
    })
    autoUpdater.checkForUpdatesAndNotify().catch((err) => console.error('update check failed:', (err && err.message) || err))
  } catch (err) {
    console.error('auto-update unavailable:', (err && err.message) || err)
  }
}

// --- app lifecycle -------------------------------------------------------

app.whenReady().then(async () => {
  buildMenu()
  setupAutoUpdates()

  try {
    if (await isDshRunning()) { createWindow(DSH_URL); return }

    const node = bundledNode()
    const dshBin = bundledDsh()
    if (!fs.existsSync(node) || !fs.existsSync(dshBin)) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'DeepSeek Harness Desktop',
        message: 'The bundled runtime could not be found.',
        detail: 'The install appears incomplete. Please reinstall the app.',
        buttons: ['OK']
      })
      app.quit()
      return
    }

    const home = dshHome()
    seedProfile(home)
    serverChild = startServer(node, dshBin, home)

    const up = await waitForServer(DSH_URL, STARTUP_TIMEOUT_MS)
    if (!up) {
      try { serverChild.kill() } catch { /* noop */ }
      await dialog.showMessageBox({
        type: 'error',
        title: 'DeepSeek Harness Desktop',
        message: 'The harness server did not start in time.',
        detail: 'Close and reopen the app. If it keeps failing, reinstall.\n\nYou can also set the DSH_URL environment variable to a harness you can reach, instead of running one locally.',
        buttons: ['OK']
      })
      app.quit()
      return
    }

    createWindow(DSH_URL)
  } catch (err) {
    console.error('bootstrap failed:', err)
    await dialog.showMessageBox({ type: 'error', title: 'DeepSeek Harness Desktop', message: 'Unexpected error.', detail: String((err && err.message) || err), buttons: ['OK'] })
    app.quit()
  }
})

app.on('before-quit', () => {
  try { if (serverChild && !serverChild.killed) serverChild.kill() } catch { /* noop */ }
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
