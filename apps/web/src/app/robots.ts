import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

/**
 * Only the marketing/auth entry points are crawlable. Everything behind the
 * session is private per-user data with no indexable value, so it is
 * explicitly disallowed rather than left to chance.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/login', '/register'],
      disallow: [
        '/dashboard',
        '/portfolios',
        '/watchlists',
        '/alerts',
        '/import',
        '/settings',
        '/api/',
      ],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
