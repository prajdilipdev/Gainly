import type { NextConfig } from 'next';

/**
 * Origin of the backend API. Normalised so that common ways of writing the
 * value all resolve to the same thing — otherwise a trailing slash produces
 * `host//api/v1/...` and pasting the full API base produces
 * `host/api/v1/api/v1/...`, both of which 404 in confusing ways.
 * Accepts: https://host, https://host/, https://host/api/v1, https://host/api/v1/
 */
function normaliseApiUrl(raw: string): string {
  return raw
    .trim()
    .replace(/\/+$/, '') // drop trailing slashes
    .replace(/\/api\/v1$/, ''); // drop an accidentally-included API base path
}

const API_URL = normaliseApiUrl(
  process.env.API_URL ?? 'http://localhost:4000',
);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // 'standalone' packages a self-contained server for Docker (see
  // apps/web/Dockerfile). Vercel has its own build/output pipeline and does
  // not need — and can misbehave with — this mode, so only apply it when
  // building outside Vercel (e.g. `docker build` or a plain `next build`
  // on a VPS).
  ...(process.env.VERCEL ? {} : { output: 'standalone' as const }),
  async rewrites() {
    // Proxy API calls through the web origin so the httpOnly refresh cookie
    // works without cross-site cookie headaches.
    return [
      {
        source: '/api/v1/:path*',
        destination: `${API_URL}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            // 'unsafe-inline'/'unsafe-eval' are required by Next.js runtime
            // scripts; everything else is locked to same-origin.
            key: 'Content-Security-Policy',
            value:
              "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
