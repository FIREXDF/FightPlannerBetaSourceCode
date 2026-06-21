import { PostHog } from 'posthog-node';
import { app } from 'electron';
import store from './store';
import * as crypto from 'crypto';
import * as os from 'os';

const POSTHOG_API_KEY = 'phc_pUseDLhd2V6C8Dv2ASg8Awx76S1AdI2Lzi2DiaieHEJ';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

let posthogClient: PostHog | null = null;
let distinctId: string = '';

function getDistinctId(): string {
    let id = store.get('posthog_distinct_id') as string | undefined;
    if (!id) {
        id = crypto.randomUUID();
        store.set('posthog_distinct_id', id);
    }
    return id;
}

export function isAnalyticsEnabled(): boolean {
    // Default to true if not explicitly set
    const enabled = store.get('analyticsEnabled');
    return enabled !== false;
}

export function setAnalyticsEnabled(enabled: boolean): void {
    store.set('analyticsEnabled', enabled);
    console.log(`[PostHog] Analytics ${enabled ? 'enabled' : 'disabled'}`);
}

export function initPosthog(): void {
    try {
        posthogClient = new PostHog(POSTHOG_API_KEY, {
            host: POSTHOG_HOST,
            flushAt: 5,
            flushInterval: 10000,
            enableExceptionAutocapture: true,
        });

        distinctId = getDistinctId();
        console.log('[PostHog] Initialized');
    } catch (error) {
        console.error('[PostHog] Init failed:', error);
    }
}

export function identifyUser(): void {
    if (!posthogClient || !isAnalyticsEnabled()) return;

    try {
        const appVersion = app.getVersion();

        posthogClient.identify({
            distinctId,
            properties: {
                app_version: appVersion,
                electron_version: process.versions.electron,
                node_version: process.versions.node,
                platform: process.platform,
                arch: process.arch,
                os_version: os.release(),
                locale: app.getLocale(),
                app_name: 'FightPlanner',
            },
        });

        console.log('[PostHog] User identified v' + appVersion);
    } catch (error) {
        console.error('[PostHog] Identify failed:', error);
    }
}

export function captureEvent(
    eventName: string,
    properties: Record<string, any> = {},
): void {
    if (!posthogClient || !isAnalyticsEnabled()) return;

    try {
        posthogClient.capture({
            distinctId,
            event: eventName,
            properties: {
                app_version: app.getVersion(),
                platform: process.platform,
                ...properties,
            },
        });
    } catch (error) {
        console.error('[PostHog] Capture failed:', error);
    }
}

export function captureError(
    error: Error | string,
    context: Record<string, any> = {},
): void {
    if (!posthogClient || !isAnalyticsEnabled()) return;

    try {
        const errorObj =
            typeof error === 'string' ? new Error(error) : error;

        posthogClient.captureException(errorObj, distinctId, {
            app_version: app.getVersion(),
            platform: process.platform,
            source: context.source || 'main',
            ...context,
        });

        console.log('[PostHog] Error captured: ' + errorObj.message);
    } catch (captureErr) {
        console.error('[PostHog] Error capture failed:', captureErr);
    }
}

export async function shutdownPosthog(): Promise<void> {
    if (!posthogClient) return;

    try {
        await posthogClient.shutdown();
        console.log('[PostHog] Shutdown complete');
    } catch (error) {
        console.error('[PostHog] Shutdown failed:', error);
    }
}

