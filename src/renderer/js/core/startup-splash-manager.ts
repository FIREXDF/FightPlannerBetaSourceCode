const STARTUP_SPLASH_VIDEO_SRC = '../images/SplashScreen.webm';
const STARTUP_SPLASH_VIDEO_DURATION_MS = 3000;

class StartupSplashManager {
  overlay: HTMLElement | null;
  stageFrame: HTMLElement | null;
  stageContainer: HTMLElement | null;
  statusText: HTMLElement | null;
  splashVideo: HTMLVideoElement | null;
  splashAudio: HTMLAudioElement | null;
  loadingVideo: HTMLVideoElement | null;
  splashEnabled: boolean;
  splashSoundEnabled: boolean;
  splashSoundPath: string | null;
  startupLaunch: boolean;
  postTutorialIntro: boolean;
  animationWarmupPromise: Promise<void> | null;

  constructor() {
    this.overlay = null;
    this.stageFrame = null;
    this.stageContainer = null;
    this.statusText = null;
    this.splashVideo = null;
    this.splashAudio = null;
    this.loadingVideo = null;
    this.splashEnabled = true;
    this.splashSoundEnabled = true;
    this.splashSoundPath = null;
    this.startupLaunch = false;
    this.postTutorialIntro = false;
    this.animationWarmupPromise = null;
  }

  isStartupLaunch() {
    return new URLSearchParams(window.location.search).get('startup') === 'true';
  }

  async initialize() {
    const params = new URLSearchParams(window.location.search);
    this.startupLaunch = params.get('startup') === 'true';
    this.postTutorialIntro = params.get('postTutorialIntro') === 'true';

    if (!this.startupLaunch) {
      document.body.classList.remove('startup-boot-pending');
      return;
    }

    this.createOverlay();

    await this.loadPreferences();

    this.animationWarmupPromise = this.warmupAnimationAssets();

    await Promise.race([
      this.runEarlyPrefetches(),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);

    const bootPromise = this.waitForBoot();

    if (this.splashEnabled) {
      await this.playSplashSequence(bootPromise);
    } else {
      await this.playLoadingOnlySequence(bootPromise);
    }

    await this.prepareAppIntro();
    await this.finishStartup();
  }

  createOverlay() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'startup-splash-overlay';
    this.overlay.style.cssText = [
      'position: fixed',
      'inset: 0',
      'z-index: 99999',
      'background: radial-gradient(circle at top, #242424 0%, #111111 58%, #090909 100%)',
      'opacity: 1',
      'transition: opacity 320ms ease',
      'overflow: hidden',
    ].join(';');

    this.stageContainer = document.createElement('div');
    this.stageFrame = document.createElement('div');
    this.stageFrame.style.cssText = [
      'position: absolute',
      'inset: 0',
      'display: flex',
      'align-items: center',
      'justify-content: center',
      'overflow: hidden',
      'pointer-events: none',
    ].join(';');

    this.stageContainer.style.cssText = 'width: 100vw; height: 100vh;';

    this.stageFrame.appendChild(this.stageContainer);
    this.overlay.appendChild(this.stageFrame);
    document.body.appendChild(this.overlay);
  }

  async loadPreferences() {
    if (!window.electronAPI?.store) {
      return;
    }

    try {
      const splashEnabled = await window.electronAPI.store.get(
        'startupSplashEnabled',
      );
      const splashSoundEnabled = await window.electronAPI.store.get(
        'startupSplashSoundEnabled',
      );
      const splashSoundPath = await window.electronAPI.store.get(
        'startupSplashSoundPath',
      );

      this.splashEnabled = splashEnabled !== false;
      this.splashSoundEnabled = splashSoundEnabled !== false;
      this.splashSoundPath =
        typeof splashSoundPath === 'string' && splashSoundPath.trim()
          ? splashSoundPath
          : null;
    } catch (error) {
      console.error('[StartupSplash] Failed to load preferences:', error);
    }
  }

