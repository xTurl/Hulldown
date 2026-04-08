const WG_ERROR_MAP: Record<string, string> = {
  SOURCE_NOT_AVAILABLE:     'WG statistics server is temporarily unavailable. Please try again in a moment.',
  INVALID_APPLICATION_ID:   'API key is invalid or missing. Please contact support.',
  REQUEST_LIMIT_EXCEEDED:   'Too many requests. Please wait a moment and try again.',
  APPLICATION_IS_BLOCKED:   'API application is blocked. Please contact support.',
  INVALID_IP_ADDRESS:       'IP address not allowed by WG API.',
  SEARCH_NOT_SPECIFIED:     'Search query is missing.',
  NOT_ENOUGH_SEARCH_LENGTH: 'Search query is too short.',
};

export function friendlyWgError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e);
  return WG_ERROR_MAP[msg] ?? `${fallback}: ${msg}`;
}
