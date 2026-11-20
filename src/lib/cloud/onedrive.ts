import {
  PublicClientApplication,
  AuthError,
  BrowserAuthErrorCodes,
  type SilentRequest,
  type AccountInfo,
} from '@azure/msal-browser';
import { CloudProvider, CloudFile, CloudSaveResult } from './types';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const SCOPES = ['Files.ReadWrite.AppFolder'];
const APP_FOLDER = '/drive/special/approot';

const SIGN_IN_ALREADY_OPEN =
  'A OneDrive sign-in window is already open. Finish signing in there, or close it and try again in a minute.';
const STALE_SIGN_IN = "An earlier OneDrive sign-in in this tab didn't finish. Click Connect again to start a new one.";
const NOT_CONNECTED = "OneDrive isn't connected. Connect it and try again.";
const SIGNED_IN_NO_ACCESS = "Signed in, but OneDrive still couldn't confirm access. Try again.";

// An error whose message is written for the player. `detail` is what actually went
// wrong, for the console.
class PlayerError extends Error {
  detail: unknown;
  constructor(message: string, detail?: unknown) {
    super(message);
    this.detail = detail;
  }
}

// A Microsoft Graph request that failed with this HTTP status.
class GraphError extends PlayerError {
  status: number;
  constructor(status: number, body: string) {
    let message = "OneDrive couldn't complete that. Try again.";
    if (status === 401 || status === 403) message = "OneDrive didn't accept your sign-in. Disconnect OneDrive, then connect again.";
    else if (status === 404) message = 'That file no longer exists in OneDrive.';
    else if (status === 429 || status >= 500) message = 'OneDrive is having trouble. Try again in a moment.';
    super(message, `Microsoft Graph API error ${status}: ${body}`);
    this.status = status;
  }
}

let msalInstance: PublicClientApplication | null = null;
// The cache clear started by the last disconnect. A new sign-in waits for it, so it
// can't race the clear and have its fresh tokens removed.
let pendingCacheClear: Promise<void> = Promise.resolve();
// The interactive MSAL call (a sign-in window) this page has open, if any, and the most
// recent one, open or settled. Each settles when its call does.
let openPopup: Promise<unknown> | null = null;
let lastPopup: Promise<unknown> | null = null;
// How many of this page's sign-in windows have settled.
let popupsSettled = 0;

// MSAL's messages ("timed_out: See https://aka.ms/..."), Graph's JSON and browser errors
// mean nothing to a player, so every error leaving this provider goes through here.
function toPlayerError(err: unknown): PlayerError {
  if (err instanceof PlayerError) {
    if (err.detail !== undefined) console.warn('OneDrive:', err.detail);
    return err;
  }
  console.warn('OneDrive:', err);
  if (err instanceof AuthError) {
    switch (err.errorCode) {
      // MSAL 5 can't see the window being closed; it gives up after popupBridgeTimeout (60 s).
      case BrowserAuthErrorCodes.timedOut:
      case BrowserAuthErrorCodes.userCancelled:
        return new PlayerError('The Microsoft sign-in window was closed or took too long. Try again.');
      case BrowserAuthErrorCodes.popupWindowError:
      case BrowserAuthErrorCodes.emptyWindowError:
        return new PlayerError("The Microsoft sign-in window couldn't open. Allow pop-ups for this site and try again.");
      case BrowserAuthErrorCodes.interactionInProgress:
        return new PlayerError(SIGN_IN_ALREADY_OPEN);
      case BrowserAuthErrorCodes.noNetworkConnectivity:
      case BrowserAuthErrorCodes.postRequestFailed:
      case BrowserAuthErrorCodes.getRequestFailed:
        return new PlayerError("Couldn't reach Microsoft. Check your connection and try again.");
      case 'access_denied': // the player cancelled or declined on Microsoft's page
        return new PlayerError('Microsoft sign-in was cancelled. Try again.');
    }
    return new PlayerError('Microsoft sign-in failed. Try again.');
  }
  return new PlayerError('Something went wrong with OneDrive. Try again.');
}

// Runs one interactive MSAL call. MSAL allows one interaction per tab, and MSAL 5 may not
// notice a closed window for a minute, so while one of ours is open another call is
// refused here: it would otherwise fail with interaction_in_progress, or cancel the open
// one if it overrode the lock. (A token request waits for the open one instead; see
// getAccessToken.)
async function runPopup<T>(start: () => Promise<T>): Promise<T> {
  if (openPopup) throw new PlayerError(SIGN_IN_ALREADY_OPEN);
  const call = Promise.resolve().then(start);
  openPopup = call;
  lastPopup = call;
  try {
    return await call;
  } finally {
    openPopup = null;
    popupsSettled++;
  }
}

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
  if (!account) throw new PlayerError(NOT_CONNECTED);

  const request: SilentRequest = { scopes: SCOPES, account };
  // The silent attempt can take about 10 s to fail, so note which sign-in window was open
  // when it started: that window, or one that opens and settles meanwhile, may already
  // have brought back the token this call needs.
  const popupAtStart = openPopup;
  const settledAtStart = popupsSettled;
  try {
    const response = await instance.acquireTokenSilent(request);
    return response.accessToken;
  } catch {
    const popup = openPopup ?? popupAtStart ?? (popupsSettled !== settledAtStart ? lastPopup : null);
    if (popup) {
      // Another operation has, or just had, a sign-in window open (the dialog lists files
      // again when the player switches tabs or reopens it). Wait for that window instead
      // of opening a second one nobody asked for. If the player didn't sign in there, this
      // rethrows its failure; if they did, the token this call needs is in the cache.
      await popup;
      try {
        const response = await instance.acquireTokenSilent(request);
        return response.accessToken;
      } catch (err) {
        throw new PlayerError(SIGNED_IN_NO_ACCESS, err);
      }
    }
    // Silent token acquisition failed, fall back to popup
    const response = await runPopup(() => instance.acquireTokenPopup({ scopes: SCOPES }));
    return response.accessToken;
  }
}