  async waitForBoot() {
    if (window.settingsManager?.readyPromise) {
      await window.settingsManager.readyPromise;
    }

    if (window.tabLoader) {
      await window.tabLoader.initializeTabs();
    }

    const bootTasks: Promise<unknown>[] = [];

    if (window.modManager?.fetchMods) {
      bootTasks.push(window.modManager.fetchMods());
    }

    if (window.pluginManager?.fetchPlugins) {
      bootTasks.push(window.pluginManager.fetchPlugins());
    }

    await Promise.allSettled(bootTasks);

    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  async runEarlyPrefetches() {
    const tasks: Promise<unknown>[] = [];
    try {
      const stagePromise = window.stagesManager?.preloadLayout?.();
      if (stagePromise) tasks.push(stagePromise);
    } catch (error) {
      console.warn('[StartupSplash] stages preload kickoff failed:', error);
    }
    try {
      const cssPromise = window.charactersManager?.preloadCssLayout?.();
      if (cssPromise) tasks.push(cssPromise);
    } catch (error) {
      console.warn('[StartupSplash] characters CSS preload kickoff failed:', error);
    }
    if (tasks.length) {
      await Promise.allSettled(tasks);
    }
  }

  async playSplashSequence(bootPromise: Promise<void>) {
    this.setStatus('Loading startup splash...');

    let bootCompleted = false;
    const trackedBootPromise = bootPromise.then(() => {
      bootCompleted = true;
    });

    const splashFinished = this.playSplashVideo();
    this.playSplashAudio();

    await splashFinished;

    if (!bootCompleted) {
      this.setStatus('Loading mods and interface...');
      await this.showLoadingVideo();
    }

    await trackedBootPromise;
  }

  async playLoadingOnlySequence(bootPromise: Promise<void>) {
    this.setStatus('Loading mods and interface...');
    await this.showLoadingVideo();
    await bootPromise;
  }

  async warmupAnimationAssets() {
    const warmupTasks: Promise<unknown>[] = [];

    if (window.animationManager?.preloadAssets) {
      warmupTasks.push(window.animationManager.preloadAssets());
    }

    if (window.preloadLoadingVideo) {
      warmupTasks.push(window.preloadLoadingVideo());
    }

    if (this.splashEnabled) {
      warmupTasks.push(this.preloadSplashVideo());
    }
    await Promise.allSettled(warmupTasks);
  }

  async preloadSplashVideo() {
    if (!document.body) {
      return;
    }

    const video = document.createElement('video');
    video.src = STARTUP_SPLASH_VIDEO_SRC;
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.style.cssText =
      'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;';
    document.body.appendChild(video);
    this.splashVideo = video;

    await new Promise<void>((resolve) => {
      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
        video.removeEventListener('loadeddata', done);
        video.removeEventListener('canplay', done);
        video.removeEventListener('error', done);
      };

      function done() {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve();
      }

      video.addEventListener('loadeddata', done);
      video.addEventListener('canplay', done);
      video.addEventListener('error', done);
      timeoutId = setTimeout(done, 6000);

      if (video.readyState >= 2) {
        done();
      }
    });
  }

