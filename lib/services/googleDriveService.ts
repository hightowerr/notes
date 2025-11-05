import crypto from 'node:crypto';

import { google, type drive_v3 } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';

import { supabase } from '@/lib/supabase';
import { encryptToken } from '@/lib/services/tokenEncryption';

type OAuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt: string;
};

const GOOGLE_DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.readonly'] as const;
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;
const TOKEN_REFRESH_EVENT_EXTERNAL_ID = 'token-refresh';

export class DriveTokenRefreshError extends Error {
  readonly reason: 'invalid_grant' | 'unknown';

  constructor(message: string, reason: 'invalid_grant' | 'unknown', cause?: unknown) {
    super(message);
    this.name = 'DriveTokenRefreshError';
    this.reason = reason;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}

function shouldRefreshToken(tokenExpiresAt?: string | null) {
  if (!tokenExpiresAt) {
    return false;
  }

  const expiresAt = Date.parse(tokenExpiresAt);
  if (Number.isNaN(expiresAt)) {
    return false;
  }

  return expiresAt <= Date.now() + TOKEN_REFRESH_THRESHOLD_MS;
}

function updateDriveClientCredentials(client: drive_v3.Drive | undefined, tokens: DriveCredentials) {
  if (!client) {
    return;
  }

  const authCandidate = client.context?._options?.auth;

  if (!authCandidate || typeof authCandidate !== 'object') {
    return;
  }

  const auth = authCandidate as OAuth2Client;

  if (typeof auth.setCredentials !== 'function') {
    return;
  }

  auth.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.tokenExpiresAt ? Date.parse(tokens.tokenExpiresAt) : undefined,
  });
}

function isUnauthorizedError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const anyError = error as Record<string, unknown>;

  if (anyError.code === 401 || anyError.status === 401) {
    return true;
  }

  const response = anyError.response as Record<string, unknown> | undefined;
  if (response && response.status === 401) {
    return true;
  }

  const errorsArray = anyError.errors;
  if (Array.isArray(errorsArray) && errorsArray.some((item) => item && (item as any).reason === 'authError')) {
    return true;
  }

  return false;
}

function isInvalidGrantError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const anyError = error as Record<string, unknown>;
  const message = typeof anyError.message === 'string' ? anyError.message : '';

  if (message.toLowerCase().includes('invalid_grant')) {
    return true;
  }

  const response = anyError.response as Record<string, unknown> | undefined;
  const data = response?.data as Record<string, unknown> | undefined;
  const responseError = typeof data?.error === 'string' ? data.error : '';
  const responseDescription = typeof data?.error_description === 'string' ? data.error_description : '';

  return (
    responseError.toLowerCase() === 'invalid_grant' ||
    responseDescription.toLowerCase().includes('invalid_grant')
  );
}

async function logTokenRefreshEvent(connectionId: string, status: 'completed' | 'failed', message: string) {
  const { error } = await supabase.from('sync_events').insert({
    connection_id: connectionId,
    event_type: 'sync_error',
    external_file_id: TOKEN_REFRESH_EVENT_EXTERNAL_ID,
    status,
    error_message: message,
  });

  if (error) {
    console.warn('[Drive] Failed to log token refresh event', { connectionId, error });
  }
}

async function markConnectionError(connectionId: string, code: string, message: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('cloud_connections')
    .update({
      status: 'error',
      last_error_code: code,
      last_error_message: message,
      last_error_at: now,
      updated_at: now,
    })
    .eq('id', connectionId);

  if (error) {
    console.error('[Drive] Failed to flag connection error state', { connectionId, error });
  }
}

