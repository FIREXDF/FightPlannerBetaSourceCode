type BatchTestingUiSummary = {
  badge: string;
  tone: 'neutral' | 'info' | 'warning' | 'success';
  title: string;
  description: string;
  resumeTitle: string;
  resumeDescription: string;
};

type BatchTestingUiDeps = {
  t: (key: string, fallback: string, params?: Record<string, any>) => string;
  escapeHtml: (value: string) => string;
  getCategoryLabel: (category: 'mods' | 'plugins') => string;
  getStatusLabel: (status: 'active' | 'disabled') => string;
};

class BatchTestingUiHelpers {
  t: BatchTestingUiDeps['t'];
  escapeHtml: BatchTestingUiDeps['escapeHtml'];
  getCategoryLabel: BatchTestingUiDeps['getCategoryLabel'];
  getStatusLabel: BatchTestingUiDeps['getStatusLabel'];

  constructor(deps: BatchTestingUiDeps) {
    this.t = deps.t;
    this.escapeHtml = deps.escapeHtml;
    this.getCategoryLabel = deps.getCategoryLabel;
    this.getStatusLabel = deps.getStatusLabel;
  }

  getSessionUiSummary(session: any): BatchTestingUiSummary {
    if (!session?.running) {
      return {
        badge: this.t('settings.batchTestingStateReady', 'Ready'),
        tone: 'neutral',
        title: this.t(
          'settings.batchTestingReadyTitle',
          'Ready to start a diagnostic',
        ),
        description: this.t(
          'settings.batchTestingReadyDesc',
          'Choose where to begin, then FightPlanner will disable groups step by step until the likely cause is isolated.',
        ),
        resumeTitle: this.t(
          'settings.batchTestingResumeButton',
          'Resume Batch Testing',
        ),
        resumeDescription: this.t(
          'settings.batchTestingResumeButtonDesc',
          'Resume the current diagnostic session',
        ),
      };
    }

    if (session.result) {
      const culpritLabel =
        session.result.culpritNames?.length === 1
          ? session.result.culpritNames[0]
          : this.t(
              'settings.batchTestingGroupCause',
              'Suspect group of items',
            );

      return {
        badge: this.t('settings.batchTestingStateFound', 'Cause found'),
        tone: 'success',
        title: this.t(
          'settings.batchTestingFoundTitle',
          'A likely cause is ready to review',
        ),
        description: this.t(
          'settings.batchTestingFoundDesc',
          'FightPlanner isolated {{culprit}}. Reopen the session to choose what to do next.',
          { culprit: culpritLabel },
        ),
        resumeTitle: this.t(
          'settings.batchTestingViewResultButton',
          'View Result',
        ),
        resumeDescription: this.t(
          'settings.batchTestingViewResultButtonDesc',
          'Review the likely culprit and choose the next action.',
        ),
      };
    }

    if (session.noCauseFound) {
      return {
        badge: this.t('settings.batchTestingStateDone', 'Finished'),
        tone: 'info',
        title: this.t(
          'settings.batchTestingNoCauseTitle',
          'No Primary Cause Found',
        ),
        description: this.t(
          'settings.batchTestingNoCauseDesc',
          'No clear primary cause was isolated in the active mods or plugins. The original state has been restored.',
        ),
        resumeTitle: this.t(
          'settings.batchTestingViewSummaryButton',
          'View Summary',
        ),
        resumeDescription: this.t(
          'settings.batchTestingViewSummaryButtonDesc',
          'Open the diagnostic summary again.',
        ),
      };
    }

    if (session.pendingPrompt) {
      const prompt = session.pendingPrompt;
      const categoryLabel = this.getCategoryLabel(prompt.category);

      return {
        badge: this.t('settings.batchTestingStateWaiting', 'Waiting for test'),
        tone: 'warning',
        title: this.t(
          'settings.batchTestingWaitingTitle',
          'Step {{step}} - test {{category}}',
          {
            step: prompt.step,
            category: categoryLabel,
          },
        ),
        description: this.t(
          'settings.batchTestingWaitingDesc',
          '{{count}} items are disabled for this check. Launch the game, test the issue, then answer.',
          { count: prompt.chunk.length },
        ),
        resumeTitle: this.t(
          'settings.batchTestingResumeCurrentStepButton',
          'Resume Current Step',
        ),
        resumeDescription: this.t(
          'settings.batchTestingResumeCurrentStepDesc',
          'Continue the current test and answer if the game works now.',
        ),
      };
    }

    const currentCategory = session.order?.[session.currentCategoryIndex] || 'mods';

    return {
      badge: this.t('settings.batchTestingStateRunning', 'In progress'),
      tone: 'info',
      title: this.t(
        'settings.batchTestingRunningTitle',
        'Analyzing {{category}}',
        {
          category: this.getCategoryLabel(currentCategory),
        },
      ),
      description: this.t(
        'settings.batchTestingRunningDesc',
        'FightPlanner is narrowing the suspect pool. You can leave this screen and resume at any time.',
      ),
      resumeTitle: this.t(
        'settings.batchTestingResumeButton',
        'Resume Batch Testing',
      ),
      resumeDescription: this.t(
        'settings.batchTestingResumeButtonDesc',
        'Resume the current diagnostic session',
      ),
    };
  }

