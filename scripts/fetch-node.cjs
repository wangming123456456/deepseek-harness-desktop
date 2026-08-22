// Stage the Node.js runtime for the current platform into vendor/node/.
// Used by `npm run prepare:node` (and the mac/linux dist scripts) so each build
// bundles the right node binary without manual setup. Skips if already present.
//
// Windows -> vendor/node/node.exe
// mac/linux-> vendor/node/node
const https = require('node:https')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync } = require('node:child_process')

const VERSION = '24.16.0'
const ROOT = path.join(__dirname, '..', 'vendor', 'node')
const isWin = process.platform === 'win32'
const binName = isWin ? 'node.exe' : 'node'

const PLAT_MAP = {
  win32: { x64: 'win32-x64', arm64: 'win32-arm64' },
  darwin: { x64: 'darwin-x64', arm64: 'darwin-arm64' },
  linux: { x64: 'linux-x64', arm64: 'linux-arm64' }
}

function platform() {
  const p = PLAT_MAP[process.platform]
  if (!p) throw new Error(`unsupported platform: ${process.platform}`)
  const a = p[process.arch]
  if (!a) throw new Error(`unsupported arch: ${process.arch}`)
  return a
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume()
        return download(res.headers.location, dest).then(resolve, reject)
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`HTTP ${res.statusCode} for ${url}`)) }
      const out = fs.createWriteStream(dest)
      res.pipe(out)
      out.on('error', reject)
      out.on('finish', () => { out.close(() => resolve()) })
    })
    req.on('error', reject)
  })
}

async function main() {
  fs.mkdirSync(ROOT, { recursive: true })
  const target = path.join(ROOT, binName)
  if (fs.existsSync(target) && fs.statSync(target).size > 0) {
    console.log(`[fetch-node] ${target} already present, skipping.`)
    return
  }

  const plat = platform()
  const base = `node-v${VERSION}-${plat}`
  const ext = isWin ? '.zip' : '.tar.gz'
  const url = `https://nodejs.org/dist/v${VERSION}/${base}${ext}`
  const tmp = path.join(os.tmpdir(), `${base}${ext}`)
  const extractDir = path.join(os.tmpdir(), `extract-${Date.now()}`)

  console.log(`[fetch-node] downloading ${url}`)
  await download(url, tmp)
  fs.mkdirSync(extractDir, { recursive: true })

  // tar is present on Windows 10+ (bsdtar handles .zip) and on mac/linux (handles .tar.gz).
  execFileSync('tar', ['-xf', tmp, '-C', extractDir], { stdio: 'ignore' })

  const inner = path.join(extractDir, base)
  const src = isWin ? path.join(inner, 'node.exe') : path.join(inner, 'bin', 'node')
  if (!fs.existsSync(src)) throw new Error(`node binary not found in archive: ${src}`)
  fs.copyFileSync(src, target)
  if (!isWin) fs.chmodSync(target, 0o755)

  console.log(`[fetch-node] staged ${target}`)
  try { fs.rmSync(extractDir, { recursive: true, force: true }); fs.rmSync(tmp, { force: true }) } catch { /* best effort */ }
}

main().catch((err) => {
  console.error('[fetch-node] failed:', err.message)
  process.exit(1)
})
