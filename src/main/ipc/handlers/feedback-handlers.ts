import { IpcMain } from 'electron';
import * as https from 'https';
import store from '../../store';
import { BaseHandlerArg } from '../../types/common';

export type FeedbackPayload = {
  type: 'bug' | 'feature' | 'feedback' | 'other';
  message: string;
  contact?: string | null;
  appVersion?: string | null;
  locale?: string | null;
  platform?: string | null;
};

export type FeedbackHandlers = typeof FeedbackHandlers;

const FEEDBACK_WORKER_URL =
  process.env.FIGHTPLANNER_FEEDBACK_WORKER_URL ||
  (store.get('feedbackWorkerUrl') as string | undefined) ||
  'https://fightplanner-feedback.nathancarlos19100.workers.dev/';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTACT_LENGTH = 200;

const sanitizeText = (value: unknown, maxLength: number) =>
  String(value || '')
    .trim()
    .slice(0, maxLength);

const postJson = (
  url: string,
  payload: Record<string, unknown>,
): Promise<{ statusCode: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const body = JSON.stringify(payload);

    const request = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        port: target.port || 443,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (response) => {
        let responseBody = '';

        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          responseBody += chunk;
        });
        response.on('end', () => {
          resolve({
            statusCode: response.statusCode || 0,
            body: responseBody,
          });
        });
      },
    );

    request.on('error', reject);
    request.write(body);
    request.end();
  });
};

const FeedbackHandlers = {
  ['submit-feedback']: async (
    common: BaseHandlerArg,
    payload: FeedbackPayload,
  ) => {
    const workerUrl = sanitizeText(FEEDBACK_WORKER_URL, 500);
    if (!workerUrl) {
      return {
        success: false,
        error: 'Feedback worker URL is not configured',
      };
    }

    const type = ['bug', 'feature', 'feedback', 'other'].includes(payload.type)
      ? payload.type
      : 'feedback';
    const message = sanitizeText(payload.message, MAX_MESSAGE_LENGTH);

    if (message.length < 10) {
      return {
        success: false,
        error: 'Feedback message is too short',
      };
    }

    try {
      const response = await postJson(workerUrl, {
        type,
        message,
        contact: sanitizeText(payload.contact, MAX_CONTACT_LENGTH) || null,
        appVersion: sanitizeText(payload.appVersion, 80) || null,
        locale: sanitizeText(payload.locale, 20) || null,
        platform: sanitizeText(payload.platform, 40) || process.platform,
        sentAt: new Date().toISOString(),
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        return {
          success: false,
          error: `Feedback service returned ${response.statusCode}`,
        };
      }

      return { success: true };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to submit feedback';
      return { success: false, error: message };
    }
  },
};

export function registerFeedbackHandlers(ipcMain: IpcMain) {
  Object.entries(FeedbackHandlers).forEach(([channel, handler]) => {
    ipcMain.handle(channel, (event, ...args) =>
      handler({ event }, ...(args as [FeedbackPayload])),
    );
  });
}