  applySessionBadgeTone(
    badgeEl: HTMLElement,
    tone: BatchTestingUiSummary['tone'],
  ) {
    const styles = {
      neutral: {
        background: 'rgba(255,255,255,0.06)',
        border: 'rgba(255,255,255,0.12)',
        color: 'var(--text-secondary)',
      },
      info: {
        background: 'rgba(var(--primary-rgb), 0.12)',
        border: 'rgba(var(--primary-rgb), 0.28)',
        color: 'var(--primary-color)',
      },
      warning: {
        background: 'rgba(245, 158, 11, 0.12)',
        border: 'rgba(245, 158, 11, 0.28)',
        color: '#f59e0b',
      },
      success: {
        background: 'rgba(34, 197, 94, 0.12)',
        border: 'rgba(34, 197, 94, 0.28)',
        color: '#22c55e',
      },
    }[tone];

    badgeEl.style.background = styles.background;
    badgeEl.style.borderColor = styles.border;
    badgeEl.style.color = styles.color;
  }

  renderInfoCard(title: string, value: string) {
    return `
      <div style="padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color);">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px;">
          ${this.escapeHtml(title)}
        </div>
        <div style="font-size: 16px; font-weight: 600; color: var(--text-primary);">
          ${this.escapeHtml(value)}
        </div>
      </div>
    `;
  }

  renderStepCard(index: string, title: string, description: string) {
    return `
      <div style="padding: 14px 16px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); min-width: 0;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 999px; background: rgba(var(--primary-rgb), 0.14); border: 1px solid rgba(var(--primary-rgb), 0.22); color: var(--primary-color); font-size: 13px; font-weight: 700; margin-bottom: 10px;">
          ${this.escapeHtml(index)}
        </div>
        <div style="font-size: 14px; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
          ${this.escapeHtml(title)}
        </div>
        <div style="font-size: 13px; line-height: 1.6; color: var(--text-secondary);">
          ${this.escapeHtml(description)}
        </div>
      </div>
    `;
  }

  renderDetailRow(label: string, value: string, multiline = false) {
    return `
      <div style="padding: 12px 14px; border-radius: 12px; background: rgba(255,255,255,0.04); border: 1px solid var(--border-color); min-width: 0;">
        <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: 6px;">
          ${this.escapeHtml(label)}
        </div>
        <div style="display: block; max-width: 100%; min-width: 0; font-size: 14px; color: var(--text-primary); line-height: 1.6; overflow-wrap: anywhere; ${multiline ? 'white-space: pre-wrap; word-break: break-word;' : ''}">
          ${this.escapeHtml(value)}
        </div>
      </div>
    `;
  }

  renderItemTrigger(
    category: 'mods' | 'plugins',
    name: string,
    variant: 'chip' | 'list',
  ) {
    const baseStyle =
      variant === 'chip'
        ? 'display: inline-flex; align-items: center; gap: 6px; max-width: 100%; min-width: 0; padding: 6px 10px; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-secondary); font-size: 12px; text-align: left; white-space: normal;'
        : 'display: inline-flex; align-items: center; gap: 6px; padding: 0; background: transparent; border: none; color: var(--primary-color); font-size: 14px;';

    return `
      <button
        type="button"
        class="batch-testing-item-trigger"
        data-batch-category="${category}"
        data-batch-name="${this.escapeHtml(name)}"
        style="${baseStyle} cursor: pointer;"
      >
        <span style="min-width: 0; overflow-wrap: anywhere; line-height: 1.25;">${this.escapeHtml(name)}</span>
        <i class="bi bi-info-circle" style="font-size: 12px; opacity: 0.8; flex: 0 0 auto;"></i>
      </button>
    `;
  }