async function refreshTokensForConnection(tokens: DriveCredentials) {
  const connectionId = tokens.connectionId;

  if (!connectionId) {
    throw new Error('connectionId is required to refresh Google Drive tokens');
  }

  console.info('[Drive] Access token expired, refreshing...', { connectionId });

  const oauthClient = getOAuthClient();
  oauthClient.setCredentials({ refresh_token: tokens.refreshToken });

  let accessToken: string | undefined;
  let refreshToken: string | undefined;
  let expiryDate: number | undefined;

  try {
    const response = await oauthClient.refreshToken(tokens.refreshToken);

    if (!response || !response.credentials) {
      console.error('[Drive] Token refresh returned invalid response', { connectionId });
      throw new Error('Token refresh response missing credentials');
    }

    const credentials = response.credentials;

    accessToken = credentials.access_token ?? undefined;
    refreshToken = credentials.refresh_token ?? tokens.refreshToken;
    expiryDate =
      typeof credentials.expiry_date === 'number' && !Number.isNaN(credentials.expiry_date)
        ? credentials.expiry_date
        : Date.now() + 60 * 60 * 1000;
  } catch (error) {
    if (isInvalidGrantError(error)) {
      await markConnectionError(connectionId, 'TOKEN_REFRESH_FAILED', 'Reconnect Google Drive');
      await logTokenRefreshEvent(connectionId, 'failed', 'Token refresh failed');
      console.error('[Drive] Token refresh failed with invalid_grant', { connectionId, error });
      throw new DriveTokenRefreshError('Token refresh failed', 'invalid_grant', error);
    }

    console.error('[Drive] Token refresh failed unexpectedly', { connectionId, error });
    throw new DriveTokenRefreshError('Token refresh failed', 'unknown', error);
  }

  if (!accessToken) {
    console.error('[Drive] Refresh response missing access token', { connectionId });
    throw new DriveTokenRefreshError('Token refresh failed', 'unknown');
  }

  const expirationIso = new Date(expiryDate ?? Date.now() + 60 * 60 * 1000).toISOString();
  const encryptedAccessToken = encryptToken(accessToken);
  const encryptedRefreshToken = encryptToken(refreshToken ?? tokens.refreshToken);
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from('cloud_connections')
    .update({
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: expirationIso,
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
      updated_at: now,
    })
    .eq('id', connectionId);

  if (updateError) {
    console.error('[Drive] Failed to persist refreshed tokens', { connectionId, error: updateError });
    throw new DriveTokenRefreshError('Failed to persist refreshed tokens', 'unknown', updateError);
  }

  await logTokenRefreshEvent(connectionId, 'completed', 'Token refreshed');

  tokens.accessToken = accessToken;
  tokens.refreshToken = refreshToken ?? tokens.refreshToken;
  tokens.tokenExpiresAt = expirationIso;

  console.info('[Drive] Token refresh successful', { connectionId });
}

async function callDriveApi<T>(
  tokens: DriveCredentials,
  params: { operationName: string; driveClient?: drive_v3.Drive; connectionId?: string },
  executor: (client: drive_v3.Drive) => Promise<T>
): Promise<T> {
  const connectionId = params.connectionId ?? tokens.connectionId;
  const driveClient = params.driveClient ?? createDriveClient(tokens);

  const maybeRefresh = async () => {
    if (connectionId && shouldRefreshToken(tokens.tokenExpiresAt)) {
      await refreshTokensForConnection(tokens);
      updateDriveClientCredentials(driveClient, tokens);
    }
  };

  await maybeRefresh();

  try {
    return await executor(driveClient);
  } catch (error) {
    if (!connectionId || !isUnauthorizedError(error)) {
      throw error;
    }

    await refreshTokensForConnection(tokens);
    updateDriveClientCredentials(driveClient, tokens);

    return await executor(driveClient);
  }
}

function resolveEnv(name: 'GOOGLE_CLIENT_ID' | 'GOOGLE_CLIENT_SECRET' | 'GOOGLE_REDIRECT_URI') {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }

  return value;
}

