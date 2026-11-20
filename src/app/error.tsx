'use client';

import ErrorScreen from '@/components/ErrorScreen';

// Shown in place of a page that throws while rendering, so one bad value can't
// blank the whole app. `reset` re-renders the page from the saved data; the
// error comes from data already in the browser, so there's nothing to refetch.
export default function ErrorPage({ error, reset }: { error: unknown; reset: () => void }) {
  return <ErrorScreen error={error} onTryAgain={reset} />;
}
