type RemoteAnnouncementType = 'success' | 'info' | 'warning' | 'error';

interface RemoteAnnouncement {
  showModal: boolean;
  showOnce?: boolean;
  id: string;
  title: string;
  message: string;
  image?: string;
  type?: RemoteAnnouncementType;
}

const ANNOUNCEMENT_URL =
  'https://raw.githubusercontent.com/FightPlanner/.github/refs/heads/main/v4.json';
const SEEN_STORAGE_PREFIX = 'fightplanner:remote-announcement:seen:';

class RemoteAnnouncementManager {
  async checkOnStartup() {
    try {
      const announcement = await this.fetchAnnouncement();
      if (!announcement || !this.shouldShow(announcement)) {
        return;
      }

      this.showAnnouncement(announcement);
    } catch (error) {
      console.warn('[RemoteAnnouncement] Failed to load announcement:', error);
    }
  }

  private async fetchAnnouncement(): Promise<RemoteAnnouncement | null> {
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

      const data = await response.json();
      return this.normalizeAnnouncement(data);
    } finally {
      window.clearTimeout(timeout);
    }
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
