import type { Metadata } from 'next';
import ImportClient from './import-client';

export const metadata: Metadata = { title: 'Import Transactions' };

export default function Page() {
  return <ImportClient />;
}
