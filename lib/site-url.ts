/**
 * Absolute base URL of the public site, for links inside emails.
 * SITE_URL wins if set; NEXTAUTH_URL is already required for auth and is the
 * deployed origin in practice.
 */
export function siteUrl(): string {
  const raw =
    process.env.SITE_URL ||
    process.env.NEXTAUTH_URL ||
    "https://starlettattoos.ink";
  return raw.replace(/\/+$/, "");
}
