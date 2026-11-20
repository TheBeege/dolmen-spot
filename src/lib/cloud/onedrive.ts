import {
  PublicClientApplication,
  BrowserAuthError,
  BrowserAuthErrorCodes,
  type SilentRequest,
  type AccountInfo,
} from '@azure/msal-browser';
import { CloudProvider, CloudFile, CloudSaveResult } from './types';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.ReadWrite.AppFolder'];
const APP_FOLDER = '/drive/special/approot';

let msalInstance: PublicClientApplication | null = null;
// The cache clear started by the last disconnect. A new sign-in waits for it, so it
// can't race the clear and have its fresh tokens removed.
let pendingCacheClear: Promise<void> = Promise.resolve();

async function getMsalInstance(clientId: string): Promise<PublicClientApplication> {
  if (msalInstance) return msalInstance;
  msalInstance = new PublicClientApplication({
    auth: {
      clientId,
      authority: 'https://login.microsoftonline.com/consumers',
      redirectUri: typeof window !== 'undefined' ? window.location.origin + '/blank.html' : '',
    },
    cache: {
      cacheLocation: 'sessionStorage',
    },
  });
  await msalInstance.initialize();
  return msalInstance;
}

function getActiveAccount(instance: PublicClientApplication): AccountInfo | null {
  return instance.getActiveAccount() || instance.getAllAccounts()[0] || null;
}

async function getAccessToken(instance: PublicClientApplication): Promise<string> {
  const account = getActiveAccount(instance);
  if (!account) throw new Error('Not authenticated with OneDrive');

  const request: SilentRequest = { scopes: SCOPES, account };
  try {
    const response = await instance.acquireTokenSilent(request);
    return response.accessToken;
  } catch {
    // Silent token acquisition failed, fall back to popup
    const response = await instance.acquireTokenPopup({ scopes: SCOPES });
    return response.accessToken;
  }
}

async function graphRequest(instance: PublicClientApplication, path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(instance);
  const url = path.startsWith('http') ? path : `${GRAPH_API}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Microsoft Graph API error ${res.status}: ${body}`);
  }
  return res;
}

export function createOneDriveProvider(): CloudProvider | null {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  if (!clientId) return null;

  let instance: PublicClientApplication | null = null;
  // Set when a sign-in was refused because of a stale interaction lock (see authenticate).
  let overrideStaleInteraction = false;

  return {
    id: 'onedrive',
    displayName: 'OneDrive',

    isAuthenticated(): boolean {
      return instance !== null && getActiveAccount(instance) !== null;
    },

    async authenticate(): Promise<void> {
      await pendingCacheClear;
      instance = await getMsalInstance(clientId);
      // While a popup is open, MSAL holds an "interaction in progress" lock in
      // sessionStorage. Reloading the tab during a sign-in popup (or during the old
      // logoutPopup Disconnect) leaves that lock behind, and MSAL then refuses every
      // sign-in in the tab with interaction_in_progress. MSAL's documented way out is
      // overrideInteractionInProgress, used only when the user explicitly retries, never as
      // an automatic retry. So explain, and let the next click on Connect take over the lock.
      const overrideInteractionInProgress = overrideStaleInteraction;
      overrideStaleInteraction = false;
      const response = await instance
        .loginPopup({ scopes: SCOPES, overrideInteractionInProgress })
        .catch((err: unknown) => {
          if (err instanceof BrowserAuthError && err.errorCode === BrowserAuthErrorCodes.interactionInProgress) {
            overrideStaleInteraction = true;
            throw new Error("An earlier OneDrive sign-in in this tab didn't finish. Click Connect again to start a new one.");
          }
          throw err;
        });
      if (response.account) {
        instance.setActiveAccount(response.account);
      }
    },

    disconnect(): void {
      if (instance) {
        const account = getActiveAccount(instance);
        if (account) {
          // Forget the account in this browser only: clearCache removes the account and
          // its tokens from MSAL's cache, opens no window and takes no interaction lock.
          // The player stays signed in to Microsoft itself.
          //
          // This replaces logoutPopup. Since MSAL 5.7, logoutPopup waits up to
          // popupBridgeTimeout (60 s) for the sign-out popup to report back through the
          // redirect bridge. Without a postLogoutRedirectUri the popup lands on the main
          // page, which has no bridge, so the wait always timed out. Meanwhile MSAL held its
          // interaction lock, so reconnecting within that minute failed with
          // interaction_in_progress, and reloading during it left the lock behind until the
          // tab was closed.
          pendingCacheClear = instance.clearCache({ account }).catch((err) => {
            console.warn('Could not clear the OneDrive account from this browser', err);
          });
        }
        msalInstance = null;
        instance = null;
      }
    },

    async listCharacterFiles(): Promise<CloudFile[]> {
      if (!instance) instance = await getMsalInstance(clientId);
      // List children of the app folder, filtered to .dolmenwood.json files
      // The approot folder returns 404 until the first file is saved into it
      try {
        // Consumer OneDrive has limited $filter support (endswith is unsupported),
        // so we list all children and filter client-side.
        const res = await graphRequest(
          instance,
          `${APP_FOLDER}/children?$select=id,name,lastModifiedDateTime&$top=100`
        );
        const data = await res.json();
        return (data.value || [])
          .filter((f: { name: string }) => f.name.endsWith('.dolmenwood.json'))
          .sort((a: { lastModifiedDateTime: string }, b: { lastModifiedDateTime: string }) =>
            b.lastModifiedDateTime.localeCompare(a.lastModifiedDateTime)
          )
          .map((f: { id: string; name: string; lastModifiedDateTime: string }) => ({
            id: f.id,
            name: f.name,
            modifiedTime: f.lastModifiedDateTime,
          }));
      } catch (err) {
        // App folder doesn't exist yet — it's created on first save
        if (err instanceof Error && err.message.includes('404')) {
          return [];
        }
        throw err;
      }
    },

    async saveCharacter(json: string, fileName: string, existingFileId?: string): Promise<CloudSaveResult> {
      if (!instance) instance = await getMsalInstance(clientId);

      if (existingFileId) {
        // Update existing file by ID
        const res = await graphRequest(
          instance,
          `/me/drive/items/${existingFileId}/content`,
          {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: json,
          }
        );
        const data = await res.json();
        // Rename file if the character name changed (no-op if name is the same)
        await graphRequest(
          instance,
          `/me/drive/items/${existingFileId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: fileName }),
          }
        );
        return { fileId: data.id, fileName };
      }

      // Create/overwrite file by path in app folder
      const res = await graphRequest(
        instance,
        `${APP_FOLDER}:/${encodeURIComponent(fileName)}:/content`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: json,
        }
      );
      const data = await res.json();
      return { fileId: data.id, fileName };
    },

    async loadCharacter(fileId: string): Promise<string> {
      if (!instance) instance = await getMsalInstance(clientId);
      const res = await graphRequest(instance, `/me/drive/items/${fileId}/content`);
      return res.text();
    },

    async deleteCharacter(fileId: string): Promise<void> {
      if (!instance) instance = await getMsalInstance(clientId);
      await graphRequest(instance, `/me/drive/items/${fileId}`, { method: 'DELETE' });
    },
  };
}
