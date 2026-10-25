/**
 * Utility for resolving Supabase Authentication redirect URLs and
 * normalizing incoming auth hash fragments for HashRouter.
 */

/**
 * Returns the fully qualified redirect URL for Supabase Auth flows
 * (email confirmation, password recovery, magic link).
 *
 * It dynamically derives the destination from:
 * 1. Explicit VITE_APP_URL or VITE_SITE_URL environment variable if set.
 * 2. The active browser window.location.origin + deployment pathname (e.g., GitHub Pages subpath).
 *
 * Since the app uses HashRouter, routes are formatted as `<base>/#/<route>`.
 */
export function getAuthRedirectUrl(route: string = '/confirm-email'): string {
  const envUrl = (
    (import.meta.env.VITE_APP_URL as string | undefined) ||
    (import.meta.env.VITE_SITE_URL as string | undefined)
  )?.trim();

  let baseUrl = '';

  if (envUrl) {
    baseUrl = envUrl.replace(/\/+$/, '');
  } else if (typeof window !== 'undefined' && window.location) {
    const origin = window.location.origin;
    // Strip trailing slash and any trailing hash/query from the pathname
    const pathname = window.location.pathname.replace(/\/+$/, '');
    baseUrl = `${origin}${pathname}`;
  }

  const cleanRoute = route.startsWith('/') ? route : `/${route}`;
  return `${baseUrl}/#${cleanRoute}`;
}

/**
 * Normalizes incoming Supabase auth fragments for HashRouter.
 *
 * When Supabase redirects following email confirmation or an error, it appends
 * tokens or errors directly to the hash fragment, e.g.:
 *   #access_token=...&type=signup
 *   #error=access_denied&error_code=otp_expired&error_description=...
 *
 * In a HashRouter app, HashRouter treats the entire hash as the router path.
 * When the hash begins with `#access_token=` or `#error=`, it fails to match
 * `#/confirm-email` or `#/auth/callback`.
 *
 * This function intercepts raw auth fragments and rewrites the hash to
 * `#/confirm-email?<params>` so React Router immediately mounts the
 * ConfirmEmail component and allows it to process the credentials or display
 * the appropriate recovery UI.
 */
export function normalizeAuthRedirectHash(): void {
  if (typeof window === 'undefined') return;

  const rawHash = window.location.hash || '';
  const search = window.location.search || '';

  // Case A: Hash contains auth tokens or auth errors but is not prefixed with a recognized route
  const isRawAuthHash =
    rawHash.startsWith('#') &&
    !rawHash.startsWith('#/') &&
    (rawHash.includes('access_token=') ||
      rawHash.includes('error=') ||
      rawHash.includes('error_code=') ||
      rawHash.includes('token_hash=') ||
      rawHash.includes('type=signup') ||
      rawHash.includes('type=recovery') ||
      rawHash.includes('type=invite') ||
      rawHash.includes('type=email'));

  if (isRawAuthHash) {
    const paramsString = rawHash.substring(1);
    // Replace hash so HashRouter routes to /confirm-email with params as search query
    window.location.hash = `#/confirm-email?${paramsString}`;
    return;
  }

  // Case B: Search query contains PKCE code or auth error while hash is empty or at root
  const urlParams = new URLSearchParams(search);
  const hasAuthSearchParams =
    urlParams.has('code') ||
    urlParams.has('token_hash') ||
    urlParams.has('error') ||
    urlParams.has('error_code') ||
    urlParams.has('error_description');

  if (hasAuthSearchParams && (!rawHash || rawHash === '#' || rawHash === '#/')) {
    // Forward the search parameters into the hash route
    window.location.hash = `#/confirm-email${search}`;
  }
}
