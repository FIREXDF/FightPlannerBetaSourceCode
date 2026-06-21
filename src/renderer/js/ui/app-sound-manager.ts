type AppSoundName =
  | 'notification'
  | 'error'
  | 'complete'
  | 'downloading'
  | 'loading'
  | 'switchTab';

class AppSoundManager {
  sounds: Record<AppSoundName, string>;
  defaultSounds: Record<AppSoundName, string>;
  customSounds: Partial<Record<AppSoundName, string>>;
  appSoundEnabled: Partial<Record<AppSoundName, boolean>>;
  customSoundsLoaded: boolean;
  lastPlayed: Map<AppSoundName, number>;
  loopAudios: Map<AppSoundName, HTMLAudioElement>;
  loopCounts: Map<AppSoundName, number>;
  fadeTimers: Map<AppSoundName, ReturnType<typeof setInterval>>;
  cooldownMs: number;
  volume: number;

  constructor() {
    this.defaultSounds = {
      notification: '../sounds/Notification.mp3',
      error: '../sounds/Error.wav',
      complete: '../sounds/Complete.wav',
      downloading: '../sounds/Downloading.wav',
      loading: '../sounds/Loading.wav',
      switchTab: '../sounds/switchTab.wav',
    };
    this.sounds = { ...this.defaultSounds };
    this.customSounds = {};
    this.appSoundEnabled = {};
    this.customSoundsLoaded = false;
    this.lastPlayed = new Map();
    this.loopAudios = new Map();
    this.loopCounts = new Map();
    this.fadeTimers = new Map();
    this.cooldownMs = 900;
    this.volume = 0.75;
    void this.loadCustomSounds();
  }

  play(
    name: AppSoundName,
    options: { volume?: number; cooldownMs?: number } = {},
  ) {
    const src = this.sounds[name];
    if (!src || !this.isSoundEnabled(name)) {
      return;
    }

    if (name === 'loading' && this.isStartupSplashActive()) {
      return;
    }

    if (this.isLoopSound(name)) {
      this.startLoop(name, options);
      return;
    }

    const now = Date.now();
    const cooldownMs = options.cooldownMs ?? this.cooldownMs;
    const lastPlayed = this.lastPlayed.get(name) || 0;

    if (now - lastPlayed < cooldownMs) {
      return;
    }

    this.lastPlayed.set(name, now);

    try {
      const audio = new Audio(src);
      audio.volume = options.volume ?? this.volume;
      audio.play().catch((error) => {
        console.warn(`[AppSoundManager] ${name} sound blocked:`, error);
      });
    } catch (error) {
      console.warn(`[AppSoundManager] Could not play ${name} sound:`, error);
    }
  }

  async loadCustomSounds() {
    if (this.customSoundsLoaded || !window.electronAPI?.store) {
      return;
    }

    try {
      const storedSounds = await window.electronAPI.store.get('appSoundPaths');
      const storedSoundEnabled =
        await window.electronAPI.store.get('appSoundEnabled');
      if (storedSounds && typeof storedSounds === 'object') {
        for (const [name, filePath] of Object.entries(storedSounds)) {
          if (
            this.isKnownSound(name) &&
            typeof filePath === 'string' &&
            filePath.trim()
          ) {
            this.customSounds[name] = filePath;
            this.sounds[name] = this.localPathToFileUrl(filePath);
          }
        }
      }
      if (storedSoundEnabled && typeof storedSoundEnabled === 'object') {
        for (const [name, enabled] of Object.entries(storedSoundEnabled)) {
          if (this.isKnownSound(name)) {
            this.appSoundEnabled[name] = enabled !== false;
          }
        }
      }
      this.customSoundsLoaded = true;
    } catch (error) {
      console.warn('[AppSoundManager] Failed to load custom sounds:', error);
    }
  }

