type ImportType = 'url' | 'webview' | 'image';

type EventPayload = Record<string, any>;

const log = (event: string, payload: EventPayload) => {
  // Placeholder for real analytics; keep data minimal and non-PII.
  // eslint-disable-next-line no-console
  if (__DEV__) console.log('[telemetry]', event, payload);
};

export const trackImportStarted = (importType: ImportType, domain?: string) =>
  log('recipe_import_started', { import_type: importType, domain });

export const trackImportFallbackWebviewShown = (domain?: string, reason?: string) =>
  log('recipe_import_fallback_webview_shown', { domain, reason });

export const trackImportCompleted = (
  importType: ImportType,
  domain?: string,
  usedWebview?: boolean,
  timeToDraftMs?: number,
) => log('recipe_import_completed', { import_type: importType, domain, used_webview: usedWebview, time_to_draft_ms: timeToDraftMs });

export const trackImportFailed = (
  importType: ImportType,
  domain?: string,
  errorCode?: string,
  nextActionReason?: string,
) =>
  log('recipe_import_failed', {
    import_type: importType,
    domain,
    error_code: errorCode,
    next_action_reason: nextActionReason,
  });

export default {
  trackImportStarted,
  trackImportFallbackWebviewShown,
  trackImportCompleted,
  trackImportFailed,
};

