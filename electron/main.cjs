const { app, BrowserWindow, ipcMain, shell, screen } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const preload = path.join(__dirname, 'preload.cjs');
let server;
let origin;
const mediaWindows = new Set();
let imageAutoplayConfig = { enabled: false, random: false, interval: 5 };

const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.m4v': 'video/mp4', '.ogv': 'video/ogg'
};

function startServer() {
  if (server && origin) return Promise.resolve();
  server = http.createServer((req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname); }
    catch { res.writeHead(400).end('Bad request'); return; }
    const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const target = path.resolve(root, relative);
    if (target !== root && !target.startsWith(root + path.sep)) { res.writeHead(403).end('Forbidden'); return; }
    fs.stat(target, (statError, stat) => {
      if (statError || !stat.isFile()) { res.writeHead(404).end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': mime[path.extname(target).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(target).pipe(res);
    });
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => {
    origin = `http://127.0.0.1:${server.address().port}`;
    resolve();
  }));
}

function secureWindowOptions(options) {
  return {
    ...options,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload
    }
  };
}

function attachNavigationPolicy(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(origin) || url.startsWith('file://')) return;
    event.preventDefault();
    if (url.startsWith('https://')) shell.openExternal(url);
  });
}

async function createMainWindow() {
  await startServer();
  const win = new BrowserWindow(secureWindowOptions({
    width: 1440, height: 920, minWidth: 800, minHeight: 560,
    title: 'My Media Viewer', titleBarStyle: 'hidden', autoHideMenuBar: true
  }));
  attachNavigationPolicy(win);
  await win.loadURL(`${origin}/index.html`);
}

function mediaSource(item) {
  if (typeof item.path === 'string' && item.path) {
    const fullPath = path.resolve(item.path);
    if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) throw new Error('Local media file is missing');
    return pathToFileURL(fullPath).href;
  }
  if (typeof item.url === 'string' && /^https:\/\//i.test(item.url)) return item.url;
  throw new Error('Unsupported media URL');
}

ipcMain.handle('media:open-windows', async (event, items, playlists = {}, areaMode = 'full') => {
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) throw new Error('Choose between 1 and 8 media windows');
  const opened = [];
  const display = { ...screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea };
  if (areaMode === 'half') {
    display.width = Math.floor(display.width / 2);
  } else if (areaMode === 'margins') {
    const marginX = Math.floor(display.width * .15), marginY = Math.floor(display.height * .12);
    display.x += marginX; display.y += marginY;
    display.width -= marginX * 2; display.height -= marginY * 2;
  }
  let columns = 1, bestScore = Infinity;
  for (let candidate = 1; candidate <= items.length; candidate++) {
    const candidateRows = Math.ceil(items.length / candidate);
    const emptyCells = candidate * candidateRows - items.length;
    const cellAspect = (display.width / candidate) / (display.height / candidateRows);
    const score = emptyCells * .5 + Math.abs(Math.log(cellAspect / (16 / 9)));
    if (score < bestScore) { bestScore = score; columns = candidate; }
  }
  const rows = Math.ceil(items.length / columns);
  const cellHeight = display.height / rows;
  for (const [index, item] of items.entries()) {
    if (!item || !['image', 'video'].includes(item.type)) continue;
    const src = mediaSource(item);
    const video = item.type === 'video';
    const row = Math.floor(index / columns);
    const column = index % columns;
    const rowCount = row === rows - 1 ? items.length - row * columns : columns;
    const cellWidth = display.width / rowCount;
    const width = Math.floor(cellWidth);
    const height = Math.floor(cellHeight);
    const x = display.x + Math.floor(column * cellWidth);
    const y = display.y + Math.floor(row * cellHeight);
    const sourceList = item.type === 'image' ? playlists.images : playlists.videos;
    const playlist = Array.isArray(sourceList)
      ? sourceList.slice(0, 10000).map(entry => ({ src: mediaSource(entry), name: String(entry.name || '') }))
      : [];
    const win = new BrowserWindow(secureWindowOptions({
      width, height, x, y, frame: false,
      minWidth: Math.min(200, width), minHeight: Math.min(150, height), resizable: true, maximizable: true,
      alwaysOnTop: true, autoHideMenuBar: true,
      title: String(item.name || (video ? 'Video' : 'Image')).slice(0, 160)
    }));
    win.setAlwaysOnTop(true, 'floating');
    attachNavigationPolicy(win);
    const query = new URLSearchParams({
      type: item.type, name: String(item.name || ''), src,
      playlist: JSON.stringify(playlist), index: String(Number(item.videoIndex) || 0),
      step: String(Math.max(1, Number(item.videoStep) || 1)),
      autoplay: String(!!item.autoplay), random: String(!!item.random),
      interval: String(Math.min(30, Math.max(3, Number(item.interval) || 5)))
    });
    mediaWindows.add(win);
    win.on('closed', () => mediaWindows.delete(win));
    await win.loadFile(path.join(__dirname, 'media-window.html'), { query: Object.fromEntries(query) });
    win.webContents.send('media-window:playlist', playlist);
    win.webContents.send('media-window:image-autoplay', imageAutoplayConfig);
    opened.push(win);
  }
  return { opened: opened.length };
});

ipcMain.on('media:set-image-autoplay', (_event, config) => {
  imageAutoplayConfig = {
    enabled: !!config?.enabled,
    random: !!config?.random,
    interval: Math.min(30, Math.max(3, Number(config?.interval) || 5))
  };
  for (const win of mediaWindows) {
    if (!win.isDestroyed()) win.webContents.send('media-window:image-autoplay', imageAutoplayConfig);
  }
});

function presetsFile() { return path.join(app.getPath('userData'), 'window-presets.json'); }
function readPresets() {
  try { return JSON.parse(fs.readFileSync(presetsFile(), 'utf8')); } catch { return {}; }
}
ipcMain.handle('media:presets', () => Object.keys(readPresets()));
ipcMain.handle('media:preset-save', (_event, name) => {
  const cleanName = String(name || '').trim().slice(0, 48);
  if (!cleanName) return false;
  const presets = readPresets();
  presets[cleanName] = [...mediaWindows].filter(win => !win.isDestroyed()).map(win => win.getBounds());
  fs.mkdirSync(app.getPath('userData'), { recursive: true });
  fs.writeFileSync(presetsFile(), JSON.stringify(presets, null, 2));
  return true;
});
ipcMain.handle('media:preset-apply', (_event, name) => {
  const bounds = readPresets()[String(name || '')];
  if (!Array.isArray(bounds)) return false;
  [...mediaWindows].filter(win => !win.isDestroyed()).forEach((win, i) => {
    if (bounds[i]) win.setBounds(bounds[i]);
  });
  return true;
});
ipcMain.on('media:minimize-window', event => BrowserWindow.fromWebContents(event.sender)?.minimize());

app.setAppUserModelId('com.my-media-viewer.desktop');

app.whenReady().then(createMainWindow).catch(error => {
  console.error('Could not start the media viewer:', error);
  app.quit();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (server) server.close();
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
