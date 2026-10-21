export interface SafeExternalUrl {
  href: string;
  host: string;
}

/**
 * Validates an external learning link. Only http(s) is allowed; schemes such as
 * javascript:, data:, file: and vbscript: are rejected, as are URLs with
 * embedded credentials. Returns the normalised URL and its host so the UI can
 * clearly show where the link leads.
 */
export function validateExternalUrl(raw: string | null | undefined): SafeExternalUrl | null {
  if (!raw) return null;
  const value = raw.trim();
  if (value.length === 0 || value.length > 1000) return null;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!url.hostname || !url.hostname.includes(".")) return null;

  return { href: url.toString(), host: url.hostname.replace(/^www\./, "") };
}
