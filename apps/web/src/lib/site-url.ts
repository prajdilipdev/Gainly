/**
 * Resolves the app's public base URL for metadata, robots.txt, and the
 * sitemap. Preference order:
 *   1. NEXT_PUBLIC_SITE_URL — set this explicitly once you have a custom
 *      domain, or to override anything below.
 *   2. VERCEL_PROJECT_PRODUCTION_URL — Vercel sets this automatically to
 *      your production domain (e.g. gainly.vercel.app), no config needed.
 *   3. VERCEL_URL — Vercel's per-deployment URL (covers preview builds).
 *   4. localhost, for local development.
 *
 * All of these are plain (non-NEXT_PUBLIC_) Vercel system env vars, but this
 * module is only ever imported from server-only files (layout metadata,
 * robots.ts, sitemap.ts), so reading them here does not leak into the
 * client bundle.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit;

  const vercelHost =
    process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`;

  return 'http://localhost:3000';
}
