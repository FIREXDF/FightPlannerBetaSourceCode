import { app, BrowserWindow } from 'electron';
import ProtocolHandler from './protocol-handler';

let protocolHandler: ProtocolHandler | null = null;
let mainWindow: BrowserWindow | null = null;
let rendererReady = false;
let startupProtocolCaptured = false;
const pendingProtocolUrls: string[] = [];

function extractProtocolUrl(args: string[]): string | null {
  for (const arg of args) {
    if (typeof arg !== 'string') continue;

    const candidate = arg.trim().replace(/^"(.*)"$/, '$1');
    if (/^fightplanner:/i.test(candidate)) {
      return `fightplanner:${candidate.slice(candidate.indexOf(':') + 1)}`;
    }
  }

  return null;
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function dispatchOrQueueProtocolUrl(url: string) {
  if (
    !protocolHandler ||
    !mainWindow ||
    mainWindow.isDestroyed() ||
    !rendererReady
  ) {
    console.log('[protocol] queueing URL until the main window is ready:', url);
    pendingProtocolUrls.push(url);
    return;
  }

  focusMainWindow();
  void protocolHandler.handleDeepLink(url);
}

function flushPendingProtocolUrls() {
  if (!protocolHandler || !rendererReady || pendingProtocolUrls.length === 0) {
    return;
  }

  const urls = pendingProtocolUrls.splice(0);
  console.log('[protocol] flushing pending URLs:', urls.length);

  for (const url of urls) {
    dispatchOrQueueProtocolUrl(url);
  }
}

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
  console.log('Received protocol URL (open-url):', url);

  const protocolUrl = extractProtocolUrl([url]);
  if (protocolUrl) {
    dispatchOrQueueProtocolUrl(protocolUrl);
  }
});

// This listener must exist before the main window is created. A protocol launch
// can otherwise arrive while migrations or the first-run tutorial are running.
app.on('second-instance', (_event, commandLine) => {
  console.log('[protocol] second-instance with argv:', commandLine);

  const protocolUrl = extractProtocolUrl(commandLine);
  if (protocolUrl) {
    console.log('[protocol] URL from second-instance:', protocolUrl);
    dispatchOrQueueProtocolUrl(protocolUrl);
  } else if (process.platform === 'linux') {
    console.log(
      '[protocol][linux] second-instance did not include a fightplanner URL',
    );
  }
});

export function initializeProtocol(window: BrowserWindow) {
  mainWindow = window;
  protocolHandler = new ProtocolHandler(mainWindow);
  rendererReady = false;

  console.log('Protocol handler initialized');

  window.webContents.on('did-start-loading', () => {
    rendererReady = false;
  });

  window.webContents.on('did-finish-load', () => {
    rendererReady = true;
    setTimeout(flushPendingProtocolUrls, 300);
  });

  if (
    !startupProtocolCaptured &&
    (process.platform === 'win32' || process.platform === 'linux')
  ) {
    startupProtocolCaptured = true;
    const args = process.argv.slice(1);
    console.log('[protocol][argv] args:', args);
    const protocolUrl = extractProtocolUrl(args);
    if (protocolUrl) {
      console.log('[protocol][argv] URL found:', protocolUrl);
      pendingProtocolUrls.push(protocolUrl);
    } else if (process.platform === 'linux') {
      console.log(
        '[protocol][linux] no URL in argv at startup. isDefaultProtocolClient=%s',
        app.isDefaultProtocolClient
          ? app.isDefaultProtocolClient('fightplanner')
          : 'n/a',
      );
    }
  }

  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = null;
      protocolHandler = null;
      rendererReady = false;
    }
  });
}

export function getProtocolHandler() {
  return protocolHandler;
}
