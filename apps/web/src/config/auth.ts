const normalizePublicConfig = (value: string | undefined): string =>
  value?.trim() ?? "";

export const GOOGLE_CLIENT_ID = normalizePublicConfig(
  import.meta.env.VITE_GOOGLE_CLIENT_ID,
);
export const GOOGLE_OAUTH_ENABLED = GOOGLE_CLIENT_ID.length > 0;
export const RECAPTCHA_SITE_KEY = normalizePublicConfig(
  import.meta.env.VITE_RECAPTCHA_SITE_KEY,
);
export const RECAPTCHA_ENABLED = RECAPTCHA_SITE_KEY.length > 0;
