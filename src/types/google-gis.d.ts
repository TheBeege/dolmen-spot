interface TokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}

interface TokenClientConfig {
  client_id: string;
  scope: string;
  callback: (response: TokenResponse) => void;
  error_callback?: (error: { type: string; message: string }) => void;
}

interface GoogleAccountsOauth2 {
  initTokenClient(config: TokenClientConfig): TokenClient;
  revoke(token: string, callback?: () => void): void;
}

interface GoogleAccounts {
  oauth2: GoogleAccountsOauth2;
}

interface Google {
  accounts: GoogleAccounts;
}

declare const google: Google | undefined;
