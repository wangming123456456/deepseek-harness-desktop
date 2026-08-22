// Stage the @deepseek-ai/dsh harness into vendor/dsh (build dependency).
// The harness is installed globally (npm i -g @deepseek-ai/dsh) on the build
// machine; this copies that package into the project so electron-builder can
// bundle it. Skips if already present. Run via `npm run setup` or `dist:*`.
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const VERSION = '0.1.1-rc.2'
const DEST = path.join(__dirname, '..', 'vendor', 'dsh')

function main() {
  if (fs.existsSync(path.join(DEST, 'lib', 'bin.js'))) {
    console.log('[fetch-harness] vendor/dsh already present, skipping.')
    return
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  let globalRoot
  try { globalRoot = execFileSync(npm, ['root', '-g'], { encoding: 'utf8' }).trim() } catch (e) {
    console.error('[fetch-harness] could not run npm root -g:', e.message); process.exit(1)
  }
  const src = path.join(globalRoot, '@deepseek-ai', 'dsh')
  if (!fs.existsSync(path.join(src, 'lib', 'bin.js'))) {
    console.error(`[fetch-harness] global @deepseek-ai/dsh not found. Install it first:\n  npm i -g @deepseek-ai/dsh@${VERSION}`)
    process.exit(1)
  }
  console.log(`[fetch-harness] copying ${src} -> ${DEST} (this can take a moment)`)
  fs.mkdirSync(path.dirname(DEST), { recursive: true })
  fs.cpSync(src, DEST, { recursive: true })
  console.log('[fetch-harness] done.')
}

main()
