function setupErrorTracking() {
    (window as any).onerror = (
        message: string,
        source: string,
        lineno: number,
        colno: number,
        error: Error | undefined,
    ) => {
        if ((window as any).electronAPI && (window as any).electronAPI.trackError) {
            (window as any).electronAPI.trackError(
                error?.message || String(message),
                error?.stack || `${source}:${lineno}:${colno}`,
                { source: 'renderer', type: 'window.onerror' },
            );
        }
    };

    (window as any).onunhandledrejection = (event: PromiseRejectionEvent) => {
        if ((window as any).electronAPI && (window as any).electronAPI.trackError) {
            const error = event.reason;
            (window as any).electronAPI.trackError(
                error?.message || String(error),
                error?.stack || '',
                { source: 'renderer', type: 'unhandledrejection' },
            );
        }
    };
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupErrorTracking);
} else {
    setupErrorTracking();
}