  async playSplashVideo() {
    if (!this.stageContainer) {
      return;
    }

    this.stopLoadingVideo();
    this.applyLayout('fullscreen');
    this.stageContainer.innerHTML = '';

    const video = this.splashVideo || document.createElement('video');
    video.className = 'startup-splash-video';
    if (video.getAttribute('src') !== STARTUP_SPLASH_VIDEO_SRC) {
      video.src = STARTUP_SPLASH_VIDEO_SRC;
    }
    video.preload = 'auto';
    video.autoplay = false;
    video.loop = false;
    video.muted = true;
    video.playsInline = true;
    video.disablePictureInPicture = true;
    video.setAttribute('aria-hidden', 'true');
    video.style.cssText =
      'display:block;width:100%;height:100%;object-fit:cover;';
    this.stageContainer.appendChild(video);
    this.splashVideo = video;

    await new Promise<void>((resolve) => {
      let settled = false;
      let durationTimeout: ReturnType<typeof setTimeout> | null = null;
      let startupTimeout: ReturnType<typeof setTimeout> | null = null;

      const startDuration = () => {
        if (durationTimeout || settled) {
          return;
        }
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
        }
        durationTimeout = setTimeout(
          finish,
          STARTUP_SPLASH_VIDEO_DURATION_MS,
        );
      };

      const cleanup = () => {
        if (startupTimeout) {
          clearTimeout(startupTimeout);
        }
        if (durationTimeout) {
          clearTimeout(durationTimeout);
        }
        video.removeEventListener('playing', startDuration);
        video.removeEventListener('error', finish);
        video.pause();
        this.stopSplashAudio();
        resolve();
      };

      function finish() {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
      }

      video.addEventListener('playing', startDuration);
      video.addEventListener('error', finish);
      startupTimeout = setTimeout(finish, 8000);
      video.play().then(startDuration).catch((error) => {
        console.warn(
          '[StartupSplash] Could not play startup splash video:',
          error,
        );
        finish();
      });
    });
  }

  stopSplashVideo() {
    this.stopVideo(this.splashVideo);
    this.splashVideo = null;
  }

  stopVideo(video: HTMLVideoElement | null) {
    if (!video) {
      return;
    }

    video.pause();
    video.removeAttribute('src');
    video.load();
    video.remove();
  }

  async showLoadingVideo() {
    if (!this.stageContainer || !window.mountLoadingVideo) {
      return;
    }

    this.stopSplashVideo();
    this.applyLayout('contained');
    this.loadingVideo = window.mountLoadingVideo(this.stageContainer);

    await new Promise<void>((resolve) => {
      const video = this.loadingVideo;
      if (!video || video.readyState >= 2) {
        resolve();
        return;
      }

      let settled = false;
      let timeoutId: ReturnType<typeof setTimeout> | null = null;

      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;

        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        video.removeEventListener('loadeddata', resolveOnce);
        video.removeEventListener('canplay', resolveOnce);
        video.removeEventListener('error', resolveOnce);
        resolve();
      };

      video.addEventListener('loadeddata', resolveOnce);
      video.addEventListener('canplay', resolveOnce);
      video.addEventListener('error', resolveOnce);

      timeoutId = setTimeout(resolveOnce, 6000);

      if (video.readyState >= 2) {
        resolveOnce();
      }
    });
  }

  stopLoadingVideo() {
    if (this.stageContainer && window.unmountLoadingVideo) {
      window.unmountLoadingVideo(this.stageContainer);
    }

    this.loadingVideo = null;
  }

  applyLayout(displayMode: 'fullscreen' | 'contained') {
    if (!this.stageFrame || !this.stageContainer) {
      return;
    }

    if (displayMode === 'fullscreen') {
      this.stageFrame.style.justifyContent = 'center';
      this.stageFrame.style.alignItems = 'center';
      this.stageContainer.style.width = '100vw';
      this.stageContainer.style.height = '100vh';
      this.stageContainer.style.maxWidth = 'none';
      this.stageContainer.style.maxHeight = 'none';
    } else {
      this.stageFrame.style.justifyContent = 'center';
      this.stageFrame.style.alignItems = 'center';
      this.stageContainer.style.width = 'min(24vw, 220px)';
      this.stageContainer.style.height = 'min(24vw, 220px)';
      this.stageContainer.style.minWidth = '120px';
      this.stageContainer.style.minHeight = '120px';
      this.stageContainer.style.maxWidth = '220px';
      this.stageContainer.style.maxHeight = '220px';
    }
  }

  playSplashAudio() {
    if (!this.splashEnabled || !this.splashSoundEnabled) {
      return;
    }

    try {
      const defaultSound = '../sounds/SplashScreen.mp3';
      const audio = new Audio(
        this.splashSoundPath
          ? this.localPathToFileUrl(this.splashSoundPath)
          : defaultSound,
      );
      this.splashAudio = audio;
      audio.volume = 0.8;

      audio.addEventListener(
        'error',
        () => {
          if (!this.splashSoundPath || this.splashAudio !== audio) {
            return;
          }

          const fallbackAudio = new Audio(defaultSound);
          this.splashAudio = fallbackAudio;
          fallbackAudio.volume = 0.8;
          fallbackAudio.play().catch((error) => {
            console.warn(
              '[StartupSplash] Fallback splash audio blocked:',
              error,
            );
          });
        },
        { once: true },
      );
      audio.play().catch((error) => {
        console.warn('[StartupSplash] Splash audio blocked:', error);
      });
    } catch (error) {
      console.warn('[StartupSplash] Could not start splash audio:', error);
    }
  }

  stopSplashAudio() {
    if (!this.splashAudio) {
      return;
    }

    this.splashAudio.pause();
    this.splashAudio.currentTime = 0;
    this.splashAudio = null;
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

  setStatus(text: string) {
    if (this.statusText) {
      this.statusText.textContent = text;
    }
  }

  async prepareAppIntro() {
    if (
      !this.splashEnabled ||
      !window.animationManager?.prepareIntroAnimation
    ) {
      return;
    }

    if (this.animationWarmupPromise) {
      await Promise.race([
        this.animationWarmupPromise,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }

    window.animationManager.prepareIntroAnimation();
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  }

  async finishStartup() {
    document.body.classList.remove('startup-boot-pending');

    this.stopLoadingVideo();
    this.stopSplashVideo();
    this.stopSplashAudio();

    if (this.overlay) {
      this.overlay.style.opacity = '0';
      await new Promise((resolve) => setTimeout(resolve, 320));
      this.overlay.remove();
    }

    this.overlay = null;
    this.stageFrame = null;
    this.stageContainer = null;
    this.statusText = null;

    if (this.splashEnabled && window.animationManager?.playIntroAnimation) {
      await window.animationManager.playIntroAnimation(false);
    }
  }
}

if (typeof window !== 'undefined') {
  (window as any).startupSplashManager = new StartupSplashManager();
}

export { StartupSplashManager };
