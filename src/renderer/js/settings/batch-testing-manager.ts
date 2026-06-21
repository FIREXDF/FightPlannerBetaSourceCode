type BatchCategory = 'mods' | 'plugins';
type BatchPromptResult = 'pass' | 'fail' | 'cancel';

type ModStateEntry = {
  name: string;
  path: string;
  hash?: string;
};

type PluginStateEntry = {
  name: string;
  path: string;
  size: string;
};

type CategoryState = {
  active: Array<ModStateEntry | PluginStateEntry>;
  disabled: Array<ModStateEntry | PluginStateEntry>;
};

type CategorySnapshot = {
  category: BatchCategory;
  label: string;
  basePath: string | null;
  originalActiveNames: string[];
  originalDisabledNames: string[];
  lastState: CategoryState | null;
};

type DiagnosisResult = {
  status: 'single' | 'group' | 'inconclusive' | 'cancelled';
  category: BatchCategory;
  culpritNames?: string[];
};

type DiagnosisProgress = {
  suspects: string[];
  granularity: number;
  foundPassingChunk: boolean;
  step: number;
  currentChunkIndex: number;
  status: 'pending' | 'single' | 'group' | 'inconclusive';
};

type PendingPrompt = {
  category: BatchCategory;
  chunk: string[];
  suspectCount: number;
  step: number;
};

type BatchTestingSession = {
  snapshots: Record<BatchCategory, CategorySnapshot>;
  order: BatchCategory[];
  currentCategoryIndex: number;
  running: boolean;
  diagnosis: Partial<Record<BatchCategory, DiagnosisProgress>>;
  pendingPrompt: PendingPrompt | null;
  result: DiagnosisResult | null;
  noCauseFound: boolean;
};

type SessionUiSummary = {
  badge: string;
  tone: 'neutral' | 'info' | 'warning' | 'success';
  title: string;
  description: string;
  resumeTitle: string;
  resumeDescription: string;
};

type BatchTestingSessionStoreLike = {
  load: <T>() => Promise<T | null>;
  save: (session: unknown) => Promise<void>;
};

type BatchTestingSessionStoreCtor = new (
  storeKey: string,
) => BatchTestingSessionStoreLike;

type BatchTestingUiHelpersLike = {
  getSessionUiSummary: (
    session: BatchTestingSession | null,
  ) => SessionUiSummary;
  applySessionBadgeTone: (
    badgeEl: HTMLElement,
    tone: SessionUiSummary['tone'],
  ) => void;
  renderInfoCard: (title: string, value: string) => string;
  renderStepCard: (index: string, title: string, description: string) => string;
  renderItemTrigger: (
    category: BatchCategory,
    name: string,
    variant: 'chip' | 'list',
  ) => string;
  styleItemInfoModal: (modal: HTMLElement) => void;
  buildModInfoBody: (
    itemName: string,
    status: 'active' | 'disabled',
    entry: { path: string; hash?: string },
    modInfo: {
      display_name?: string;
      description?: string;
      authors?: string;
      version?: string;
      category?: string;
      url?: string;
    },
  ) => string;
  buildPluginInfoBody: (
    itemName: string,
    status: 'active' | 'disabled',
    entry: { path: string; size: string },
  ) => string;
};

type BatchTestingUiHelpersCtor = new (deps: {
  t: (key: string, fallback: string, params?: Record<string, any>) => string;
  escapeHtml: (value: string) => string;
  getCategoryLabel: (category: BatchCategory) => string;
  getStatusLabel: (status: 'active' | 'disabled') => string;
}) => BatchTestingUiHelpersLike;

type BatchTestingStateHelpersLike = {
  collectSnapshots: () => Promise<Record<BatchCategory, CategorySnapshot>>;
  ensureCategoryAvailable: (
    category: BatchCategory,
    basePath: string,
  ) => Promise<void>;
  readCategoryState: (
    category: BatchCategory,
    basePath: string,
  ) => Promise<CategoryState>;
  applyState: (
    snapshot: CategorySnapshot,
    enabledNames: string[],
  ) => Promise<void>;
  syncManager: (
    category: BatchCategory,
    basePath: string,
    state: CategoryState,
  ) => void;
  findItemState: (
    session: BatchTestingSession | null,
    category: BatchCategory,
    itemName: string,
  ) => {
    entry: ModStateEntry | PluginStateEntry;
    status: 'active' | 'disabled';
  } | null;
};

type BatchTestingStateHelpersCtor = new (deps: {
  t: (key: string, fallback: string, params?: Record<string, any>) => string;
}) => BatchTestingStateHelpersLike;

type ModalAction = {
  label: string;
  type?: 'primary' | 'secondary' | 'danger';
  onClick: () => void | Promise<void>;
};

class BatchTestingManager {
  modal: HTMLElement | null;
  session: BatchTestingSession | null;
  isRestoring: boolean;
  sessionStore: BatchTestingSessionStoreLike;
  state: BatchTestingStateHelpersLike;
  ui: BatchTestingUiHelpersLike;

