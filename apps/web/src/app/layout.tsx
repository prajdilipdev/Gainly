import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';
import { getSiteUrl } from '@/lib/site-url';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

const SITE_URL = getSiteUrl();
const DESCRIPTION =
  'Gainly: track US (NYSE/NASDAQ) and Indian (NSE/BSE) stock portfolios with live prices, analytics, alerts, and smart imports.';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Gainly — Stock Portfolio Tracker',
    template: '%s | Gainly',
  },
  description: DESCRIPTION,
  applicationName: 'Gainly',
  openGraph: {
    type: 'website',
    siteName: 'Gainly',
    title: 'Gainly — Stock Portfolio Tracker',
    description: DESCRIPTION,
    url: SITE_URL,
  },
  twitter: {
    card: 'summary',
    title: 'Gainly — Stock Portfolio Tracker',
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
