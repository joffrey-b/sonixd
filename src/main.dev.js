/* eslint global-require: off, no-console: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `yarn build` or `yarn build:main`, this file is compiled to
 * `./src/main.prod.js` using webpack. This gives us some performance wins.
 */
import 'core-js/stable';
import 'regenerator-runtime/runtime';
import fs from 'fs';
import https from 'https';
import path from 'path';
import { ipcMain, app, BrowserWindow, shell, globalShortcut, Menu, Tray, dialog } from 'electron';
import electronLocalshortcut from 'electron-localshortcut';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import { configureStore } from '@reduxjs/toolkit';
import { forwardToRenderer, triggerAlias, replayActionMain } from 'electron-redux';
import playerReducer from './redux/playerSlice';
import playQueueReducer from './redux/playQueueSlice';
import multiSelectReducer from './redux/multiSelectSlice';
import configReducer from './redux/configSlice';
import MenuBuilder from './menu';
import { isWindows, isMacOS, isLinux } from './shared/utils';
import { settings, setDefaultSettings } from './components/shared/setDefaultSettings';

setDefaultSettings(false);

let systemCaCerts = null;

// On Linux, Electron uses neither the system CA trust store nor the NSS database
// for certificate verification — neither the Node.js/axios network stack nor
// Chromium's audio-streaming stack will trust user-added CAs by default.
// We fix this by:
//   1. Setting NODE_EXTRA_CA_CERTS so the renderer's Node.js picks up the system
//      bundle before the renderer process is spawned (inherited via env).
//   2. Patching https.globalAgent for the main process, in case TLS was already
//      loaded by an import before NODE_EXTRA_CA_CERTS could take effect.
//   3. Storing the bundle for the certificate-error handler below, which covers
//      Chromium's network stack (audio streaming, cover art, etc.).
if (isLinux()) {
  const caBundlePaths = [
    '/etc/ssl/certs/ca-certificates.crt', // Debian / Ubuntu / Mint
    '/etc/pki/tls/certs/ca-bundle.crt', // Fedora / RHEL / CentOS
    '/etc/ssl/ca-bundle.pem', // openSUSE
    '/etc/pki/ca-trust/extracted/pem/tls-ca-bundle.pem', // Arch Linux
  ];
  const bundlePath = caBundlePaths.find((p) => fs.existsSync(p));
  if (bundlePath) {
    process.env.NODE_EXTRA_CA_CERTS = bundlePath;
    try {
      systemCaCerts = fs.readFileSync(bundlePath);
      https.globalAgent.options.ca = systemCaCerts;
    } catch {
      // Bundle found but unreadable — NODE_EXTRA_CA_CERTS still covers the renderer
    }
  }
}

export const store = configureStore({
  reducer: {
    player: playerReducer,
    playQueue: playQueueReducer,
    multiSelect: multiSelectReducer,
    config: configReducer,
  },
  middleware: [triggerAlias, forwardToRenderer],
});

replayActionMain(store);

let mainWindow = null;
let tray = null;
let exitFromTray = false;
let forceQuit = false;
let saved = false;

if (process.env.NODE_ENV === 'production') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('electron-debug')();
}

const installExtensions = async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS', 'REDUX_DEVTOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      { forceDownload, loadExtensionOptions: { allowFileAccess: true } }
    )
    .catch(console.log);
};

const RESOURCES_PATH = app.isPackaged
  ? path.join(process.resourcesPath, 'assets')
  : path.join(__dirname, '../assets');

const getAssetPath = (...paths) => {
  return path.join(RESOURCES_PATH, ...paths);
};

const stop = () => {
  mainWindow.webContents.send('player-stop');
};

const playPause = () => {
  mainWindow.webContents.send('player-play-pause');
};

const nextTrack = () => {
  mainWindow.webContents.send('player-next-track');
};

const previousTrack = () => {
  mainWindow.webContents.send('player-prev-track');
};

const volumeUp = () => {
  mainWindow.webContents.send('player-volume-up');
};

const volumeDown = () => {
  mainWindow.webContents.send('player-volume-down');
};

const toggleMute = () => {
  mainWindow.webContents.send('player-mute');
};

