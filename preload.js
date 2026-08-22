// Preload: runs in an isolated world with contextIsolation enabled.
// Kept intentionally minimal — expose nothing sensitive to the page.
// The desktop shell does not need to inject busy globals into the DSH UI.
const { contextBridge } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  isDesktop: true,
  platform: process.platform
})
