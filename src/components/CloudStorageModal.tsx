'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import type { CloudFile, CloudProvider } from '@/lib/cloud/types';

type TabId = 'local' | 'google-drive' | 'onedrive';

interface Props {
  open: boolean;
  onClose(): void;
  providers: CloudProvider[];
  authStates: Record<string, boolean>;
  onConnect(providerId: 'google-drive' | 'onedrive'): Promise<void>;
  onDisconnect(providerId: 'google-drive' | 'onedrive'): void;
  onListFiles(providerId: 'google-drive' | 'onedrive'): Promise<CloudFile[]>;
  onSave(providerId: 'google-drive' | 'onedrive'): Promise<void>;
  onLoad(providerId: 'google-drive' | 'onedrive', fileId: string, fileName: string): Promise<void>;
  onDelete(providerId: 'google-drive' | 'onedrive', fileId: string): Promise<void>;
  onExportLocal(): void;
  onImportLocal(file: File): void;
  loading: boolean;
  error: string | null;
  onClearError(): void;
  characterName: string;
}

export default function CloudStorageModal({
  open,
  onClose,
  providers,
  authStates,
  onConnect,
  onDisconnect,
  onListFiles,
  onSave,
  onLoad,
  onDelete,
  onExportLocal,
  onImportLocal,
  loading,
  error,
  onClearError,
  characterName,
}: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('local');
  const [files, setFiles] = useState<CloudFile[]>([]);
  const [filesLoaded, setFilesLoaded] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const availableTabs: { id: TabId; label: string }[] = [
    { id: 'local', label: 'Local File' },
    ...providers.map(p => ({ id: p.id as TabId, label: p.displayName })),
  ];

  const activeProviderId = activeTab !== 'local' ? (activeTab as 'google-drive' | 'onedrive') : null;
  const isConnected = activeProviderId ? authStates[activeProviderId] : false;

  const loadFiles = useCallback(async (providerId: 'google-drive' | 'onedrive') => {
    setFilesLoaded(false);
    const result = await onListFiles(providerId);
    setFiles(result);
    setFilesLoaded(true);
  }, [onListFiles]);

  // Load files when switching to a connected provider tab
  useEffect(() => {
    if (open && activeProviderId && isConnected) {
      loadFiles(activeProviderId);
    }
  }, [open, activeProviderId, isConnected, loadFiles]);

  // Clear state when modal closes
  useEffect(() => {
    if (!open) {
      setFiles([]);
      setFilesLoaded(false);
      setSuccessMessage(null);
      onClearError();
    }
  }, [open, onClearError]);

  const showSuccess = useCallback((msg: string) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(null), 3000);
  }, []);

  const handleSave = useCallback(async () => {
    if (!activeProviderId) return;
    try {
      await onSave(activeProviderId);
      showSuccess('Character saved!');
      loadFiles(activeProviderId);
    } catch {
      // Error handled by parent
    }
  }, [activeProviderId, onSave, showSuccess, loadFiles]);

  const handleLoad = useCallback(async (fileId: string, fileName: string) => {
    if (!activeProviderId) return;
    try {
      await onLoad(activeProviderId, fileId, fileName);
      showSuccess('Character loaded!');
      onClose();
    } catch {
      // Error handled by parent
    }
  }, [activeProviderId, onLoad, showSuccess, onClose]);

  const handleDelete = useCallback(async (fileId: string, fileName: string) => {
    if (!activeProviderId) return;
    const displayName = fileName.replace('.dolmenwood.json', '');
    const providerName = activeProviderId === 'google-drive' ? 'Google Drive' : 'OneDrive';
    if (!confirm(`Delete ${displayName} from ${providerName}? This cannot be undone.`)) return;
    try {
      await onDelete(activeProviderId, fileId);
      showSuccess('File deleted.');
      loadFiles(activeProviderId);
    } catch {
      // Error handled by parent
    }
  }, [activeProviderId, onDelete, showSuccess, loadFiles]);

  const handleConnect = useCallback(async () => {
    if (!activeProviderId) return;
    try {
      await onConnect(activeProviderId);
    } catch {
      // Error handled by parent
    }
  }, [activeProviderId, onConnect]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Save / Load Character"
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Modal panel */}
      <div className="relative bg-[#2a2a3e] rounded-lg border border-[#c4a35a]/30 w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#5a3a28] shrink-0">
          <h3 className="text-[#c4a35a] text-lg font-bold">Save / Load Character</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-[#8b2500] hover:text-[#b33a1a] font-bold text-lg px-2"
          >
            &times;
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#5a3a28] shrink-0">
          {availableTabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                onClearError();
                setSuccessMessage(null);
              }}
              className={`px-4 py-2 text-sm font-semibold transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-[#c4a35a] border-[#c4a35a]'
                  : 'text-[#f5e6c8]/60 border-transparent hover:text-[#f5e6c8]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">
          {/* Error / Success messages */}
          {error && (
            <div className="mb-3 p-2 bg-[#8b2500]/20 border border-[#8b2500]/40 rounded text-sm text-[#ff6b4a]">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="mb-3 p-2 bg-[#2d4a2e]/40 border border-[#3d6b3e]/40 rounded text-sm text-[#7dde7d]">
              {successMessage}
            </div>
          )}

          {/* Local File Tab */}
          {activeTab === 'local' && (
            <div className="space-y-4">
              <div>
                <h4 className="text-[#c4a35a] text-sm font-semibold mb-2">Export to File</h4>
                <p className="text-[#f5e6c8]/60 text-xs mb-2">
                  Download <strong>{characterName || 'character'}</strong> as a JSON file.
                </p>
                <button
                  onClick={() => { onExportLocal(); showSuccess('Character exported!'); }}
                  className="px-3 py-1.5 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] text-sm rounded transition-colors"
                >
                  Export Character
                </button>
              </div>
              <div className="border-t border-[#5a3a28] pt-4">
                <h4 className="text-[#c4a35a] text-sm font-semibold mb-2">Import from File</h4>
                <p className="text-[#f5e6c8]/60 text-xs mb-2">
                  Load a character from a .dolmenwood.json file. This adds a new character.
                </p>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-1.5 bg-[#2d4a2e] hover:bg-[#3d6b3e] text-[#f5e6c8] text-sm rounded transition-colors"
                >
                  Import Character
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onImportLocal(file);
                      showSuccess('Character imported!');
                      onClose();
                    }
                    e.target.value = '';
                  }}
                />
              </div>
            </div>
          )}

          {/* Cloud Provider Tabs */}
          {activeProviderId && !isConnected && (
            <div className="text-center py-8">
              <svg className="w-12 h-12 mx-auto mb-3 text-[#f5e6c8]/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
              </svg>
              <p className="text-[#f5e6c8]/60 text-sm mb-4">
                Connect to {activeProviderId === 'google-drive' ? 'Google Drive' : 'OneDrive'} to save and load characters.
              </p>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="px-4 py-2 bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-50 text-[#f5e6c8] text-sm rounded transition-colors"
              >
                {loading ? 'Connecting...' : 'Connect'}
              </button>
              <p className="text-[#f5e6c8]/30 text-xs mt-4">
                Your data stays in your own {activeProviderId === 'google-drive' ? 'Drive' : 'OneDrive'}. We only access files created by this app.
              </p>
            </div>
          )}

          {activeProviderId && isConnected && (
            <div className="space-y-4">
              {/* Save action */}
              <div>
                <h4 className="text-[#c4a35a] text-sm font-semibold mb-2">Save Current Character</h4>
                <p className="text-[#f5e6c8]/60 text-xs mb-2">
                  Save <strong>{characterName || 'character'}</strong> to {activeProviderId === 'google-drive' ? 'Google Drive' : 'OneDrive'}.
                </p>
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-3 py-1.5 bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-50 text-[#f5e6c8] text-sm rounded transition-colors"
                >
                  {loading ? 'Saving...' : 'Save Character'}
                </button>
              </div>

              {/* File list */}
              <div className="border-t border-[#5a3a28] pt-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-[#c4a35a] text-sm font-semibold">Saved Characters</h4>
                  <button
                    onClick={() => loadFiles(activeProviderId)}
                    disabled={loading}
                    className="text-xs text-[#f5e6c8]/40 hover:text-[#f5e6c8] transition-colors"
                  >
                    Refresh
                  </button>
                </div>

                {!filesLoaded && loading ? (
                  <p className="text-[#f5e6c8]/40 text-sm py-4 text-center">Loading files...</p>
                ) : files.length === 0 ? (
                  <p className="text-[#f5e6c8]/40 text-sm py-4 text-center">
                    No saved characters found.
                  </p>
                ) : (
                  <div className="space-y-1">
                    {files.map(file => (
                      <div
                        key={file.id}
                        className="flex items-center justify-between p-2 rounded bg-[#1a1a2e] hover:bg-[#1a1a2e]/80 min-h-[44px]"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="text-sm text-[#f5e6c8] truncate">
                            {file.name.replace('.dolmenwood.json', '')}
                          </div>
                          <div className="text-xs text-[#f5e6c8]/30">
                            {new Date(file.modifiedTime).toLocaleString()}
                          </div>
                        </div>
                        <div className="ml-2 flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleLoad(file.id, file.name)}
                            disabled={loading}
                            className="px-2 py-1 bg-[#2d4a2e] hover:bg-[#3d6b3e] disabled:opacity-50 text-[#f5e6c8] text-xs rounded transition-colors"
                          >
                            Load
                          </button>
                          <button
                            onClick={() => handleDelete(file.id, file.name)}
                            disabled={loading}
                            className="text-[#8b2500] hover:text-[#b33a1a] disabled:opacity-50 text-xs transition-colors"
                            title="Delete from cloud"
                          >
                            Del
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Disconnect */}
              <div className="border-t border-[#5a3a28] pt-4">
                <button
                  onClick={() => onDisconnect(activeProviderId)}
                  className="text-xs text-[#8b2500] hover:text-[#b33a1a] transition-colors"
                >
                  Disconnect {activeProviderId === 'google-drive' ? 'Google Drive' : 'OneDrive'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