const toAccelerator = (key) =>
  key
    .split('+')
    .map((part) => {
      if (part === 'ctrl') return 'CommandOrControl';
      if (part === 'alt') return 'Alt';
      if (part === 'shift') return 'Shift';
      if (part === 'meta') return 'Meta';
      if (part === 'left') return 'Left';
      if (part === 'right') return 'Right';
      if (part === 'up') return 'Up';
      if (part === 'down') return 'Down';
      if (part === 'del') return 'Delete';
      if (part === 'backspace') return 'Backspace';
      if (part === 'space') return 'Space';
      if (part === 'esc') return 'Escape';
      return part.toUpperCase();
    })
    .join('+');

let customShortcutKeys = [];

const unregisterCustomShortcuts = () => {
  customShortcutKeys.forEach((acc) => {
    try {
      globalShortcut.unregister(acc);
    } catch {
      // ignore
    }
  });
  customShortcutKeys = [];
};

const registerCustomShortcuts = (hotkeys) => {
  unregisterCustomShortcuts();
  const actions = {
    playPause: () => playPause(),
    nextTrack: () => nextTrack(),
    prevTrack: () => previousTrack(),
    volumeUp: () => volumeUp(),
    volumeDown: () => volumeDown(),
    mute: () => toggleMute(),
  };
  Object.entries(actions).forEach(([action, handler]) => {
    const key = hotkeys[action];
    if (!key) return;
    const accelerator = toAccelerator(key);
    try {
      if (globalShortcut.register(accelerator, handler)) {
        customShortcutKeys.push(accelerator);
      }
    } catch {
      // invalid accelerator - skip
    }
  });
};

const registerCustomShortcutsFromSettings = () => {
  registerCustomShortcuts({
    playPause: settings.get('hotkeyPlayPause') || 'ctrl+p',
    nextTrack: settings.get('hotkeyNextTrack') || 'ctrl+right',
    prevTrack: settings.get('hotkeyPrevTrack') || 'ctrl+left',
    volumeUp: settings.get('hotkeyVolumeUp') || 'ctrl+up',
    volumeDown: settings.get('hotkeyVolumeDown') || 'ctrl+down',
    mute: settings.get('hotkeyMute') || 'ctrl+m',
  });
};

const quickSave = () => {
  mainWindow.webContents.send('save-queue-state', app.getPath('userData'));
};

const createWinThumbarButtons = () => {
  if (isWindows()) {
    mainWindow.setThumbarButtons([
      {
        tooltip: 'Previous Track',
        icon: getAssetPath('skip-previous.png'),
        click: () => previousTrack(),
      },
      {
        tooltip: 'Play/Pause',
        icon: getAssetPath('play-circle.png'),
        click: () => playPause(),
      },
      {
        tooltip: 'Next Track',
        icon: getAssetPath('skip-next.png'),
        click: () => {
          nextTrack();
        },
      },
    ]);
  }
};

const saveQueue = (callback) => {
  ipcMain.on('saved-state', () => {
    callback();
  });

  mainWindow.webContents.send('save-queue-state', app.getPath('userData'));
};

const restoreQueue = () => {
  mainWindow.webContents.send('restore-queue-state', app.getPath('userData'));
};

