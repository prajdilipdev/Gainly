import type { Metadata } from 'next';
import RegisterClient from './register-client';

export const metadata: Metadata = { title: 'Create Account' };

export default function Page() {
  return <RegisterClient />;
}
