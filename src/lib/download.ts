/**
 * Offer `contents` to the player as a file download.
 *
 * The link is added to the page before clicking (some browsers ignore clicks
 * on detached links) and the object URL is revoked only after a minute,
 * because revoking it straight away can cancel a download that hasn't
 * started yet.
 */
export function downloadFile(fileName: string, contents: string | Blob, type = 'application/json'): void {
  const blob = typeof contents === 'string' ? new Blob([contents], { type }) : contents;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Local date and time for a file name, e.g. `2026-11-20-1837`. */
export function localFileStamp(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
