type RemoteAnnouncementType = 'success' | 'info' | 'warning' | 'error';

interface RemoteAnnouncement {
  showModal: boolean;
  showOnce?: boolean;
  id: string;
  title: string;
  message: string;
  image?: string;
  type?: RemoteAnnouncementType;
  version?: string;
  versionAtLeast?: string;
  versionBelow?: string;
}

const ANNOUNCEMENT_URL =
  'https://raw.githubusercontent.com/FightPlanner/.github/refs/heads/main/v4.json';
const SEEN_STORAGE_PREFIX = 'fightplanner:remote-announcement:seen:';

class RemoteAnnouncementManager {
  async checkOnStartup() {
    try {
      const currentVersion = await this.getCurrentVersion();
      const announcement = await this.fetchAnnouncement(currentVersion);
      if (!announcement || !this.shouldShow(announcement)) {
        return;
      }

      this.showAnnouncement(announcement);
    } catch (error) {
      console.warn('[RemoteAnnouncement] Failed to load announcement:', error);
    }
  }

  private async fetchAnnouncement(
    currentVersion: string | null,
  ): Promise<RemoteAnnouncement | null> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(ANNOUNCEMENT_URL, {
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();
      if (!text.trim()) {
        throw new Error('Empty announcement response');
      }

      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Invalid announcement JSON: ${message}`);
      }

      return this.selectAnnouncement(data, currentVersion);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  private selectAnnouncement(
    data: unknown,
    currentVersion: string | null,
  ): RemoteAnnouncement | null {
    const announcements = this.normalizeAnnouncements(data);
    return (
      announcements.find((announcement) =>
        this.matchesCurrentVersion(announcement, currentVersion),
      ) || null
    );
  }

  private normalizeAnnouncements(data: unknown): RemoteAnnouncement[] {
    if (!data || typeof data !== 'object') {
      return [];
    }

    const raw = data as Record<string, unknown>;
    const rawAnnouncements = Array.isArray(raw.announcements)
      ? raw.announcements
      : [data];

    return rawAnnouncements
      .map((announcement) => this.normalizeAnnouncement(announcement))
      .filter(
        (announcement): announcement is RemoteAnnouncement =>
          announcement !== null,
      );
  }

  private normalizeAnnouncement(data: unknown): RemoteAnnouncement | null {
    if (!data || typeof data !== 'object') {
      return null;
    }

    const raw = data as Record<string, unknown>;
    const showModal = raw.showModal === true;
    const id = typeof raw.id === 'string' ? raw.id.trim() : '';
    const title = typeof raw.title === 'string' ? raw.title.trim() : '';
    const message = this.normalizeMessage(raw.message);
    const image = typeof raw.image === 'string' ? raw.image.trim() : '';
    const type = this.normalizeType(raw.type);
    const version = this.normalizeVersionGate(raw.version);
    const versionAtLeast = this.normalizeVersionGate(
      raw.versionAtLeast || raw.minVersion,
    );
    const versionBelow = this.normalizeVersionGate(
      raw.versionBelow || raw.belowVersion || raw.maxVersion,
    );

    if (!showModal || !id || !title || !message) {
      return null;
    }

    return {
      showModal,
      showOnce: raw.showOnce !== false,
      id,
      title,
      message,
      image: this.isHttpUrl(image) ? image : undefined,
      type,
      version,
      versionAtLeast,
      versionBelow,
    };
  }

  private normalizeType(type: unknown): RemoteAnnouncementType {
    if (
      type === 'success' ||
      type === 'warning' ||
      type === 'error' ||
      type === 'info'
    ) {
      return type;
    }

    return 'info';
  }

  private normalizeMessage(message: unknown) {
    if (typeof message === 'string') {
      return message.replace(/\\n/g, '\n').trim();
    }

    if (Array.isArray(message)) {
      return message
        .filter((line): line is string => typeof line === 'string')
        .join('\n')
        .replace(/\\n/g, '\n')
        .trim();
    }

    return '';
  }

  private normalizeVersionGate(value: unknown) {
    if (typeof value !== 'string') {
      return undefined;
    }

    const version = value.trim();
    return version ? version : undefined;
  }

  private async getCurrentVersion() {
    try {
      const versionInfo = await window.electronAPI?.getAppVersion?.();
      return typeof versionInfo?.version === 'string'
        ? versionInfo.version
        : null;
    } catch (error) {
      console.warn('[RemoteAnnouncement] Failed to read app version:', error);
      return null;
    }
  }

  private matchesCurrentVersion(
    announcement: RemoteAnnouncement,
    currentVersion: string | null,
  ) {
    if (
      !announcement.version &&
      !announcement.versionAtLeast &&
      !announcement.versionBelow
    ) {
      return true;
    }

    if (!currentVersion) {
      return false;
    }

    if (
      announcement.version &&
      this.compareVersions(currentVersion, announcement.version) !== 0
    ) {
      return false;
    }

    if (
      announcement.versionAtLeast &&
      this.compareVersions(currentVersion, announcement.versionAtLeast) < 0
    ) {
      return false;
    }

    if (
      announcement.versionBelow &&
      this.compareVersions(currentVersion, announcement.versionBelow) >= 0
    ) {
      return false;
    }

    return true;
  }

  private compareVersions(left: string, right: string) {
    const parsedLeft = this.parseVersion(left);
    const parsedRight = this.parseVersion(right);

    for (let index = 0; index < 3; index += 1) {
      const diff = parsedLeft.numbers[index] - parsedRight.numbers[index];
      if (diff !== 0) {
        return diff;
      }
    }

    return this.comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease);
  }

  private parseVersion(version: string) {
    const [core, prerelease = ''] = version.trim().replace(/^v/i, '').split('-');
    const numbers = core.split('.').map((part) => {
      const value = Number.parseInt(part, 10);
      return Number.isFinite(value) ? value : 0;
    });

    return {
      numbers: [numbers[0] || 0, numbers[1] || 0, numbers[2] || 0],
      prerelease: prerelease
        .split('.')
        .map((part) => part.trim())
        .filter(Boolean),
    };
  }

  private comparePrerelease(left: string[], right: string[]) {
    if (left.length === 0 && right.length === 0) {
      return 0;
    }

    if (left.length === 0) {
      return 1;
    }

    if (right.length === 0) {
      return -1;
    }

    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const leftPart = left[index];
      const rightPart = right[index];

      if (leftPart === undefined) {
        return -1;
      }

      if (rightPart === undefined) {
        return 1;
      }

      const diff = this.comparePrereleasePart(leftPart, rightPart);
      if (diff !== 0) {
        return diff;
      }
    }

    return 0;
  }

  private comparePrereleasePart(left: string, right: string) {
    const leftNumber = Number.parseInt(left, 10);
    const rightNumber = Number.parseInt(right, 10);
    const leftIsNumber = String(leftNumber) === left;
    const rightIsNumber = String(rightNumber) === right;

    if (leftIsNumber && rightIsNumber) {
      return leftNumber - rightNumber;
    }

    if (leftIsNumber) {
      return -1;
    }

    if (rightIsNumber) {
      return 1;
    }

    return left.localeCompare(right);
  }

  private shouldShow(announcement: RemoteAnnouncement) {
    if (!announcement.showOnce) {
      return true;
    }

    return (
      localStorage.getItem(this.getSeenStorageKey(announcement.id)) !== '1'
    );
  }

  private showAnnouncement(announcement: RemoteAnnouncement) {
    if (!window.modalManager?.showCustomModal) {
      return;
    }

    const body = document.createElement('div');
    body.className = 'remote-announcement-body';

    if (announcement.image) {
      const image = document.createElement('img');
      image.className = 'remote-announcement-image';
      image.src = announcement.image;
      image.alt = '';
      body.appendChild(image);
    }

    const message = document.createElement('p');
    message.className = 'remote-announcement-message';
    this.appendLinkedText(message, announcement.message);
    body.appendChild(message);

    const modal = window.modalManager.showCustomModal({
      id: `remote-announcement-${announcement.id}`,
      title: announcement.title,
      body,
      size: 'announcement',
      buttons: [
        {
          text: 'Close',
          type: 'primary',
        },
      ],
      onClose: () => this.markSeen(announcement),
    });

    modal.classList.add(
      'remote-announcement-modal',
      `remote-announcement-${announcement.type || 'info'}`,
    );

    const icon = this.getIconForType(announcement.type || 'info');
    const headerTitle = modal.querySelector<HTMLElement>('.modal-header h3');
    if (headerTitle && icon) {
      const iconEl = document.createElement('i');
      iconEl.className = `bi ${icon}`;
      headerTitle.prepend(iconEl);
    }

    this.markSeen(announcement);
  }

  private appendLinkedText(parent: HTMLElement, text: string) {
    const urlPattern = /(https?:\/\/[^\s]+)/g;
    let lastIndex = 0;

    for (const match of text.matchAll(urlPattern)) {
      const url = match[0];
      const index = match.index || 0;

      if (index > lastIndex) {
        parent.appendChild(
          document.createTextNode(text.slice(lastIndex, index)),
        );
      }

      const link = document.createElement('a');
      link.href = url;
      link.textContent = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      parent.appendChild(link);

      lastIndex = index + url.length;
    }

    if (lastIndex < text.length) {
      parent.appendChild(document.createTextNode(text.slice(lastIndex)));
    }
  }

  private markSeen(announcement: RemoteAnnouncement) {
    if (announcement.showOnce) {
      localStorage.setItem(this.getSeenStorageKey(announcement.id), '1');
    }
  }

  private getSeenStorageKey(id: string) {
    return `${SEEN_STORAGE_PREFIX}${id}`;
  }

  private isHttpUrl(value: string) {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private getIconForType(type: RemoteAnnouncementType) {
    switch (type) {
      case 'success':
        return null;
      case 'warning':
        return 'bi-exclamation-triangle-fill';
      case 'error':
        return 'bi-x-circle-fill';
      case 'info':
      default:
        return 'bi-info-circle-fill';
    }
  }
}

if (typeof window !== 'undefined') {
  window.remoteAnnouncementManager = new RemoteAnnouncementManager();
}

export { RemoteAnnouncementManager };
