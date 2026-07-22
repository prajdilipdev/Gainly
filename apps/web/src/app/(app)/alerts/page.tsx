import type { Metadata } from 'next';
import AlertsClient from './alerts-client';

export const metadata: Metadata = { title: 'Price Alerts' };

export default function Page() {
  return <AlertsClient />;
}
