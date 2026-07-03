import { IpcMain } from 'electron';
import * as https from 'https';
import { randomBytes } from 'crypto';
import store from '../../store';
import { BaseHandlerArg } from '../../types/common';

export type FeedbackLogAttachment = {
  fileName: string;
  mimeType?: string | null;
  size: number;
  contentBase64: string;
};

export type FeedbackPayload = {
  type: 'bug' | 'feature' | 'feedback' | 'other';
  message: string;
  contact?: string | null;
  appVersion?: string | null;
  locale?: string | null;
  platform?: string | null;
  logAttachment?: FeedbackLogAttachment | null;
  logAttachments?: FeedbackLogAttachment[] | null;
};

export type FeedbackHandlers = typeof FeedbackHandlers;

const FEEDBACK_WORKER_URL =
  process.env.FIGHTPLANNER_FEEDBACK_WORKER_URL ||
  (store.get('feedbackWorkerUrl') as string | undefined) ||
  'https://fightplanner-feedback.nathancarlos19100.workers.dev/';

const MAX_MESSAGE_LENGTH = 4000;
const MAX_CONTACT_LENGTH = 200;
const MAX_LOG_ATTACHMENT_BYTES = 2 * 1024 * 1024;
const MAX_LOG_ATTACHMENTS = 5;

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

const sanitizeFileName = (value: unknown) =>
  String(value || 'fightplanner-log.txt')
    .replace(/[\\/:"*?<>|]+/g, '_')
    .trim()
    .slice(0, 120) || 'fightplanner-log.txt';

const postMultipart = (
  url: string,
  payload: Record<string, unknown>,
  attachments: FeedbackLogAttachment[],
): Promise<{ statusCode: number; body: string }> => {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const boundary = `----FightPlannerFeedback${randomBytes(12).toString('hex')}`;
    const chunks = [
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="payload_json"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n`,
      ),
    ];

    attachments.forEach((attachment) => {
      const fileBuffer = Buffer.from(attachment.contentBase64 || '', 'base64');
      const fileName = sanitizeFileName(attachment.fileName);
      const mimeType = sanitizeText(attachment.mimeType, 80) || 'text/plain';
      chunks.push(
        Buffer.from(
          `--${boundary}\r\nContent-Disposition: form-data; name="logs"; filename="${fileName}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        ),
        fileBuffer,
        Buffer.from('\r\n'),
      );
    });

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);

    const request = https.request(
      {
        hostname: target.hostname,
        path: `${target.pathname}${target.search}`,
        method: 'POST',
        port: target.port || 443,
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': body.length,
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
      const feedbackBody = {
        type,
        message,
        contact: sanitizeText(payload.contact, MAX_CONTACT_LENGTH) || null,
        appVersion: sanitizeText(payload.appVersion, 80) || null,
        locale: sanitizeText(payload.locale, 20) || null,
        platform: sanitizeText(payload.platform, 40) || process.platform,
        sentAt: new Date().toISOString(),
      };
      const attachments = (
        Array.isArray(payload.logAttachments)
          ? payload.logAttachments
          : payload.logAttachment
            ? [payload.logAttachment]
            : []
      )
        .filter((attachment) => attachment?.contentBase64)
        .slice(0, MAX_LOG_ATTACHMENTS);
      let response;

      if (attachments.length > 0) {
        if (
          attachments.some(
            (attachment) => attachment.size > MAX_LOG_ATTACHMENT_BYTES,
          )
        ) {
          return {
            success: false,
            error: 'Log file is too large',
          };
        }

        response = await postMultipart(workerUrl, feedbackBody, attachments);
      } else {
        response = await postJson(workerUrl, feedbackBody);
      }

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
