const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('mediaViewerDesktop', {
  getPathForFile(file) {
    return webUtils.getPathForFile(file);
  },
  openMediaWindows(items, playlists) {
    return ipcRenderer.invoke('media:open-windows', items, playlists);
  },
  setMediaAutoplay(config) {
    ipcRenderer.send('media:set-image-autoplay', config);
  },
  onMediaAutoplay(callback) {
    ipcRenderer.on('media-window:image-autoplay', (_event, config) => callback(config));
  },
  onMediaPlaylist(callback) {
    ipcRenderer.on('media-window:playlist', (_event, playlist) => callback(playlist));
  }
});