const createWindow = async () => {
  if (process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true') {
    await installExtensions();
  }

  let windowDimensions = [];
  let windowPos = [];
  let isCentered = true;

  // If retained window size is enabled, use saved dimensions and position. Otherwise, use defined defaults
  if (settings.get('retainWindowSize')) {
    windowDimensions = settings.get('savedWindowSize');
    windowPos = settings.get('savedWindowPos');
    isCentered = false;
  } else {
    windowDimensions = [settings.get('defaultWindowWidth'), settings.get('defaultWindowHeight')];
  }

  mainWindow = new BrowserWindow({
    show: false,
    width: windowDimensions[0],
    height: windowDimensions[1],
    center: isCentered,
    x: windowPos[0],
    y: windowPos[1],
    icon: getAssetPath('icon.png'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    autoHideMenuBar: true,
    minWidth: 768,
    minHeight: 600,
    frame: settings.get('titleBarStyle') === 'native',
  });

  electronLocalshortcut.register(mainWindow, 'Ctrl+Shift+I', () => {
    mainWindow?.webContents.openDevTools();
  });

  electronLocalshortcut.register(mainWindow, 'F12', () => {
    mainWindow?.webContents.openDevTools({ mode: 'undocked' });
  });

  if (settings.get('globalMediaHotkeys')) {
    globalShortcut.register('MediaStop', () => {
      stop();
    });

    globalShortcut.register('MediaPlayPause', () => {
      playPause();
    });

    globalShortcut.register('MediaNextTrack', () => {
      nextTrack();
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      previousTrack();
    });
  } else if (!settings.get('systemMediaTransportControls')) {
    electronLocalshortcut.register(mainWindow, 'MediaStop', () => {
      stop();
    });

    electronLocalshortcut.register(mainWindow, 'MediaPlayPause', () => {
      playPause();
    });

    electronLocalshortcut.register(mainWindow, 'MediaNextTrack', () => {
      nextTrack();
    });

    electronLocalshortcut.register(mainWindow, 'MediaPreviousTrack', () => {
      previousTrack();
    });
  }

  if (settings.get('globalShortcuts')) {
    registerCustomShortcutsFromSettings();
  }

  ipcMain.on('enable-global-shortcuts', () => {
    registerCustomShortcutsFromSettings();
  });

  ipcMain.on('disable-global-shortcuts', () => {
    unregisterCustomShortcuts();
  });

  ipcMain.on('quicksave', () => {
    quickSave();
  });

  ipcMain.on('enableGlobalHotkeys', () => {
    electronLocalshortcut.unregisterAll(mainWindow);

    globalShortcut.register('MediaStop', () => {
      stop();
    });

    globalShortcut.register('MediaPlayPause', () => {
      playPause();
    });

    globalShortcut.register('MediaNextTrack', () => {
      nextTrack();
    });

    globalShortcut.register('MediaPreviousTrack', () => {
      previousTrack();
    });
  });

  ipcMain.on('disableGlobalHotkeys', () => {
    globalShortcut.unregisterAll();
    customShortcutKeys = [];

    if (settings.get('globalShortcuts')) {
      registerCustomShortcutsFromSettings();
    }

    if (!settings.get('systemMediaTransportControls')) {
      electronLocalshortcut.register(mainWindow, 'MediaStop', () => {
        stop();
      });

      electronLocalshortcut.register(mainWindow, 'MediaPlayPause', () => {
        playPause();
      });

      electronLocalshortcut.register(mainWindow, 'MediaNextTrack', () => {
        nextTrack();
      });

      electronLocalshortcut.register(mainWindow, 'MediaPreviousTrack', () => {
        previousTrack();
      });
    }
  });

  mainWindow.loadURL(`file://${__dirname}/index.html#${settings.get('startPage')}`);

  // @TODO: Use 'ready-to-show' event
  // https://github.com/electron/electron/blob/master/docs/api/browser-window.md#using-ready-to-show-event
  mainWindow.webContents.on('did-finish-load', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
      mainWindow.focus();

      createWinThumbarButtons();
    }

    if (settings.get('resume')) {
      restoreQueue();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (store.getState().config.window.minimizeToTray) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('moved', () => {
    if (settings.get('retainWindowSize')) {
      settings.set('savedWindowPos', mainWindow.getPosition());
    }
  });

  mainWindow.on('close', (event) => {
    if (!exitFromTray && store.getState().config.window.exitToTray) {
      if (isMacOS() && !forceQuit) {
        exitFromTray = true;
      }
      event.preventDefault();
      mainWindow.hide();
    }

    // If retain window size is enabled, save the dimensions
    if (settings.get('retainWindowSize')) {
      const curSize = mainWindow.getSize();
      settings.set('savedWindowSize', [curSize[0], curSize[1]]);
    }

    // If we have enabled saving the queue, we need to defer closing the main window until it has finished saving.
    if (!saved && settings.get('resume')) {
      event.preventDefault();
      saved = true;
      saveQueue(() => {
        mainWindow.close();
        if (forceQuit) {
          app.exit();
        }
      });
    }
  });

  if (isWindows()) {
    app.setAppUserModelId(process.execPath);
  }

  if (isMacOS()) {
    app.on('before-quit', () => {
      forceQuit = true;
    });
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  if (settings.get('autoUpdate') === true) {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();

    autoUpdater.on('update-downloaded', () => {
      settings.set('autoUpdateNotice', true);
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ipcMain.handle('file-path', async (_, argument) => {
    const filePath = dialog.showOpenDialogSync({
      properties: ['openFile', 'openDirectory'],
    });
    return filePath;
  });

  ipcMain.on('minimize', () => {
    mainWindow.minimize();
  });

  ipcMain.on('maximize', () => {
    mainWindow.maximize();
  });

  ipcMain.on('unmaximize', () => {
    mainWindow.unmaximize();
  });

  ipcMain.on('close', () => {
    mainWindow.close();
  });

  mainWindow.on('maximize', () => {
    mainWindow.webContents.send('maximize');
  });

  mainWindow.on('unmaximize', () => {
    mainWindow.webContents.send('unmaximize');
  });
};

const createTray = () => {
  if (isMacOS()) {
    return;
  }

  tray = isLinux() ? new Tray(getAssetPath('icon.png')) : new Tray(getAssetPath('icon.ico'));
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Play/Pause',
      click: () => {
        playPause();
      },
    },
    {
      label: 'Next Track',
      click: () => {
        nextTrack();
      },
    },
    {
      label: 'Previous Track',
      click: () => {
        previousTrack();
      },
    },
    {
      label: 'Stop',
      click: () => {
        stop();
      },
    },
    {
      type: 'separator',
    },
    {
      label: 'Open main window',
      click: () => {
        mainWindow.show();
        createWinThumbarButtons();
      },
    },
    {
      label: 'Quit Sonixd',
      click: () => {
        exitFromTray = true;
        app.quit();
      },
    },
  ]);

  tray.on('double-click', () => {
    mainWindow.show();
    createWinThumbarButtons();
  });

  tray.setToolTip('Sonixd');
  tray.setContextMenu(contextMenu);
};

const gotProcessLock = app.requestSingleInstanceLock();
if (!gotProcessLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    mainWindow.show();
  });
}

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  globalShortcut.unregisterAll();
  if (isMacOS()) {
    mainWindow = null;
  } else {
    app.quit();
  }
});

