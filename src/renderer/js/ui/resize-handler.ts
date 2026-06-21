class ResizeHandler {
  isResizing: boolean;
  currentPanel: HTMLElement | null;

  constructor() {
    this.isResizing = false;
    this.initResize();
  }

  initResize() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () =>
        this.setupResizeHandlers(),
      );
    } else {
      this.setupResizeHandlers();
    }
  }

  async loadSavedWidth() {
    try {
      const saved = await window.electronAPI.store.get('panelWidth');
      if (saved) {
        return saved;
      }
    } catch (error) {
      console.error('Failed to load panel width:', error);
    }
    return null;
  }

  async saveWidth(width) {
    try {
      await window.electronAPI.store.set('panelWidth', width);
    } catch (error) {
      console.error('Failed to save panel width:', error);
    }
  }

  async setupResizeHandlers() {
    const resizeHandle = document.querySelector<HTMLElement>('#resize-handle');
    const rightPanel = document.querySelector<HTMLElement>('#right-panel');

    if (resizeHandle && rightPanel) {
      await this.setupResizeForPanel(resizeHandle, rightPanel);
    }

    const resizeHandlePlugins = document.querySelector<HTMLElement>(
      '#resize-handle-plugins',
    );
    const rightPanelPlugins = document.querySelector<HTMLElement>(
      '#right-panel-plugins',
    );

    if (resizeHandlePlugins && rightPanelPlugins) {
      await this.setupResizeForPanel(resizeHandlePlugins, rightPanelPlugins);
    }
  }

  async setupResizeForPanel(resizeHandle, rightPanel) {
    const savedWidth = await this.loadSavedWidth();
    if (savedWidth) {
      rightPanel.style.width = `${savedWidth}px`;
    }

    resizeHandle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this.currentPanel = rightPanel;
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (
        !this.isResizing ||
        !this.currentPanel ||
        !this.currentPanel.parentElement
      )
        return;

      const containerWidth = this.currentPanel.parentElement.offsetWidth;
      const mouseX = e.clientX;

      const newWidth =
        containerWidth -
        mouseX +
        this.currentPanel.parentElement.getBoundingClientRect().left;

      const minWidth = 250;
      const maxWidth = 600;
      const constrainedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));

      this.currentPanel.style.width = `${constrainedWidth}px`;
    });

    document.addEventListener('mouseup', () => {
      if (this.isResizing && this.currentPanel) {
        this.isResizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        const currentWidth = parseInt(this.currentPanel.style.width, 10);
        if (!isNaN(currentWidth)) {
          this.saveWidth(currentWidth);
        }

        this.currentPanel = null;
      }
    });
  }
}

if (typeof window !== 'undefined') {
  window.resizeHandler = new ResizeHandler();
  console.log('Resize Handler initialized');
}

export { type ResizeHandler };
