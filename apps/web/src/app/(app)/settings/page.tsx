import type { Metadata } from 'next';
import SettingsClient from './settings-client';

export const metadata: Metadata = { title: 'Settings' };

export default function Page() {
  return <SettingsClient />;
}
