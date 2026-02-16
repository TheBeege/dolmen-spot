'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
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
  loading: boolean;
  error: string | null;
  clearError(): void;
}

export function useCloudStorage(): UseCloudStorageReturn {
  const [providers, setProviders] = useState<CloudProvider[]>([]);
  const [authStates, setAuthStates] = useState<Record<ProviderId, boolean>>({
    'google-drive': false,
    'onedrive': false,
  });
  const [loading, setLoading] = useState(false);
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

  const connect = useCallback(async (providerId: ProviderId) => {
    setError(null);
    setLoading(true);
    try {
      const provider = getProvider(providerId);
      await provider.authenticate();
      refreshAuthState(providerId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Authentication failed');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProvider, refreshAuthState]);

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
    setLoading(true);
    try {
      const provider = getProvider(providerId);
      return await provider.listCharacterFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list files');
      return [];
    } finally {
      setLoading(false);
    }
  }, [getProvider]);

  const saveCharacter = useCallback(async (
    providerId: ProviderId,
    characterId: string,
    json: string,
    characterName: string
  ) => {
    setError(null);
    setLoading(true);
    try {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save character');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProvider]);

  const loadCharacter = useCallback(async (providerId: ProviderId, fileId: string): Promise<string> => {
    setError(null);
    setLoading(true);
    try {
      const provider = getProvider(providerId);
      return await provider.loadCharacter(fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProvider]);

  const deleteFile = useCallback(async (providerId: ProviderId, fileId: string) => {
    setError(null);
    setLoading(true);
    try {
      const provider = getProvider(providerId);
      await provider.deleteCharacter(fileId);
      removeCloudMetadataByFileId(fileId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete file');
      throw err;
    } finally {
      setLoading(false);
    }
  }, [getProvider]);

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
