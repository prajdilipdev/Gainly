import type { Metadata } from 'next';
import WatchlistsClient from './watchlists-client';

export const metadata: Metadata = { title: 'Watchlists' };

export default function Page() {
  return <WatchlistsClient />;
}