  constructor() {
    this.modal = null;
    this.session = null;
    this.isRestoring = false;
    this.sessionStore = this.createSessionStore();
    this.state = this.createStateHelpers();
    this.ui = this.createUiHelpers();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.refreshControlState();
      });
    } else {
      this.refreshControlState();
    }

    window.addEventListener('localeChanged', () => {
      this.refreshControlState();
    });

    void this.loadPersistedSession();
  }

  createSessionStore(): BatchTestingSessionStoreLike {
    const SessionStoreCtor = (window as any).BatchTestingSessionStore as
      | BatchTestingSessionStoreCtor
      | undefined;

    if (SessionStoreCtor) {
      return new SessionStoreCtor(this.getSessionStoreKey());
    }

    return {
      load: async <T>() => null as T | null,
      save: async () => {},
    };
  }

  createUiHelpers(): BatchTestingUiHelpersLike {
    const UiHelpersCtor = (window as any).BatchTestingUiHelpers as
      | BatchTestingUiHelpersCtor
      | undefined;

    if (UiHelpersCtor) {
      return new UiHelpersCtor({
        t: (key: string, fallback: string, params: Record<string, any> = {}) =>
          this.t(key, fallback, params),
        escapeHtml: (value: string) => this.escapeHtml(value),
        getCategoryLabel: (category: BatchCategory) =>
          this.getCategoryLabel(category),
        getStatusLabel: (status: 'active' | 'disabled') =>
          this.getStatusLabel(status),
      });
    }

    throw new Error('BatchTestingUiHelpers is not available');
  }

  createStateHelpers(): BatchTestingStateHelpersLike {
    const StateHelpersCtor = (window as any).BatchTestingStateHelpers as
      | BatchTestingStateHelpersCtor
      | undefined;

    if (StateHelpersCtor) {
      return new StateHelpersCtor({
        t: (key: string, fallback: string, params: Record<string, any> = {}) =>
          this.t(key, fallback, params),
      });
    }

    throw new Error('BatchTestingStateHelpers is not available');
  }

  getSessionStoreKey() {
    return 'batchTesting.session';
  }

  async loadPersistedSession() {
    try {
      const storedSession = await this.sessionStore.load<BatchTestingSession>();

      if (
        storedSession &&
        storedSession.snapshots &&
        Array.isArray(storedSession.order)
      ) {
        this.session = storedSession;
        this.syncPersistedSessionState();
      } else {
        this.session = null;
      }
    } catch (error) {
      console.error('[BatchTesting] Failed to load stored session:', error);
      this.session = null;
    } finally {
      this.refreshControlState();
    }
  }

  syncPersistedSessionState() {
    if (!this.session) {
      return;
    }

    for (const category of ['mods', 'plugins'] as BatchCategory[]) {
      const snapshot = this.session.snapshots?.[category];

      if (!snapshot?.basePath || !snapshot.lastState) {
        continue;
      }

      this.state.syncManager(category, snapshot.basePath, snapshot.lastState);
    }
  }

  async persistSession() {
    try {
      await this.sessionStore.save(this.session);
    } finally {
      this.refreshControlState();
    }
  }

  refreshControlState() {
    const hasRunningSession = !!this.session?.running;
    const summary = this.ui.getSessionUiSummary(this.session);

    const startButton =
      document.querySelector<HTMLButtonElement>('#batch-testing-btn');
    const resumeButton = document.querySelector<HTMLButtonElement>(
      '#batch-testing-resume-btn',
    );
    const cancelButton = document.querySelector<HTMLButtonElement>(
      '#batch-testing-cancel-btn',
    );
    const sessionBadge = document.querySelector<HTMLElement>(
      '#batch-testing-session-badge',
    );
    const sessionTitle = document.querySelector<HTMLElement>(
      '#batch-testing-session-title',
    );
    const sessionDesc = document.querySelector<HTMLElement>(
      '#batch-testing-session-desc',
    );

    if (startButton) {
      startButton.disabled = hasRunningSession;
      startButton.style.opacity = hasRunningSession ? '0.6' : '1';
      startButton.style.cursor = hasRunningSession ? 'not-allowed' : 'pointer';
    }

    if (resumeButton) {
      resumeButton.style.display = hasRunningSession ? 'flex' : 'none';
      const titleEl = resumeButton.querySelector<HTMLElement>(
        '.settings-btn-action-title',
      );
      const descEl = resumeButton.querySelector<HTMLElement>(
        '.settings-btn-action-desc',
      );

      if (titleEl) {
        titleEl.textContent = summary.resumeTitle;
      }

      if (descEl) {
        descEl.textContent = summary.resumeDescription;
      }
    }

    if (cancelButton) {
      cancelButton.style.display = hasRunningSession ? 'flex' : 'none';
    }

    if (sessionBadge) {
      sessionBadge.textContent = summary.badge;
      this.ui.applySessionBadgeTone(sessionBadge, summary.tone);
    }

    if (sessionTitle) {
      sessionTitle.textContent = summary.title;
    }

    if (sessionDesc) {
      sessionDesc.textContent = summary.description;
    }
  }

  getCategoryLabel(category: BatchCategory) {
    return category === 'mods'
      ? this.t('settings.batchTestingStartMods', 'Mods')
      : this.t('settings.batchTestingStartPlugins', 'Plugins');
  }

  getSelectedStartCategory(): BatchCategory {
    const selected = document.querySelector<HTMLInputElement>(
      'input[name="batch-testing-start-order"]:checked',
    );

    return selected?.value === 'plugins' ? 'plugins' : 'mods';
  }

  async openStartModal() {
    if (this.session?.running) {
      this.showToast(
        this.t(
          'toasts.batchTestingAlreadyRunning',
          'A batch testing session is already running.',
        ),
        'warning',
      );
      return;
    }

    let snapshots: Record<BatchCategory, CategorySnapshot>;
    try {
      snapshots = await this.state.collectSnapshots();
    } catch (error) {
      this.showToast(
        error instanceof Error
          ? error.message
          : String(error || 'Unknown error'),
        'warning',
      );
      return;
    }

    const activeMods = snapshots.mods.originalActiveNames.length;
    const activePlugins = snapshots.plugins.originalActiveNames.length;

    if (activeMods === 0 && activePlugins === 0) {
      this.showToast(
        this.t(
          'toasts.batchTestingNothingToTest',
          'No active mods or plugins are available for batch testing.',
        ),
        'warning',
      );
      return;
    }

    const firstCategory = this.getSelectedStartCategory();
    const startLabel =
      firstCategory === 'mods'
        ? this.t('settings.batchTestingStartMods', 'Mods')
        : this.t('settings.batchTestingStartPlugins', 'Plugins');

    this.renderModal(
      this.t('settings.batchTestingTitle', 'Batch Testing'),
      `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.14) 0%, rgba(var(--primary-rgb), 0.08) 100%); border: 1px solid rgba(var(--primary-rgb), 0.2);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted);">
                ${this.escapeHtml(
                  this.t('settings.batchTestingStartOrder', 'Start With'),
                )}
              </div>
              <div style="padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: var(--text-primary); font-size: 12px; font-weight: 600;">
                ${this.escapeHtml(startLabel)}
              </div>
            </div>

          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px;">
            ${this.ui.renderInfoCard(
              this.t('settings.batchTestingStartMods', 'Mods'),
              `${activeMods}`,
            )}
            ${this.ui.renderInfoCard(
              this.t('settings.batchTestingStartPlugins', 'Plugins'),
              `${activePlugins}`,
            )}
          </div>
          <div style="padding: 14px 16px; border-radius: 12px; background: rgba(var(--primary-rgb), 0.08); border: 1px solid rgba(var(--primary-rgb), 0.18); color: var(--text-secondary); line-height: 1.6;">
            ${this.escapeHtml(
              this.hasConfiguredEmulator()
                ? this.t(
                    'settings.batchTestingEmulatorReady',
                    'Your emulator is configured. A launch button will be available during each test step.',
                  )
                : this.t(
                    'settings.batchTestingLaunchGame',
                    'Launch the game and confirm if it works',
                  ),
            )}
          </div>
        </div>
      `,
      [
        {
          label: this.t('common.cancel', 'Cancel'),
          type: 'secondary',
          onClick: () => this.closeModal(),
        },
        {
          label: this.t('settings.batchTestingButton', 'Batch Testing'),
          type: 'primary',
          onClick: async () => {
            await this.startSession(firstCategory);
          },
        },
      ],
    );
  }

  async startSession(firstCategory: BatchCategory) {
    let sessionSnapshots: Record<BatchCategory, CategorySnapshot>;

    try {
      sessionSnapshots = await this.state.collectSnapshots();
    } catch (error) {
      this.showToast(
        error instanceof Error
          ? error.message
          : String(error || 'Unknown error'),
        'warning',
      );
      return;
    }

    const order =
      firstCategory === 'mods'
        ? (['mods', 'plugins'] as BatchCategory[])
        : (['plugins', 'mods'] as BatchCategory[]);

    this.session = {
      snapshots: sessionSnapshots,
      order,
      currentCategoryIndex: 0,
      running: true,
      diagnosis: {},
      pendingPrompt: null,
      result: null,
      noCauseFound: false,
    };

    await this.persistSession();
    await this.continueSession();
  }

  async resumeSession() {
    if (!this.session?.running) {
      this.showToast(
        this.t(
          'toasts.batchTestingNoSession',
          'There is no batch testing session in progress.',
        ),
        'warning',
      );
      return;
    }

    if (this.session.result) {
      await this.showSuspectResult(
        this.session.snapshots[this.session.result.category],
        this.session.result,
      );
      return;
    }

    if (this.session.noCauseFound) {
      this.renderNoCauseResult();
      return;
    }

    if (this.session.pendingPrompt) {
      this.renderPrompt(this.session.pendingPrompt);
      return;
    }

    await this.continueSession();
  }

  async cancelSession() {
    if (!this.session?.running) {
      this.showToast(
        this.t(
          'toasts.batchTestingNoSession',
          'There is no batch testing session in progress.',
        ),
        'warning',
      );
      return;
    }

    await this.restoreOriginalState();
    this.showToast(
      this.t(
        'toasts.batchTestingCancelled',
        'Batch testing was cancelled and the original state was restored.',
      ),
      'success',
    );
    this.closeModal();
  }

  async continueSession() {
    if (!this.session?.running) {
      return;
    }

    try {
      while (this.session.currentCategoryIndex < this.session.order.length) {
        const category = this.session.order[this.session.currentCategoryIndex];
        const snapshot = this.session.snapshots[category];

        if (!snapshot.basePath || snapshot.originalActiveNames.length === 0) {
          this.session.currentCategoryIndex += 1;
          await this.persistSession();
          continue;
        }

        let progress = this.session.diagnosis[category];
        if (!progress) {
          progress = {
            suspects: [...snapshot.originalActiveNames],
            granularity: 2,
            foundPassingChunk: false,
            step: 1,
            currentChunkIndex: 0,
            status: 'pending',
          };
          this.session.diagnosis[category] = progress;
          await this.persistSession();
        }

        const isWaitingForAnswer = await this.prepareNextPrompt(
          snapshot,
          progress,
        );

        if (isWaitingForAnswer) {
          return;
        }
      }

      await this.restoreOriginalState();

      if (!this.session) {
        return;
      }

      this.session.noCauseFound = true;
      await this.persistSession();
      this.renderNoCauseResult();
    } catch (error) {
      console.error('[BatchTesting] Failed:', error);

      if (error instanceof Error && this.isUnavailableFolderError(error)) {
        this.showToast(error.message, 'warning');
        await this.persistSession();
        return;
      }

      await this.restoreOriginalState();
      this.showToast(
        this.t('toasts.batchTestingFailed', 'Batch testing failed: {{error}}', {
          error:
            error instanceof Error ? error.message : String(error || 'Unknown'),
        }),
        'error',
      );
      this.closeModal();
    }
  }

  async prepareNextPrompt(
    snapshot: CategorySnapshot,
    progress: DiagnosisProgress,
  ) {
    while (progress.suspects.length > 1) {
      const chunks = this.splitIntoChunks(
        progress.suspects,
        progress.granularity,
      );

      if (progress.currentChunkIndex >= chunks.length) {
        if (progress.granularity >= progress.suspects.length) {
          break;
        }

        progress.granularity = Math.min(
          progress.suspects.length,
          progress.granularity * 2,
        );
        progress.currentChunkIndex = 0;
        progress.step += 1;
        await this.persistSession();
        continue;
      }

      const chunk = chunks[progress.currentChunkIndex];
      const enabledNames = snapshot.originalActiveNames.filter(
        (name) => !chunk.includes(name),
      );

      await this.state.applyState(snapshot, enabledNames);

      if (!this.session) {
        return true;
      }

      this.session.pendingPrompt = {
        category: snapshot.category,
        chunk: [...chunk],
        suspectCount: progress.suspects.length,
        step: progress.step,
      };
      await this.persistSession();
      this.renderPrompt(this.session.pendingPrompt);
      return true;
    }

    await this.finalizeCurrentCategory(snapshot, progress);
    return !!this.session?.result;
  }

  async finalizeCurrentCategory(
    snapshot: CategorySnapshot,
    progress: DiagnosisProgress,
  ) {
    if (!this.session) {
      return;
    }

    this.session.pendingPrompt = null;

    if (!progress.foundPassingChunk) {
      progress.status = 'inconclusive';
      await this.state.applyState(snapshot, snapshot.originalActiveNames);
      this.session.currentCategoryIndex += 1;
      await this.persistSession();
      return;
    }

    const culpritNames = [...progress.suspects];
    const enabledNames = snapshot.originalActiveNames.filter(
      (name) => !culpritNames.includes(name),
    );

    await this.state.applyState(snapshot, enabledNames);

    if (!this.session) {
      return;
    }

    const resolvedStatus = culpritNames.length === 1 ? 'single' : 'group';
    const result: DiagnosisResult = {
      status: resolvedStatus,
      category: snapshot.category,
      culpritNames,
    };

    progress.status = resolvedStatus;
    this.session.result = result;
    await this.persistSession();
    await this.showSuspectResult(snapshot, result);
  }

  async respondToPrompt(answer: BatchPromptResult) {
    if (!this.session?.running || !this.session.pendingPrompt) {
      return;
    }

    if (answer === 'cancel') {
      await this.cancelSession();
      return;
    }

    const prompt = this.session.pendingPrompt;
    const progress = this.session.diagnosis[prompt.category];
    const snapshot = this.session.snapshots[prompt.category];

    if (!progress) {
      return;
    }

    if (snapshot?.basePath) {
      try {
        await this.state.ensureCategoryAvailable(
          prompt.category,
          snapshot.basePath,
        );
      } catch (error) {
        this.showToast(
          error instanceof Error
            ? error.message
            : String(error || 'Unknown error'),
          'warning',
        );
        return;
      }
    }

    this.session.pendingPrompt = null;

    if (answer === 'pass') {
      progress.suspects = [...prompt.chunk];
      progress.granularity = 2;
      progress.foundPassingChunk = true;
      progress.currentChunkIndex = 0;
      progress.step += 1;
    } else {
      progress.currentChunkIndex += 1;
    }

    await this.persistSession();
    await this.continueSession();
  }

  renderPrompt(prompt: PendingPrompt) {
    const snapshot = this.session?.snapshots[prompt.category];

    if (!snapshot) {
      return;
    }

    const chips = prompt.chunk
      .map((name) => this.ui.renderItemTrigger(prompt.category, name, 'chip'))
      .join('');
    const stepLabel = this.t('settings.batchTestingStep', 'Step {{step}}', {
      step: prompt.step,
    });

    const actions: ModalAction[] = [
      {
        label: this.t(
          'settings.batchTestingCancelButton',
          'Cancel Batch Testing',
        ),
        type: 'secondary',
        onClick: async () => {
          await this.respondToPrompt('cancel');
        },
      },
    ];

    if (this.hasConfiguredEmulator()) {
      actions.push({
        label: this.t('settings.batchTestingLaunchGame', 'Launch the game'),
        type: 'secondary',
        onClick: async () => {
          await this.launchConfiguredGame();
        },
      });
    }

    actions.push(
      {
        label: this.t(
          'settings.batchTestingWorksNowButton',
          'Yes, it works now',
        ),
        type: 'primary',
        onClick: async () => {
          await this.respondToPrompt('pass');
        },
      },
      {
        label: this.t(
          'settings.batchTestingStillBrokenButton',
          'No, it is still broken',
        ),
        type: 'danger',
        onClick: async () => {
          await this.respondToPrompt('fail');
        },
      },
    );

    this.renderModal(
      `${this.t('settings.batchTestingTitle', 'Batch Testing')} - ${
        snapshot.label
      }`,
      `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.14) 0%, rgba(var(--primary-rgb), 0.08) 100%); border: 1px solid rgba(var(--primary-rgb), 0.2);">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;">
              <div style="padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: var(--text-primary); font-size: 12px; font-weight: 600;">
                ${this.escapeHtml(snapshot.label)}
              </div>
              <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted);">
                ${this.escapeHtml(stepLabel)}
              </div>
            </div>
            <div style="margin-top: 10px; color: var(--text-secondary); line-height: 1.6;">
              ${this.escapeHtml(
                this.t(
                  'settings.batchTestingPrompt',
                  'These items are currently disabled. Launch the game, test the issue, then tell FightPlanner whether it works now.',
                ),
              )}
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            ${this.ui.renderInfoCard(
              this.t('settings.batchTestingQuestion', 'Does it work?'),
              stepLabel,
            )}
            ${this.ui.renderInfoCard(
              this.t(
                'settings.batchTestingCurrentPool',
                'Current suspect pool',
              ),
              `${prompt.suspectCount}`,
            )}
            ${this.ui.renderInfoCard(
              this.t(
                'settings.batchTestingDisabledChunk',
                'Disabled for this test',
              ),
              `${prompt.chunk.length}`,
            )}
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 12px;">
            ${this.ui.renderStepCard(
              '1',
              this.t(
                'settings.batchTestingChecklistLaunchTitle',
                'Launch the game',
              ),
              this.t(
                'settings.batchTestingChecklistLaunchDesc',
                'Open the game with this temporary setup.',
              ),
            )}
            ${this.ui.renderStepCard(
              '2',
              this.t(
                'settings.batchTestingChecklistCheckTitle',
                'Check the issue',
              ),
              this.t(
                'settings.batchTestingChecklistCheckDesc',
                'See if the bug, crash, or problem still happens.',
              ),
            )}
            ${this.ui.renderStepCard(
              '3',
              this.t(
                'settings.batchTestingChecklistAnswerTitle',
                'Choose the result',
              ),
              this.t(
                'settings.batchTestingChecklistAnswerDesc',
                'Use the buttons below to say if the game works now or not.',
              ),
            )}
          </div>
          <div style="padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); min-height: 0;">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 10px;">
              ${this.escapeHtml(
                this.t(
                  'settings.batchTestingDisabledNowTitle',
                  'Temporarily disabled for this test',
                ),
              )}
            </div>
            <div class="batch-testing-scroll-panel">
              <div class="batch-testing-chip-list">
                ${chips}
              </div>
            </div>
          </div>
        </div>
      `,
      actions,
    );
  }

  renderNoCauseResult() {
    this.renderModal(
      this.t('settings.batchTestingNoCauseTitle', 'No Primary Cause Found'),
      `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 16px 18px; border-radius: 14px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color);">
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 8px;">
              ${this.escapeHtml(
                this.t('settings.batchTestingStateDone', 'Finished'),
              )}
            </div>
            <div style="color: var(--text-secondary); line-height: 1.6;">
              ${this.escapeHtml(
                this.t(
                  'settings.batchTestingNoCauseDesc',
                  'No clear primary cause was isolated in the active mods or plugins. The original state has been restored.',
                ),
              )}
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px;">
            ${this.ui.renderStepCard(
              '1',
              this.t(
                'settings.batchTestingNoCauseTipOneTitle',
                'Try the other category first',
              ),
              this.t(
                'settings.batchTestingNoCauseTipOneDesc',
                'If you started with mods, try plugins first next time, or the opposite.',
              ),
            )}
            ${this.ui.renderStepCard(
              '2',
              this.t(
                'settings.batchTestingNoCauseTipTwoTitle',
                'Retest after new changes',
              ),
              this.t(
                'settings.batchTestingNoCauseTipTwoDesc',
                'If you install or remove items later, you can run the diagnostic again.',
              ),
            )}
          </div>
        </div>
      `,
      [
        {
          label: this.t('common.close', 'Close'),
          type: 'primary',
          onClick: () => this.closeModal(),
        },
      ],
    );
  }

  async askIfItWorks(
    snapshot: CategorySnapshot,
    chunk: string[],
    suspectCount: number,
    step: number,
  ): Promise<BatchPromptResult> {
    const chips = chunk
      .map((name) => this.ui.renderItemTrigger(snapshot.category, name, 'chip'))
      .join('');

    return new Promise((resolve) => {
      const actions: ModalAction[] = [
        {
          label: this.t('common.cancel', 'Cancel'),
          type: 'secondary',
          onClick: () => resolve('cancel'),
        },
      ];

      if (this.hasConfiguredEmulator()) {
        actions.push({
          label: this.t('settings.batchTestingLaunchGame', 'Launch the game'),
          type: 'secondary',
          onClick: async () => {
            await this.launchConfiguredGame();
          },
        });
      }

      actions.push(
        {
          label: this.t('common.yes', 'Yes'),
          type: 'primary',
          onClick: () => resolve('pass'),
        },
        {
          label: this.t('common.no', 'No'),
          type: 'danger',
          onClick: () => resolve('fail'),
        },
      );

      this.renderModal(
        `${this.t('settings.batchTestingTitle', 'Batch Testing')} • ${
          snapshot.label
        }`,
        `
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
              ${this.ui.renderInfoCard(
                this.t('settings.batchTestingQuestion', 'Does it work?'),
                this.t('settings.batchTestingStep', 'Step {{step}}', { step }),
              )}
              ${this.ui.renderInfoCard(
                this.t(
                  'settings.batchTestingCurrentPool',
                  'Current suspect pool',
                ),
                `${suspectCount}`,
              )}
              ${this.ui.renderInfoCard(
                this.t(
                  'settings.batchTestingDisabledChunk',
                  'Disabled for this test',
                ),
                `${chunk.length}`,
              )}
            </div>
            <p style="margin: 0; color: var(--text-secondary); line-height: 1.6;">
              ${this.escapeHtml(
                this.t(
                  'settings.batchTestingPrompt',
                  'These items are currently disabled. Launch the game, test the issue, then tell FightPlanner whether it works now.',
                ),
              )}
            </p>
            <div class="batch-testing-scroll-panel">
              <div class="batch-testing-chip-list">
                ${chips}
              </div>
            </div>
          </div>
        `,
        actions,
      );
    });
  }

  async showSuspectResult(snapshot: CategorySnapshot, result: DiagnosisResult) {
    const culpritNames = result.culpritNames || [];
    const list = culpritNames
      .map(
        (name) =>
          `<li style="margin-bottom: 6px;">${this.ui.renderItemTrigger(
            snapshot.category,
            name,
            'list',
          )}</li>`,
      )
      .join('');

    const isSingle = culpritNames.length === 1;

    const actions: ModalAction[] = [
      {
        label: this.t(
          'settings.batchTestingRestoreAll',
          'Restore Original State',
        ),
        type: 'secondary',
        onClick: async () => {
          await this.restoreOriginalState();
          this.closeModal();
        },
      },
    ];

    if (isSingle) {
      actions.push(
        {
          label: this.t('settings.batchTestingDisableMod', 'Keep it disabled'),
          type: 'secondary',
          onClick: () => this.closeModal(),
        },
        {
          label: this.t('settings.batchTestingDeleteMod', 'Delete it'),
          type: 'danger',
          onClick: async () => {
            await this.deleteSuspect(snapshot.category, culpritNames[0]);
            this.closeModal();
          },
        },
      );
    } else {
      actions.push({
        label: this.t(
          'settings.batchTestingKeepGroupDisabled',
          'Keep This Group Disabled',
        ),
        type: 'primary',
        onClick: () => this.closeModal(),
      });
    }

    this.renderModal(
      this.t('settings.batchTestingResultTitle', 'Primary Cause'),
      `
        <div style="display: flex; flex-direction: column; gap: 16px;">
          <div style="padding: 16px 18px; border-radius: 14px; background: linear-gradient(135deg, rgba(var(--primary-rgb), 0.14) 0%, rgba(var(--primary-rgb), 0.08) 100%); border: 1px solid rgba(var(--primary-rgb), 0.2);">
            <div style="display: inline-flex; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.12); color: var(--text-primary); font-size: 12px; font-weight: 600; margin-bottom: 10px;">
              ${this.escapeHtml(
                this.t(
                  'settings.batchTestingPrimaryCauseLabel',
                  'Likely culprit',
                ),
              )}
            </div>
            <div style="font-size: 18px; font-weight: 700; color: var(--text-primary);">
              ${this.escapeHtml(
                isSingle
                  ? culpritNames[0]
                  : this.t(
                      'settings.batchTestingGroupCause',
                      'Suspect group of items',
                    ),
              )}
            </div>
            <div style="margin-top: 8px; color: var(--text-secondary); line-height: 1.6;">
              ${this.escapeHtml(
                isSingle
                  ? this.t(
                      'settings.batchTestingDeleteOrDisable',
                      'Do you want to delete it or just disable it?',
                    )
                  : this.t(
                      'settings.batchTestingGroupDesc',
                      'The issue stopped only when this whole group was disabled together.',
                    ),
              )}
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
            ${this.ui.renderInfoCard(
              this.t(
                'settings.batchTestingCurrentPool',
                'Current suspect pool',
              ),
              `${culpritNames.length}`,
            )}
            ${this.ui.renderInfoCard(
              this.t('settings.batchTestingStartOrder', 'Start With'),
              snapshot.label,
            )}
          </div>
          <ul style="margin: 0; padding-left: 18px; color: var(--text-secondary); line-height: 1.6;">
            ${list}
          </ul>
        </div>
      `,
      actions,
    );
  }

  async deleteSuspect(category: BatchCategory, suspectName: string) {
    if (!this.session) {
      return;
    }

    const snapshot = this.session.snapshots[category];
    let suspectPath =
      snapshot.lastState?.disabled.find((entry) => entry.name === suspectName)
        ?.path ||
      snapshot.lastState?.active.find((entry) => entry.name === suspectName)
        ?.path ||
      null;

    if (!suspectPath && snapshot.basePath) {
      const currentState = await this.state.readCategoryState(
        category,
        snapshot.basePath,
      );
      snapshot.lastState = currentState;
      suspectPath =
        currentState.disabled.find((entry) => entry.name === suspectName)
          ?.path ||
        currentState.active.find((entry) => entry.name === suspectName)?.path ||
        null;
    }

    if (!suspectPath) {
      throw new Error(`Unable to find ${suspectName}`);
    }

    if (category === 'mods') {
      const result = await window.electronAPI.deleteMod(suspectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete mod');
      }
      this.showToast(
        this.t('toasts.modUninstalled', 'Mod uninstalled successfully'),
        'success',
      );
    } else {
      const result = await window.electronAPI.deletePlugin(suspectPath);
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete plugin');
      }
      this.showToast(
        this.t(
          'toasts.batchTestingPluginDeleted',
          'Plugin deleted successfully',
        ),
        'success',
      );
    }

    if (snapshot.basePath) {
      const refreshedState = await this.state.readCategoryState(
        category,
        snapshot.basePath,
      );
      snapshot.lastState = refreshedState;
      this.state.syncManager(category, snapshot.basePath, refreshedState);
    }
  }

  async restoreOriginalState() {
    if (!this.session || this.isRestoring) {
      return;
    }

    this.isRestoring = true;

    try {
      for (const category of ['mods', 'plugins'] as BatchCategory[]) {
        const snapshot = this.session.snapshots[category];
        if (!snapshot.basePath) {
          continue;
        }

        await this.state.applyState(snapshot, snapshot.originalActiveNames);
      }
    } finally {
      this.isRestoring = false;
    }
  }

  async launchConfiguredGame() {
    if (!this.hasConfiguredEmulator()) {
      window.toastManager?.warning(
        'toasts.configureEmulatorPaths',
        6000,
        {},
        {
          actionButton: {
            text: window.i18n?.t?.('toasts.settings') || 'Settings',
            onClick: () => this.navigateToEmulatorSettings(),
          },
        },
      );
      return;
    }

    await window.settingsManager.readyPromise;

    const result = await window.electronAPI.launchEmulator(
      window.settingsManager.getEmulatorType(),
      window.settingsManager.getEmulatorPath(),
      window.settingsManager.getGamePath(),
      window.settingsManager.getEmulatorFullscreen(),
    );

    if (result.success) {
      this.showToast(
        this.t(
          'toasts.emulatorLaunchedSuccessfully',
          'Emulator launched successfully',
        ),
        'success',
      );
      return;
    }

    if (result.error === 'emulator_already_running') {
      this.showToast(
        this.t(
          'toasts.emulatorAlreadyRunning',
          'The emulator is already running',
        ),
        'warning',
      );
      return;
    }

    this.showToast(
      this.t(
        'toasts.failedToLaunchEmulator',
        'Failed to launch emulator: {{error}}',
        { error: result.error || 'Unknown error' },
      ),
      'error',
    );
  }

  async openItemInfo(category: BatchCategory, itemName: string) {
    const itemState = this.state.findItemState(
      this.session,
      category,
      itemName,
    );

    if (!itemState) {
      this.showToast(
        this.t(
          'toasts.batchTestingItemInfoUnavailable',
          'Item info is unavailable right now.',
        ),
        'warning',
      );
      return;
    }

    if (category === 'mods') {
      const modInfo = await window.electronAPI.getModInfo(itemState.entry.path);
      const details = modInfo || {
        display_name: itemName,
        description: this.t(
          'tools.modInfo.noDetailedInfo',
          'No detailed information available',
        ),
      };

      const infoModal = window.modalManager.showCustomModal({
        id: 'batch-testing-item-info-modal',
        title: this.t('settings.batchTestingItemInfoTitle', 'Item Info'),
        size: 'small',
        body: this.ui.buildModInfoBody(
          itemName,
          itemState.status,
          itemState.entry as { path: string; hash?: string },
          details,
        ),
      });
      this.ui.styleItemInfoModal(infoModal);
      return;
    }

    const infoModal = window.modalManager.showCustomModal({
      id: 'batch-testing-item-info-modal',
      title: this.t('settings.batchTestingItemInfoTitle', 'Item Info'),
      size: 'small',
      body: this.ui.buildPluginInfoBody(
        itemName,
        itemState.status,
        itemState.entry as { path: string; size: string },
      ),
    });
    this.ui.styleItemInfoModal(infoModal);
  }

  getStatusLabel(status: 'active' | 'disabled') {
    return status === 'active'
      ? this.t('settings.batchTestingStatusActive', 'Active')
      : this.t('settings.batchTestingStatusDisabled', 'Disabled');
  }

  hasConfiguredEmulator() {
    return !!window.settingsManager?.hasEmulatorConfig?.();
  }

  renderModal(title: string, body: string, actions: ModalAction[]) {
    if (!this.modal || !document.body.contains(this.modal)) {
      this.modal = window.modalManager.showCustomModal({
        id: 'batch-testing-modal',
        title,
        body,
        size: 'large',
        clickOverlayToClose: false,
        escapeToClose: false,
      });
    }

    this.modal.classList.add('batch-testing-modal');

    const titleEl = this.modal.querySelector<HTMLElement>('.modal-header h3');
    const bodyEl = this.modal.querySelector<HTMLElement>('.modal-body');
    const footerEl = this.modal.querySelector<HTMLElement>('.modal-footer');

    if (titleEl) {
      titleEl.textContent = title.split('â€¢').join('-').split('•').join('-');
    }

    if (bodyEl) {
      bodyEl.classList.add('batch-testing-modal-body');
      bodyEl.innerHTML = body;
      this.attachItemTriggerListeners(bodyEl);
    }

    if (footerEl) {
      footerEl.innerHTML = '';

      actions.forEach((action) => {
        const button = document.createElement('button');
        button.className = `modal-btn modal-btn-${action.type || 'secondary'}`;
        button.textContent = action.label;
        button.addEventListener('click', async () => {
          button.disabled = true;
          try {
            await action.onClick();
          } finally {
            button.disabled = false;
          }
        });
        footerEl.appendChild(button);
      });
    }
  }

  attachItemTriggerListeners(container: HTMLElement) {
    container
      .querySelectorAll<HTMLButtonElement>('.batch-testing-item-trigger')
      .forEach((button) => {
        if (button.dataset.listenerAttached === 'true') {
          return;
        }

        button.addEventListener('click', async () => {
          const category =
            button.dataset.batchCategory === 'plugins' ? 'plugins' : 'mods';
          const itemName = button.dataset.batchName;

          if (!itemName) {
            return;
          }

          try {
            await this.openItemInfo(category, itemName);
          } catch (error) {
            console.error('[BatchTesting] Failed to open item info:', error);
            this.showToast(
              this.t(
                'toasts.batchTestingItemInfoFailed',
                'Failed to load item info.',
              ),
              'error',
            );
          }
        });

        button.dataset.listenerAttached = 'true';
      });
  }

  closeModal() {
    const modal = this.modal;
    this.modal = null;
    this.session = null;
    if (window.modManager?.clearBatchTestingOverride) {
      window.modManager.clearBatchTestingOverride();
      void window.modManager.fetchMods();
    }
    if (window.pluginManager?.clearBatchTestingOverride) {
      window.pluginManager.clearBatchTestingOverride();
      void window.pluginManager.fetchPlugins();
    }
    void this.persistSession();

    if (!modal) {
      return;
    }

    window.modalManager.closeModal(modal, {
      onModalClosed: () => {
        modal.remove();
      },
    });
  }

  splitIntoChunks<T>(items: T[], parts: number): T[][] {
    const chunks: T[][] = [];
    const chunkSize = Math.ceil(items.length / parts);

    for (let index = 0; index < items.length; index += chunkSize) {
      chunks.push(items.slice(index, index + chunkSize));
    }

    return chunks.filter((chunk) => chunk.length > 0);
  }

  t(key: string, fallback: string, params: Record<string, any> = {}) {
    if (window.i18n?.t) {
      const translated = window.i18n.t(key, params);
      if (translated && translated !== key) {
        return translated;
      }
    }

    return fallback.replace(/\{\{(\w+)\}\}/g, (_match, paramName) => {
      return params[paramName] != null ? String(params[paramName]) : '';
    });
  }

  showToast(
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info',
  ) {
    if (!window.toastManager) {
      return;
    }

    if (type === 'success') {
      window.toastManager.success(message);
      return;
    }

    if (type === 'error') {
      window.toastManager.error(message);
      return;
    }

    if (type === 'warning') {
      window.toastManager.warning(message);
      return;
    }

    window.toastManager.info(message);
  }

  navigateToEmulatorSettings() {
    const settingsTab = document.querySelector<HTMLElement>(
      '[data-tab="settings"]',
    );
    if (settingsTab) {
      settingsTab.click();
    }

    setTimeout(() => {
      window.settingsManager?.switchSettingsTab?.('emulator');
    }, 100);
  }

  isUnavailableFolderError(error: Error) {
    const normalizedMessage = error.message.toLowerCase();
    return (
      normalizedMessage.includes('folder is not available') ||
      normalizedMessage.includes('make sure this folder exists')
    );
  }

  escapeHtml(value: string) {
    const div = document.createElement('div');
    div.textContent = value;
    return div.innerHTML;
  }
}

if (typeof window !== 'undefined') {
  (window as any).batchTestingManager = new BatchTestingManager();
}

export { BatchTestingManager, type BatchCategory };