function getOAuthClient() {
  const clientId = resolveEnv('GOOGLE_CLIENT_ID');
  const clientSecret = resolveEnv('GOOGLE_CLIENT_SECRET');
  const redirectUri = resolveEnv('GOOGLE_REDIRECT_URI');

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function buildOAuthState(): string {
  return crypto.randomBytes(16).toString('hex');
}

export function generateGoogleDriveAuthUrl(state?: string): string {
  const oauthClient = getOAuthClient();

  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_DRIVE_SCOPES,
    include_granted_scopes: true,
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
  if (!code || typeof code !== 'string') {
    throw new Error('Authorization code is required to exchange tokens');
  }

  const oauthClient = getOAuthClient();

  const { tokens } = await oauthClient.getToken(code);

  if (!tokens.access_token) {
    throw new Error('Google OAuth response did not contain an access token');
  }

  if (!tokens.refresh_token) {
    throw new Error('Google OAuth response did not contain a refresh token');
  }

  const expiresAtMs =
    typeof tokens.expiry_date === 'number' && !Number.isNaN(tokens.expiry_date)
      ? tokens.expiry_date
      : Date.now() + 60 * 60 * 1000; // Default to 1 hour if expiry missing

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    tokenExpiresAt: new Date(expiresAtMs).toISOString(),
  };
}

export function resolveProviderDisplayName(provider: string) {
  if (provider === 'google_drive') {
    return 'Google Drive';
  }

  return provider;
}

export type DriveCredentials = {
  accessToken: string;
  refreshToken: string;
  tokenExpiresAt?: string | null;
  connectionId?: string;
};

export function createDriveClient(tokens: DriveCredentials): drive_v3.Drive {
  const oauthClient = getOAuthClient();
  oauthClient.setCredentials({
    access_token: tokens.accessToken,
    refresh_token: tokens.refreshToken,
    expiry_date: tokens.tokenExpiresAt ? Date.parse(tokens.tokenExpiresAt) : undefined,
  });

  return google.drive({ version: 'v3', auth: oauthClient });
}

export type DriveFileMetadata = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  modifiedTime: string | null;
};

export async function getFileMetadata(
  fileId: string,
  tokens: DriveCredentials,
  driveClient?: drive_v3.Drive
): Promise<DriveFileMetadata> {
  if (!fileId) {
    throw new Error('Google Drive fileId is required');
  }

  const response = await callDriveApi(
    tokens,
    { operationName: 'files.get', driveClient },
    (drive) =>
      drive.files.get({
        fileId,
        fields: 'id, name, mimeType, size, modifiedTime',
        supportsAllDrives: false,
      })
  );

  const data = response.data;

  if (!data || !data.id || !data.name || !data.mimeType) {
    throw new Error(`Google Drive metadata for file ${fileId} is incomplete`);
  }

  const sizeValue =
    typeof data.size === 'string' ? Number.parseInt(data.size, 10) : undefined;

  return {
    id: data.id,
    name: data.name,
    mimeType: data.mimeType,
    size: Number.isFinite(sizeValue) && sizeValue ? sizeValue : 0,
    modifiedTime: data.modifiedTime ?? null,
  };
}

export async function listFilesInFolder(
  folderId: string,
  tokens: DriveCredentials,
  options: { pageSize?: number; connectionId?: string } = {},
  driveClient?: drive_v3.Drive
): Promise<DriveFileMetadata[]> {
  if (!folderId) {
    throw new Error('Google Drive folderId is required');
  }

  const files: DriveFileMetadata[] = [];
  const pageSize = options.pageSize ?? 100;
  let pageToken: string | undefined;

  do {
    const response = await callDriveApi(
      tokens,
      {
        operationName: 'files.list',
        driveClient,
        connectionId: options.connectionId,
      },
      (drive) =>
        drive.files.list({
          q: `'${folderId}' in parents and trashed = false`,
          corpora: 'user',
          fields: 'files(id, name, mimeType, size, modifiedTime), nextPageToken',
          pageSize,
          pageToken,
          supportsAllDrives: false,
          includeItemsFromAllDrives: false,
          spaces: 'drive',
        })
    );

    const pageFiles = response.data.files ?? [];
    for (const file of pageFiles) {
      if (!file.id || !file.name || !file.mimeType) {
        continue;
      }

      const sizeValue =
        typeof file.size === 'string' ? Number.parseInt(file.size, 10) : undefined;

      files.push({
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        size: Number.isFinite(sizeValue) && sizeValue ? sizeValue : 0,
        modifiedTime: file.modifiedTime ?? null,
      });
    }

    pageToken = response.data.nextPageToken ?? undefined;
  } while (pageToken);

  return files;
}

