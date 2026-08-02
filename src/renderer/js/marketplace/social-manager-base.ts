class SocialManagerBase {
  [key: string]: any;
  API_URL: string;
  GAMEBANANA_TOP_SUBS_URL: string;
  GAMEBANANA_SUBFEED_URL: string;
  GAMEBANANA_API_URL: string;
  authToken: string | null;
  tokenRefreshPromise: Promise<boolean> | null;
  userData: {
    localId: string;
    email: string;
    displayName: string;
    refreshToken: string;
  } | null;
  autoDownloadInterval: ReturnType<typeof setInterval> | null;
  autoDownloadEnabled: boolean;
  autoDownloadIntervalMs: number;
  installingMods: Set<string>;
  serviceUnavailableShown: boolean;
  onboardingAnim: any;
  loginAnim: any;
  profileMediaUploadAnim: any;
  gameBananaFeaturedMods: GameBananaTopSubmission[];
  gameBananaFeaturedSourceMods: GameBananaTopSubmission[];
  gameBananaFeaturedIndex: number;
  gameBananaFeaturedTimeline: any;
  gameBananaPreviewAnimation: Promise<void> | null;
  gameBananaModsPage: number;
  gameBananaModsTotalPages: number;
  gameBananaDiscoverSort: GameBananaDiscoverSort;
  gameBananaCurrentSubfeedData: GameBananaSubfeedResponse | null;
  gameBananaCategoryFilter: string;
  gameBananaSkinSubcategoryOpen: boolean;
  gameBananaSkinSubcategoryId: number | null;
  gameBananaSkinSubcategories: any[] | null;
  gameBananaSearchQuery: string;
  gameBananaSearchDebounce: ReturnType<typeof setTimeout> | null;
  gameBananaModsRequestId: number;
  gameBananaSearchListenerBound: boolean;
  gameBananaSubmissionCache: Map<string, GameBananaTopSubmission>;
  gameBananaDownloadCountCache: Map<string, number | null>;
  gameBananaDownloadCountRequests: Map<string, Promise<number | null>>;
  gameBananaLastDetailSource: {
    modelName: string;
    submissionId: string;
    sourceKind: 'featured' | 'grid' | 'social';
    page: number;
    scrollTop: number;
  } | null;
  gameBananaDetailReturnSection: string | null;
  gameBananaDetailReturnScrollTop: number;
  gameBananaDetailReturnInProgress: boolean;
  gameBananaDiscoverSnapshot: {
    html: string;
    page: number;
    scrollTop: number;
  } | null;
  gameBananaCurrentDetail: {
    details: any;
    fallback: GameBananaTopSubmission | null;
    files: GameBananaFileEntry[];
  } | null;
  socialFeedPage: number;
  socialFeedPerPage: number;
  socialFeedMods: any[];
  skylineInstalledCache: boolean | null;
  pendingGameBananaSocialDownloads: Map<
    string,
    PendingGameBananaSocialDownload
  >;
  profileMediaCropState: ProfileMediaCropState | null;
  profileMediaListenersBound: boolean;
  socialNavigationListenersBound: boolean;
  socialProfileButtonsBound: boolean;
  socialDocumentClickListenerBound: boolean;
  cache: {
    [key: string]: { data: any; timestamp: number; ttl: number };
  };
  pendingRequests: Map<string, Promise<any>>;
  viewedUserId: string | null;
  viewedUsername: string | null;

  constructor() {
    this.API_URL =
      'https://fightplanner-social-api.nathancarlos19100.workers.dev';
    this.GAMEBANANA_TOP_SUBS_URL =
      // GameBanana can prepend a PHP warning to responses that request
      // _aPreviewMedia, making the otherwise valid JSON impossible to parse.
      // The submission image fields are sufficient for Discover cards.
      'https://gamebanana.com/apiv11/Game/6498/TopSubs?_csvProperties=_idRow,_sModelName,_sSingularTitle,_sName,_sProfileUrl,_sImageUrl,_sThumbnailUrl,_aSubmitter,_aRootCategory,_aSubCategory,_sPeriod,_nLikeCount,_nPostCount,_bHasContentRatings,_aContentRatings,_aContentRating,_sContentRating,_sContentRatingName,_bIsNSFW,_bIsNsfw,_bIsAdult,_aTags';
    this.GAMEBANANA_SUBFEED_URL =
      'https://gamebanana.com/apiv11/Game/6498/Subfeed';
    this.GAMEBANANA_API_URL = 'https://gamebanana.com/apiv11';
    this.authToken = null;
    this.tokenRefreshPromise = null;
    this.userData = null;
    this.autoDownloadInterval = null;
    this.autoDownloadEnabled = true;
    this.autoDownloadIntervalMs = 5 * 60 * 1000;
    this.installingMods = new Set();
    this.serviceUnavailableShown = false;
    this.profileMediaUploadAnim = null;
    this.gameBananaFeaturedMods = [];
    this.gameBananaFeaturedSourceMods = [];
    this.gameBananaFeaturedIndex = 0;
    this.gameBananaFeaturedTimeline = null;
    this.gameBananaPreviewAnimation = null;
    this.gameBananaModsPage = 1;
    this.gameBananaModsTotalPages = 1;
    this.gameBananaDiscoverSort = 'recent';
    this.gameBananaCurrentSubfeedData = null;
    this.gameBananaCategoryFilter = 'all';
    this.gameBananaSkinSubcategoryOpen = false;
    this.gameBananaSkinSubcategoryId = null;
    this.gameBananaSkinSubcategories = null;
    this.gameBananaSearchQuery = '';
    this.gameBananaSearchDebounce = null;
    this.gameBananaModsRequestId = 0;
    this.gameBananaSearchListenerBound = false;
    this.gameBananaSubmissionCache = new Map();
    this.gameBananaDownloadCountCache = new Map();
    this.gameBananaDownloadCountRequests = new Map();
    this.gameBananaLastDetailSource = null;
    this.gameBananaDetailReturnSection = null;
    this.gameBananaDetailReturnScrollTop = 0;
    this.gameBananaDetailReturnInProgress = false;
    this.gameBananaDiscoverSnapshot = null;
    this.gameBananaCurrentDetail = null;
    this.socialFeedPage = 1;
    this.socialFeedPerPage = 12;
    this.socialFeedMods = [];
    this.skylineInstalledCache = null;
    this.pendingGameBananaSocialDownloads = new Map();
    this.profileMediaCropState = null;
    this.profileMediaListenersBound = false;
    this.socialNavigationListenersBound = false;
    this.socialProfileButtonsBound = false;
    this.socialDocumentClickListenerBound = false;

    // Cache pour réduire les requêtes
    this.cache = {
      links: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes
      friends: { data: null, timestamp: 0, ttl: 2 * 60 * 1000 }, // 2 minutes
      notifications: { data: null, timestamp: 0, ttl: 1 * 60 * 1000 }, // 1 minute
      gameBananaTopSubs: { data: null, timestamp: 0, ttl: 10 * 60 * 1000 }, // 10 minutes
      gameBananaTopSubsContentRatings: {
        data: null,
        timestamp: 0,
        ttl: 10 * 60 * 1000,
      },
      profileBadgeDefinitions: {
        data: null,
        timestamp: 0,
        ttl: 10 * 60 * 1000,
      },
    };
    this.pendingRequests = new Map(); // Éviter les requêtes simultanées
  }

  bindBackdropClose(modal: HTMLElement, onClose: () => void) {
    let pointerStartedOnBackdrop = false;
    modal.addEventListener('pointerdown', (event) => {
      pointerStartedOnBackdrop = event.target === modal;
    });
    modal.addEventListener('click', (event) => {
      const shouldClose = pointerStartedOnBackdrop && event.target === modal;
      pointerStartedOnBackdrop = false;
      if (shouldClose) {
        onClose();
      }
    });
  }

  // Vérifier si le cache est valide
  isCacheValid(key) {
    const cached = this.cache[key];
    if (!cached || !cached.data) return false;
    return Date.now() - cached.timestamp < cached.ttl;
  }

  // Obtenir les données du cache
  getCached(key) {
    if (this.isCacheValid(key)) {
      return this.cache[key].data;
    }
    return null;
  }

  // Mettre à jour le cache
  setCache(key, data) {
    if (this.cache[key]) {
      this.cache[key].data = data;
      this.cache[key].timestamp = Date.now();
    }
  }

  // Invalider le cache
  invalidateCache(key: string | null = null) {
    if (key) {
      if (this.cache[key]) {
        this.cache[key].data = null;
        this.cache[key].timestamp = 0;
      }
    } else {
      // Invalider tout le cache
      Object.keys(this.cache).forEach((k) => {
        this.cache[k].data = null;
        this.cache[k].timestamp = 0;
      });
    }
    console.log('[Social] Cache invalidated:', key || 'all');
  }

  escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  getSocialTranslation(
    key: string,
    fallback: string,
    params: Record<string, string> = {},
  ) {
    const translation = window.i18n?.t?.(key, params);
    return translation && translation !== key ? translation : fallback;
  }

  isAuthErrorPayload(data: any) {
    const rawMessage =
      typeof data === 'string'
        ? data
        : data?.error?.message || data?.error || data?.message || '';
    const message = String(rawMessage).toLowerCase();
    return (
      message.includes('token invalide') ||
      message.includes('invalid_id_token') ||
      message.includes('invalid id token') ||
      message.includes('id token') ||
      message.includes('auth credential') ||
      message.includes('token expired') ||
      message.includes('expired')
    );
  }

  isAccountDisabledPayload(data: any) {
    const rawMessage =
      typeof data === 'string'
        ? data
        : data?.error?.message ||
          data?.error?.code ||
          data?.error_code ||
          data?.code ||
          data?.msg ||
          data?.message ||
          '';
    const message = String(rawMessage).toLowerCase();
    return (
      message.includes('user_disabled') ||
      message.includes('user disabled') ||
      message.includes('account disabled') ||
      message.includes('user_banned') ||
      message.includes('user banned') ||
      message.includes('banned')
    );
  }

  getAccountDisabledMessage(data: any) {
    const reason =
      data?.error?.disableReason ||
      data?.error?.disable_reason ||
      data?.disableReason ||
      data?.disable_reason;
    return reason
      ? this.getSocialTranslation(
          'social.accountDisabledReason',
          `Account disabled: ${reason}`,
          { reason },
        )
      : this.getSocialTranslation(
          'social.accountDisabledSignedOut',
          'Account disabled. You have been signed out.',
        );
  }

  async clearStoredSocialSession() {
    this.authToken = null;
    this.userData = null;
    this.stopAutoDownloadCheck();
    this.invalidateCache();

    if (window.electronAPI?.store) {
      try {
        await window.electronAPI.store.delete('social.authToken');
        await window.electronAPI.store.delete('social.userData');
      } catch (error) {
        console.warn('[Social] Failed to clear stored auth data:', error);
      }
    }

    window.dispatchEvent(new CustomEvent('social-account-updated'));
  }

  async handleAccountDisabled(data: any) {
    const message = this.getAccountDisabledMessage(data);
    this.accountDisabledHandled = true;
    await this.clearStoredSocialSession();
    this.showLoginScreen();

    if (window.modalManager?.showAlert) {
      window.modalManager.showAlert(
        'error',
        this.getSocialTranslation(
          'social.accountDisabled',
          'Account disabled',
        ),
        message,
      );
    } else if (window.toastManager) {
      window.toastManager.error(message);
    }
  }

  async parseJsonResponse(response: Response) {
    const text = await response.text();
    if (!text) return null;

    try {
      return JSON.parse(text);
    } catch (error) {
      // GameBanana occasionally prepends PHP warnings to an otherwise valid
      // JSON response while still returning HTTP 200. Recover the JSON body
      // so Discover does not render an empty Featured section (and cache it).
      const jsonStart = text.search(/[\[{]/);
      if (jsonStart > 0) {
        try {
          return JSON.parse(text.slice(jsonStart));
        } catch (_jsonError) {
          // Keep the original response below when the suffix is not JSON.
        }
      }
      return { message: text };
    }
  }

  async refreshAuthToken(): Promise<boolean> {
    if (this.tokenRefreshPromise) {
      return this.tokenRefreshPromise;
    }

    this.tokenRefreshPromise = this.refreshAuthTokenInternal().finally(() => {
      this.tokenRefreshPromise = null;
    });

    return this.tokenRefreshPromise;
  }

  async refreshAuthTokenInternal(): Promise<boolean> {
    const refreshToken =
      this.userData?.refreshToken || (this.userData as any)?.refresh_token;
    if (!refreshToken) {
      console.log('[Social] No refresh token available');
      return false;
    }

    try {
      console.log('[Social] Attempting to refresh auth token...');
      const response = await fetch(`${this.API_URL}/refresh-token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refreshToken,
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        if (this.isAccountDisabledPayload(data)) {
          await this.handleAccountDisabled(data);
        }
        console.error('[Social] Token refresh failed:', data.error);
        return false;
      }

      this.authToken = data.access_token;
      if (this.userData && (this.userData as any).refresh_token) {
        delete (this.userData as any).refresh_token;
      }
      if (data.refresh_token && this.userData) {
        this.userData.refreshToken = data.refresh_token;
      }

      if (window.electronAPI && window.electronAPI.store) {
        if (this.authToken) {
          await window.electronAPI.store.set(
            'social.authToken',
            this.authToken,
          );
        }
        if (this.userData) {
          await window.electronAPI.store.set('social.userData', this.userData);
        }
      }

      console.log('[Social] ✅ Token refreshed successfully');
      return true;
    } catch (error) {
      console.error('[Social] Token refresh error:', error);
      return false;
    }
  }

  getRequestWithToken(url: string, options: RequestInit = {}) {
    const nextOptions: RequestInit = { ...options };
    let nextUrl = url;

    if (!this.authToken) {
      return { url: nextUrl, options: nextOptions };
    }

    try {
      const parsedUrl = new URL(nextUrl, window.location.href);
      if (parsedUrl.searchParams.has('idToken')) {
        parsedUrl.searchParams.delete('idToken');
        nextUrl = parsedUrl.toString();
      }
    } catch (error) {
      if (nextUrl.includes('idToken=')) {
        nextUrl = nextUrl
          .replace(/([?&])idToken=[^&]*&?/, '$1')
          .replace(/[?&]$/, '');
      }
    }

    if (nextUrl.startsWith(this.API_URL)) {
      const headers = new Headers(nextOptions.headers || {});
      headers.set('Authorization', `Bearer ${this.authToken}`);
      nextOptions.headers = headers;
    }

    const body = nextOptions.body;
    if (typeof body === 'string') {
      try {
        const parsedBody = JSON.parse(body);
        let changed = false;
        if ('idToken' in parsedBody) {
          parsedBody.idToken = this.authToken;
          changed = true;
        }
        if ('_idToken' in parsedBody) {
          parsedBody._idToken = this.authToken;
          changed = true;
        }
        if (changed) {
          nextOptions.body = JSON.stringify(parsedBody);
        }
      } catch (error) {
        // Body is not JSON, leave it unchanged.
      }
    } else if (body instanceof FormData) {
      const formData = new FormData();
      body.forEach((value, key) => {
        if (key !== 'idToken' && key !== '_idToken') {
          formData.append(key, value);
        }
      });
      if (body.has('idToken')) formData.append('idToken', this.authToken);
      if (body.has('_idToken')) formData.append('_idToken', this.authToken);
      nextOptions.body = formData;
    }

    return { url: nextUrl, options: nextOptions };
  }

  async fetchWithAuth(url: string, options: RequestInit = {}) {
    let request = this.getRequestWithToken(url, options);
    let response = await fetch(request.url, request.options);

    let shouldRefresh = response.status === 401 || response.status === 403;
    if (!shouldRefresh && !response.ok) {
      try {
        const errorPayload = await this.parseJsonResponse(response.clone());
        shouldRefresh = this.isAuthErrorPayload(errorPayload);
      } catch (error) {
        shouldRefresh = false;
      }
    }

    if (shouldRefresh) {
      console.log('[Social] Auth request failed, refreshing token...');
      if (await this.refreshAuthToken()) {
        request = this.getRequestWithToken(url, options);
        response = await fetch(request.url, request.options);
      }
    }

    return response;
  }

  async fetchWithCache(
    url: string,
    options: RequestInit = {},
    cacheKey: string | null = null,
  ) {
    // Vérifier le cache d'abord
    if (cacheKey && this.isCacheValid(cacheKey)) {
      console.log('[Social] Using cached data for:', cacheKey);
      return this.getCached(cacheKey);
    }

    // Éviter les requêtes simultanées identiques
    if (this.pendingRequests.has(url)) {
      console.log('[Social] Request already pending, waiting...');
      return await this.pendingRequests.get(url);
    }

    // Créer la promesse
    const requestPromise = (async () => {
      let response = await this.fetchWithAuth(url, options);
      let data = await this.parseJsonResponse(response);

      if (
        !response.ok &&
        this.isAuthErrorPayload(data) &&
        (await this.refreshAuthToken())
      ) {
        response = await this.fetchWithAuth(url, options);
        data = await this.parseJsonResponse(response);
      }

      if (!response.ok) {
        await this.handleServiceUnavailable(
          typeof data === 'string' ? data : JSON.stringify(data || {}),
          response.status,
        );
      }

      // Mettre en cache si cacheKey fourni
      if (cacheKey && response.ok) {
        this.setCache(cacheKey, data);
      }

      return data;
    })().finally(() => {
      // Nettoyer la requête en attente
      this.pendingRequests.delete(url);
    });

    // Stocker la promesse
    this.pendingRequests.set(url, requestPromise);

    return requestPromise;
  }

  async initialize() {
    if (this.socialInitialized) {
      this.setupButtons();
      this.setupProfileButtons();
      this.setupGameBananaSearchEvents();
      this.setupNavigation();
      return;
    }

    this.socialInitialized = true;

    try {
      setTimeout(() => {
        this.hideRegisterModal();
        this.hideForgotPasswordModal();
        this.hideRemoveFriendModal();
      }, 10);

      if (window.electronAPI && window.electronAPI.store) {
        const [storedToken, storedUserData] = (await Promise.all([
          window.electronAPI.store.get('social.authToken'),
          window.electronAPI.store.get('social.userData'),
        ])) as [string | null, typeof this.userData | null];

        if (storedToken && storedUserData) {
          this.authToken = storedToken;
          this.userData = storedUserData;

          if (!(await this.refreshAuthToken())) {
            if (
              this.accountDisabledHandled ||
              !this.authToken ||
              !this.userData
            ) {
              return;
            }
          }

          await this.showProfileScreen();

          this.startAutoDownloadCheck();

          this.setupProtocolListeners();
          this.refreshAuthToken().catch((error) => {
            console.warn('[Social] Background token refresh failed:', error);
          });
          return;
        }
      }

      const needsOnboarding = await this.checkOnboarding();

      if (needsOnboarding) {
        this.startOnboarding();
      } else {
        this.showLoginScreen();
      }
    } catch (e) {
      console.error('Failed to init social tab:', e);

      this.showLoginScreen();
    }
  }

  async checkOnboarding() {
    try {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.get
      ) {
        const done = await window.electronAPI.store.get(
          'social.onboardingDone',
        );
        return !done;
      }
      return true;
    } catch (e) {
      return true;
    }
  }

  async markOnboardingDone() {
    try {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.set
      ) {
        await window.electronAPI.store.set('social.onboardingDone', true);
      }
    } catch (e) {
      console.warn('Failed to save onboarding status:', e);
    }
  }

  startOnboarding() {
    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'flex';

      setTimeout(() => {
        this.loadOnboardingAnimation();
      }, 0);
    }
  }

  loadOnboardingAnimation() {
    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (!onboarding) return;

    const lottieContainer = document.querySelector<HTMLElement>(
      '#social-onboarding-lottie',
    );

    if (lottieContainer && window.lottie) {
      const anim = window.lottie.loadAnimation({
        container: lottieContainer,
        renderer: 'svg',
        loop: false,
        autoplay: true,
        path: '../images/social.json',
        rendererSettings: {
          preserveAspectRatio: 'xMidYMid slice',
          className: 'lottie-animation-fullscreen',
          // For some reason, clearCanvas is not recognized unless type is "canvas"
          ...{ clearCanvas: true },
        },
      });

      anim.addEventListener('DOMLoaded', () => {
        const svg = lottieContainer.querySelector<HTMLElement>('svg');
        if (svg) {
          svg.style.position = 'absolute';
          svg.style.top = '0';
          svg.style.left = '0';
          svg.style.width = '100%';
          svg.style.height = '100%';
          svg.style.maxWidth = 'none';
          svg.style.maxHeight = 'none';
          svg.style.margin = '0';
          svg.style.padding = '0';
          svg.style.overflow = 'visible';
          svg.setAttribute('preserveAspectRatio', 'xMidYMid slice');
        }
      });

      let overlayShown = false;
      let paused = false;

      anim.addEventListener('enterFrame', () => {
        if (anim.totalFrames && anim.currentFrame !== undefined) {
          const frameRate = anim.frameRate || 30;
          const currentTime = anim.currentFrame / frameRate;

          if (!overlayShown && currentTime >= 3.73) {
            overlayShown = true;
            setTimeout(() => {
              const overlay = document.querySelector<HTMLElement>(
                '.social-onboarding-overlay',
              );
              if (overlay) {
                overlay.style.opacity = '1';
                overlay.style.pointerEvents = 'auto';
              }

              const button = document.querySelector<HTMLElement>(
                '#social-get-started',
              );
              if (button) {
                button.style.pointerEvents = 'auto';
                button.style.cursor = 'pointer';
              }
            }, 100);
          }

          if (!paused && currentTime >= 4.35) {
            anim.pause();
            paused = true;
          }
        }
      });

      this.onboardingAnim = anim;
    }

    const getStartedBtn = document.querySelector<HTMLElement>(
      '#social-get-started',
    );
    if (getStartedBtn) {
      getStartedBtn.addEventListener(
        'click',
        () => {
          this.finishOnboarding();
        },
        { once: true },
      );
    }
  }

  finishOnboarding() {
    if (this.onboardingAnim) {
      try {
        this.onboardingAnim.destroy();
      } catch (e) {}
      this.onboardingAnim = null;
    }

    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.markOnboardingDone();

    this.showLoginScreen();
  }

  showLoginScreen() {
    const profileContainer = document.querySelector<HTMLElement>(
      '#social-profile-container',
    );
    if (profileContainer) {
      profileContainer.style.display = 'none';
      profileContainer.classList.remove('guest-discover-only');
    }

    const loginContainer = document.querySelector<HTMLElement>(
      '#social-login-container',
    );
    if (loginContainer) {
      loginContainer.style.display = 'flex';

      const container = document.querySelector<HTMLElement>('#social-lottie');
      if (container && window.lottie) {
        if (this.loginAnim) {
          try {
            this.loginAnim.destroy();
          } catch (e) {
            console.warn('Error destroying login animation:', e);
          }
          this.loginAnim = null;
        }

        container.innerHTML = '';

        this.loginAnim = window.lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop: true,
          autoplay: true,
          path: '../images/social.json',
        });
      }

      this.setupButtons();
    }
  }

  async login(email, password) {
    try {
      const response = await fetch(`${this.API_URL}/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      const rawText = await response.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch (e) {
        this.showServiceErrorModal(
          'modals.socialServiceUnavailable.title',
          'modals.socialServiceUnavailable.invalidResponse',
        );
        throw new Error('Invalid JSON response from social API');
      }

      if (!response.ok || data.error) {
        if (
          await this.handleServiceUnavailable(
            data?.error?.message || JSON.stringify(data),
            response.status,
          )
        ) {
          throw new Error('Service temporarily unavailable');
        }

        if (response.status === 429 || response.status === 404) {
          this.showServiceErrorModal(
            'modals.socialServiceUnavailable.title',
            'modals.socialServiceUnavailable.rateLimited',
          );
          throw new Error(`Social service error ${response.status}`);
        }

        let errorMessage = this.getSocialTranslation(
          'social.loginFailed',
          'Login failed.',
        );

        const supabaseErrorCode =
          data.error?.message || data.error?.code || data.error_code;

        if (data.error?.message === 'USER_DISABLED') {
          const disableReason =
            data.error.disableReason ||
            this.getSocialTranslation(
              'social.accountHasBeenDisabled',
              'Account has been disabled.',
            );
          errorMessage = this.getSocialTranslation(
            'social.accountDisabledReason',
            `Account disabled: ${disableReason}`,
            { reason: disableReason },
          );
        } else if (supabaseErrorCode) {
          const errorMessages = {
            EMAIL_NOT_FOUND: this.getSocialTranslation(
              'social.emailNotFound',
              'Email not found.',
            ),
            INVALID_PASSWORD: this.getSocialTranslation(
              'social.invalidPassword',
              'Invalid password.',
            ),
            INVALID_EMAIL: this.getSocialTranslation(
              'social.invalidEmail',
              'Invalid email address.',
            ),
            USER_DISABLED: this.getSocialTranslation(
              'social.accountDisabled',
              'Account disabled',
            ),
            TOO_MANY_ATTEMPTS_TRY_LATER:
              this.getSocialTranslation(
                'social.tooManyAttempts',
                'Too many attempts. Please try again later.',
              ),
            email_not_confirmed:
              this.getSocialTranslation(
                'social.confirmEmailBeforeSignIn',
                'Please confirm your email before signing in. Check your inbox.',
              ),
            invalid_credentials: this.getSocialTranslation(
              'social.invalidCredentials',
              'Invalid email or password.',
            ),
          } as Record<string, string>;
          errorMessage =
            errorMessages[supabaseErrorCode] ||
            data.error?.message ||
            data.msg ||
            this.getSocialTranslation('social.loginFailed', 'Login failed.');
        } else if (data.msg) {
          errorMessage = data.msg;
        }

        throw new Error(errorMessage);
      }

      this.authToken = data.access_token;
      this.userData = {
        localId: data.user?.id || data.id,
        email: data.user?.email || data.email,
        displayName:
          data.user?.user_metadata?.username ||
          data.user?.user_metadata?.display_name ||
          '',
        refreshToken: data.refresh_token,
      };

      if (window.electronAPI && window.electronAPI.store) {
        try {
          if (this.authToken) {
            await window.electronAPI.store.set(
              'social.authToken',
              this.authToken,
            );
          }
          if (this.userData) {
            await window.electronAPI.store.set(
              'social.userData',
              this.userData,
            );
          }
        } catch (e) {
          console.warn('Failed to save auth data:', e);
        }
      }

      window.dispatchEvent(new CustomEvent('social-account-updated'));

      return { success: true, data };
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  }

  setupButtons() {
    const form = document.querySelector<HTMLElement>('#social-login-form');
    const emailInput =
      document.querySelector<HTMLInputElement>('#social-email');

    const passInput =
      document.querySelector<HTMLInputElement>('#social-password');

    const remember =
      document.querySelector<HTMLInputElement>('#social-remember');

    const forgot = document.querySelector<HTMLElement>('#social-forgot');
    const joinWaitlist = document.querySelector<HTMLElement>(
      '#social-join-waitlist',
    );
    const useInvite = document.querySelector<HTMLElement>(
      '#social-use-invite',
    );
    const discoverOnly = document.querySelector<HTMLElement>(
      '#social-discover-only',
    );
    const submitButton = form
      ? form.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;

    if (form && emailInput && passInput) {
      if (
        window.electronAPI &&
        window.electronAPI.store &&
        window.electronAPI.store.get
      ) {
        window.electronAPI.store
          .get('social.rememberEmail')
          .then((val: string | null) => {
            if (val && !emailInput.value) emailInput.value = val;
          })
          .catch(() => {});
      }

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();
        const password = passInput.value;

        if (!email || !password) {
          if (window.toastManager)
            window.toastManager.error('toasts.pleaseEnterEmailAndPassword');
          return;
        }

        const originalButtonText = submitButton ? submitButton.innerHTML : '';
        if (submitButton) {
          submitButton.disabled = true;
          submitButton.innerHTML = `<i class="bi bi-hourglass-split"></i> ${this.escapeHtml(
            this.getSocialTranslation('social.signingIn', 'Signing in...'),
          )}`;
        }
        emailInput.disabled = true;
        passInput.disabled = true;

        try {
          if (window.toastManager) window.toastManager.info('toasts.signingIn');

          const loginResult = await this.login(email, password);

          if (!this.authToken || !loginResult?.success) {
            throw new Error('toasts.loginFailed');
          }

          if (window.toastManager)
            window.toastManager.success('toasts.signedInSuccessfully');

          if (remember && remember.checked && window.electronAPI) {
            try {
              await window.electronAPI.store.set('social.rememberEmail', email);
            } catch (e) {}
          }

          await this.showProfileScreen();

          this.startAutoDownloadCheck();

          this.setupProtocolListeners();
        } catch (err) {
          const errorMsg =
            typeof err?.message === 'string' && err.message.trim().length > 0
              ? err.message
              : 'toasts.loginFailed';
          if (window.toastManager) {
            if (errorMsg.startsWith('toasts.')) {
              window.toastManager.error(errorMsg);
            } else {
              window.toastManager.error(errorMsg);
            }
          }
        } finally {
          if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = originalButtonText;
          }
          emailInput.disabled = false;
          passInput.disabled = false;
        }
      });
    }

    if (forgot) {
      forgot.addEventListener('click', (e) => {
        e.preventDefault();
        this.showForgotPasswordModal();
      });
    }

    if (joinWaitlist) {
      joinWaitlist.addEventListener('click', (e) => {
        e.preventDefault();
        this.showRegisterModal('waitlist');
      });
    }

    if (useInvite) {
      useInvite.addEventListener('click', (e) => {
        e.preventDefault();
        this.showRegisterModal('invite');
      });
    }

    if (discoverOnly && !discoverOnly.dataset.listenerAttached) {
      discoverOnly.addEventListener('click', (e) => {
        e.preventDefault();
        this.showDiscoverOnly();
      });
      discoverOnly.dataset.listenerAttached = 'true';
    }

    this.setupForgotPasswordModal();

    this.setupRegisterModal();

    this.setupRemoveFriendModal();

    this.setupGameBananaSearchEvents();
  }

  showDiscoverOnly() {
    const loginContainer = document.querySelector<HTMLElement>(
      '#social-login-container',
    );
    if (loginContainer) {
      loginContainer.style.display = 'none';
    }

    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();
    this.hideRemoveFriendModal();

    const profileContainer = document.querySelector<HTMLElement>(
      '#social-profile-container',
    );
    if (!profileContainer) return;

    profileContainer.style.display = 'flex';
    profileContainer.classList.add('guest-discover-only');

    const socialRoot =
      document.querySelector<HTMLElement>('#tab-social') || document;
    const navItems =
      socialRoot.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.classList.toggle(
        'active',
        item.getAttribute('data-section') === 'discover',
      );
    });

    const sections =
      socialRoot.querySelectorAll<HTMLElement>('.social-section');
    sections.forEach((section) => {
      const isDiscover = section.id === 'social-section-discover';
      section.classList.toggle('active', isDiscover);
      section.style.opacity = '';
      section.style.transform = '';
      section.style.transition = '';
    });

    this.setupGameBananaSearchEvents();
    void this.loadDiscover();
  }

  showForgotPasswordModal() {
    if (this.authToken && this.userData) {
      console.log(
        '[Social] Cannot show forgot password modal: user is already logged in',
      );
      return;
    }

    const modal = document.querySelector<HTMLElement>('#social-forgot-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.opacity = '1';

      const emailInput =
        document.querySelector<HTMLInputElement>('#social-email');
      const forgotEmailInput = document.querySelector<HTMLInputElement>(
        '#social-forgot-email',
      );
      if (emailInput && forgotEmailInput && emailInput.value) {
        forgotEmailInput.value = emailInput.value;
      }
    }
  }

  hideForgotPasswordModal() {
    const modal = document.querySelector<HTMLElement>('#social-forgot-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.opacity = '0';
      const form = document.querySelector<HTMLFormElement>(
        '#social-forgot-form',
      );
      if (form) form.reset();
    }
  }

  setupForgotPasswordModal() {
    const modal = document.querySelector<HTMLElement>('#social-forgot-modal');
    const closeBtn = document.querySelector<HTMLElement>(
      '#social-forgot-close',
    );
    const form = document.querySelector<HTMLElement>('#social-forgot-form');
    const emailInput = document.querySelector<HTMLInputElement>(
      '#social-forgot-email',
    );
    const submitBtn = form
      ? form.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;

    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideForgotPasswordModal();
      });
    }

    if (modal) {
      this.bindBackdropClose(modal, () => this.hideForgotPasswordModal());
    }

    if (form && emailInput) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailInput.value.trim();

        if (!email) {
          if (window.toastManager)
            window.toastManager.error('toasts.pleaseEnterEmail');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<i class="bi bi-hourglass-split"></i> ${this.escapeHtml(
            this.getSocialTranslation('social.sending', 'Sending...'),
          )}`;
        }

        try {
          const response = await fetch(`${this.API_URL}/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });

          const data = await response.json();

          if (response.ok && !data.error) {
            if (window.toastManager) {
              window.toastManager.success(
                this.getSocialTranslation(
                  'social.passwordResetEmailSent',
                  'Password reset email sent! Check your inbox.',
                ),
              );
            }
            this.hideForgotPasswordModal();
          } else {
            const errorMsg =
              data.error?.message || 'Failed to send reset email';
            let userMessage = 'Failed to send reset email';

            if (errorMsg.includes('EMAIL_NOT_FOUND')) {
              userMessage = 'toasts.emailNotFound';
            } else if (errorMsg.includes('INVALID_EMAIL')) {
              userMessage = 'toasts.invalidEmail';
            } else {
              userMessage = 'toasts.failedToSendResetEmail';
            }

            if (window.toastManager) window.toastManager.error(userMessage);
          }
        } catch (error) {
          console.error('Password reset error:', error);
          if (window.toastManager)
            window.toastManager.error('toasts.failedToSendResetEmail');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-envelope"></i> ${this.escapeHtml(
              this.getSocialTranslation(
                'social.sendResetLink',
                'Send Reset Link',
              ),
            )}`;
          }
        }
      });
    }
  }

  showRegisterModal(step: 'waitlist' | 'invite' | 'account' = 'waitlist') {
    if (this.authToken && this.userData) {
      console.log(
        '[Social] Cannot show register modal: user is already logged in',
      );
      return;
    }

    const modal = document.querySelector<HTMLElement>('#social-register-modal');
    if (modal) {
      modal.style.display = 'flex';
      modal.style.opacity = '1';

      const loginEmail =
        document.querySelector<HTMLInputElement>('#social-email')?.value || '';
      if (loginEmail) {
        const targetId =
          step === 'invite' ? '#social-invite-email' : '#social-waitlist-email';
        const target =
          document.querySelector<HTMLInputElement>(targetId);
        if (target && !target.value) target.value = loginEmail;
      }
      this.showRegistrationStep(step);
    }
  }

  showRegistrationStep(step: 'waitlist' | 'invite' | 'account') {
    const waitlistForm = document.querySelector<HTMLElement>(
      '#social-waitlist-form',
    );
    const inviteForm =
      document.querySelector<HTMLElement>('#social-invite-form');
    const accountForm = document.querySelector<HTMLElement>(
      '#social-register-form',
    );
    if (waitlistForm) {
      waitlistForm.style.display = step === 'waitlist' ? 'flex' : 'none';
    }
    if (inviteForm) {
      inviteForm.style.display = step === 'invite' ? 'flex' : 'none';
    }
    if (accountForm) {
      accountForm.style.display = step === 'account' ? 'flex' : 'none';
    }

    const title =
      document.querySelector<HTMLElement>('#social-register-title');
    if (title) {
      const titles = {
        waitlist: {
          key: 'social.joinWaitlist',
          fallback: 'Join the waitlist',
        },
        invite: {
          key: 'social.useInviteCode',
          fallback: 'Use your invite code',
        },
        account: {
          key: 'social.createAccount',
          fallback: 'Create Account',
        },
      };
      const selected = titles[step];
      title.dataset.i18n = selected.key;
      title.textContent = this.getSocialTranslation(
        selected.key,
        selected.fallback,
      );
    }
  }

  hideRegisterModal() {
    const modal = document.querySelector<HTMLElement>('#social-register-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.style.opacity = '0';
      [
        '#social-waitlist-form',
        '#social-invite-form',
        '#social-register-form',
      ].forEach((selector) => {
        document.querySelector<HTMLFormElement>(selector)?.reset();
      });
      this.showRegistrationStep('waitlist');
    }
  }

  getRegistrationErrorToast(data: any): string {
    const errorCode =
      typeof data?.error_code === 'string' ? data.error_code.toLowerCase() : '';
    const message =
      typeof data?.msg === 'string'
        ? data.msg
        : typeof data?.message === 'string'
          ? data.message
          : typeof data?.error?.message === 'string'
            ? data.error.message
            : typeof data?.error === 'string'
              ? data.error
              : '';
    const normalizedMessage = message.toLowerCase();

    if (
      errorCode.includes('user_already_exists') ||
      errorCode.includes('email_exists') ||
      normalizedMessage.includes('already registered') ||
      normalizedMessage.includes('already exists')
    ) {
      return 'toasts.emailAlreadyExists';
    }

    if (
      errorCode.includes('validation_failed') ||
      errorCode.includes('invalid_email') ||
      normalizedMessage.includes('invalid email') ||
      normalizedMessage.includes('validate email') ||
      normalizedMessage.includes('email address')
    ) {
      return 'toasts.invalidEmail';
    }

    if (
      errorCode.includes('weak_password') ||
      normalizedMessage.includes('weak password') ||
      normalizedMessage.includes('password should') ||
      normalizedMessage.includes('password must')
    ) {
      return 'toasts.weakPassword';
    }

    return 'toasts.failedToCreateAccount';
  }

  setupRegisterModal() {
    const modal = document.querySelector<HTMLElement>('#social-register-modal');
    const closeBtn = document.querySelector<HTMLElement>(
      '#social-register-close',
    );
    const waitlistForm = document.querySelector<HTMLFormElement>(
      '#social-waitlist-form',
    );
    const waitlistEmail = document.querySelector<HTMLInputElement>(
      '#social-waitlist-email',
    );
    const haveCodeButton = document.querySelector<HTMLButtonElement>(
      '#social-waitlist-have-code',
    );
    const inviteForm =
      document.querySelector<HTMLFormElement>('#social-invite-form');
    const inviteEmail = document.querySelector<HTMLInputElement>(
      '#social-invite-email',
    );
    const inviteCode = document.querySelector<HTMLInputElement>(
      '#social-invite-code',
    );
    const inviteBackButton = document.querySelector<HTMLButtonElement>(
      '#social-invite-back',
    );
    const form =
      document.querySelector<HTMLFormElement>('#social-register-form');
    const usernameInput = document.querySelector<HTMLInputElement>(
      '#social-register-username',
    );
    const emailInput = document.querySelector<HTMLInputElement>(
      '#social-register-email',
    );
    const passwordInput = document.querySelector<HTMLInputElement>(
      '#social-register-password',
    );
    const passwordConfirmInput = document.querySelector<HTMLInputElement>(
      '#social-register-password-confirm',
    );
    const registerInviteCode = document.querySelector<HTMLInputElement>(
      '#social-register-invite-code',
    );
    const submitBtn = form
      ? form.querySelector<HTMLButtonElement>('button[type="submit"]')
      : null;

    if (closeBtn && !closeBtn.dataset.listenerAttached) {
      closeBtn.addEventListener('click', () => {
        this.hideRegisterModal();
      });
      closeBtn.dataset.listenerAttached = 'true';
    }

    if (modal && !modal.dataset.backdropListenerAttached) {
      this.bindBackdropClose(modal, () => this.hideRegisterModal());
      modal.dataset.backdropListenerAttached = 'true';
    }

    if (haveCodeButton && !haveCodeButton.dataset.listenerAttached) {
      haveCodeButton.addEventListener('click', () => {
        if (waitlistEmail?.value && inviteEmail && !inviteEmail.value) {
          inviteEmail.value = waitlistEmail.value.trim();
        }
        this.showRegistrationStep('invite');
      });
      haveCodeButton.dataset.listenerAttached = 'true';
    }

    if (inviteBackButton && !inviteBackButton.dataset.listenerAttached) {
      inviteBackButton.addEventListener('click', () => {
        this.showRegistrationStep('waitlist');
      });
      inviteBackButton.dataset.listenerAttached = 'true';
    }

    if (
      waitlistForm &&
      waitlistEmail &&
      !waitlistForm.dataset.listenerAttached
    ) {
      waitlistForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = waitlistEmail.value.trim();
        const button =
          waitlistForm.querySelector<HTMLButtonElement>('button[type="submit"]');
        const original = button?.innerHTML || '';
        if (!email) return;

        if (button) {
          button.disabled = true;
          button.innerHTML = `<i class="bi bi-hourglass-split"></i> ${this.escapeHtml(
            this.getSocialTranslation('social.sending', 'Sending...'),
          )}`;
        }
        try {
          const response = await fetch(`${this.API_URL}/waitlist/request`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          const data = await this.parseJsonResponse(response);
          if (!response.ok || data.error) {
            throw new Error(
              typeof data.error === 'string'
                ? data.error
                : data.error?.message ||
                    data.message ||
                    'Failed to join the waitlist',
            );
          }

          if (data.status === 'approved') {
            if (inviteEmail) inviteEmail.value = email;
            this.showRegistrationStep('invite');
            window.toastManager?.info(
              data.message ||
                this.getSocialTranslation(
                  'social.waitlistApproved',
                  'Your request is approved. Enter your code.',
                ),
            );
          } else if (data.status === 'account_exists') {
            const loginEmail =
              document.querySelector<HTMLInputElement>('#social-email');
            if (loginEmail) loginEmail.value = email;
            this.hideRegisterModal();
            window.toastManager?.info(
              data.message ||
                this.getSocialTranslation(
                  'social.accountAlreadyExists',
                  'This email already has an account. Sign in.',
                ),
            );
          } else if (data.status === 'rejected') {
            window.toastManager?.error(
              data.message ||
                this.getSocialTranslation(
                  'social.waitlistRejected',
                  'This request was not approved.',
                ),
            );
          } else {
            window.toastManager?.success(
              data.message ||
                this.getSocialTranslation(
                  'social.waitlistPending',
                  'Your request is now pending review.',
                ),
            );
          }
        } catch (error) {
          window.toastManager?.error(
            error?.message ||
              this.getSocialTranslation(
                'social.failedToJoinWaitlist',
                'Failed to join the waitlist.',
              ),
          );
        } finally {
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
        }
      });
      waitlistForm.dataset.listenerAttached = 'true';
    }

    if (
      inviteForm &&
      inviteEmail &&
      inviteCode &&
      !inviteForm.dataset.listenerAttached
    ) {
      inviteForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = inviteEmail.value.trim();
        const code = inviteCode.value.trim().toUpperCase();
        const button =
          inviteForm.querySelector<HTMLButtonElement>('button[type="submit"]');
        const original = button?.innerHTML || '';
        if (!email || !code) {
          window.toastManager?.error('toasts.pleaseFillAllFields');
          return;
        }

        if (button) {
          button.disabled = true;
          button.innerHTML = `<i class="bi bi-hourglass-split"></i> ${this.escapeHtml(
            this.getSocialTranslation('social.verifying', 'Verifying...'),
          )}`;
        }
        try {
          const response = await fetch(`${this.API_URL}/waitlist/verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, inviteCode: code }),
          });
          const data = await this.parseJsonResponse(response);
          if (!response.ok || !data.valid) {
            throw new Error(
              typeof data.error === 'string'
                ? data.error
                : data.error?.message ||
                    data.message ||
                    'Invalid invitation',
            );
          }

          if (emailInput) emailInput.value = email;
          if (registerInviteCode) registerInviteCode.value = code;
          this.showRegistrationStep('account');
          window.toastManager?.success(
            this.getSocialTranslation(
              'social.inviteAccepted',
              'Invitation accepted. Create your account.',
            ),
          );
        } catch (error) {
          window.toastManager?.error(
            error?.message ||
              this.getSocialTranslation(
                'social.invalidInvitation',
                'Invalid invitation.',
              ),
          );
        } finally {
          if (button) {
            button.disabled = false;
            button.innerHTML = original;
          }
        }
      });
      inviteForm.dataset.listenerAttached = 'true';
    }

    if (
      form &&
      usernameInput &&
      emailInput &&
      passwordInput &&
      passwordConfirmInput &&
      registerInviteCode &&
      !form.dataset.listenerAttached
    ) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        const passwordConfirm = passwordConfirmInput.value;
        const invitationCode = registerInviteCode.value.trim();

        if (
          !username ||
          !email ||
          !password ||
          !passwordConfirm ||
          !invitationCode
        ) {
          if (window.toastManager)
            window.toastManager.error('toasts.pleaseFillAllFields');
          return;
        }

        if (password.length < 6) {
          if (window.toastManager)
            window.toastManager.error('toasts.passwordMinLength');
          return;
        }

        if (password !== passwordConfirm) {
          if (window.toastManager)
            window.toastManager.error('toasts.passwordsDoNotMatch');
          return;
        }

        if (submitBtn) {
          submitBtn.disabled = true;
          submitBtn.innerHTML = `<i class="bi bi-hourglass-split"></i> ${this.escapeHtml(
            this.getSocialTranslation(
              'social.creatingAccount',
              'Creating account...',
            ),
          )}`;
        }

        try {
          const response = await fetch(`${this.API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email,
              password,
              username,
              inviteCode: invitationCode,
            }),
          });

          const data = await response.json();

          if (response.ok && !data.error && (data.user?.id || data.id)) {
            const emailConfirmed = Boolean(
              data.user?.email_confirmed_at || data.user?.confirmed_at,
            );

            if (!emailConfirmed) {
              if (window.toastManager) {
                window.toastManager.success('toasts.accountCreatedCheckEmail');
              }

              this.hideRegisterModal();
              this.showEmailConfirmationModal(email);
              return;
            }

            if (window.toastManager) {
              window.toastManager.success('toasts.accountCreated');
            }

            try {
              await this.login(email, password);

              if (window.toastManager)
                window.toastManager.success('toasts.signedInSuccessfully');

              this.hideRegisterModal();

              await this.showProfileScreen();

              this.startAutoDownloadCheck();

              this.setupProtocolListeners();
            } catch (loginError) {
              if (window.toastManager) {
                window.toastManager.error(
                  'toasts.accountCreatedButFailedToSignIn',
                );
              }
            }
          } else {
            console.warn('[Social] Registration failed:', {
              status: response.status,
              data,
            });
            const userMessage = this.getRegistrationErrorToast(data);

            if (window.toastManager) window.toastManager.error(userMessage);
          }
        } catch (error) {
          console.error('Registration error:', error);
          if (window.toastManager)
            window.toastManager.error('toasts.failedToCreateAccount');
        } finally {
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="bi bi-person-plus"></i> ${this.escapeHtml(
              this.getSocialTranslation(
                'social.createAccount',
                'Create Account',
              ),
            )}`;
          }
        }
      });
      form.dataset.listenerAttached = 'true';
    }
  }

  async showProfileScreen() {
    const loginContainer = document.querySelector<HTMLElement>(
      '#social-login-container',
    );
    if (loginContainer) {
      loginContainer.style.display = 'none';
    }

    const onboarding =
      document.querySelector<HTMLElement>('#social-onboarding');
    if (onboarding) {
      onboarding.style.display = 'none';
    }

    this.hideRegisterModal();
    this.hideForgotPasswordModal();
    this.hideRemoveFriendModal();

    const profileContainer = document.querySelector<HTMLElement>(
      '#social-profile-container',
    );
    if (profileContainer) {
      profileContainer.style.display = 'flex';
      profileContainer.classList.remove('guest-discover-only');

      await this.loadUserProfile();
      this.setupProfileButtons();
      this.setupGameBananaSearchEvents();
      this.setupNavigation();
      this.switchSection('discover');
    }
  }

  setupNavigation() {
    if (this.socialNavigationListenersBound) return;
    this.socialNavigationListenersBound = true;

    const socialRoot =
      document.querySelector<HTMLElement>('#tab-social') || document;
    const navItems =
      socialRoot.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      item.addEventListener('click', () => {
        const section = item.getAttribute('data-section');
        this.switchSection(section);
      });
    });
  }

  switchSection(sectionName) {
    const socialRoot =
      document.querySelector<HTMLElement>('#tab-social') || document;
    const currentSections = socialRoot.querySelectorAll<HTMLElement>(
      '.social-section.active',
    );
    currentSections.forEach((section) => {
      section.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
      section.style.opacity = '0';
      section.style.transform = 'translateX(-10px)';
    });

    const navItems =
      socialRoot.querySelectorAll<HTMLElement>('.social-nav-item');
    navItems.forEach((item) => {
      if (item.getAttribute('data-section') === sectionName) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    setTimeout(() => {
      const sections =
        socialRoot.querySelectorAll<HTMLElement>('.social-section');
      sections.forEach((section) => {
        if (section.id === `social-section-${sectionName}`) {
          section.classList.add('active');
          section.style.opacity = '0';
          section.style.transform = 'translateX(10px)';

          setTimeout(() => {
            section.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            section.style.opacity = '1';
            section.style.transform = 'translateX(0)';
          }, 10);
        } else {
          section.classList.remove('active');
          section.style.opacity = '';
          section.style.transform = '';
          section.style.transition = '';
        }
      });
    }, 200);

    switch (sectionName) {
      case 'discover':
        setTimeout(() => this.loadDiscover(), 250);
        break;
      case 'people-downloads':
        setTimeout(() => this.loadFeed(), 250);
        break;
      case 'my-mods':
        setTimeout(() => this.loadMyMods(), 250);
        break;
      case 'friends':
        setTimeout(() => this.loadFriends(), 250);
        break;
      case 'profile':
        break;
      case 'user-profile':
        break;
    }
  }

  // Afficher un modal informant l'utilisateur de vérifier son email
  showEmailConfirmationModal(email: string) {
    // Créer un modal simple
    const modalId = 'social-email-confirmation-modal';
    let modal = document.getElementById(modalId);

    if (!modal) {
      modal = document.createElement('div');
      modal.id = modalId;
      modal.className = 'social-modal';
      const verifyEmailTitle = this.escapeHtml(
        this.getSocialTranslation('social.verifyYourEmail', 'Verify Your Email'),
      );
      const confirmationSent = this.escapeHtml(
        this.getSocialTranslation(
          'social.confirmationEmailSentTo',
          'A confirmation email has been sent to:',
        ),
      );
      const confirmationInstructions = this.escapeHtml(
        this.getSocialTranslation(
          'social.confirmationEmailInstructions',
          'Please check your inbox and click the confirmation link before signing in.',
        ),
      );
      const gotIt = this.escapeHtml(
        this.getSocialTranslation('social.gotIt', 'Got it!'),
      );
      modal.innerHTML = `
        <div class="social-modal-content" style="max-width: 400px; text-align: center;">
          <div class="social-modal-header">
            <h3>📧 ${verifyEmailTitle}</h3>
            <button class="social-modal-close">&times;</button>
          </div>
          <div class="social-modal-body" style="padding: 20px;">
            <p>${confirmationSent}</p>
            <p style="font-weight: bold; margin: 10px 0;">${this.escapeHtml(email)}</p>
            <p>${confirmationInstructions}</p>
            <button class="social-btn social-btn-primary" id="email-confirm-ok" style="margin-top: 20px;">
              ${gotIt}
            </button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);

      // Fermer le modal
      const closeBtn = modal.querySelector('.social-modal-close');
      const okBtn = modal.querySelector('#email-confirm-ok');

      const hideModal = () => {
        if (modal) modal.style.display = 'none';
      };

      closeBtn?.addEventListener('click', hideModal);
      okBtn?.addEventListener('click', hideModal);

      // Fermer en cliquant à l'extérieur
      this.bindBackdropClose(modal, hideModal);
    } else {
      // Mettre à jour l'email
      const emailEl = modal.querySelector('.social-modal-body p:nth-child(2)');
      if (emailEl) emailEl.textContent = email;
    }

    if (modal) {
      modal.style.display = 'flex';
    }
  }
}