  styleItemInfoModal(modal: HTMLElement) {
    const maxModalHeight = Math.min(Math.floor(window.innerHeight * 0.78), 720);

    modal.dataset.batchItemInfo = 'true';
    modal.style.width = 'min(560px, 92vw)';
    modal.style.minWidth = '320px';
    modal.style.maxWidth = '92vw';
    modal.style.maxHeight = `${maxModalHeight}px`;
    modal.style.overflow = 'hidden';
    modal.style.zIndex = '10001';

    const headerEl = modal.querySelector<HTMLElement>('.modal-header');
    const bodyEl = modal.querySelector<HTMLElement>('.modal-body');
    const footerEl = modal.querySelector<HTMLElement>('.modal-footer');

    if (headerEl) {
      headerEl.style.padding = '18px 20px';
    }

    if (bodyEl) {
      bodyEl.style.padding = '16px 20px';
      bodyEl.style.overflowY = 'auto';
      bodyEl.style.overflowX = 'hidden';
      bodyEl.style.overscrollBehavior = 'contain';
      bodyEl.style.minWidth = '0';
    }

    if (footerEl) {
      footerEl.style.padding = '14px 20px';
    }

    window.requestAnimationFrame(() => {
      const headerHeight = headerEl?.offsetHeight ?? 0;
      const footerHeight = footerEl?.offsetHeight ?? 0;
      const availableBodyHeight = Math.max(
        140,
        maxModalHeight - headerHeight - footerHeight - 24,
      );

      if (bodyEl) {
        bodyEl.style.maxHeight = `${availableBodyHeight}px`;
      }
    });
  }

  buildModInfoBody(
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
  ) {
    const rows: string[] = [];

    rows.push(
      this.renderDetailRow(
        this.t('tools.modInfo.name', 'Name'),
        modInfo.display_name || itemName,
      ),
    );

    if (modInfo.authors) {
      rows.push(
        this.renderDetailRow(
          this.t('tools.modInfo.authors', 'Authors'),
          modInfo.authors,
        ),
      );
    }

    if (modInfo.version) {
      rows.push(
        this.renderDetailRow(
          this.t('tools.modInfo.version', 'Version'),
          modInfo.version,
        ),
      );
    }

    if (modInfo.category) {
      rows.push(
        this.renderDetailRow(
          this.t('tools.modInfo.category', 'Category'),
          modInfo.category,
        ),
      );
    }

    rows.push(
      this.renderDetailRow(
        this.t('settings.batchTestingInfoStatus', 'Status'),
        this.getStatusLabel(status),
      ),
    );

    if (entry.hash) {
      rows.push(
        this.renderDetailRow(
          this.t('settings.batchTestingInfoHash', 'Hash'),
          entry.hash,
        ),
      );
    }

    rows.push(
      this.renderDetailRow(
        this.t('settings.batchTestingInfoPath', 'Path'),
        entry.path,
        true,
      ),
    );

    if (modInfo.url) {
      rows.push(
        this.renderDetailRow(
          this.t('tools.modInfo.url', 'URL'),
          modInfo.url,
          true,
        ),
      );
    }

    return `
      <div style="display: flex; flex-direction: column; gap: 14px; min-width: 0;">
        <div style="padding: 14px 16px; border-radius: 12px; background: rgba(var(--primary-rgb), 0.08); border: 1px solid rgba(var(--primary-rgb), 0.18); color: var(--text-secondary); line-height: 1.6;">
          ${this.escapeHtml(
            modInfo.description ||
              this.t(
                'tools.modInfo.noDetailedInfo',
                'No detailed information available',
              ),
          )}
        </div>
        <div style="display: flex; flex-direction: column; gap: 10px; min-width: 0;">
          ${rows.join('')}
        </div>
      </div>
    `;
  }

  buildPluginInfoBody(
    itemName: string,
    status: 'active' | 'disabled',
    entry: { path: string; size: string },
  ) {
    return `
      <div style="display: flex; flex-direction: column; gap: 10px; min-width: 0;">
        ${this.renderDetailRow(
          this.t('tools.modInfo.name', 'Name'),
          itemName,
        )}
        ${this.renderDetailRow(
          this.t('settings.batchTestingInfoStatus', 'Status'),
          this.getStatusLabel(status),
        )}
        ${this.renderDetailRow(
          this.t('settings.batchTestingInfoSize', 'Size'),
          entry.size || 'Unknown',
        )}
        ${this.renderDetailRow(
          this.t('settings.batchTestingInfoPath', 'Path'),
          entry.path,
          true,
        )}
      </div>
    `;
  }
}

if (typeof window !== 'undefined') {
  (window as any).BatchTestingUiHelpers = BatchTestingUiHelpers;
}

export {};
