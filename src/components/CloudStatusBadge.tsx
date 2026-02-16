'use client';

import { CloudMetadataEntry } from '@/lib/cloud/types';

interface Props {
  metadata: CloudMetadataEntry | null;
}

export default function CloudStatusBadge({ metadata }: Props) {
  if (!metadata) return null;

  return (
    <span
      className="text-[#c4a35a]/60 ml-1 flex-shrink-0"
      title={`Saved to ${metadata.provider === 'google-drive' ? 'Google Drive' : 'OneDrive'} on ${new Date(metadata.lastSaved).toLocaleString()}`}
    >
      <svg className="w-3.5 h-3.5 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4" />
      </svg>
    </span>
  );
}
