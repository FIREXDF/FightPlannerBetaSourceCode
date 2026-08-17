let socialInstallSharingNoticePromise: Promise<void> | null = null;

async function showSocialInstallSharingNoticeOnce() {
  if (socialInstallSharingNoticePromise) {
    return socialInstallSharingNoticePromise;
  }

  socialInstallSharingNoticePromise = (async () => {
    if (!window.electronAPI?.store || !window.modalManager?.showCustomModal) {
      return;
    }

    try {
      const [storedAuthToken, storedUserData, noticeSeen] = await Promise.all([
        window.electronAPI.store.get('social.authToken'),
        window.electronAPI.store.get('social.userData'),
        window.electronAPI.store.get('social.installSharingNoticeSeen'),
      ]);
      const socialManager = window.socialManager as any;
      const authToken = socialManager?.authToken || storedAuthToken;
      const userData = socialManager?.userData || storedUserData;

      if (!authToken || !userData || noticeSeen === true) {
        return;
      }

      await new Promise<void>((resolve) => {
        const body = document.createElement('div');
        body.className = 'social-install-sharing-notice';

        const message = document.createElement('p');
        message.className = 'social-install-sharing-message';
        message.textContent = window.i18n?.t
          ? window.i18n.t('modals.socialInstallSharing.message')
          : 'Future GameBanana installs will be shown on your Social profile.';

        const hint = document.createElement('p');
        hint.className = 'modal-hint';
        hint.textContent = window.i18n?.t
          ? window.i18n.t('modals.socialInstallSharing.hint')
          : 'You can turn this off anytime in Profile > Privacy, or hide individual mods from your profile.';

        body.append(message, hint);

        const saveChoice = async (shareInstalls: boolean) => {
          try {
            await Promise.all([
              window.electronAPI.store.set(
                'social.shareInstallsOnProfile',
                shareInstalls,
              ),
              window.electronAPI.store.set(
                'social.installSharingNoticeSeen',
                true,
              ),
            ]);

            const setting = document.querySelector<HTMLInputElement>(
              '#social-share-installs-on-profile',
            );
            if (setting) setting.checked = shareInstalls;
          } catch (error) {
            console.warn(
              '[Social] Failed to save install sharing preference:',
              error,
            );
          }
        };

        window.modalManager.showCustomModal({
          id: 'social-install-sharing-notice-modal',
          title: window.i18n?.t
            ? window.i18n.t('modals.socialInstallSharing.title')
            : 'Your installs and Social',
          body,
          clickOverlayToClose: false,
          escapeToClose: false,
          buttons: [
            {
              text: window.i18n?.t
                ? window.i18n.t('modals.socialInstallSharing.dontShare')
                : "Don't share installs",
              type: 'secondary',
              onClick: () => saveChoice(false),
            },
            {
              text: window.i18n?.t
                ? window.i18n.t('modals.socialInstallSharing.continue')
                : 'Continue',
              type: 'primary',
              onClick: () => saveChoice(true),
            },
          ],
          onClose: resolve,
        });
      });
    } catch (error) {
      console.warn('[Social] Failed to prepare install sharing notice:', error);
    }
  })();

  try {
    await socialInstallSharingNoticePromise;
  } finally {
    socialInstallSharingNoticePromise = null;
  }
}

if (window.electronAPI && window.electronAPI.onModInstallConfirmRequest) {
  window.electronAPI.onModInstallConfirmRequest(async (data) => {
    console.log('Received install confirmation request:', data);

    await showSocialInstallSharingNoticeOnce();

    let installConfirmEnabled = true;

    try {
      const setting = await window.electronAPI.store.get(
        'installConfirmEnabled',
      );
      console.log('Install confirm setting:', setting);

      if (setting === false) {
        installConfirmEnabled = false;
      }
    } catch (error) {
      console.error('Error checking install confirm setting:', error);
    }

    if (!installConfirmEnabled) {
      console.log('Install confirmation disabled, proceeding directly...');

      if (window.electronAPI) {
        await window.electronAPI.confirmProtocolInstall(
          data.url,
          data.downloadId,
        );
      }
    } else {
      console.log('Showing install confirmation modal');

      if (window.modalManager) {
        window.modalManager.openInstallConfirmModal(
          data.url,
          data.downloadId,
          data.modId,
          data.modType,
        );
      } else {
        console.error('Modal manager not available');
      }
    }
  });

  console.log('Protocol install listener initialized');
}

if (window.electronAPI && window.electronAPI.onGameBananaPairingSuccess) {
  window.electronAPI.onGameBananaPairingSuccess((data) => {
    if (window.toastManager) {
      window.toastManager.success('GameBanana account successfully paired. Listening for remote installs...', 5000);
    }
  });
}
