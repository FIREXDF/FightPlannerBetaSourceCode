class MarketplaceDiscover extends SocialGameBananaManager {
  private started = false;
  private comingSoonEventsBound = false;
  private socialBackgroundAnimation: any = null;

  async initialize() {
    if (!document.querySelector('#social-discover-content')) return;
    this.setupComingSoonScreen();
  }

  private setupComingSoonScreen() {
    if (this.comingSoonEventsBound) return;

    const discoverButton = document.querySelector<HTMLButtonElement>(
      '#marketplace-go-to-discover',
    );
    if (!discoverButton) return;

    this.comingSoonEventsBound = true;
    this.loadSocialBackground();
    discoverButton.addEventListener('click', () => {
      void this.openDiscover();
    });
  }

  private loadSocialBackground() {
    const container = document.querySelector<HTMLElement>('#social-lottie');
    if (!container || !window.lottie || this.socialBackgroundAnimation) return;

    container.innerHTML = '';
    this.socialBackgroundAnimation = window.lottie.loadAnimation({
      container,
      renderer: 'svg',
      loop: true,
      autoplay: true,
      path: '../images/social.json',
    });
  }

  private async openDiscover() {
    const comingSoon = document.querySelector<HTMLElement>(
      '#marketplace-coming-soon',
    );
    const discover = document.querySelector<HTMLElement>(
      '#social-profile-container',
    );

    if (comingSoon) comingSoon.style.display = 'none';
    if (discover) discover.style.display = 'flex';
    if (this.socialBackgroundAnimation) {
      this.socialBackgroundAnimation.destroy();
      this.socialBackgroundAnimation = null;
    }
    if (this.started) return;

    this.started = true;
    this.setupGameBananaSearchEvents();
    await this.loadDiscover();
  }
}

if (typeof window !== 'undefined') {
  window.marketplaceDiscover = new MarketplaceDiscover();
  window.socialManager = window.marketplaceDiscover;
}

export { MarketplaceDiscover };
