import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as disconnectPOST } from '@/app/api/cloud/google-drive/disconnect/route';
import { POST as selectFolderPOST } from '@/app/api/cloud/google-drive/select-folder/route';
import { processingQueue } from '@/lib/services/processingQueue';
import * as googleDriveService from '@/lib/services/googleDriveService';
import { encryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';

const DEFAULT_USER_ID = 'default-user';

type TableName = 'cloud_connections' | 'uploaded_files' | 'sync_events';

const mockDb: Record<TableName, Map<string, any>> = {
  cloud_connections: new Map(),
  uploaded_files: new Map(),
  sync_events: new Map(),
};

const pendingUpdateErrors: Record<TableName, Array<{ message: string }>> = {
  cloud_connections: [],
  uploaded_files: [],
  sync_events: [],
};

function resetMockDb() {
  for (const table of Object.values(mockDb)) {
    table.clear();
  }
}

function resetUpdateErrors() {
  for (const errors of Object.values(pendingUpdateErrors)) {
    errors.length = 0;
  }
}

function enqueueUpdateError(tableName: TableName, message: string) {
  pendingUpdateErrors[tableName].push({ message });
}

function createQuery(tableName: TableName) {
  const filter: Record<string, unknown> = {};

  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filter[column] = value;
      return api;
    },
    maybeSingle: async () => {
      const rows = Array.from(mockDb[tableName].values()).filter((row) => {
        return Object.entries(filter).every(([key, value]) => row[key] === value);
      });

      if (rows.length === 0) {
        return { data: null, error: null };
      }

      if (rows.length > 1) {
        return { data: null, error: { message: 'Multiple rows matched' } };
      }

      return { data: { ...rows[0] }, error: null };
    },
    insert: async (payload: any) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        const id = row.id ?? randomUUID();
        mockDb[tableName].set(id, { ...row, id });
      }
      return { error: null };
    },
    update: (patch: Record<string, unknown>) => {
      return {
        eq: async (column: string, value: unknown) => {
          const combinedFilter = { ...filter, [column]: value };
          const rows = Array.from(mockDb[tableName].values()).filter((row) => {
            return Object.entries(combinedFilter).every(([key, val]) => row[key] === val);
          });

          const pendingError = pendingUpdateErrors[tableName].shift();
          if (pendingError) {
            return { data: null, error: { message: pendingError.message } };
          }

          for (const row of rows) {
            Object.assign(row, patch);
            mockDb[tableName].set(row.id, row);
          }

          return { data: rows.map((row) => ({ ...row })), error: null };
        },
      } satisfies Record<string, any>;
    },
    delete: () => {
      return {
        eq: async (column: string, value: unknown) => {
          const combinedFilter = { ...filter, [column]: value };
          const rows = Array.from(mockDb[tableName].values()).filter((row) => {
            return Object.entries(combinedFilter).every(([key, val]) => row[key] === val);
          });
          for (const row of rows) {
            mockDb[tableName].delete(row.id);
          }
          return { error: null };
        },
      } satisfies Record<string, any>;
    },
  } satisfies Record<string, any>;

  return api;
}

