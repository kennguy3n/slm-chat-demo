// Electron main process entrypoint for the KChat SLM demo desktop app.
//
// This file is the canonical owner of all AI inference: per the
// realigned architecture, the Go backend is data-only and every model
// call (run / stream / smart-reply / translate / extract-tasks /
// summarize-thread / model status / load / unload) is dispatched from
// the renderer to the main process via IPC. The main process talks to
// the local Ollama daemon (or the bundled mock fallback) over HTTP.
//
// In dev (`npm run electron:dev`) the BrowserWindow loads the Vite dev
// server at http://localhost:5173. In packaged builds it loads the
// built `dist/index.html`.

import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { registerIPCHandlers } from './ipc-handlers.js';

// We compile this file to CJS via tsconfig.electron.json, so __dirname
// is always defined at runtime. The `declare` keeps the source legible
// to ts-aware tooling that doesn't load the @types/node CJS globals.
declare const __dirname: string;

const isDev = process.env.ELECTRON_DEV === '1';
const devURL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173';

async function createWindow(): Promise<BrowserWindow> {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'KChat SLM Demo',
    backgroundColor: '#0c0d10',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    await win.loadURL(devURL);
    if (process.env.ELECTRON_DEVTOOLS !== '0') {
      win.webContents.openDevTools({ mode: 'detach' });
    }
  } else {
    // Packaged layout: dist-electron/main.js next to ../dist/index.html.
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    await win.loadFile(indexPath);
  }
  return win;
}

app.whenReady().then(async () => {
  registerIPCHandlers();
  await createWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) await createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
