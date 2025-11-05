import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as manualSyncPOST } from '@/app/api/cloud/google-drive/manual-sync/route';
import { DriveTokenRefreshError } from '@/lib/services/googleDriveService';
import * as folderSync from '@/lib/services/googleDriveFolderSync';
import { encryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';

const DEFAULT_USER_ID = 'default-user';

type CloudConnectionRow = {
  id: string;
  user_id: string;
  provider: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  folder_id: string | null;
  folder_name: string | null;
  status: 'active' | 'error';
  last_error_code: string | null;
  last_error_message: string | null;
  last_error_at: string | null;
  last_sync?: string | null;
};

const cloudConnections = new Map<string, CloudConnectionRow>();

function matchesFilters(
  row: CloudConnectionRow,
  filters: Partial<Record<keyof CloudConnectionRow, unknown>>
) {
  return Object.entries(filters).every(([column, value]) => row[column as keyof CloudConnectionRow] === value);
}

function buildCloudConnectionsQuery() {
  const filters: Partial<Record<keyof CloudConnectionRow, unknown>> = {};

  const query = {
    select: () => query,
    eq: (column: keyof CloudConnectionRow, value: unknown) => {
      filters[column] = value;
      return query;
    },
    maybeSingle: async () => {
      const [row] =
        Array.from(cloudConnections.values()).filter((record) => matchesFilters(record, filters)) ?? [];

      if (!row) {
        return { data: null, error: null };
      }

      return { data: { ...row }, error: null };
    },
    update: (patch: Partial<CloudConnectionRow>) => ({
      eq: async (column: keyof CloudConnectionRow, value: unknown) => {
        filters[column] = value;

        const updatedRows = Array.from(cloudConnections.values()).filter((record) =>
          matchesFilters(record, filters)
        );

        for (const row of updatedRows) {
          const next = { ...row, ...patch };
          cloudConnections.set(row.id, next);
        }

        return {
          data: updatedRows.map((row) => ({ ...row, ...patch })),
          error: null,
        };
      },
    }),
  };

  return query satisfies Record<string, unknown>;
}

function insertConnection(row: Partial<CloudConnectionRow>) {
  const id = row.id ?? randomUUID();
  cloudConnections.set(id, {
    id,
    user_id: row.user_id ?? DEFAULT_USER_ID,
    provider: row.provider ?? 'google_drive',
    access_token: row.access_token ?? encryptToken('access-token'),
    refresh_token: row.refresh_token ?? encryptToken('refresh-token'),
    token_expires_at: row.token_expires_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    folder_id: row.folder_id ?? null,
    folder_name: row.folder_name ?? null,
    status: row.status ?? 'active',
    last_error_code: row.last_error_code ?? null,
    last_error_message: row.last_error_message ?? null,
    last_error_at: row.last_error_at ?? null,
    last_sync: row.last_sync ?? null,
  });
  return id;
}

describe('Google Drive manual sync contract', () => {
  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
    }
  });

  beforeEach(() => {
    cloudConnections.clear();
    vi.restoreAllMocks();

    vi.spyOn(supabase, 'from').mockImplementation((tableName: string) => {
      if (tableName !== 'cloud_connections') {
        throw new Error(`Unexpected table: ${tableName}`);
      }

      return buildCloudConnectionsQuery() as ReturnType<typeof supabase.from>;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    cloudConnections.clear();
  });

  it('returns 200 and sync summary when connection and folder exist', async () => {
    const connectionId = insertConnection({
      folder_id: 'folder-123',
      folder_name: 'Team Notes',
    });

    const syncSummary = {
      syncedFiles: 2,
      duplicateFiles: ['Existing Doc'],
      unsupportedFiles: ['binary.bin'],
    };

    const syncSpy = vi.spyOn(folderSync, 'syncFolderContents').mockResolvedValue(syncSummary);

    const request = new Request('http://localhost:3000/api/cloud/google-drive/manual-sync', {
      method: 'POST',
    });

    const response = await manualSyncPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.syncedFiles).toBe(syncSummary.syncedFiles);
    expect(payload.skippedDuplicates).toBe(syncSummary.duplicateFiles);
    expect(payload.skippedUnsupported).toBe(syncSummary.unsupportedFiles);
    expect(payload.folderId).toBe('folder-123');
    expect(syncSpy).toHaveBeenCalledWith({
      folderId: 'folder-123',
      connectionId,
      requestUrl: request.url,
      tokens: expect.objectContaining({ connectionId }),
    });

    const updatedConnection = cloudConnections.get(connectionId);
    expect(updatedConnection?.last_sync).toBeTruthy();
    expect(updatedConnection?.status).toBe('active');
    expect(updatedConnection?.last_error_code).toBeNull();
  });

  it('returns 401 when no Google Drive connection exists', async () => {
    const request = new Request('http://localhost:3000/api/cloud/google-drive/manual-sync', {
      method: 'POST',
    });

    const response = await manualSyncPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('NO_CONNECTION');
  });

  it('returns 400 when connection has no folder selected', async () => {
    insertConnection({
      folder_id: null,
    });

    const request = new Request('http://localhost:3000/api/cloud/google-drive/manual-sync', {
      method: 'POST',
    });

    const response = await manualSyncPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe('NO_FOLDER_SELECTED');
    expect(
      payload.message.includes('Click "Select Folder" in settings to choose a Google Drive folder')
    ).toBe(true);
  });

  it('returns 401 with TOKEN_REFRESH_REQUIRED when token refresh fails', async () => {
    insertConnection({
      folder_id: 'folder-456',
    });

    const syncSpy = vi.spyOn(folderSync, 'syncFolderContents').mockRejectedValue(
      new DriveTokenRefreshError('Token refresh failed', 'invalid_grant')
    );

    const request = new Request('http://localhost:3000/api/cloud/google-drive/manual-sync', {
      method: 'POST',
    });

    const response = await manualSyncPOST(request);
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe('TOKEN_REFRESH_REQUIRED');
    expect(payload.message).toContain('Reconnect Google Drive');
    expect(syncSpy).toHaveBeenCalled();
  });
});

