import type { Metadata } from 'next';
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
      </body>
    </html>
  );
}
