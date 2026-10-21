/**
 * Returns a safe, same-site relative path for post-login redirects.
 * Rejects absolute URLs, protocol-relative URLs ("//evil.com"), backslash tricks,
 * and anything that is not a plain in-app path, to prevent open redirects.
 */
export function safeNext(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value) return fallback;
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//") || value.includes("\\")) return fallback;
  if (/[\u0000-\u001f]/.test(value)) return fallback;
  // Never bounce back into the auth pages (prevents redirect loops).
  if (value.startsWith("/sign-in") || value.startsWith("/sign-up")) return fallback;
  return value;
}
