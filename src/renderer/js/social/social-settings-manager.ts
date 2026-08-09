class SocialSettingsManager extends SocialProfileManager {
  [key: string]: any;
  setSecurityFeedback(
    selector: string,
    message: string,
    state: 'success' | 'error' | null = null,
  ) {
    const feedback = document.querySelector<HTMLElement>(selector);
    if (!feedback) return;

    feedback.textContent = message;
    feedback.classList.toggle('is-success', state === 'success');
    feedback.classList.toggle('is-error', state === 'error');
  }

  async updateEmail() {
    const emailInput =
      document.querySelector<HTMLInputElement>('#social-new-email');
    const passwordInput = document.querySelector<HTMLInputElement>(
      '#social-email-current-password',
    );
    const submitButton = document.querySelector<HTMLButtonElement>(
      '#social-save-email',
    );

    if (!emailInput || !passwordInput || !this.authToken || !this.userData) {
      return;
    }

    const newEmail = emailInput.value.trim().toLowerCase();
    const currentEmail = String(this.userData.email || '').trim().toLowerCase();
    const currentPassword = passwordInput.value;

    this.setSecurityFeedback('#social-change-email-feedback', '');

    if (!emailInput.checkValidity()) {
      emailInput.reportValidity();
      return;
    }

    if (newEmail === currentEmail) {
      this.setSecurityFeedback(
        '#social-change-email-feedback',
        this.getSocialTranslation(
          'social.emailUnchanged',
          'Enter an email address different from your current one.',
        ),
        'error',
      );
      return;
    }

    submitButton?.setAttribute('disabled', '');

    try {
      const response = await this.fetchWithAuth(`${this.API_URL}/update-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idToken: this.authToken,
          email: newEmail,
          currentPassword,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        throw new Error(data.error?.message || data.error || 'UPDATE_EMAIL_FAILED');
      }

      this.userData.email = newEmail;
      if (data.idToken) this.authToken = data.idToken;
      if (data.refreshToken) this.userData.refreshToken = data.refreshToken;

      if (window.electronAPI?.store) {
        await window.electronAPI.store.set('social.userData', this.userData);
        if (data.idToken) {
          await window.electronAPI.store.set('social.authToken', data.idToken);
        }
      }

      const profileEmail = document.querySelector<HTMLElement>(
        '#social-profile-email',
      );
      const currentEmailLabel = document.querySelector<HTMLElement>(
        '#social-current-email',
      );
      if (profileEmail) profileEmail.textContent = newEmail;
      if (currentEmailLabel) currentEmailLabel.textContent = newEmail;

      emailInput.value = '';
      passwordInput.value = '';
      window.dispatchEvent(new CustomEvent('social-account-updated'));
      this.setSecurityFeedback(
        '#social-change-email-feedback',
        this.getSocialTranslation(
          'social.emailUpdated',
          'Email updated. Check your inbox if confirmation is required.',
        ),
        'success',
      );
    } catch (error) {
      console.error('Error updating email:', error);
      this.setSecurityFeedback(
        '#social-change-email-feedback',
        this.getSocialTranslation(
          'social.failedToUpdateEmail',
          'Unable to update your email right now.',
        ),
        'error',
      );
    } finally {
      submitButton?.removeAttribute('disabled');
    }
  }

  async sendPasswordReset() {
    const button = document.querySelector<HTMLButtonElement>(
      '#social-send-password-reset',
    );
    const originalButtonContent = button?.innerHTML;
    const email = String(this.userData?.email || '').trim();
    if (!email) return;

    this.setSecurityFeedback('#social-password-reset-feedback', '');
    button?.setAttribute('disabled', '');
    if (button) {
      button.innerHTML = `<i class="bi bi-hourglass-split"></i><span>${this.escapeHtml(
        this.getSocialTranslation('social.sendingPasswordReset', 'Sending...'),
      )}</span>`;
    }

    try {
      const response = await fetch(`${this.API_URL}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.error) {
        throw new Error(data.error?.message || data.error || 'PASSWORD_RESET_FAILED');
      }

      this.setSecurityFeedback(
        '#social-password-reset-feedback',
        this.getSocialTranslation(
          'social.passwordResetEmailSent',
          'Password reset email sent! Check your inbox.',
        ),
        'success',
      );
    } catch (error) {
      console.error('Password reset error:', error);
      this.setSecurityFeedback(
        '#social-password-reset-feedback',
        this.getSocialTranslation(
          'social.failedToSendResetEmail',
          'Failed to send reset email.',
        ),
        'error',
      );
    } finally {
      button?.removeAttribute('disabled');
      if (button && originalButtonContent) {
        button.innerHTML = originalButtonContent;
      }
    }
  }

  async loadAutoDownloadSettingsToUI() {
    await this.loadAutoDownloadSettings();

    const enabledCheckbox = document.querySelector<HTMLInputElement>(
      '#social-auto-download-enabled',
    );
    const intervalInput = document.querySelector<HTMLInputElement>(
      '#social-auto-download-interval',
    );

    if (enabledCheckbox) {
      enabledCheckbox.checked = this.autoDownloadEnabled;
    }
    if (intervalInput) {
      intervalInput.value = `${this.autoDownloadIntervalMs / (60 * 1000)}`;
    }
  }

  async updateAutoDownloadSettings() {
    const enabledCheckbox = document.querySelector<HTMLInputElement>(
      '#social-auto-download-enabled',
    );
    const intervalInput = document.querySelector<HTMLInputElement>(
      '#social-auto-download-interval',
    );

    if (!enabledCheckbox || !intervalInput) return;

    const enabled = enabledCheckbox.checked;
    const intervalMinutes = parseInt(intervalInput.value, 10);

    if (isNaN(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 60) {
      if (window.toastManager)
        window.toastManager.error('toasts.intervalMustBeBetween');
      return;
    }

    this.autoDownloadEnabled = enabled;
    this.autoDownloadIntervalMs = intervalMinutes * 60 * 1000;

    await this.saveAutoDownloadSettings();

    if (enabled && this.authToken) {
      this.startAutoDownloadCheck();
    } else {
      this.stopAutoDownloadCheck();
    }

    if (window.toastManager)
      window.toastManager.success('toasts.autoDownloadSettingsSaved');
  }

  async updateUsername() {
    const usernameInput = document.querySelector<HTMLInputElement>(
      '#social-edit-username',
    );
    if (!usernameInput || !this.authToken) return;

    const newUsername = usernameInput.value.trim();
    if (!newUsername) {
      if (window.toastManager)
        window.toastManager.error('toasts.usernameCannotBeEmpty');
      return;
    }

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/update-username`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            idToken: this.authToken,
            username: newUsername,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && !data.error) {
        if (this.userData && this.userData.localId) {
          await this.fetchWithAuth(
            `${this.API_URL}/write/users/${this.userData.localId}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: newUsername,
                _idToken: this.authToken,
              }),
            },
          );
        }

        const usernameEl = document.querySelector<HTMLElement>(
          '#social-profile-username',
        );
        if (usernameEl) usernameEl.textContent = newUsername;

        if (this.userData) {
          this.userData.displayName = newUsername;
          if (window.electronAPI?.store) {
            await window.electronAPI.store.set('social.userData', this.userData);
          }
          window.dispatchEvent(new CustomEvent('social-account-updated'));
        }

        if (window.toastManager)
          window.toastManager.success('toasts.usernameUpdated');
      } else {
        const errorMsg = data.error?.message || 'toasts.failedToUpdateUsername';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('Error updating username:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToUpdateUsername');
    }
  }

  async updatePrivacySettings() {
    const privacyVisibility = document.querySelector<HTMLInputElement>(
      '#social-privacy-visibility',
    );
    const privacySync = document.querySelector<HTMLInputElement>(
      '#social-privacy-sync',
    );

    if (!privacyVisibility || !privacySync || !this.authToken || !this.userData)
      return;

    const privacySettings = {
      modsVisibility: privacyVisibility.value,
      allowSync: privacySync.checked,
    };

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/update-user-privacy`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.userData.localId,
            idToken: this.authToken,
            privacySettings,
          }),
        },
      );

      const data = await response.json();

      if (response.ok && data.success) {
        if (window.toastManager)
          window.toastManager.success('toasts.privacySettingsUpdated');
      } else {
        const errorMsg = data.error || 'toasts.failedToUpdatePrivacySettings';
        if (window.toastManager) window.toastManager.error(errorMsg);
      }
    } catch (error) {
      console.error('Error updating privacy settings:', error);
      if (window.toastManager)
        window.toastManager.error('toasts.failedToUpdatePrivacySettings');
    }
  }

  async logout() {
    try {
      await fetch(`${this.API_URL}/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      this.authToken = null;
      this.userData = null;

      if (window.electronAPI && window.electronAPI.store) {
        try {
          await window.electronAPI.store.delete('social.authToken');
          await window.electronAPI.store.delete('social.userData');
        } catch (e) {}
      }

      window.dispatchEvent(new CustomEvent('social-account-updated'));

      const profileContainer = document.querySelector<HTMLElement>(
        '#social-profile-container',
      );
      if (profileContainer) profileContainer.style.display = 'none';

      const emailInput =
        document.querySelector<HTMLInputElement>('#social-email');
      const passInput =
        document.querySelector<HTMLInputElement>('#social-password');

      if (emailInput) emailInput.value = '';
      if (passInput) passInput.value = '';

      this.stopAutoDownloadCheck();

      this.showLoginScreen();

      if (window.toastManager)
        window.toastManager.success('toasts.loggedOutSuccessfully');
    } catch (error) {
      console.error('Logout error:', error);

      this.stopAutoDownloadCheck();
      const profileContainer = document.querySelector<HTMLElement>(
        '#social-profile-container',
      );
      if (profileContainer) profileContainer.style.display = 'none';
      window.dispatchEvent(new CustomEvent('social-account-updated'));
      this.showLoginScreen();
    }
  }

  startAutoDownloadCheck() {
    this.stopAutoDownloadCheck();

    this.loadAutoDownloadSettings().then(() => {
      if (!this.autoDownloadEnabled) {
        console.log('[Social] Auto-download is disabled');
        return;
      }

      console.log(
        `[Social] Starting auto-download check (interval: ${
          this.autoDownloadIntervalMs / 1000
        }s)`,
      );

      this.checkAndDownloadMods();

      this.autoDownloadInterval = setInterval(() => {
        this.checkAndDownloadMods();
      }, this.autoDownloadIntervalMs);
    });
  }

  stopAutoDownloadCheck() {
    if (this.autoDownloadInterval) {
      clearInterval(this.autoDownloadInterval);
      this.autoDownloadInterval = null;
      console.log('[Social] Stopped auto-download check');
    }
  }

  async loadAutoDownloadSettings() {
    try {
      if (window.electronAPI && window.electronAPI.store) {
        const enabled = (await window.electronAPI.store.get(
          'social.autoDownloadEnabled',
        )) as boolean | undefined;

        const intervalMinutes = (await window.electronAPI.store.get(
          'social.autoDownloadIntervalMinutes',
        )) as number;

        if (enabled !== undefined) {
          this.autoDownloadEnabled = enabled;
        }
        if (intervalMinutes !== undefined) {
          this.autoDownloadIntervalMs = intervalMinutes * 60 * 1000;
        }
      }
    } catch (e) {
      console.warn('Failed to load auto-download settings:', e);
    }
  }

  async checkAndDownloadMods() {
    if (!this.authToken || !this.userData) {
      console.log('[Social] No auth token, skipping auto-download check');
      return;
    }

    try {
      const userId = this.userData.localId;

      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
      const username = usernameEl ? usernameEl.textContent : null;

      const modsData = await this.fetchWithCache(
        `${this.API_URL}/list/links`,
        {},
        'links',
      );

      if (!modsData || (modsData.error && modsData.error.message)) {
        if (
          await this.handleServiceUnavailable(
            JSON.stringify(modsData),
            modsData.status || 500,
          )
        ) {
          return;
        }
        console.error('[Social] list/links request failed:', modsData);
        return;
      }

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (!Array.isArray(mods)) {
        console.error('[Social] Invalid mods data received');
        return;
      }

      const uninstalledMods = mods.filter((mod) => {
        const modUserId = mod.userId;
        const modPseudo = mod.pseudo;
        const isOwner =
          modUserId === userId || (username && modPseudo === username);
        const isInstalled = mod.modInstalled === true;
        const hasLink = mod.link && mod.link.trim() !== '';
        const link = mod.link ? mod.link.trim() : '';

        const isInstalling = this.installingMods.has(link);

        return isOwner && !isInstalled && hasLink && !isInstalling;
      });

      console.log(
        `[Social] Found ${uninstalledMods.length} uninstalled mod(s)`,
      );

      for (const mod of uninstalledMods) {
        const link = mod.link.trim();
        if (link) {
          this.installingMods.add(link);

          console.log(
            `[Social] Opening link for mod: ${mod.mod_name || 'Unknown'}`,
            link,
          );

          if (link.startsWith('fightplanner:')) {
            if (window.electronAPI && window.electronAPI.openFightPlannerLink) {
              await window.electronAPI.openFightPlannerLink(link);
            } else {
              console.error('[Social] openFightPlannerLink not available');

              this.installingMods.delete(link);
            }
          } else {
            if (window.electronAPI && window.electronAPI.openUrl) {
              await window.electronAPI.openUrl(link);
            }

            this.installingMods.delete(link);
          }

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    } catch (error) {
      console.error('[Social] Error checking mods:', error);
    }
  }

  async saveAutoDownloadSettings() {
    try {
      if (window.electronAPI && window.electronAPI.store) {
        await window.electronAPI.store.set(
          'social.autoDownloadEnabled',
          this.autoDownloadEnabled,
        );
        await window.electronAPI.store.set(
          'social.autoDownloadIntervalMinutes',
          this.autoDownloadIntervalMs / (60 * 1000),
        );
      }
    } catch (e) {
      console.warn('Failed to save auto-download settings:', e);
    }
  }

  setupProtocolListeners() {
    if (!window.electronAPI) return;

    window.electronAPI.onModInstallSuccess((data) => {
      console.log('[Social] Mod installed successfully:', data);

      if (data.url) {
        this.updateModInstalledStatus(data.url, data.downloadId);
        this.saveInstalledGameBananaDownloadToSocial(
          data.url,
          data.downloadId,
        );
      }
    });
  }

  async updateModInstalledStatus(downloadUrl, eventDownloadId = '') {
    if (!this.authToken || !this.userData) {
      console.log('[Social] No auth token, cannot update mod status');
      return;
    }

    try {
      const response = await this.fetchWithAuth(
        `${this.API_URL}/list/links`,
      );

      if (!response.ok) {
        const text = await response.text();
        if (await this.handleServiceUnavailable(text, response.status)) {
          return;
        }
        if (response.status === 429 || response.status === 404) {
          this.showServiceErrorModal(
            'modals.socialServiceUnavailable.title',
            'modals.socialServiceUnavailable.rateLimited',
          );
          return;
        }
        console.error('[Social] list/links update failed:', text);
        return;
      }

      const modsData = await response.json();

      // Handle both array and paginated response
      const mods = Array.isArray(modsData)
        ? modsData
        : modsData.documents || [];

      if (!Array.isArray(mods)) {
        console.error('[Social] Invalid mods data received');
        return;
      }

      const userId = this.userData.localId;
      const usernameEl = document.querySelector<HTMLElement>(
        '#social-profile-username',
      );
      const username = usernameEl ? usernameEl.textContent : null;

      for (const mod of mods) {
        const modUserId = mod.userId;
        const modPseudo = mod.pseudo;
        const isOwner =
          modUserId === userId || (username && modPseudo === username);

        if (!isOwner) continue;

        const link = mod.link ? mod.link.trim() : '';

        const downloadId =
          String(eventDownloadId || '') ||
          this.getDownloadIdFromGameBananaUrl(downloadUrl);
        const linkDownloadId = this.getDownloadIdFromGameBananaUrl(link);

        if (downloadId && downloadId === linkDownloadId) {
          console.log(
            `[Social] Updating modInstalled for mod: ${mod.id || mod.mod_name}`,
          );

          if (mod.id) {
            const now = new Date().toISOString();
            await this.fetchWithAuth(`${this.API_URL}/write/links/${mod.id}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                downloadedAt: now,
                modInstalled: true,
                updatedAt: now,
                _idToken: this.authToken,
              }),
            });

            this.invalidateCache('links');
            this.installingMods.delete(link);

            console.log(
              `[Social] ✅ Updated modInstalled to true for mod ID: ${mod.id}`,
            );
          }
          break;
        }
      }
    } catch (error) {
      console.error('[Social] Error updating modInstalled status:', error);
    }
  }

  showServiceErrorModal(titleKey, messageKey) {
    if (window.modalManager && window.modalManager.showAlert) {
      window.modalManager.showAlert('warning', titleKey, messageKey);
    } else if (window.toastManager) {
      const t = (k) => (window.i18n && window.i18n.t ? window.i18n.t(k) : k);
      window.toastManager.warning(t(messageKey));
    } else {
      const t = (k) => (window.i18n && window.i18n.t ? window.i18n.t(k) : k);
      alert(`${t(titleKey)}\n\n${t(messageKey)}`);
    }
  }

  showFirebaseDatabaseLimitModal() {
    const t = (k) => (window.i18n && window.i18n.t ? window.i18n.t(k) : k);
    const titleKey = 'modals.firebaseDatabaseLimit.title';
    const messageKey = 'modals.firebaseDatabaseLimit.message';
    const supportKey = 'modals.firebaseDatabaseLimit.support';
    const waitKey = 'modals.firebaseDatabaseLimit.wait';

    if (window.modalManager?.showCustomModal) {
      window.modalManager.showCustomModal({
        id: 'firebase-database-limit-modal',
        title: t(titleKey),
        body: `<p style="color: var(--text-secondary); line-height: 1.6; margin: 0;">${this.escapeHtml(t(messageKey))}</p>`,
        clickOverlayToClose: false,
        buttons: [
          {
            text: t(supportKey),
            type: 'primary',
            onClick: () => {
              window.electronAPI?.openUrl?.('https://ko-fi.com/firexdf');
            },
          },
          {
            text: t(waitKey),
            type: 'secondary',
          },
        ],
      });
      return;
    }

    this.showServiceErrorModal(titleKey, messageKey);
  }

  async handleServiceUnavailable(rawMessage, status) {
    const msg = (rawMessage || '').toString();
    const lowerMsg = msg.toLowerCase();
    const firebaseLimitReached =
      msg.includes('FIREBASE_DATABASE_LIMIT_REACHED') ||
      lowerMsg.includes('resource_exhausted') ||
      lowerMsg.includes('quota exceeded') ||
      lowerMsg.includes('limite de la base de donnees') ||
      lowerMsg.includes('limite de la base de données') ||
      lowerMsg.includes('firebase database limit') ||
      (lowerMsg.includes('cloud firestore api') &&
        lowerMsg.includes('quota'));

    if (firebaseLimitReached) {
      if (!this.serviceUnavailableShown) {
        this.serviceUnavailableShown = true;
        this.showFirebaseDatabaseLimitModal();
      }
      this.stopAutoDownloadCheck();
      return true;
    }

    const marker =
      msg.includes('Please check back later') ||
      msg.includes('Error 1027') ||
      status === 520 ||
      status === 527 ||
      status === 502 ||
      status === 503;

    if (!marker) return false;

    if (this.serviceUnavailableShown) return true;
    this.serviceUnavailableShown = true;

    if (window.modalManager && window.modalManager.showAlert) {
      window.modalManager.showAlert(
        'warning',
        this.getSocialTranslation(
          'social.serviceUnavailableTitle',
          'Service temporarily unavailable',
        ),
        this.getSocialTranslation(
          'social.serviceUnavailableMessage',
          'The Social service is temporarily unavailable (Error 1027). Please try again in a few minutes.',
        ),
      );
    } else if (window.toastManager) {
      window.toastManager.warning(
        this.getSocialTranslation(
          'social.serviceUnavailableMessage',
          'The Social service is temporarily unavailable (Error 1027). Please try again in a few minutes.',
        ),
      );
    }

    this.stopAutoDownloadCheck();
    return true;
  }
}
