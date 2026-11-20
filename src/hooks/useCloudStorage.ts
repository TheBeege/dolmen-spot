'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { CloudProvider, CloudFile, CloudMetadataEntry } from '@/lib/cloud/types';
import { getCloudMetadata, setCloudMetadata, removeCloudMetadataByFileId } from '@/lib/cloud/cloud-metadata';

type ProviderId = 'google-drive' | 'onedrive';

interface UseCloudStorageReturn {
  providers: CloudProvider[];
  authStates: Record<ProviderId, boolean>;
  connect(providerId: ProviderId): Promise<void>;
  disconnect(providerId: ProviderId): void;
  listFiles(providerId: ProviderId): Promise<CloudFile[]>;
  saveCharacter(providerId: ProviderId, characterId: string, json: string, characterName: string): Promise<void>;
  loadCharacter(providerId: ProviderId, fileId: string): Promise<string>;
  deleteFile(providerId: ProviderId, fileId: string): Promise<void>;
  getMetadata(characterId: string): CloudMetadataEntry | null;
  setMetadata(characterId: string, providerId: ProviderId, fileId: string, fileName: string): void;
  /** Whether each provider has an operation in flight. */
  loading: Record<ProviderId, boolean>;
  error: string | null;
  clearError(): void;
}

export function useCloudStorage(): UseCloudStorageReturn {
  const [providers, setProviders] = useState<CloudProvider[]>([]);
  const [authStates, setAuthStates] = useState<Record<ProviderId, boolean>>({
    'google-drive': false,
    'onedrive': false,
  });
  // Operations in flight, counted per provider: one call finishing mustn't re-enable
  // buttons while another call, for that provider or another one, is still running.
  const [inFlight, setInFlight] = useState<Record<ProviderId, number>>({
    'google-drive': 0,
    'onedrive': 0,
  });
  const loading = useMemo(
    () => ({ 'google-drive': inFlight['google-drive'] > 0, 'onedrive': inFlight.onedrive > 0 }),
    [inFlight],
  );
  const [error, setError] = useState<string | null>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    // Lazy-load providers to avoid loading cloud SDKs at page load
    async function init() {
      const loaded: CloudProvider[] = [];

      const { createGoogleDriveProvider } = await import('@/lib/cloud/google-drive');
      const gd = createGoogleDriveProvider();
      if (gd) loaded.push(gd);

      const { createOneDriveProvider } = await import('@/lib/cloud/onedrive');
      const od = createOneDriveProvider();
      if (od) loaded.push(od);

      setProviders(loaded);

      // Check initial auth states
      const states: Record<ProviderId, boolean> = {
        'google-drive': false,
        'onedrive': false,
      };
      for (const p of loaded) {
        states[p.id] = p.isAuthenticated();
      }
      setAuthStates(states);
    }

    init();
  }, []);

  const getProvider = useCallback((id: ProviderId): CloudProvider => {
    const p = providers.find(p => p.id === id);
    if (!p) throw new Error(`Provider ${id} not available`);
    return p;
  }, [providers]);

  const refreshAuthState = useCallback((id: ProviderId) => {
    const p = providers.find(p => p.id === id);
    if (p) {
      setAuthStates(prev => ({ ...prev, [id]: p.isAuthenticated() }));
    }
  }, [providers]);

  // Runs one operation for a provider, counting it as in flight for that provider only.
  const track = useCallback(async <T>(providerId: ProviderId, op: () => Promise<T>): Promise<T> => {
    setInFlight(prev => ({ ...prev, [providerId]: prev[providerId] + 1 }));
    try {
      return await op();
    } finally {
      setInFlight(prev => ({ ...prev, [providerId]: prev[providerId] - 1 }));
    }
  }, []);

  const connect = useCallback(async (providerId: ProviderId) => {
    setError(null);
    try {
      await track(providerId, async () => {
        const provider = getProvider(providerId);
        await provider.authenticate();
        refreshAuthState(providerId);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      throw err;
    }
  }, [getProvider, refreshAuthState, track]);

  const disconnect = useCallback((providerId: ProviderId) => {
    try {
      const provider = getProvider(providerId);
      provider.disconnect();
      refreshAuthState(providerId);
    } catch {
      // Ignore disconnect errors
    }
  }, [getProvider, refreshAuthState]);

  const listFiles = useCallback(async (providerId: ProviderId): Promise<CloudFile[]> => {
    setError(null);
    try {
      return await track(providerId, () => getProvider(providerId).listCharacterFiles());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list files');
      return [];
    }
  }, [getProvider, track]);

  const saveCharacter = useCallback(async (
    providerId: ProviderId,
    characterId: string,
    json: string,
    characterName: string
  ) => {
    setError(null);
    try {
      await track(providerId, async () => {
        const provider = getProvider(providerId);
        const fileName = `${characterName || 'character'}.dolmenwood.json`;
        const existing = getCloudMetadata(characterId);
        const existingFileId = existing?.provider === providerId ? existing.fileId : undefined;

        const result = await provider.saveCharacter(json, fileName, existingFileId);

        setCloudMetadata(characterId, {
          provider: providerId,
          fileId: result.fileId,
          fileName: result.fileName,
          lastSaved: new Date().toISOString(),
        });
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save character');
      throw err;
    }
  }, [getProvider, track]);

  const loadCharacter = useCallback(async (providerId: ProviderId, fileId: string): Promise<string> => {
    setError(null);
    try {
      return await track(providerId, () => getProvider(providerId).loadCharacter(fileId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character');
      throw err;
    }
  }, [getProvider, track]);

  const deleteFile = useCallback(async (providerId: ProviderId, fileId: string) => {
    setError(null);
    try {
      await track(providerId, async () => {
        await getProvider(providerId).deleteCharacter(fileId);
        removeCloudMetadataByFileId(fileId);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
      throw err;
    }
  }, [getProvider, track]);

  const clearError = useCallback(() => setError(null), []);

  const setMetadata = useCallback((
    characterId: string,
    providerId: ProviderId,
    fileId: string,
    fileName: string,
  ) => {
    setCloudMetadata(characterId, {
      provider: providerId,
      fileId,
      fileName,
      lastSaved: new Date().toISOString(),
    });
  }, []);

  return {
    providers,
    authStates,
    connect,
    disconnect,
    listFiles,
    saveCharacter,
    loadCharacter,
    deleteFile,
    getMetadata: getCloudMetadata,
    setMetadata,
    loading,
    error,
    clearError,
  };
}
