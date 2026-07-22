import type { Metadata } from 'next';
import PortfoliosClient from './portfolios-client';

export const metadata: Metadata = { title: 'Portfolios' };

export default function Page() {
  return <PortfoliosClient />;
}
