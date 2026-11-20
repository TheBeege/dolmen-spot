'use client';

import './globals.css';
import ErrorScreen from '@/components/ErrorScreen';

// Last resort, for errors in the root layout or in app/error.tsx itself. It
// replaces the root layout, so it brings its own <html>, <body> and styles.
export default function GlobalError({ error, reset }: { error: unknown; reset: () => void }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <title>Something went wrong | Dolmen Spot</title>
        <ErrorScreen error={error} onTryAgain={reset} />
      </body>
    </html>
  );
}
