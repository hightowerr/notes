import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as webhookPOST, __testing } from '@/app/api/webhooks/google-drive/route';
import { generateContentHash } from '@/lib/schemas';
import { MAX_FILE_SIZE } from '@/lib/schemas/uploadedFileSchema';
import { MAX_FILE_SIZE } from '@/lib/schemas/uploadedFileSchema';
import { processingQueue } from '@/lib/services/processingQueue';
import * as googleDriveService from '@/lib/services/googleDriveService';
import * as tokenEncryption from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';

type DriveClient = ReturnType<typeof googleDriveService.createDriveClient>;

type CloudConnectionRow = {
  id: string;
  user_id: string;
  provider: 'google_drive';
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  webhook_id: string | null;
  folder_id?: string | null;
  folder_name?: string | null;
  status?: 'active' | 'error';
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_error_at?: string | null;
};

type UploadedFileRow = {
  id: string;
  name: string;
  size?: number;
  mime_type?: string;
  content_hash: string;
  uploaded_at?: string;
  storage_path?: string | null;
  status?: string;
  source?: string;
  external_id?: string | null;
  sync_enabled?: boolean;
  queue_position?: number | null;
};

type SyncEventRow = {
  id: string;
  connection_id: string;
  event_type: string;
  external_file_id: string;
  file_name?: string | null;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  error_message?: string | null;
  retry_count?: number;
  next_retry_at?: string | null;
};

type ProcessedDocumentRow = {
  id: string;
  file_id: string;
  markdown_content?: string;
};

type TableName = 'cloud_connections' | 'uploaded_files' | 'sync_events' | 'processed_documents';

type TableRowMap = {
  cloud_connections: CloudConnectionRow;
  uploaded_files: UploadedFileRow;
  sync_events: SyncEventRow;
  processed_documents: ProcessedDocumentRow;
};

const mockDb: { [K in TableName]: Map<string, TableRowMap[K]> } = {
  cloud_connections: new Map(),
  uploaded_files: new Map(),
  sync_events: new Map(),
  processed_documents: new Map(),
};

const originalFetch: typeof fetch | undefined = global.fetch;
let uploadMock: ReturnType<typeof vi.fn>;
let removeMock: ReturnType<typeof vi.fn>;