// Re-verify certificates that Chromium rejects using Node.js TLS against the
// system CA bundle loaded above. This lets user-trusted CAs (e.g. a home router
// or OPNsense CA) work on Linux without any manual NSS database manipulation.
// Node.js and Chromium use independent TLS stacks, so this request will not
// re-trigger the certificate-error event.
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  if (!systemCaCerts) {
    callback(false);
    return;
  }

  event.preventDefault();

  let urlObj;
  try {
    urlObj = new URL(url);
  } catch {
    callback(false);
    return;
  }

  const req = https.request(
    {
      host: urlObj.hostname,
      port: parseInt(urlObj.port, 10) || 443,
      method: 'HEAD',
      path: '/',
      ca: systemCaCerts,
      rejectUnauthorized: true,
      timeout: 5000,
    },
    () => callback(true)
  );

  req.on('error', () => callback(false));
  req.on('timeout', () => {
    req.destroy();
    callback(false);
  });

  try {
    req.end();
  } catch {
    callback(false);
  }
});

app.commandLine.appendSwitch('disable-features', 'HardwareMediaKeyHandling');

app
  .whenReady()
  .then(() => {
    createWindow();
    createTray();
    return null;
  })
  .catch(console.log);

app.on('activate', () => {
  // On macOS it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (mainWindow === null) {
    createWindow();
  } else {
    mainWindow.show();
  }
});

ipcMain.on('reload', () => {
  if (process.env.APPIMAGE) {
    app.exit();
    app.relaunch({
      execPath: process.env.APPIMAGE,
      args: process.argv.slice(1).concat(['--appimage-extract-and-run']),
    });
    app.exit(0);
  } else {
    app.relaunch();
    app.exit();
  }
});
