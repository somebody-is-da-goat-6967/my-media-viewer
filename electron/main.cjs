const { app, BrowserWindow, ipcMain, shell } = require('electron');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const root = path.resolve(__dirname, '..');
const preload = path.join(__dirname, 'preload.cjs');
let server;
let origin;

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
    title: 'Random Media Viewer'
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

ipcMain.handle('media:open-windows', async (event, items) => {
  if (!Array.isArray(items) || items.length < 1 || items.length > 8) throw new Error('Choose between 1 and 8 media windows');
  const opened = [];
  for (const item of items) {
    if (!item || !['image', 'video'].includes(item.type)) continue;
    const src = mediaSource(item);
    const video = item.type === 'video';
    const win = new BrowserWindow(secureWindowOptions({
      width: video ? 560 : 480, height: video ? 360 : 420,
      minWidth: 240, minHeight: 180, resizable: true,
      alwaysOnTop: true, autoHideMenuBar: true,
      title: String(item.name || (video ? 'Video' : 'Image')).slice(0, 160)
    }));
    win.setAlwaysOnTop(true, 'floating');
    attachNavigationPolicy(win);
    const query = new URLSearchParams({ type: item.type, name: String(item.name || ''), src });
    await win.loadFile(path.join(__dirname, 'media-window.html'), { query: Object.fromEntries(query) });
    opened.push(win);
  }
  return { opened: opened.length };
});

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