export async function downloadFile(
  fileId: string,
  tokens: DriveCredentials,
  driveClient?: drive_v3.Drive
): Promise<Buffer> {
  if (!fileId) {
    throw new Error('Google Drive fileId is required to download');
  }

  const response = await callDriveApi(
    tokens,
    { operationName: 'files.get_media', driveClient },
    (drive) =>
      drive.files.get(
        {
          fileId,
          alt: 'media',
          supportsAllDrives: false,
        },
        {
          responseType: 'arraybuffer',
        }
      )
  );

  if (!response.data) {
    throw new Error(`Google Drive returned empty response for file ${fileId}`);
  }

  return Buffer.from(response.data as ArrayBuffer);
}

export type WebhookRegistrationParams = {
  folderId: string;
  webhookAddress: string;
  channelId?: string;
  channelToken?: string;
};

export type WebhookRegistrationResult = {
  channelId: string;
  resourceId: string;
  expiration?: string | null;
};

export async function registerWebhook(
  tokens: DriveCredentials,
  params: WebhookRegistrationParams,
  driveClient?: drive_v3.Drive
): Promise<WebhookRegistrationResult> {
  const channelId = params.channelId ?? crypto.randomUUID();

  const response = await callDriveApi(
    tokens,
    { operationName: 'files.watch', driveClient },
    (drive) =>
      drive.files.watch({
        fileId: params.folderId,
        requestBody: {
          id: channelId,
          type: 'web_hook',
          address: params.webhookAddress,
          token: params.channelToken,
        },
        supportsAllDrives: false,
      })
  );

  const body = response.data;

  if (!body.id || !body.resourceId) {
    throw new Error('Google Drive webhook registration did not return identifiers');
  }

  return {
    channelId: body.id,
    resourceId: body.resourceId,
    expiration: body.expiration ?? null,
  };
}

export async function stopWebhook(
  tokens: DriveCredentials,
  params: { channelId: string; resourceId: string },
  driveClient?: drive_v3.Drive
): Promise<void> {
  if (!params.channelId || !params.resourceId) {
    throw new Error('Channel ID and resource ID are required to stop webhook');
  }

  await callDriveApi(
    tokens,
    { operationName: 'channels.stop', driveClient },
    (drive) =>
      drive.channels.stop({
        requestBody: {
          id: params.channelId,
          resourceId: params.resourceId,
        },
      })
  );
}

export type CloudConnectionSummary = {
  id: string;
  provider: string;
  providerDisplayName: string;
  folderId: string | null;
  folderName: string | null;
  syncEnabled: boolean;
  createdAt: string;
  lastSync: string | null;
  status: 'active' | 'error';
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  lastErrorAt: string | null;
};

export function adaptCloudConnectionRow(row: {
  id: string;
  provider: string;
  folder_id: string | null;
  folder_name?: string | null;
  created_at: string;
  last_sync?: string | null;
  status?: 'active' | 'error' | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_error_at?: string | null;
}): CloudConnectionSummary {
  return {
    id: row.id,
    provider: row.provider,
    providerDisplayName: resolveProviderDisplayName(row.provider),
    folderId: row.folder_id ?? null,
    folderName: row.folder_name ?? null,
    syncEnabled: Boolean(row.folder_id),
    createdAt: row.created_at,
    lastSync: row.last_sync ?? null,
    status: row.status ?? 'active',
    lastErrorCode: row.last_error_code ?? null,
    lastErrorMessage: row.last_error_message ?? null,
    lastErrorAt: row.last_error_at ?? null,
  };
}

export { GOOGLE_DRIVE_SCOPES };
