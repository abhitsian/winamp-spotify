const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let nextProcess;
const isDev = process.env.NODE_ENV !== 'production';
const PORT = 3000;
const HOST = '127.0.0.1';

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 300,
    height: 550,
    minWidth: 275,
    minHeight: 400,
    frame: false,
    transparent: true,
    resizable: true,
    hasShadow: true,
    vibrancy: 'dark',
    titleBarStyle: 'hidden',
    trafficLightPosition: { x: -100, y: -100 }, // Hide traffic lights
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Load the app
  if (isDev) {
    mainWindow.loadURL(`http://${HOST}:${PORT}`);
    // Open DevTools in dev mode
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadURL(`http://${HOST}:${PORT}`);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Make window draggable by title bar
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.insertCSS(`
      .winamp-titlebar {
        -webkit-app-region: drag;
      }
      .winamp-titlebar button, .winamp-controls {
        -webkit-app-region: no-drag;
      }
    `);
  });
}

function startNextServer() {
  return new Promise((resolve, reject) => {
    const isWin = process.platform === 'win32';
    const npmCmd = isWin ? 'npm.cmd' : 'npm';

    nextProcess = spawn(npmCmd, ['run', 'start'], {
      cwd: path.join(__dirname, '..'),
      stdio: 'pipe',
      env: { ...process.env, PORT: PORT.toString() },
    });

    nextProcess.stdout.on('data', (data) => {
      console.log(`Next.js: ${data}`);
      if (data.toString().includes('Ready') || data.toString().includes('started')) {
        resolve();
      }
    });

    nextProcess.stderr.on('data', (data) => {
      console.error(`Next.js Error: ${data}`);
    });

    nextProcess.on('error', reject);

    // Give it some time to start
    setTimeout(resolve, 3000);
  });
}

app.whenReady().then(async () => {
  if (!isDev) {
    await startNextServer();
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (nextProcess) {
    nextProcess.kill();
  }
});
