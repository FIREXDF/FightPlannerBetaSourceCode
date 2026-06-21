import { app, BrowserWindow } from 'electron';
import * as path from 'path';

let tutorialWindow: BrowserWindow | null = null;

export function createTutorialWindow(parentWindow?: BrowserWindow | null) {
  if (tutorialWindow) {
    tutorialWindow.focus();
    return tutorialWindow;
  }

  const width = 1300;
  const height = 800;

  tutorialWindow = new BrowserWindow({
    width: width,
    height: height,
    center: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      additionalArguments: ['--window-type=tutorial'],
    },
  });

  const loadPath = path.join(
    app.getAppPath(),
    'assets',
    'pages',
    'tutorial.html',
  );

  tutorialWindow.loadFile(loadPath);

  tutorialWindow.setMenuBarVisibility(false);

  tutorialWindow.webContents.on('did-finish-load', () => {
    console.log('Tutorial window loaded successfully');
  });

  tutorialWindow.on('closed', () => {
    console.log('Tutorial window "closed" event triggered');
    tutorialWindow = null;
    if (parentWindow && !parentWindow.isDestroyed()) {
      parentWindow.webContents.send('tutorial-window-closed');
    }
  });

  return tutorialWindow;
}

export function closeTutorialWindow() {
  console.log('closeTutorialWindow called');
  if (tutorialWindow && !tutorialWindow.isDestroyed()) {
    console.log('Tutorial window exists, destroying...');
    try {
      tutorialWindow.destroy();
      console.log('Tutorial window destroyed');
    } catch (error) {
      console.error('Error destroying tutorial window:', error);
    }
    tutorialWindow = null;
  } else {
    console.log('No tutorial window to close or already destroyed');
  }
}

export function getTutorialWindow() {
  return tutorialWindow;
}
