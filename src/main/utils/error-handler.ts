export const ErrorCodes = {
  MOD_NOT_FOUND: 'MOD_NOT_FOUND',
  MOD_READ_ERROR: 'MOD_READ_ERROR',
  MOD_SAVE_ERROR: 'MOD_SAVE_ERROR',
  MOD_DELETE_ERROR: 'MOD_DELETE_ERROR',
  MOD_RENAME_ERROR: 'MOD_RENAME_ERROR',
  MOD_INSTALL_ERROR: 'MOD_INSTALL_ERROR',
  PLUGIN_NOT_FOUND: 'PLUGIN_NOT_FOUND',
  PLUGIN_INSTALL_FAILED: 'PLUGIN_INSTALL_FAILED',
  PLUGIN_UPDATE_FAILED: 'PLUGIN_UPDATE_FAILED',
  PLUGIN_READ_ERROR: 'PLUGIN_READ_ERROR',
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  FOLDER_NOT_FOUND: 'FOLDER_NOT_FOUND',
  FILE_READ_ERROR: 'FILE_READ_ERROR',
  FILE_WRITE_ERROR: 'FILE_WRITE_ERROR',
  INVALID_PATH: 'INVALID_PATH',
  PROTOCOL_HANDLER_NOT_INITIALIZED: 'PROTOCOL_HANDLER_NOT_INITIALIZED',
  INVALID_PROTOCOL_LINK: 'INVALID_PROTOCOL_LINK',
  STORE_OPERATION_ERROR: 'STORE_OPERATION_ERROR',
  FTP_CONNECTION_ERROR: 'FTP_CONNECTION_ERROR',
  FTP_TRANSFER_ERROR: 'FTP_TRANSFER_ERROR',
  EMULATOR_LAUNCH_ERROR: 'EMULATOR_LAUNCH_ERROR',
  LOCALE_LOAD_ERROR: 'LOCALE_LOAD_ERROR',
  TUTORIAL_WINDOW_ERROR: 'TUTORIAL_WINDOW_ERROR',
  MIGRATION_ERROR: 'MIGRATION_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

export function handleError(error: Error, context: string) {
  const errorMessage = error?.message || String(error);
  const errorStack = error?.stack;

  console.error(`[${context}] Error:`, errorMessage);
  if (errorStack && process.env.NODE_ENV !== 'production') {
    console.error(`[${context}] Stack:`, errorStack);
  }

  return {
    error: errorMessage,
    context,
  };
}

export function createErrorResponse(
  code: string,
  message: string,
  details = {},
): {
  success: false;
  error: string;
  code: string;
  details: Record<string, unknown>;
} {
  return {
    success: false,
    error: message,
    code: code,
    details: details,
  };
}
