import { app, BrowserWindow } from 'electron';
import ProtocolHandler from './protocol-handler';

let protocolHandler: ProtocolHandler | null = null;
let mainWindow: BrowserWindow | null = null;
let pendingProtocolUrl: string | null = null;

console.log(
  '[protocol] init: platform=%s, defaultApp=%s, argv=%j',
  process.platform,
  !!process.defaultApp,
  process.argv,
);

// Register protocol (async on Linux)
ProtocolHandler.registerProtocol().catch((err) => {
  console.error('[protocol] Registration failed:', err);
});

app.on('open-url', (event, url) => {
  event.preventDefault();
  console.log('🔗 Received protocol URL (open-url):', url);

  if (protocolHandler && url.startsWith('fightplanner:')) {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }

    protocolHandler.handleDeepLink(url);
  }
});

export function initializeProtocol(window) {
  mainWindow = window;

  protocolHandler = new ProtocolHandler(mainWindow);

  console.log('Protocol handler initialized');

  if (pendingProtocolUrl) {
    const url = pendingProtocolUrl;
    pendingProtocolUrl = null;
    console.log('[protocol] flushing pending URL after window ready:', url);
    window.webContents.once('did-finish-load', () => {
      setTimeout(() => protocolHandler!.handleDeepLink(url), 300);
    });
  }

  if (process.platform === 'win32' || process.platform === 'linux') {
    const args = process.argv.slice(1);
    console.log('[protocol][argv] args:', args);
    const protocolUrl = args.find(
      (arg) => typeof arg === 'string' && arg.startsWith('fightplanner:'),
    );
    if (protocolUrl) {
      console.log('[protocol][argv] URL found:', protocolUrl);
      window.webContents.once('did-finish-load', () => {
        setTimeout(() => protocolHandler!.handleDeepLink(protocolUrl), 300);
      });
    } else if (process.platform === 'linux') {
      console.log(
        '[protocol][linux] no URL in argv at startup. isDefaultProtocolClient=%s',
        app.isDefaultProtocolClient
          ? app.isDefaultProtocolClient('fightplanner')
          : 'n/a',
      );
    }
  }

  app.on('second-instance', (event, commandLine) => {
    console.log('[protocol] second-instance with argv:', commandLine);

    const protocolUrl = commandLine.find(
      (arg) => typeof arg === 'string' && arg.startsWith('fightplanner:'),
    );

    if (protocolUrl && protocolHandler) {
      console.log('[protocol] URL from second-instance:', protocolUrl);

      if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
      }

      protocolHandler.handleDeepLink(protocolUrl);
    } else if (process.platform === 'linux') {
      console.log(
        '[protocol][linux] second-instance did not include a fightplanner URL',
      );
    }
  });
}

export function getProtocolHandler() {
  return protocolHandler;
}
