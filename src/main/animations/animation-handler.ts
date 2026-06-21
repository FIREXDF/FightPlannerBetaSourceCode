import { ipcMain, BrowserWindow } from 'electron';

export interface AnimationEvents {
  'start-intro-animation': {};
}

export default class AnimationHandler {
  mainWindow: BrowserWindow | null;

  constructor() {
    this.mainWindow = null;
  }

  initialize(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
    this.setupListeners();
  }

  setupListeners() {
    // Listen for tutorial close event to trigger intro animation
    ipcMain.on('close-tutorial-window', () => {
      console.log(
        'Received close-tutorial-window event in AnimationHandler',
      );
      // We assume the tutorial window close logic is handled elsewhere (in main.js or tutorial-window.js)
      // This handler solely focuses on triggering the main window animation
      this.triggerIntroAnimation();
    });
  }

  triggerIntroAnimation() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      console.log('Triggering intro animation on main window');
      this.mainWindow.webContents.send('start-intro-animation');
    }
  }
}
