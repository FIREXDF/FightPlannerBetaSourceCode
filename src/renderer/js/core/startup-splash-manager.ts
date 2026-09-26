class StartupSplashManager {
  overlay: HTMLElement | null;
  stageFrame: HTMLElement | null;
  stageContainer: HTMLElement | null;
  statusText: HTMLElement | null;
  currentAnimation: any;
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
    this.currentAnimation = null;
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

    // Pre-cache heavy panels (stages layout + character CSS) BEFORE the
    // splash animation plays so their IPC payload deserialization does not
    // stutter the Lottie animation. Capped to avoid stalling startup if the
    // backend is slow.
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

    const splashPromise = this.loadAnimation('../images/SplashScreen.json', {
      loop: false,
      autoplay: true,
      displayMode: 'fullscreen',
      preserveAspectRatio: 'xMidYMid slice',
    });

    this.playSplashAudio();

    const splashFinished = splashPromise.then(
      (animation) => this.waitForAnimationEnd(animation, 12000),
    );

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

    await Promise.allSettled(warmupTasks);
  }

  async showLoadingVideo() {
    if (!this.stageContainer || !window.mountLoadingVideo) {
      return;
    }

    this.destroyCurrentAnimation();
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

  destroyCurrentAnimation() {
    if (!this.currentAnimation) {
      return;
    }

    try {
      this.currentAnimation.destroy();
    } catch (error) {
      console.warn('[StartupSplash] Could not destroy animation:', error);
    }

    this.currentAnimation = null;
  }

  async prepareAppIntro() {
    if (!this.splashEnabled || !window.animationManager?.prepareIntroAnimation) {
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

  async loadAnimation(
    path: string,
    options: {
      loop: boolean;
      autoplay: boolean;
      displayMode: 'fullscreen' | 'contained';
      preserveAspectRatio: string;
    },
  ) {
    if (!this.stageContainer || !window.lottie) {
      throw new Error('Lottie is not available for startup splash');
    }

    this.stopLoadingVideo();
    this.destroyCurrentAnimation();

    this.applyLayout(options.displayMode);
    this.stageContainer.innerHTML = '';
    this.currentAnimation = window.lottie.loadAnimation({
      container: this.stageContainer,
      renderer: 'svg',
      loop: options.loop,
      autoplay: options.autoplay,
      path,
      rendererSettings: {
        preserveAspectRatio: options.preserveAspectRatio,
      },
    });

    await new Promise<void>((resolve) => {
      const animation = this.currentAnimation;
      animation.addEventListener('DOMLoaded', () => resolve());
      animation.addEventListener('data_failed', () => resolve());
    });

    return this.currentAnimation;
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

  async waitForAnimationEnd(animation: any, fallbackMs: number) {
    await new Promise<void>((resolve) => {
      let settled = false;
      const resolveOnce = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      animation.addEventListener('complete', resolveOnce);
      animation.addEventListener('data_failed', resolveOnce);
      setTimeout(resolveOnce, fallbackMs);
    });
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
      audio.volume = 0.8;
      audio.addEventListener(
        'error',
        () => {
          if (!this.splashSoundPath) {
            return;
          }

          const fallbackAudio = new Audio(defaultSound);
          fallbackAudio.volume = 0.8;
          fallbackAudio.play().catch((error) => {
            console.warn('[StartupSplash] Fallback splash audio blocked:', error);
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

  async finishStartup() {
    document.body.classList.remove('startup-boot-pending');

    this.stopLoadingVideo();

    if (this.overlay) {
      this.overlay.style.opacity = '0';
      await new Promise((resolve) => setTimeout(resolve, 320));
      this.overlay.remove();
    }

    this.destroyCurrentAnimation();

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
