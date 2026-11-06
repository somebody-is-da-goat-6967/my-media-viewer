const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mediaViewerDesktop', {
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  openMediaWindows(items) {
    return ipcRenderer.invoke('media:open-windows', items);
  }
});