describe('Google Drive folder selection', () => {
  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
    }

    if (!process.env.GOOGLE_DRIVE_WEBHOOK_URL) {
      process.env.GOOGLE_DRIVE_WEBHOOK_URL = 'https://example.com/google-drive-webhook';
    }
  });

  beforeEach(() => {
    resetMockDb();
    processingQueue._reset();
    vi.restoreAllMocks();
    resetUpdateErrors();

    vi.spyOn(supabase, 'from').mockImplementation((tableName: string) => {
      return createQuery(tableName as TableName);
    });

    vi.spyOn(supabase.storage, 'from').mockReturnValue({
      upload: vi.fn().mockResolvedValue({ data: { path: 'mock-path' }, error: null }),
      remove: vi.fn().mockResolvedValue({ data: null, error: null }),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns 401 when no Google Drive connection exists', async () => {
    const request = new Request('http://localhost:3000/api/cloud/google-drive/select-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: 'folder-123', folderName: 'Team Notes' }),
    });

    const response = await selectFolderPOST(request);
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.error).toBe('NO_CONNECTION');
  });

  it('syncs files from Drive folder and updates connection metadata', async () => {
    const connectionId = randomUUID();
    const accessToken = encryptToken('access-token');
    const refreshToken = encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: DEFAULT_USER_ID,
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      folder_id: null,
      folder_name: null,
      webhook_id: null,
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    const listFilesSpy = vi
      .spyOn(googleDriveService, 'listFilesInFolder')
      .mockResolvedValue([
        {
          id: 'drive-file-1',
          name: 'Meeting Notes.pdf',
          mimeType: 'application/pdf',
          size: 2048,
          modifiedTime: null,
        },
      ]);

    const downloadSpy = vi
      .spyOn(googleDriveService, 'downloadFile')
      .mockResolvedValue(Buffer.from('hello world'));

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as any);

    const registerWebhookSpy = vi
      .spyOn(googleDriveService, 'registerWebhook')
      .mockResolvedValue({ channelId: 'channel-123', resourceId: 'resource-123', expiration: null });

    const uploadMock = vi.fn().mockResolvedValue({ data: { path: 'drive/mock-path' }, error: null });
    const removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.spyOn(supabase.storage, 'from').mockReturnValue({
      upload: uploadMock,
      remove: removeMock,
    } as any);

    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({ immediate: true, queuePosition: null });

    const request = new Request('http://localhost:3000/api/cloud/google-drive/select-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: 'folder-abc', folderName: 'Project Docs' }),
    });

    const response = await selectFolderPOST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.syncedFiles).toBe(1);
    expect(payload.folderName).toBe('Project Docs');
    expect(payload.webhookId).toBe('channel-123');

    expect(listFilesSpy).toHaveBeenCalledWith('folder-abc', expect.anything(), {}, expect.anything());
    expect(downloadSpy).toHaveBeenCalledWith('drive-file-1', expect.anything(), expect.anything());
    expect(registerWebhookSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      folderId: 'folder-abc',
    }), expect.anything());

    const connection = mockDb.cloud_connections.get(connectionId)!;
    expect(connection.folder_id).toBe('folder-abc');
    expect(connection.folder_name).toBe('Project Docs');
    expect(connection.webhook_id).toBe('channel-123');
    expect(connection.status).toBe('active');
    expect(connection.last_error_code).toBeNull();
    expect(connection.last_error_message).toBeNull();
    expect(connection.last_error_at).toBeNull();

    const uploadedRecords = Array.from(mockDb.uploaded_files.values());
    expect(uploadedRecords).toHaveLength(1);
    expect(uploadedRecords[0].source).toBe('google_drive');
    expect(uploadedRecords[0].external_id).toBe('drive-file-1');
    expect(uploadedRecords[0].sync_enabled).toBe(true);
    expect(uploadedRecords[0].storage_path).toMatch(
      new RegExp(`^cloud/google-drive/${connectionId}/[a-f0-9]{8}-`)
    );
    expect(['processing', 'pending']).toContain(uploadedRecords[0].status);

    const events = Array.from(mockDb.sync_events.values()).filter(
      (event) => event.external_file_id === 'drive-file-1'
    );
    expect(events).toHaveLength(1);
    expect(events[0].event_type).toBe('file_added');
    expect(events[0].status).toBe('completed');
    expect(events[0].error_message ?? null).toBeNull();

    expect(uploadMock).toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
  });

  it('retries updating connection when legacy schema is missing new columns', async () => {
    const connectionId = randomUUID();
    const accessToken = encryptToken('access-token');
    const refreshToken = encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: DEFAULT_USER_ID,
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      folder_id: null,
      folder_name: null,
      webhook_id: null,
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    enqueueUpdateError('cloud_connections', 'column "status" does not exist');

    vi.spyOn(googleDriveService, 'listFilesInFolder').mockResolvedValue([]);
    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as any);

    const registerWebhookSpy = vi
      .spyOn(googleDriveService, 'registerWebhook')
      .mockResolvedValue({ channelId: 'channel-legacy', resourceId: 'resource-legacy', expiration: null });

    const request = new Request('http://localhost:3000/api/cloud/google-drive/select-folder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: 'folder-legacy', folderName: 'Legacy Folder' }),
    });

    const response = await selectFolderPOST(request);

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.folderId).toBe('folder-legacy');
    expect(body.folderName).toBe('Legacy Folder');

    const connection = mockDb.cloud_connections.get(connectionId)!;
    expect(connection.folder_id).toBe('folder-legacy');
    expect(connection.webhook_id).toBe('channel-legacy');
    expect(connection.folder_name).toBeNull();

    expect(registerWebhookSpy).toHaveBeenCalled();
  });

  describe('disconnect route', () => {
    it('returns success when no connection exists', async () => {
      const request = new Request('http://localhost:3000/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const response = await disconnectPOST(request);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toEqual({ success: true, disconnected: false });
    });

    it('stops webhook and removes connection', async () => {
      const connectionId = randomUUID();
      const accessToken = encryptToken('access-token');
      const refreshToken = encryptToken('refresh-token');

      mockDb.cloud_connections.set(connectionId, {
        id: connectionId,
        user_id: DEFAULT_USER_ID,
        provider: 'google_drive',
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        folder_id: 'folder-123',
        folder_name: 'Project Notes',
        webhook_id: 'channel-456',
      });

      const stopWebhookSpy = vi.spyOn(googleDriveService, 'stopWebhook').mockResolvedValue();

      const request = new Request('http://localhost:3000/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const response = await disconnectPOST(request);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toEqual({ success: true, disconnected: true });

      expect(stopWebhookSpy).toHaveBeenCalledWith(
        expect.any(Object),
        {
          channelId: 'channel-456',
          resourceId: 'folder-123',
        }
      );

      expect(mockDb.cloud_connections.size).toBe(0);
    });

    it('returns warning when webhook stop fails but connection is deleted', async () => {
      const connectionId = randomUUID();
      const accessToken = encryptToken('access-token');
      const refreshToken = encryptToken('refresh-token');

      mockDb.cloud_connections.set(connectionId, {
        id: connectionId,
        user_id: DEFAULT_USER_ID,
        provider: 'google_drive',
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        folder_id: 'folder-123',
        folder_name: 'Project Notes',
        webhook_id: 'channel-456',
      });

      const stopWebhookSpy = vi
        .spyOn(googleDriveService, 'stopWebhook')
        .mockRejectedValue(new Error('stop failed'));

      const request = new Request('http://localhost:3000/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const response = await disconnectPOST(request);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toEqual({
        success: true,
        disconnected: true,
        warning: 'WEBHOOK_STOP_FAILED',
      });

      expect(stopWebhookSpy).toHaveBeenCalledWith(
        expect.any(Object),
        {
          channelId: 'channel-456',
          resourceId: 'folder-123',
        }
      );

      expect(mockDb.cloud_connections.size).toBe(0);
    });

    it('removes connection without stopping webhook when metadata missing', async () => {
      const connectionId = randomUUID();
      const accessToken = encryptToken('access-token');
      const refreshToken = encryptToken('refresh-token');

      mockDb.cloud_connections.set(connectionId, {
        id: connectionId,
        user_id: DEFAULT_USER_ID,
        provider: 'google_drive',
        access_token: accessToken,
        refresh_token: refreshToken,
        token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        folder_id: null,
        folder_name: null,
        webhook_id: null,
      });

      const stopWebhookSpy = vi.spyOn(googleDriveService, 'stopWebhook').mockResolvedValue();

      const request = new Request('http://localhost:3000/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const response = await disconnectPOST(request);
      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload).toEqual({ success: true, disconnected: true });

      expect(stopWebhookSpy).not.toHaveBeenCalled();
      expect(mockDb.cloud_connections.size).toBe(0);
    });

    it('returns 500 when connection lookup fails', async () => {
      vi.spyOn(supabase, 'from').mockImplementationOnce(() => {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: null,
                  error: { message: 'lookup failed' },
                }),
              }),
            }),
          }),
        } as any;
      });

      const request = new Request('http://localhost:3000/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const response = await disconnectPOST(request);
      expect(response.status).toBe(500);
      const payload = await response.json();
      expect(payload).toEqual({
        error: 'CONNECTION_LOOKUP_FAILED',
        message: 'Failed to load Google Drive connection',
      });
    });

    it('returns 500 when deleting connection fails', async () => {
      const connectionId = randomUUID();
      const accessToken = encryptToken('access-token');
      const refreshToken = encryptToken('refresh-token');

      vi.spyOn(supabase, 'from').mockImplementation((tableName: string) => {
        if (tableName === 'cloud_connections') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: async () => ({
                    data: {
                      id: connectionId,
                      access_token: accessToken,
                      refresh_token: refreshToken,
                      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
                      folder_id: 'folder-123',
                      webhook_id: 'channel-456',
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: () => ({
              eq: async () => ({ error: { message: 'delete failed' } }),
            }),
          } as any;
        }

        return createQuery(tableName as TableName);
      });

      const stopWebhookSpy = vi.spyOn(googleDriveService, 'stopWebhook').mockResolvedValue();

      const request = new Request('http://localhost:3000/api/cloud/google-drive/disconnect', {
        method: 'POST',
      });

      const response = await disconnectPOST(request);
      expect(response.status).toBe(500);
      const payload = await response.json();
      expect(payload).toEqual({
        error: 'DISCONNECT_FAILED',
        message: 'Failed to remove Google Drive connection',
      });

      expect(stopWebhookSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          accessToken: expect.any(String),
          refreshToken: expect.any(String),
        }),
        {
          channelId: 'channel-456',
          resourceId: 'folder-123',
        }
      );
    });
  });
});
