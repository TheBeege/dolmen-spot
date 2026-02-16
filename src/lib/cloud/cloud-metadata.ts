import { CloudMetadataEntry } from './types';

const STORAGE_KEY = 'dolmenwood-cloud-metadata';

type CloudMetadataMap = Record<string, CloudMetadataEntry>;

function loadMetadata(): CloudMetadataMap {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    return data ? JSON.parse(data) : {};
  } catch {
    return {};
  }
}

function saveMetadata(metadata: CloudMetadataMap): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(metadata));
}

export function getCloudMetadata(characterId: string): CloudMetadataEntry | null {
  const metadata = loadMetadata();
  return metadata[characterId] ?? null;
}

export function setCloudMetadata(characterId: string, entry: CloudMetadataEntry): void {
  const metadata = loadMetadata();
  metadata[characterId] = entry;
  saveMetadata(metadata);
}

export function removeCloudMetadata(characterId: string): void {
  const metadata = loadMetadata();
  delete metadata[characterId];
  saveMetadata(metadata);
}

export function removeCloudMetadataByFileId(fileId: string): void {
  const metadata = loadMetadata();
  for (const key of Object.keys(metadata)) {
    if (metadata[key].fileId === fileId) {
      delete metadata[key];
    }
  }
  saveMetadata(metadata);
}
