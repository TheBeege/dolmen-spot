export interface CloudFile {
  id: string;
  name: string;
  modifiedTime: string; // ISO 8601
}

export interface CloudSaveResult {
  fileId: string;
  fileName: string;
}

export interface CloudProvider {
  id: 'google-drive' | 'onedrive';
  displayName: string;
  isAuthenticated(): boolean;
  authenticate(): Promise<void>;
  disconnect(): void;
  listCharacterFiles(): Promise<CloudFile[]>;
  saveCharacter(json: string, fileName: string, existingFileId?: string): Promise<CloudSaveResult>;
  loadCharacter(fileId: string): Promise<string>;
  deleteCharacter(fileId: string): Promise<void>;
}

export interface CloudMetadataEntry {
  provider: 'google-drive' | 'onedrive';
  fileId: string;
  fileName: string;
  lastSaved: string; // ISO 8601
}
