import { IpcMain } from 'electron';
import { captureEvent, captureError, isAnalyticsEnabled, setAnalyticsEnabled } from '../../posthog';

export interface AnalyticsHandlers {
    'analytics-track-event': (
        event: Electron.IpcMainInvokeEvent,
        eventName: string,
        properties?: Record<string, any>,
    ) => void;
    'analytics-track-error': (
        event: Electron.IpcMainInvokeEvent,
        errorMessage: string,
        errorStack: string,
        context?: Record<string, any>,
    ) => void;
    'analytics-test-error': (
        event: Electron.IpcMainInvokeEvent,
    ) => { success: boolean };
    'analytics-test-event': (
        event: Electron.IpcMainInvokeEvent,
    ) => { success: boolean };
    'analytics-get-enabled': (
        event: Electron.IpcMainInvokeEvent,
    ) => Promise<boolean>;
    'analytics-set-enabled': (
        event: Electron.IpcMainInvokeEvent,
        enabled: boolean,
    ) => void;
    [key: string]: (...args: any[]) => any;
}

export function registerAnalyticsHandlers(ipcMain: IpcMain): void {
    ipcMain.handle(
        'analytics-track-event',
        (_event, eventName: string, properties: Record<string, any> = {}) => {
            captureEvent(eventName, properties);
        },
    );

    ipcMain.handle(
        'analytics-track-error',
        (
            _event,
            errorMessage: string,
            errorStack: string,
            context: Record<string, any> = {},
        ) => {
            const error = new Error(errorMessage);
            error.stack = errorStack;
            captureError(error, { source: 'renderer', ...context });
        },
    );

    ipcMain.handle('analytics-test-error', () => {
        const testError = new Error('PostHog test error from main process');
        captureError(testError, { source: 'main', test: true });
        return { success: true };
    });

    ipcMain.handle('analytics-test-event', () => {
        captureEvent('test_event', { source: 'developer_options', test: true });
        return { success: true };
    });

    ipcMain.handle('analytics-get-enabled', () => {
        return isAnalyticsEnabled();
    });

    ipcMain.handle('analytics-set-enabled', (_event, enabled: boolean) => {
        setAnalyticsEnabled(enabled);
    });
}