const pendingUpdateErrors: Record<TableName, Array<{ message: string }>> = {
  cloud_connections: [],
  uploaded_files: [],
  sync_events: [],
  processed_documents: [],
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

function createQuery<K extends TableName>(tableName: K) {
  type Row = TableRowMap[K];
  const table = mockDb[tableName];
  const predicates: Array<(row: Row) => boolean> = [];

  const matches = (row: Row) => predicates.every((predicate) => predicate(row));

  const api = {
    select: () => api,
    eq: (column: keyof Row, value: Row[keyof Row]) => {
      predicates.push((row) => row[column] === value);
      return api;
    },
    neq: (column: keyof Row, value: Row[keyof Row]) => {
      predicates.push((row) => row[column] !== value);
      return api;
    },
    not: (column: keyof Row, operator: string, value: unknown) => {
      if (operator === 'is' && value === null) {
        predicates.push((row) => row[column] !== null && row[column] !== undefined);
      }
      return api;
    },
    then: (
      onFulfilled?: (value: { data: Row[]; error: null }) => unknown,
      onRejected?: (reason: unknown) => unknown
    ) => {
      const rows = Array.from(table.values())
        .filter(matches)
        .map((row) => ({ ...row }));
      return Promise.resolve({ data: rows, error: null }).then(onFulfilled, onRejected);
    },
    maybeSingle: async () => {
      const rows = Array.from(table.values()).filter(matches);

      if (rows.length === 0) {
        return { data: null as Row | null, error: null };
      }

      if (rows.length > 1) {
        return { data: null as Row | null, error: { message: 'Multiple rows matched' } };
      }

      return { data: { ...rows[0] }, error: null };
    },
    insert: async (payload: Row | Row[]) => {
      const rows = Array.isArray(payload) ? payload : [payload];
      for (const row of rows) {
        const id = row.id ?? randomUUID();
        table.set(id, { ...row, id });
      }
      return { data: null, error: null };
    },
    update: (patch: Partial<Row>) => {
      return {
        eq: async (column: keyof Row, value: Row[keyof Row]) => {
          const rows = Array.from(table.values()).filter(
            (row) => matches(row) && row[column] === value
          );

          const pendingError = pendingUpdateErrors[tableName].shift();
          if (pendingError) {
            return { data: null, error: { message: pendingError.message } };
          }

          for (const row of rows) {
            const updatedRow = { ...row, ...patch, id: row.id };
            table.set(row.id, updatedRow);
          }

          return { data: rows.map((row) => ({ ...row })), error: null };
        },
      };
    },
    delete: () => {
      return {
        eq: async (column: keyof Row, value: Row[keyof Row]) => {
          const rows = Array.from(table.values()).filter(
            (row) => matches(row) && row[column] === value
          );
          for (const row of rows) {
            table.delete((row as Row & { id: string }).id);
          }
          return { error: null };
        },
      };
    },
  };

  return api;
}

describe('Google Drive webhook handler', () => {
  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
    }
  });

  beforeEach(() => {
    resetMockDb();
    resetUpdateErrors();
    processingQueue._reset();
    vi.restoreAllMocks();

    vi.spyOn(supabase, 'from').mockImplementation((tableName: string) =>
      createQuery(tableName as TableName)
    );

    type StorageBucketApi = ReturnType<typeof supabase.storage.from>;
    uploadMock = vi.fn().mockResolvedValue({ data: { path: 'drive/mock-path' }, error: null });
    removeMock = vi.fn().mockResolvedValue({ data: null, error: null });
    const storageMock = {
      upload: uploadMock,
      remove: removeMock,
    } as unknown as StorageBucketApi;

    vi.spyOn(supabase.storage, 'from').mockReturnValue(storageMock);

    global.fetch = vi.fn().mockResolvedValue({ ok: true }) as unknown as typeof fetch;
  });

  afterEach(async () => {
    await __testing.waitForAllTasks();
    __testing.clearScheduledRetries();
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalFetch) {
      global.fetch = originalFetch;
    }
  });

  it('returns 202 when channel token is missing', async () => {
    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: false, reason: 'missing_channel_token' });

    await __testing.waitForAllTasks();
    expect(mockDb.sync_events.size).toBe(0);
  });

  it('persists new Drive file and queues processing', async () => {
    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: 'drive-file-123',
      name: 'Meeting Notes.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      modifiedTime: null,
    });
    vi.spyOn(googleDriveService, 'downloadFile').mockResolvedValue(Buffer.from('hello world'));
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': 'https://www.googleapis.com/drive/v3/files/drive-file-123?foo=bar',
        'X-Goog-Resource-State': 'add',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    expect(mockDb.uploaded_files.size).toBe(1);
    const [uploaded] = Array.from(mockDb.uploaded_files.values());
    expect(uploaded.external_id).toBe('drive-file-123');
    expect(uploaded.source).toBe('google_drive');
    expect(uploaded.status).toBe('processing');
    expect(uploaded.storage_path).toMatch(
      new RegExp(`^cloud/google-drive/${connectionId}/[a-f0-9]{8}-`)
    );

    expect(mockDb.sync_events.size).toBe(1);
    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.status).toBe('completed');
    expect(event.file_name).toBe('Meeting Notes.pdf');

    expect(processingQueue.enqueue).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('marks duplicate files as failed sync events', async () => {
    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    const duplicateBuffer = Buffer.from('duplicate content');
    const arrayBuffer = duplicateBuffer.buffer.slice(
      duplicateBuffer.byteOffset,
      duplicateBuffer.byteOffset + duplicateBuffer.byteLength
    );
    const contentHash = await generateContentHash(arrayBuffer);

    mockDb.uploaded_files.set('existing-file', {
      id: 'existing-file',
      name: 'Existing Notes.pdf',
      content_hash: contentHash,
    });

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: 'drive-file-999',
      name: 'Duplicate.pdf',
      mimeType: 'application/pdf',
      size: 2048,
      modifiedTime: null,
    });
    vi.spyOn(googleDriveService, 'downloadFile').mockResolvedValue(duplicateBuffer);
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: false,
      queuePosition: 1,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': 'https://www.googleapis.com/drive/v3/files/drive-file-999',
        'X-Goog-Resource-State': 'add',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: true });

    await __testing.waitForAllTasks();
    expect(mockDb.uploaded_files.size).toBe(1);

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.status).toBe('failed');
    expect(event.error_message).toContain('Duplicate of Existing Notes.pdf');

    expect(processingQueue.enqueue).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects files that exceed maximum size before download', async () => {
    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    const downloadSpy = vi
      .spyOn(googleDriveService, 'downloadFile')
      .mockResolvedValue(Buffer.from('should-not-download'));

    const createDriveSpy = vi
      .spyOn(googleDriveService, 'createDriveClient')
      .mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: 'drive-file-large',
      name: 'Large Report.pdf',
      mimeType: 'application/pdf',
      size: MAX_FILE_SIZE + 1024,
      modifiedTime: null,
    });
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: false,
      queuePosition: 1,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': 'https://www.googleapis.com/drive/v3/files/drive-file-large',
        'X-Goog-Resource-State': 'add',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    expect(downloadSpy).not.toHaveBeenCalled();
    expect(processingQueue.enqueue).not.toHaveBeenCalled();
    expect(uploadMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.status).toBe('failed');
    expect(event.file_name).toBe('Large Report.pdf');
    expect(event.error_message).toContain('maximum size limit');
  });

  it('detects channel expiration notifications and clears webhook state', async () => {
    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    const createDriveSpy = vi.spyOn(googleDriveService, 'createDriveClient');
    const metadataSpy = vi.spyOn(googleDriveService, 'getFileMetadata');
    const enqueueSpy = vi.spyOn(processingQueue, 'enqueue');

    const expirationIso = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Channel-Expiration': expirationIso,
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: false, reason: 'channel_expired' });

    await __testing.waitForAllTasks();

    const updatedConnection = mockDb.cloud_connections.get(connectionId);
    expect(updatedConnection?.webhook_id).toBeNull();
    expect(updatedConnection?.status).toBe('error');
    expect(updatedConnection?.last_error_code).toBe('WEBHOOK_EXPIRED');
    expect(updatedConnection?.last_error_message ?? '').toContain('expired');
    expect(updatedConnection?.last_error_at).not.toBeNull();

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event).toMatchObject({
      event_type: 'sync_error',
      status: 'failed',
    });
    expect(event.error_message).toContain('expired');

    expect(createDriveSpy).not.toHaveBeenCalled();
    expect(metadataSpy).not.toHaveBeenCalled();
    expect(enqueueSpy).not.toHaveBeenCalled();
  });

  it('flags connection error when token decryption fails', async () => {
    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    const decryptSpy = vi
      .spyOn(tokenEncryption, 'decryptToken')
      .mockImplementation(() => {
        throw new Error('Decrypt failure');
      });

    const enqueueSpy = vi.spyOn(processingQueue, 'enqueue');
    const metadataSpy = vi.spyOn(googleDriveService, 'getFileMetadata');
    const downloadSpy = vi.spyOn(googleDriveService, 'downloadFile');

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': 'https://www.googleapis.com/drive/v3/files/drive-file-999',
        'X-Goog-Resource-State': 'add',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    const updatedConnection = mockDb.cloud_connections.get(connectionId);
    expect(updatedConnection?.status).toBe('error');
    expect(updatedConnection?.last_error_code).toBe('TOKEN_DECRYPT_FAILED');
    expect(updatedConnection?.last_error_message ?? '').toContain('Failed to decrypt');
    expect(updatedConnection?.last_error_at).not.toBeNull();
    expect(updatedConnection?.webhook_id).toBeNull();

    const events = Array.from(mockDb.sync_events.values());
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('failed');
    expect(events[0].error_message).toContain('Failed to decrypt Drive credentials');

    expect(enqueueSpy).not.toHaveBeenCalled();
    expect(metadataSpy).not.toHaveBeenCalled();
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();

    decryptSpy.mockRestore();
  });

  it('reprocesses file when Drive sends update notification', async () => {
    const connectionId = randomUUID();
    const externalFileId = 'drive-file-321';
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    const originalBuffer = Buffer.from('original content');
    const originalArrayBuffer = originalBuffer.buffer.slice(
      originalBuffer.byteOffset,
      originalBuffer.byteOffset + originalBuffer.byteLength
    );
    const originalHash = await generateContentHash(originalArrayBuffer);

    const existingFileId = randomUUID();
    const existingStoragePath = 'cloud/google-drive/old-connection/old-file.pdf';

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    mockDb.uploaded_files.set(existingFileId, {
      id: existingFileId,
      name: 'Meeting Notes.pdf',
      content_hash: originalHash,
      storage_path: existingStoragePath,
      status: 'completed',
      source: 'google_drive',
      external_id: externalFileId,
      sync_enabled: true,
    });

    mockDb.processed_documents.set('processed-1', {
      id: 'processed-1',
      file_id: existingFileId,
      markdown_content: '# Summary',
    });

    const updatedBuffer = Buffer.from('updated drive content');
    const updatedArrayBuffer = updatedBuffer.buffer.slice(
      updatedBuffer.byteOffset,
      updatedBuffer.byteOffset + updatedBuffer.byteLength
    );
    const updatedHash = await generateContentHash(updatedArrayBuffer);

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: externalFileId,
      name: 'Meeting Notes.pdf',
      mimeType: 'application/pdf',
      size: updatedBuffer.byteLength,
      modifiedTime: new Date().toISOString(),
    });
    vi.spyOn(googleDriveService, 'downloadFile').mockResolvedValue(updatedBuffer);
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': `https://www.googleapis.com/drive/v3/files/${externalFileId}`,
        'X-Goog-Resource-State': 'update',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    const updatedFile = mockDb.uploaded_files.get(existingFileId)!;
    expect(updatedFile.content_hash).toBe(updatedHash);
    expect(updatedFile.status).toBe('processing');
    expect(updatedFile.storage_path).toMatch(
      new RegExp(`^cloud/google-drive/${connectionId}/[a-f0-9]{8}-`)
    );
    expect(updatedFile.sync_enabled).toBe(true);

    expect(mockDb.processed_documents.size).toBe(0);

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.event_type).toBe('file_modified');
    expect(event.status).toBe('completed');
    expect(event.error_message).toBeNull();

    expect(uploadMock).toHaveBeenCalledTimes(1);
    const [uploadPath, uploadPayload, uploadOptions] = uploadMock.mock.calls[0]!;
    expect(typeof uploadPath).toBe('string');
    expect(uploadPath).toMatch(new RegExp(`^cloud/google-drive/${connectionId}/`));
    expect(uploadPayload).not.toBeNull();
    expect(typeof (uploadPayload as { byteLength?: unknown }).byteLength).toBe('number');
    expect(uploadOptions).toMatchObject({ upsert: false });
    expect(removeMock).toHaveBeenCalledWith([existingStoragePath]);

    expect(processingQueue.enqueue).toHaveBeenCalledWith(existingFileId, 'Meeting Notes.pdf');
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('skips reprocessing when Drive update has no content changes', async () => {
    const connectionId = randomUUID();
    const externalFileId = 'drive-file-unchanged';
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    const buffer = Buffer.from('same content as before');
    const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
    const contentHash = await generateContentHash(arrayBuffer);

    const existingFileId = randomUUID();

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    mockDb.uploaded_files.set(existingFileId, {
      id: existingFileId,
      name: 'Weekly Report.pdf',
      content_hash: contentHash,
      storage_path: 'cloud/google-drive/old-path/report.pdf',
      status: 'completed',
      source: 'google_drive',
      external_id: externalFileId,
      sync_enabled: true,
    });

    mockDb.processed_documents.set('processed-unchanged', {
      id: 'processed-unchanged',
      file_id: existingFileId,
      markdown_content: '# Report',
    });

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: externalFileId,
      name: 'Weekly Report.pdf',
      mimeType: 'application/pdf',
      size: buffer.byteLength,
      modifiedTime: new Date().toISOString(),
    });
    vi.spyOn(googleDriveService, 'downloadFile').mockResolvedValue(buffer);
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': `https://www.googleapis.com/drive/v3/files/${externalFileId}`,
        'X-Goog-Resource-State': 'update',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    const updatedFile = mockDb.uploaded_files.get(existingFileId)!;
    expect(updatedFile.content_hash).toBe(contentHash);
    expect(updatedFile.status).toBe('completed');
    expect(mockDb.processed_documents.size).toBe(1);

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.event_type).toBe('file_modified');
    expect(event.status).toBe('completed');
    expect(event.error_message).toBe('No content changes detected');

    expect(uploadMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(processingQueue.enqueue).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('rejects updated file when reported size exceeds limit', async () => {
    const connectionId = randomUUID();
    const externalFileId = 'drive-file-too-large';
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    const existingFileId = randomUUID();

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    mockDb.uploaded_files.set(existingFileId, {
      id: existingFileId,
      name: 'Huge Report.pdf',
      content_hash: await generateContentHash(Buffer.from('small').buffer),
      storage_path: 'cloud/google-drive/huge/huge-report.pdf',
      status: 'completed',
      source: 'google_drive',
      external_id: externalFileId,
      sync_enabled: true,
    });

    const downloadSpy = vi.spyOn(googleDriveService, 'downloadFile');

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: externalFileId,
      name: 'Huge Report.pdf',
      mimeType: 'application/pdf',
      size: MAX_FILE_SIZE + 1024,
      modifiedTime: new Date().toISOString(),
    });
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': `https://www.googleapis.com/drive/v3/files/${externalFileId}`,
        'X-Goog-Resource-State': 'update',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    expect(downloadSpy).not.toHaveBeenCalled();

    const updatedFile = mockDb.uploaded_files.get(existingFileId)!;
    expect(updatedFile.storage_path).toBe('cloud/google-drive/huge/huge-report.pdf');
    expect(updatedFile.status).toBe('completed');

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.event_type).toBe('file_modified');
    expect(event.status).toBe('failed');
    expect(event.error_message).toContain('maximum size limit');
  });

  it('rejects updated file when size metadata is unavailable', async () => {
    const connectionId = randomUUID();
    const externalFileId = 'drive-file-missing-size';
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    const existingFileId = randomUUID();

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    mockDb.uploaded_files.set(existingFileId, {
      id: existingFileId,
      name: 'Unknown Size.pdf',
      content_hash: await generateContentHash(Buffer.from('content').buffer),
      storage_path: 'cloud/google-drive/unknown/unknown.pdf',
      status: 'completed',
      source: 'google_drive',
      external_id: externalFileId,
      sync_enabled: true,
    });

    const downloadSpy = vi.spyOn(googleDriveService, 'downloadFile');

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: externalFileId,
      name: 'Unknown Size.pdf',
      mimeType: 'application/pdf',
      size: 0,
      modifiedTime: new Date().toISOString(),
    });
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': `https://www.googleapis.com/drive/v3/files/${externalFileId}`,
        'X-Goog-Resource-State': 'update',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    expect(downloadSpy).not.toHaveBeenCalled();

    const updatedFile = mockDb.uploaded_files.get(existingFileId)!;
    expect(updatedFile.status).toBe('completed');
    expect(updatedFile.storage_path).toBe('cloud/google-drive/unknown/unknown.pdf');

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.event_type).toBe('file_modified');
    expect(event.status).toBe('failed');
    expect(event.error_message).toBe('Unable to determine file size for updated Google Drive file');
  });

  it('rejects updated file when MIME type becomes unsupported', async () => {
    const connectionId = randomUUID();
    const externalFileId = 'drive-file-unsupported';
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    const existingFileId = randomUUID();

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    mockDb.uploaded_files.set(existingFileId, {
      id: existingFileId,
      name: 'Presentation.pdf',
      content_hash: await generateContentHash(Buffer.from('content').buffer),
      storage_path: 'cloud/google-drive/support/presentation.pdf',
      status: 'completed',
      source: 'google_drive',
      external_id: externalFileId,
      sync_enabled: true,
    });

    const downloadSpy = vi.spyOn(googleDriveService, 'downloadFile');

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: externalFileId,
      name: 'Presentation.pdf',
      mimeType: 'application/vnd.ms-powerpoint',
      size: 2048,
      modifiedTime: new Date().toISOString(),
    });
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': `https://www.googleapis.com/drive/v3/files/${externalFileId}`,
        'X-Goog-Resource-State': 'update',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    expect(downloadSpy).not.toHaveBeenCalled();

    const updatedFile = mockDb.uploaded_files.get(existingFileId)!;
    expect(updatedFile.status).toBe('completed');
    expect(updatedFile.storage_path).toBe('cloud/google-drive/support/presentation.pdf');

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.event_type).toBe('file_modified');
    expect(event.status).toBe('failed');
    expect(event.error_message).toBe('Unsupported file type: application/vnd.ms-powerpoint');
  });

  it('skips update when new content duplicates a different file', async () => {
    const connectionId = randomUUID();
    const targetExternalId = 'drive-file-target';
    const otherExternalId = 'drive-file-other';
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    const originalBuffer = Buffer.from('original target content');
    const originalArrayBuffer = originalBuffer.buffer.slice(
      originalBuffer.byteOffset,
      originalBuffer.byteOffset + originalBuffer.byteLength
    );
    const originalHash = await generateContentHash(originalArrayBuffer);

    const otherBuffer = Buffer.from('other drive file content');
    const otherArrayBuffer = otherBuffer.buffer.slice(
      otherBuffer.byteOffset,
      otherBuffer.byteOffset + otherBuffer.byteLength
    );
    const otherHash = await generateContentHash(otherArrayBuffer);

    const targetFileId = randomUUID();
    const otherFileId = randomUUID();

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    mockDb.uploaded_files.set(targetFileId, {
      id: targetFileId,
      name: 'Target Document.pdf',
      content_hash: originalHash,
      storage_path: 'cloud/google-drive/target/target-document.pdf',
      status: 'completed',
      source: 'google_drive',
      external_id: targetExternalId,
      sync_enabled: true,
    });

    mockDb.uploaded_files.set(otherFileId, {
      id: otherFileId,
      name: 'Existing Duplicate.pdf',
      content_hash: otherHash,
      storage_path: 'cloud/google-drive/other/existing-duplicate.pdf',
      status: 'completed',
      source: 'google_drive',
      external_id: otherExternalId,
      sync_enabled: true,
    });

    mockDb.processed_documents.set('processed-target', {
      id: 'processed-target',
      file_id: targetFileId,
      markdown_content: '# Target',
    });

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: targetExternalId,
      name: 'Target Document.pdf',
      mimeType: 'application/pdf',
      size: otherBuffer.byteLength,
      modifiedTime: new Date().toISOString(),
    });
    vi.spyOn(googleDriveService, 'downloadFile').mockResolvedValue(otherBuffer);
    vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': `https://www.googleapis.com/drive/v3/files/${targetExternalId}`,
        'X-Goog-Resource-State': 'update',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ accepted: true });

    await __testing.waitForAllTasks();

    const targetFile = mockDb.uploaded_files.get(targetFileId)!;
    expect(targetFile.content_hash).toBe(originalHash);
    expect(targetFile.storage_path).toBe('cloud/google-drive/target/target-document.pdf');
    expect(mockDb.processed_documents.size).toBe(1);

    const [event] = Array.from(mockDb.sync_events.values());
    expect(event.event_type).toBe('file_modified');
    expect(event.status).toBe('failed');
    expect(event.error_message).toBe('Duplicate of Existing Duplicate.pdf');

    expect(uploadMock).not.toHaveBeenCalled();
    expect(removeMock).not.toHaveBeenCalled();
    expect(processingQueue.enqueue).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('falls back when connection error columns are missing', async () => {
    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-123',
      status: 'active',
    });

    enqueueUpdateError('cloud_connections', 'column "status" does not exist');

    vi.spyOn(tokenEncryption, 'decryptToken').mockImplementation(() => {
      throw new Error('Decrypt failure');
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-123',
        'X-Goog-Resource-Uri': 'https://www.googleapis.com/drive/v3/files/drive-file-legacy',
        'X-Goog-Resource-State': 'add',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);

    await __testing.waitForAllTasks();

    const connection = mockDb.cloud_connections.get(connectionId);
    expect(connection?.webhook_id).toBeNull();
    expect(connection?.status).toBe('active');
    expect(connection?.last_error_code).toBeUndefined();
  });

  it('retries failed processing with exponential backoff and succeeds on retry', async () => {
    vi.useFakeTimers();

    const connectionId = randomUUID();
    const accessToken = tokenEncryption.encryptToken('access-token');
    const refreshToken = tokenEncryption.encryptToken('refresh-token');

    mockDb.cloud_connections.set(connectionId, {
      id: connectionId,
      user_id: 'default-user',
      provider: 'google_drive',
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      webhook_id: 'channel-retry',
      status: 'active',
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    });

    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as DriveClient);
    vi.spyOn(googleDriveService, 'getFileMetadata').mockResolvedValue({
      id: 'drive-file-retry',
      name: 'Retry Document.md',
      mimeType: 'text/markdown',
      size: 2048,
      modifiedTime: null,
    });

    const downloadSpy = vi
      .spyOn(googleDriveService, 'downloadFile')
      .mockRejectedValueOnce(new Error('Temporary Drive outage'))
      .mockResolvedValueOnce(Buffer.from('# Retry Success'));

    const enqueueSpy = vi.spyOn(processingQueue, 'enqueue').mockReturnValue({
      immediate: true,
      queuePosition: null,
    });

    const request = new Request('http://localhost:3000/api/webhooks/google-drive', {
      method: 'POST',
      headers: {
        'X-Goog-Channel-Token': connectionId,
        'X-Goog-Channel-Id': 'channel-retry',
        'X-Goog-Resource-Uri': 'https://www.googleapis.com/drive/v3/files/drive-file-retry',
        'X-Goog-Resource-State': 'add',
      },
    });

    const response = await webhookPOST(request);
    expect(response.status).toBe(202);

    await __testing.waitForAllTasks();

    expect(mockDb.sync_events.size).toBe(1);
    let [event] = Array.from(mockDb.sync_events.values());
    expect(event.status).toBe('failed');
    expect(event.retry_count).toBe(1);
    expect(event.next_retry_at).not.toBeNull();
    expect(event.retry_context).toBeDefined();
    expect((event.retry_context as any).requestUrl).toContain('/api/webhooks/google-drive');
    expect(__testing.getPendingRetryCount()).toBe(1);

    __testing.clearScheduledRetries();
    expect(__testing.getPendingRetryCount()).toBe(0);

    await __testing.recoverScheduledRetries();
    expect(__testing.getPendingRetryCount()).toBe(1);

    vi.advanceTimersByTime(60_000);
    await Promise.resolve();
    await Promise.resolve();
    await __testing.waitForAllTasks();

    [event] = Array.from(mockDb.sync_events.values());
    expect(event.status).toBe('completed');
    expect(event.retry_count).toBe(1);
    expect(event.next_retry_at).toBeNull();
    expect(event.retry_context ?? null).toBeNull();

    expect(downloadSpy).toHaveBeenCalledTimes(2);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
