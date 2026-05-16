import type { Metadata } from 'next';
import Script from 'next/script';
import { Analytics } from '@vercel/analytics/next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dolmen Spot — Dolmenwood Character Sheet',
  description: 'Your spot for tracking your Dolmenwood character. An unofficial digital character sheet for the Dolmenwood TTRPG by Necrotic Gnome.',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        {children}
        <Analytics />
        {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="lazyOnload"
          />
        )}
      </body>
    </html>
  );
}
