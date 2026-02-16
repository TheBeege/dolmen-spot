import { CloudProvider, CloudFile, CloudSaveResult } from './types';

const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const TOKEN_KEY = 'dolmenwood-google-token';
const TOKEN_EXPIRY_KEY = 'dolmenwood-google-token-expiry';

function getStoredToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiry = sessionStorage.getItem(TOKEN_EXPIRY_KEY);
  if (!token || !expiry) return null;
  if (Date.now() > Number(expiry)) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
    return null;
  }
  return token;
}

function storeToken(token: string, expiresIn: number): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  // Store expiry with 60s buffer
  sessionStorage.setItem(TOKEN_EXPIRY_KEY, String(Date.now() + (expiresIn - 60) * 1000));
}

function clearToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(TOKEN_EXPIRY_KEY);
}

async function getAccessToken(): Promise<string> {
  const stored = getStoredToken();
  if (stored) return stored;
  throw new Error('Not authenticated with Google Drive');
}

async function driveRequest(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const url = path.startsWith('http') ? path : `${DRIVE_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google Drive API error ${res.status}: ${body}`);
  }
  return res;
}

export function createGoogleDriveProvider(): CloudProvider | null {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  return {
    id: 'google-drive',
    displayName: 'Google Drive',

    isAuthenticated(): boolean {
      return getStoredToken() !== null;
    },

    authenticate(): Promise<void> {
      return new Promise((resolve, reject) => {
        if (typeof google === 'undefined') {
          reject(new Error('Google Identity Services not loaded. Please try again.'));
          return;
        }

        const tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: SCOPE,
          callback: (response: TokenResponse) => {
            if (response.error) {
              reject(new Error(response.error_description || response.error));
              return;
            }
            storeToken(response.access_token, response.expires_in);
            resolve();
          },
          error_callback: (error: { type: string; message: string }) => {
            reject(new Error(error.message || 'Google auth failed'));
          },
        });

        tokenClient.requestAccessToken({ prompt: '' });
      });
    },

    disconnect(): void {
      const token = getStoredToken();
      if (token && typeof google !== 'undefined') {
        google.accounts.oauth2.revoke(token);
      }
      clearToken();
    },

    async listCharacterFiles(): Promise<CloudFile[]> {
      const q = encodeURIComponent("name contains '.dolmenwood.json' and trashed=false");
      const fields = encodeURIComponent('files(id,name,modifiedTime)');
      const res = await driveRequest(`/files?q=${q}&fields=${fields}&orderBy=modifiedTime desc&pageSize=50`);
      const data = await res.json();
      return (data.files || []).map((f: { id: string; name: string; modifiedTime: string }) => ({
        id: f.id,
        name: f.name,
        modifiedTime: f.modifiedTime,
      }));
    },

    async saveCharacter(json: string, fileName: string, existingFileId?: string): Promise<CloudSaveResult> {
      if (existingFileId) {
        // Update existing file
        const res = await driveRequest(
          `${UPLOAD_API}/files/${existingFileId}?uploadType=media`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: json,
          }
        );
        const data = await res.json();
        // Rename file if the character name changed (no-op if name is the same)
        await driveRequest(
          `/files/${existingFileId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName }),
          }
        );
        return { fileId: data.id, fileName };
      }

      // Create new file with multipart upload
      const metadata = {
        name: fileName,
        mimeType: 'application/json',
      };

      const boundary = '---dolmenwood_boundary';
      const body =
        `--${boundary}\r\n` +
        `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
        `${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        `${json}\r\n` +
        `--${boundary}--`;

      const res = await driveRequest(
        `${UPLOAD_API}/files?uploadType=multipart`,
        {
          method: 'POST',
          headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
          body,
        }
      );
      const data = await res.json();
      return { fileId: data.id, fileName };
    },

    async loadCharacter(fileId: string): Promise<string> {
      const res = await driveRequest(`/files/${fileId}?alt=media`);
      return res.text();
    },

    async deleteCharacter(fileId: string): Promise<void> {
      await driveRequest(`/files/${fileId}`, { method: 'DELETE' });
    },
  };
}
