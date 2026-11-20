'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import type { CloudProvider, CloudFile, CloudMetadataEntry } from '@/lib/cloud/types';
import { getCloudMetadata, setCloudMetadata, removeCloudMetadataByFileId } from '@/lib/cloud/cloud-metadata';

type ProviderId = 'google-drive' | 'onedrive';
type Operation = 'connect' | 'list' | 'save' | 'load' | 'delete';

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
  /** Whether each provider has a save in flight. */
  saving: Record<ProviderId, boolean>;
  error: string | null;
  clearError(): void;
}

export function useCloudStorage(): UseCloudStorageReturn {
  const [providers, setProviders] = useState<CloudProvider[]>([]);
  const [authStates, setAuthStates] = useState<Record<ProviderId, boolean>>({
    'google-drive': false,
    'onedrive': false,
  });
  // Operations in flight, per provider: one call finishing mustn't re-enable buttons
  // while another call, for that provider or another one, is still running.
  const [inFlight, setInFlight] = useState<Record<ProviderId, Operation[]>>({
    'google-drive': [],
    'onedrive': [],
  });
  const loading = useMemo(
    () => ({ 'google-drive': inFlight['google-drive'].length > 0, 'onedrive': inFlight.onedrive.length > 0 }),
    [inFlight],
  );
  const saving = useMemo(
    () => ({ 'google-drive': inFlight['google-drive'].includes('save'), 'onedrive': inFlight.onedrive.includes('save') }),
    [inFlight],
  );
  // The message for the last failed operation, and which provider and operation it was.
  const [failure, setFailure] = useState<{ providerId: ProviderId; operation: Operation; message: string } | null>(null);
  const error = failure?.message ?? null;
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
  // A failure is recorded with its provider and operation. A success clears an earlier
  // failure of the same operation for that provider, so a message that no longer applies
  // doesn't linger, while a successful list still can't hide a failed save.
  const track = useCallback(async <T>(
    providerId: ProviderId,
    operation: Operation,
    op: () => Promise<T>,
    fallbackMessage: string,
  ): Promise<T> => {
    setInFlight(prev => ({ ...prev, [providerId]: [...prev[providerId], operation] }));
    try {
      const result = await op();
      setFailure(prev => (prev?.providerId === providerId && prev.operation === operation ? null : prev));
      return result;
    } catch (err) {
      setFailure({ providerId, operation, message: err instanceof Error ? err.message : fallbackMessage });
      throw err;
    } finally {
      setInFlight(prev => {
        const ops = [...prev[providerId]];
        ops.splice(ops.indexOf(operation), 1);
        return { ...prev, [providerId]: ops };
      });
    }
  }, []);

  const connect = useCallback(async (providerId: ProviderId) => {
    setFailure(null);
    await track(providerId, 'connect', async () => {
      await getProvider(providerId).authenticate();
      refreshAuthState(providerId);
    }, 'Authentication failed');
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
    setFailure(null);
    try {
      return await track(providerId, 'list', () => getProvider(providerId).listCharacterFiles(), 'Failed to list files');
    } catch {
      return [];
    }
  }, [getProvider, track]);

  const saveCharacter = useCallback(async (
    providerId: ProviderId,
    characterId: string,
    json: string,
    characterName: string
  ) => {
    setFailure(null);
    await track(providerId, 'save', async () => {
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
    }, 'Failed to save character');
  }, [getProvider, track]);

  const loadCharacter = useCallback(async (providerId: ProviderId, fileId: string): Promise<string> => {
    setFailure(null);
    return track(providerId, 'load', () => getProvider(providerId).loadCharacter(fileId), 'Failed to load character');
  }, [getProvider, track]);

  const deleteFile = useCallback(async (providerId: ProviderId, fileId: string) => {
    setFailure(null);
    await track(providerId, 'delete', async () => {
      await getProvider(providerId).deleteCharacter(fileId);
      removeCloudMetadataByFileId(fileId);
    }, 'Failed to delete file');
  }, [getProvider, track]);

  const clearError = useCallback(() => setFailure(null), []);

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
    saving,
    error,
    clearError,
  };
}
