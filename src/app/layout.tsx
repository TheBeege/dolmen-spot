import type { Metadata } from 'next';
import Script from 'next/script';
import './globals.css';

export const metadata: Metadata = {
  title: 'Dolmenwood Character Sheet',
  description: 'Digital character sheet for the Dolmenwood TTRPG by Necrotic Gnome',
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
