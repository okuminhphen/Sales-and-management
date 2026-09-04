export const BACKEND_URL = import.meta.env.VITE_API_ORIGIN ?? "";
export const API_BASE_URL = `${BACKEND_URL}/api/v1`;
export const BACKEND_WEBHOOK =
  import.meta.env.VITE_SOCKET_URL ?? (BACKEND_URL || window.location.origin);