async function graphRequest(instance: PublicClientApplication, path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken(instance);
  const url = path.startsWith('http') ? path : `${GRAPH_API}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...init?.headers,
      },
    });
  } catch (err) {
    throw new PlayerError("Couldn't reach OneDrive. Check your connection and try again.", err);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new GraphError(res.status, body);
  }
  return res;
}

export function createOneDriveProvider(): CloudProvider | null {
  const clientId = process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID;
  if (!clientId) return null;

  let instance: PublicClientApplication | null = null;
  // Set when a sign-in found a lock left by an earlier page load (see authenticate).
  let overrideStaleLock = false;

  // The instance for one operation, read once at its start. If Disconnect runs midway,
  // the operation keeps this instance, now without an account: a step that still needs a
  // token fails with "not connected" instead of on a null instance, and a step that
  // already has its token finishes.
  const operationInstance = async (): Promise<PublicClientApplication> => {
    if (!instance) instance = await getMsalInstance(clientId);
    return instance;
  };

  const provider: CloudProvider = {
    id: 'onedrive',
    displayName: 'OneDrive',

    isAuthenticated(): boolean {
      return instance !== null && getActiveAccount(instance) !== null;
    },

    async authenticate(): Promise<void> {
      await runPopup(async () => {
        await pendingCacheClear;
        const msal = await getMsalInstance(clientId);
        instance = msal;
        // runPopup only gets here when no popup of this page's is open, so if MSAL still
        // reports an interaction in progress, its lock in sessionStorage was left by an
        // earlier page load: the tab was reloaded during a sign-in window (or during the
        // old logoutPopup Disconnect). MSAL then refuses every sign-in in the tab. Its
        // documented way out is overrideInteractionInProgress, used only when the user
        // explicitly retries, never as an automatic retry. So explain, and let the next
        // click on Connect take over the lock.
        const overrideInteractionInProgress = overrideStaleLock;
        overrideStaleLock = false;
        const response = await msal
          .loginPopup({ scopes: SCOPES, overrideInteractionInProgress })
          .catch((err: unknown) => {
            if (err instanceof AuthError && err.errorCode === BrowserAuthErrorCodes.interactionInProgress) {
              overrideStaleLock = true;
              throw new PlayerError(STALE_SIGN_IN, err);
            }
            throw err;
          });
        if (response.account) {
          msal.setActiveAccount(response.account);
        }
      });
    },

    disconnect(): void {
      if (instance) {
        // Forget the Microsoft account in this browser only: clearCache with no account
        // removes every account and token MSAL holds for this app in this tab (and its
        // temporary keys and key store). It opens no window and takes no interaction
        // lock, and the player stays signed in to Microsoft itself.
        //
        // This replaces logoutPopup. Since MSAL 5.7, logoutPopup waits up to
        // popupBridgeTimeout (60 s) for the sign-out popup to report back through the
        // redirect bridge. Without a postLogoutRedirectUri the popup lands on the main
        // page, which has no bridge, so the wait always timed out. Meanwhile MSAL held its
        // interaction lock, so reconnecting within that minute failed with
        // interaction_in_progress, and reloading during it left the lock behind until the
        // tab was closed.
        pendingCacheClear = instance.clearCache().catch((err) => {
          console.warn('Could not clear the OneDrive account from this browser', err);
        });
        msalInstance = null;
        instance = null;
      }
    },

    async listCharacterFiles(): Promise<CloudFile[]> {
      const msal = await operationInstance();
      // List children of the app folder, filtered to .dolmenwood.json files
      // The approot folder returns 404 until the first file is saved into it
      try {
        // Consumer OneDrive has limited $filter support (endswith is unsupported),
        // so we list all children and filter client-side.
        const res = await graphRequest(
          msal,
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
        if (err instanceof GraphError && err.status === 404) {
          return [];
        }
        throw err;
      }
    },

    async saveCharacter(json: string, fileName: string, existingFileId?: string): Promise<CloudSaveResult> {
      const msal = await operationInstance();

      if (existingFileId) {
        // Update existing file by ID
        const res = await graphRequest(
          msal,
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
          msal,
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
        msal,
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
      const msal = await operationInstance();
      const res = await graphRequest(msal, `/me/drive/items/${fileId}/content`);
      return res.text();
    },

    async deleteCharacter(fileId: string): Promise<void> {
      const msal = await operationInstance();
      await graphRequest(msal, `/me/drive/items/${fileId}`, { method: 'DELETE' });
    },
  };

  // Whatever an operation throws, from MSAL, Graph, the network or a bug, reaches the
  // player as a PlayerError (see toPlayerError).
  const playerFacing = <T>(op: Promise<T>): Promise<T> =>
    op.catch((err: unknown) => {
      throw toPlayerError(err);
    });
  return {
    ...provider,
    authenticate: () => playerFacing(provider.authenticate()),
    listCharacterFiles: () => playerFacing(provider.listCharacterFiles()),
    saveCharacter: (json, fileName, existingFileId) => playerFacing(provider.saveCharacter(json, fileName, existingFileId)),
    loadCharacter: (fileId) => playerFacing(provider.loadCharacter(fileId)),
    deleteCharacter: (fileId) => playerFacing(provider.deleteCharacter(fileId)),
  };
}
