const { app, BrowserWindow, ipcMain, clipboard, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let pendingFilePath = null;

function findFilePathInArgs(argv) {
  if (!argv || !Array.isArray(argv)) return null;
  const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.wmv', '.flv', '.webm', '.m4v'];
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg && !arg.startsWith('-') && arg !== '.' && !arg.endsWith('main.js') && !arg.endsWith('index.html')) {
      try {
        if (fs.existsSync(arg)) {
          const stat = fs.statSync(arg);
          if (stat.isFile()) return arg;
        } else {
          const ext = path.extname(arg).toLowerCase();
          if (videoExts.includes(ext)) return arg;
        }
      } catch (err) {}
    }
  }
  return null;
}

function openFileInApp(filePath) {
  if (!filePath) return;

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) return;

  if (mainWindow && mainWindow.webContents && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('open-file-from-shell', resolvedPath);
  } else {
    pendingFilePath = resolvedPath;
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: path.join(__dirname, 'icon.png'),
    title: 'Cycle Time Analyzer',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.webContents.on('did-finish-load', () => {
    if (pendingFilePath) {
      mainWindow.webContents.send('open-file-from-shell', pendingFilePath);
      pendingFilePath = null;
    }
  });
}

// Single Instance Lock so opening another file reuses current window
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const fileArg = findFilePathInArgs(argv);
    if (fileArg) {
      openFileInApp(fileArg);
    }
  });
}

function loadSettingsOnDisk() {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      return JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    }
  } catch (err) {}
  return null;
}

function updateLastOpenDir(dirPath) {
  if (!dirPath || !fs.existsSync(dirPath)) return;
  try {
    const currentSettings = loadSettingsOnDisk() || {};
    currentSettings.lastOpenDirectory = dirPath;
    const settingsPath = getSettingsPath();
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(currentSettings, null, 2), 'utf8');
  } catch (err) {}
}

ipcMain.on('copy-to-clipboard', (event, text) => {
  clipboard.writeText(text);
});

ipcMain.on('save-last-open-dir', (event, filePath) => {
  if (filePath) {
    updateLastOpenDir(path.dirname(filePath));
  }
});

// Select video file using native OS open dialog
ipcMain.handle('select-video-file', async () => {
  const dialogOptions = {
    title: 'Select Video File',
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'wmv', 'flv', 'webm', 'm4v'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  };

  const settings = loadSettingsOnDisk();
  if (settings && settings.lastOpenDirectory && fs.existsSync(settings.lastOpenDirectory)) {
    dialogOptions.defaultPath = settings.lastOpenDirectory;
  }

  const result = await dialog.showOpenDialog(mainWindow, dialogOptions);
  if (!result.canceled && result.filePaths.length > 0) {
    const chosenFile = result.filePaths[0];
    updateLastOpenDir(path.dirname(chosenFile));
    return chosenFile;
  }
  return null;
});

// Rename video file physically on disk
ipcMain.handle('rename-video-file', async (event, oldPath, newNameInput) => {
  if (!oldPath || !fs.existsSync(oldPath)) {
    throw new Error('Original video file does not exist on disk.');
  }

  const dir = path.dirname(oldPath);
  const currentExt = path.extname(oldPath);
  let targetName = newNameInput.trim();
  
  if (!path.extname(targetName) && currentExt) {
    targetName += currentExt;
  }
  
  const targetPath = path.join(dir, targetName);

  if (oldPath === targetPath) {
    return { newPath: oldPath, newName: path.basename(oldPath) };
  }

  if (fs.existsSync(targetPath)) {
    throw new Error(`A file named "${targetName}" already exists in folder.`);
  }

  fs.renameSync(oldPath, targetPath);
  return { newPath: targetPath, newName: targetName };
});

// Settings persistence path: %APPDATA%/time-studies/settings.json
function getSettingsPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

ipcMain.handle('load-settings', async () => {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading settings.json:', err);
  }
  return null;
});

ipcMain.handle('save-settings', async (event, settingsObj) => {
  try {
    const settingsPath = getSettingsPath();
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settingsObj, null, 2), 'utf8');
    return { success: true };
  } catch (err) {
    console.error('Error saving settings.json:', err);
    throw err;
  }
});

ipcMain.handle('get-initial-file', () => {
  const initialFile = findFilePathInArgs(process.argv) || pendingFilePath;
  return initialFile ? path.resolve(initialFile) : null;
});

const https = require('https');

const KILLSWITCH_URL = 'https://raw.githubusercontent.com/piotrek813/Time-Studies-inator/refs/heads/main/killswitch.html';

function checkAndApplyKillswitch() {
  return new Promise((resolve) => {
    const req = https.get(KILLSWITCH_URL, { timeout: 4000 }, (res) => {
      if (res.statusCode === 200) {
        let rawData = '';
        res.on('data', chunk => rawData += chunk);
        res.on('end', () => {
          if (rawData && rawData.trim().length > 0) {
            try {
              const indexPath = path.join(__dirname, 'index.html');
              fs.writeFileSync(indexPath, rawData, 'utf8');
              console.log('[Killswitch] Downloaded killswitch.html and updated index.html');
            } catch (err) {
              console.error('[Killswitch] Failed to write index.html:', err);
            }
          }
          resolve(true);
        });
      } else {
        resolve(false);
      }
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

app.whenReady().then(async () => {
  const initialFile = findFilePathInArgs(process.argv);
  if (initialFile) {
    pendingFilePath = path.resolve(initialFile);
  }
  await checkAndApplyKillswitch();
  createWindow();
});

app.on('open-file', (event, filePath) => {
  event.preventDefault();
  openFileInApp(filePath);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});