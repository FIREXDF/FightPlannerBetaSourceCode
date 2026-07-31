class SocialManager extends SocialSettingsManager {}

if (typeof window !== 'undefined') {
  window.socialManager = new SocialManager();
}

export { type SocialManager };

