const normalizePublicConfig = (value: string | undefined): string =>
  value?.trim() ?? "";

export const GOOGLE_CLIENT_ID = normalizePublicConfig(
  import.meta.env.VITE_GOOGLE_CLIENT_ID,
);
// Database V2 intentionally has no immutable OAuth provider subject yet.
// Keep the UI fail-closed even if an old client ID remains in a local env.
export const GOOGLE_OAUTH_ENABLED = false;
export const RECAPTCHA_SITE_KEY = normalizePublicConfig(
  import.meta.env.VITE_RECAPTCHA_SITE_KEY,
);
export const RECAPTCHA_ENABLED = RECAPTCHA_SITE_KEY.length > 0;
