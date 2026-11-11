import type { Metadata, Viewport } from 'next';
import { AppShell } from '@/components/AppShell';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Aurora Keys: virtual piano, arranger and piano tutor', template: '%s · Aurora Keys' },
  description:
    'Play a sampled grand piano with your laptop keyboard, add automatic accompaniment rhythms, and learn songs with falling notes and key-letter guidance. Free, no account, runs in your browser.',
};

export const viewport: Viewport = { themeColor: '#07080a', width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
