class AnimationManager {
  isReducedMotion: boolean;
  initialized: boolean;
  introAudio: HTMLAudioElement | null;
  assetWarmupPromise: Promise<void> | null;
  gsapWarmedUp: boolean;

  constructor() {
    this.isReducedMotion = false;
    this.initialized = false;
    this.introAudio = null;
    this.assetWarmupPromise = null;
    this.gsapWarmedUp = false;
  }

  initialize() {
    if (this.initialized) return;

    this.checkReducedMotion();
    void this.preloadAssets();
    this.setupListeners();
    this.checkInitialAnimation();
    this.initialized = true;
  }

  checkReducedMotion() {
    // Check if user has enabled reduced animations in app settings
    this.isReducedMotion =
      document.body.classList.contains('reduced-animations') ||
      document.body.classList.contains('no-animations');
  }

  checkInitialAnimation() {
    // Check if class was added by inline script (from query param)
    if (document.body.classList.contains('app-entrance-animation')) {
      console.log('Initial entrance animation detected');
      // Set cleanup timer
      setTimeout(() => {
        document.body.classList.remove('app-entrance-animation');
        console.log('Initial entrance animation sequence completed');
      }, 2500); // 2s animation + buffer
    }
  }

  setupListeners() {
    // Listen for intro animation trigger from main process (manual trigger)
    if (window.electronAPI) {
      window.electronAPI.onStartIntroAnimation(() => {
        void this.playIntroAnimation();
      });
    }
  }

  preloadAssets() {
    this.checkReducedMotion();

    if (this.isReducedMotion) {
      return Promise.resolve();
    }

    if (this.assetWarmupPromise) {
      return this.assetWarmupPromise;
    }

    this.warmupGsapRuntime();

    this.assetWarmupPromise = new Promise<void>((resolve) => {
      try {
        if (!this.introAudio) {
          this.introAudio = new Audio('../../assets/sounds/endtutorial.mp3');
          this.introAudio.preload = 'auto';
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

          this.introAudio?.removeEventListener('canplaythrough', resolveOnce);
          this.introAudio?.removeEventListener('loadeddata', resolveOnce);
          this.introAudio?.removeEventListener('error', resolveOnce);
          resolve();
        };

        this.introAudio.addEventListener('canplaythrough', resolveOnce);
        this.introAudio.addEventListener('loadeddata', resolveOnce);
        this.introAudio.addEventListener('error', resolveOnce);

        timeoutId = setTimeout(resolveOnce, 1500);
        this.introAudio.load();
      } catch (error) {
        console.warn('[AnimationManager] Failed to warm intro assets:', error);
        resolve();
      }
    });

    return this.assetWarmupPromise;
  }

  warmupGsapRuntime() {
    if (this.gsapWarmedUp || typeof gsap === 'undefined') {
      return;
    }

    try {
      const timeline = gsap.timeline({ paused: true });
      timeline.to({}, { duration: 0 });
      timeline.kill();
      this.gsapWarmedUp = true;
    } catch (error) {
      console.warn('[AnimationManager] Failed to warm GSAP runtime:', error);
    }
  }

  playIntroAudio() {
    const introAudio =
      this.introAudio || new Audio('../../assets/sounds/endtutorial.mp3');

    try {
      introAudio.currentTime = 0;
      introAudio.play().catch((error) => {
        console.error(
          '[AnimationManager] Error playing intro audio:',
          error,
        );
      });
    } catch (error) {
      console.error('[AnimationManager] Failed to initialize intro audio:', error);
    }
  }

  prepareIntroAnimation() {
    this.checkReducedMotion();

    if (this.isReducedMotion) {
      return;
    }

    void this.preloadAssets();
    document.body.classList.remove('app-entrance-animation');
    document.body.classList.add('app-entrance-prepared');
    void document.body.offsetWidth;
  }

  playIntroAnimation(playAudio = true) {
    this.checkReducedMotion();

    if (this.isReducedMotion) return Promise.resolve();

    void this.preloadAssets();
    console.log('Playing entrance animation sequence (manual trigger)');

    if (playAudio) {
      this.playIntroAudio();
    }

    return new Promise<void>((resolve) => {
      requestAnimationFrame(() => {
        const body = document.body;
        const wasPrepared = body.classList.contains('app-entrance-prepared');

        body.classList.remove('app-entrance-animation');
        if (!wasPrepared) {
          body.classList.add('app-entrance-prepared');
        }

        void document.body.offsetWidth;

        body.classList.remove('app-entrance-prepared');
        body.classList.add('app-entrance-animation');

        setTimeout(() => {
          body.classList.remove('app-entrance-animation');
          body.classList.remove('app-entrance-prepared');
          console.log('Entrance animation sequence completed');
          resolve();
        }, 2500);
      });
    });
  }

  // Helper for GSAP tab switches to keep renderer.js clean
  animateTabSwitch(currentTab, selectedTab, tabName) {
    if (this.isReducedMotion) {
      this.handleReducedMotionTabSwitch(currentTab, selectedTab);
      return;
    }

    // If entrance animation is playing, don't run tab switch animation yet
    if (document.body.classList.contains('app-entrance-animation')) {
      this.handleReducedMotionTabSwitch(currentTab, selectedTab);
      return;
    }

    this.handleFullMotionTabSwitch(currentTab, selectedTab);
  }

  handleReducedMotionTabSwitch(currentTab, selectedTab) {
    // Instant switch logic
    document.querySelectorAll<HTMLElement>('.tab-content').forEach((tab) => {
      tab.classList.remove('active');
      tab.style.cssText = 'display: none;';
    });

    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.cssText =
        'display: flex; opacity: 1; transform: none; z-index: auto;';
    }
  }

  handleFullMotionTabSwitch(currentTab, selectedTab) {
    // GSAP animation logic
    document.querySelectorAll<HTMLElement>('.tab-content').forEach((tab) => {
      if (tab !== selectedTab && tab !== currentTab) {
        gsap.set(tab, { display: 'none', zIndex: -1 });
      }
    });

    if (selectedTab) {
      selectedTab.classList.add('active');
      selectedTab.style.display = 'flex';
      gsap.set(selectedTab, {
        x: 50,
        opacity: 0,
        zIndex: 2,
        scale: 0.95,
        boxShadow: '0 0 0 rgba(0,0,0,0)',
      });
    }

    if (currentTab) {
      gsap.set(currentTab, { zIndex: 1 });
    }

    const tl = gsap.timeline();

    if (currentTab) {
      tl.to(
        currentTab,
        {
          x: -50,
          opacity: 0,
          scale: 0.95,
          duration: 0.3,
          ease: 'power3.inOut',
        },
        0,
      );
    }

    if (selectedTab) {
      tl.to(
        selectedTab,
        {
          x: 0,
          opacity: 1,
          scale: 1,
          boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
          duration: 0.4,
          ease: 'power3.out',
        },
        0,
      );

      tl.to(
        selectedTab,
        {
          boxShadow: '0 0 0 rgba(0,0,0,0)',
          duration: 0.2,
          ease: 'power2.inOut',
          onComplete: () => {
            gsap.set(selectedTab, {
              clearProps: 'x,opacity,scale,boxShadow,zIndex',
            });
          },
        },
        '+=0.1',
      );
    }

    if (currentTab) {
      tl.call(
        () => {
          currentTab.classList.remove('active');
          gsap.set(currentTab, {
            display: 'none',
            clearProps: 'x,opacity,scale,boxShadow',
            zIndex: -1,
          });
        },
        undefined,
        0.3,
      );
    }
  }
}

window.animationManager = new AnimationManager();

export { type AnimationManager };