  setCustomSound(name: AppSoundName, filePath: string | null) {
    if (!this.isKnownSound(name)) {
      return;
    }

    this.stop(name, { force: true, fadeMs: 150 });

    if (filePath && filePath.trim()) {
      this.customSounds[name] = filePath;
      this.sounds[name] = this.localPathToFileUrl(filePath);
    } else {
      delete this.customSounds[name];
      this.sounds[name] = this.defaultSounds[name];
    }
  }

  setSoundEnabled(name: AppSoundName, enabled: boolean) {
    if (!this.isKnownSound(name)) {
      return;
    }

    this.appSoundEnabled[name] = enabled;
    this.lastPlayed.delete(name);

    if (!enabled) {
      this.stop(name, { force: true, fadeMs: 120 });
    }
  }

  startLoop(
    name: AppSoundName,
    options: { volume?: number; cooldownMs?: number } = {},
  ) {
    const src = this.sounds[name];
    if (!src || !this.isSoundEnabled(name)) {
      return;
    }

    this.loopCounts.set(name, (this.loopCounts.get(name) || 0) + 1);
    this.clearFadeTimer(name);

    const existingAudio = this.loopAudios.get(name);
    if (existingAudio) {
      existingAudio.volume = options.volume ?? this.volume;
      return;
    }

    try {
      const audio = new Audio(src);
      audio.loop = true;
      audio.volume = options.volume ?? this.volume;
      this.loopAudios.set(name, audio);
      audio.play().catch((error) => {
        console.warn(`[AppSoundManager] ${name} loop blocked:`, error);
      });
    } catch (error) {
      console.warn(`[AppSoundManager] Could not start ${name} loop:`, error);
    }
  }

  stop(name: AppSoundName, options: { fadeMs?: number; force?: boolean } = {}) {
    if (!this.isLoopSound(name)) {
      return;
    }

    const nextCount = options.force
      ? 0
      : Math.max((this.loopCounts.get(name) || 0) - 1, 0);
    this.loopCounts.set(name, nextCount);

    if (nextCount > 0) {
      return;
    }

    this.fadeOutLoop(name, options.fadeMs ?? 650);
  }

  fadeOutLoop(name: AppSoundName, fadeMs: number) {
    const audio = this.loopAudios.get(name);
    if (!audio) {
      return;
    }

    this.clearFadeTimer(name);

    const startVolume = audio.volume;
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const progress = Math.min(elapsed / fadeMs, 1);

      audio.volume = Math.max(startVolume * (1 - progress), 0);

      if (progress >= 1) {
        this.clearFadeTimer(name);
        audio.pause();
        audio.currentTime = 0;
        audio.loop = false;
        this.loopAudios.delete(name);
        this.loopCounts.delete(name);
      }
    }, 30);

    this.fadeTimers.set(name, timer);
  }

  clearFadeTimer(name: AppSoundName) {
    const timer = this.fadeTimers.get(name);
    if (!timer) {
      return;
    }

    clearInterval(timer);
    this.fadeTimers.delete(name);
  }

  isLoopSound(name: AppSoundName) {
    return name === 'loading' || name === 'downloading';
  }

  isKnownSound(name: string): name is AppSoundName {
    return name in this.defaultSounds;
  }

  isSoundEnabled(name: AppSoundName) {
    return this.appSoundEnabled[name] !== false;
  }

  localPathToFileUrl(filePath: string) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    const isWindowsPath = /^[A-Za-z]:\//.test(normalizedPath);
    const prefixedPath = isWindowsPath ? `/${normalizedPath}` : normalizedPath;

    return `file://${prefixedPath
      .split('/')
      .map((segment) =>
        /^[A-Za-z]:$/.test(segment) ? segment : encodeURIComponent(segment),
      )
      .join('/')}`;
  }

  isStartupSplashActive() {
    return (
      document.body.classList.contains('startup-boot-pending') ||
      !!document.getElementById('startup-splash-overlay')
    );
  }
}

if (typeof window !== 'undefined') {
  window.appSoundManager = new AppSoundManager();
}

export { type AppSoundManager };
