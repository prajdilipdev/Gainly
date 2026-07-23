import type { Metadata } from 'next';
import PortfolioDetailClient from './portfolio-detail-client';

export const metadata: Metadata = { title: 'Portfolio' };

export default function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <PortfolioDetailClient params={params} />;
}
