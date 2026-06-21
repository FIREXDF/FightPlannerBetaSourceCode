import { IpcMainInvokeEvent } from 'electron';

export type HandlerResponse<SuccessData extends {} = {}> = Promise<
  | (SuccessData & {
      success: true;
    })
  | {
      success: false;
      error?: string;
      code?: string;
      details?: Record<string, unknown>;
      canceled?: boolean;
    }
>;

export type BaseHandlerArg<data extends Record<string, unknown> = {}> = {
  event: IpcMainInvokeEvent;
} & data;

export type GenericHandler<T extends {} = {}> = (
  common: BaseHandlerArg<T>,
  ...args: unknown[]
) => unknown;

export type ParamsWithoutFirstArg<T extends (...args: any[]) => any> =
  Parameters<T> extends [any, ...infer Rest] ? Rest : [];
