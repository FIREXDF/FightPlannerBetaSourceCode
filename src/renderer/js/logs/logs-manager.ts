interface Log {
  id: number;
  timestamp: Date;
  level: string;
  message: string;
  source: 'main' | 'renderer';
}

class LogsManager {
  logs: Array<Log>;
  maxLogs: number;
  currentFilter: string;
  showDeveloperLogs: boolean;
  logsContainer: HTMLElement | null;
  initialized: boolean;

  constructor() {
    this.logs = [];
    this.maxLogs = 1000;
    this.currentFilter = 'all';
    this.showDeveloperLogs = false;
    this.logsContainer = null;
    this.initialized = false;

    this.interceptConsole();
    this.setupIPCListener();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initialize());
    } else {
      this.initialize();
    }
  }

  initialize() {
    this.logsContainer = document.querySelector<HTMLElement>('#logs-container');
    if (!this.logsContainer) {
      console.warn('Logs container not found - will initialize later');
      return;
    }

    this.setupEventListeners();
    this.renderLogs();
    this.initialized = true;
  }

  reinitialize() {
    this.logsContainer = document.querySelector<HTMLElement>('#logs-container');
    if (this.logsContainer) {
      this.setupEventListeners();
      this.renderLogs();
      this.initialized = true;
    }
  }

  interceptConsole() {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalInfo = console.info;

    console.log = (...args) => {
      this.addLog('log', args);
      originalLog.apply(console, args);
    };

    console.warn = (...args) => {
      this.addLog('warn', args);
      originalWarn.apply(console, args);
    };

    console.error = (...args) => {
      this.addLog('error', args);
      originalError.apply(console, args);
    };

    console.info = (...args) => {
      this.addLog('log', args);
      originalInfo.apply(console, args);
    };
  }

  setupIPCListener() {
    if (window.electronAPI && window.electronAPI.onMainLog) {
      window.electronAPI.onMainLog((logData) => {
        this.addLog(logData.level || 'log', [logData.message], true);
      });
      console.log('Main process logs listener initialized');
    }
  }

  addLog(level, args, fromMain = false) {
    const timestamp = new Date();
    const message = args
      .map((arg) => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2);
          } catch (e) {
            return String(arg);
          }
        }
        return String(arg);
      })
      .join(' ');

    const logEntry: Log = {
      id: Date.now() + Math.random(),
      timestamp,
      level,
      message,
      source: fromMain ? 'main' : 'renderer',
    };

    this.logs.push(logEntry);

    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    if (this.initialized && this.logsContainer) {
      this.appendLogEntry(logEntry);
    }
  }

  setupEventListeners() {
    const filterButtons =
      document.querySelectorAll<HTMLElement>('.logs-filter-btn');
    filterButtons.forEach((btn) => {
      if (!btn.dataset.listenerAttached) {
        btn.addEventListener('click', () => {
          const level = btn.dataset.logLevel;
          this.setFilter(level);

          filterButtons.forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
        });
        btn.dataset.listenerAttached = 'true';
      }
    });

    const clearBtn = document.querySelector<HTMLElement>('#clear-logs-btn');
    if (clearBtn && !clearBtn.dataset.listenerAttached) {
      clearBtn.addEventListener('click', () => this.clearLogs());
      clearBtn.dataset.listenerAttached = 'true';
    }

    const copyBtn = document.querySelector<HTMLElement>('#copy-logs-btn');
    if (copyBtn && !copyBtn.dataset.listenerAttached) {
      copyBtn.addEventListener('click', () => this.copyLogsToClipboard());
      copyBtn.dataset.listenerAttached = 'true';
    }

    const openLogsFolderBtn = document.querySelector<HTMLElement>(
      '#open-logs-folder-btn',
    );
    if (openLogsFolderBtn && !openLogsFolderBtn.dataset.listenerAttached) {
      openLogsFolderBtn.addEventListener('click', () => this.openLogsFolder());
      openLogsFolderBtn.dataset.listenerAttached = 'true';
    }

    const developerLogsBtn = document.querySelector<HTMLElement>(
      '#toggle-developer-logs-btn',
    );
    if (developerLogsBtn && !developerLogsBtn.dataset.listenerAttached) {
      developerLogsBtn.addEventListener('click', () => {
        this.setDeveloperLogsVisible(!this.showDeveloperLogs);
      });
      developerLogsBtn.dataset.listenerAttached = 'true';
    }

    this.updateDeveloperLogsButton();
  }

  setFilter(level) {
    this.currentFilter = level;
    this.renderLogs();
  }

  setDeveloperLogsVisible(visible: boolean) {
    this.showDeveloperLogs = visible;
    this.updateDeveloperLogsButton();
    this.renderLogs();
  }

  updateDeveloperLogsButton() {
    const developerLogsBtn = document.querySelector<HTMLElement>(
      '#toggle-developer-logs-btn',
    );
    if (!developerLogsBtn) return;

    developerLogsBtn.classList.toggle('active', this.showDeveloperLogs);
    developerLogsBtn.setAttribute('aria-pressed', String(this.showDeveloperLogs));
  }

  isDeveloperLog(log: Log) {
    if (log.level === 'error') {
      return false;
    }

    const message = log.message.trim();
    const developerLogPatterns = [
      /^Tab already loaded:/i,
      /^Tab switched to:/i,
      /^Switched to tab:/i,
      /^Initializing features for tab:/i,
      /^Updating \d+ elements with data-i18n$/i,
      /^Updated \d+ elements$/i,
      /^Install confirm toggle:/i,
      /^Install confirm toggle changed!$/i,
      /^Install confirm toggle listener attached$/i,
      /^Sending Discord RPC update:/i,
      /^Received discord-rpc-update:/i,
      /^Discord RPC manager not initialized/i,
      /^Setting .* tab/i,
      /^Setting Idle state$/i,
      /^Setting up Discord RPC listeners/i,
      /^Found \d+ tab buttons$/i,
      /^Discord RPC Client initialized$/i,
      /^Main process logs listener initialized$/i,
      /^Logs Manager initialized$/i,
      /^\[UpdateManager\]/i,
      /^\[extract-progress\]/i,
      /^\[renderer-ipc\]/i,
    ];

    return developerLogPatterns.some((pattern) => pattern.test(message));
  }

  isLogVisible(log: Log) {
    if (this.currentFilter !== 'all' && log.level !== this.currentFilter) {
      return false;
    }

    return this.showDeveloperLogs || !this.isDeveloperLog(log);
  }

  clearLogs() {
    this.logs = [];
    this.renderLogs();
  }

  async openLogsFolder() {
    try {
      if (window.electronAPI && window.electronAPI.getLogsPath) {
        const logsPath = await window.electronAPI.getLogsPath();

        if (window.electronAPI.openFolder) {
          await window.electronAPI.openFolder(logsPath);

          if (window.toastManager) {
            window.toastManager.success('toasts.logsFolderOpened');
          }
        }
      } else {
        if (window.toastManager) {
          window.toastManager.error('toasts.cannotOpenLogsFolder');
        }
      }
    } catch (error) {
      console.error('Error opening logs folder:', error);
      if (window.toastManager) {
        window.toastManager.error('toasts.failedToOpenLogsFolder');
      }
    }
  }

  copyLogsToClipboard() {
    try {
      const logsText = this.getFilteredLogs()
        .map((log) => {
          const time = log.timestamp.toLocaleTimeString();
          const date = log.timestamp.toLocaleDateString();
          return `[${date} ${time}] [${log.level.toUpperCase()}] [${log.source}] ${log.message}`;
        })
        .join('\n');

      navigator.clipboard
        .writeText(logsText)
        .then(() => {
          if (window.toastManager) {
            window.toastManager.success('toasts.logsCopiedToClipboard');
          }
        })
        .catch((err) => {
          console.error('Failed to copy logs:', err);
          if (window.toastManager) {
            window.toastManager.error('toasts.failedToCopyLogs');
          }
        });
    } catch (error) {
      console.error('Error copying logs:', error);
      if (window.toastManager) {
        window.toastManager.error('Failed to copy logs');
      }
    }
  }

  renderLogs() {
    if (!this.logsContainer) return;

    const filteredLogs = this.getFilteredLogs();

    if (filteredLogs.length === 0) {
      this.logsContainer.innerHTML = `
        <div class="logs-empty-state">
          <i class="bi bi-terminal"></i>
          <p>No logs to display.</p>
        </div>
      `;
      return;
    }

    this.logsContainer.innerHTML = '';
    filteredLogs.forEach((log) => this.appendLogEntry(log, false));

    this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
  }

  appendLogEntry(log, shouldScroll = true) {
    if (!this.logsContainer) return;

    if (!this.isLogVisible(log)) {
      return;
    }

    const emptyState =
      this.logsContainer.querySelector<HTMLElement>('.logs-empty-state');
    if (emptyState) {
      emptyState.remove();
    }

    const logElement = document.createElement('div');
    logElement.className = `log-entry log-${log.level}`;
    logElement.dataset.logId = log.id;

    const time = log.timestamp.toLocaleTimeString();
    const icon = this.getLogIcon(log.level);
    const sourceTag =
      log.source === 'main' ? '<span class="log-source-tag">MAIN</span>' : '';

    logElement.innerHTML = `
      <div class="log-time">${time}</div>
      <div class="log-icon">${icon}</div>
      ${sourceTag}
      <div class="log-message">${this.escapeHtml(log.message)}</div>
    `;

    this.logsContainer.appendChild(logElement);

    if (shouldScroll) {
      this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }

    const maxVisibleLogs = 500;
    const logEntries =
      this.logsContainer.querySelectorAll<HTMLElement>('.log-entry');
    if (logEntries.length > maxVisibleLogs) {
      logEntries[0].remove();
    }
  }

  getLogIcon(level) {
    const icons = {
      log: '<i class="bi bi-info-circle"></i>',
      warn: '<i class="bi bi-exclamation-triangle"></i>',
      error: '<i class="bi bi-x-circle"></i>',
    };
    return icons[level] || icons.log;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  getFilteredLogs() {
    return this.logs.filter((log) => this.isLogVisible(log));
  }
}

if (typeof window !== 'undefined') {
  window.logsManager = new LogsManager();
  console.log('Logs Manager initialized');
}

export { type LogsManager };
