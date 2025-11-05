import { beforeAll, describe, expect, it, vi } from 'vitest';
import { google, type drive_v3 } from 'googleapis';

import * as googleDriveService from '@/lib/services/googleDriveService';
import { decryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';

const {
  listFilesInFolder,
  getFileMetadata,
  downloadFile,
  DriveTokenRefreshError,
} = googleDriveService;

beforeAll(() => {
  if (!process.env.ENCRYPTION_KEY) {
    process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
  }

  process.env.GOOGLE_CLIENT_ID ??= 'client-id';
  process.env.GOOGLE_CLIENT_SECRET ??= 'client-secret';
  process.env.GOOGLE_REDIRECT_URI ??= 'https://example.com/oauth/callback';
});

function createMockDrive({
  listImpl,
  getImpl,
  downloadImpl,
}: {
  listImpl?: () => Promise<any>;
  getImpl?: () => Promise<any>;
  downloadImpl?: () => Promise<any>;
} = {}) {
  const auth = {
    setCredentials: vi.fn(),
  };

  const drive: Partial<drive_v3.Drive> = {
    files: {
      list: listImpl ?? vi.fn().mockResolvedValue({ data: { files: [], nextPageToken: undefined } }),
      get: getImpl ?? vi.fn().mockResolvedValue({ data: { id: 'file-1', name: 'File', mimeType: 'text/plain' } }),
    },
    context: {
      _options: {
        auth,
      },
    },
  };

  (drive as any).files.get = getImpl ?? (drive as any).files.get;

  if (downloadImpl) {
    (drive as any).files.get = downloadImpl;
  }

  return { drive: drive as drive_v3.Drive, auth };
}

function setupSupabaseMocks() {
  const updates: Array<Record<string, unknown>> = [];
  const events: Array<Record<string, unknown>> = [];

  const supabaseSpy = vi.spyOn(supabase, 'from').mockImplementation((table: string) => {
    if (table === 'cloud_connections') {
      return {
        update: (payload: Record<string, unknown>) => {
          updates.push(payload);
          return {
            eq: async () => ({ error: null }),
          };
        },
      } as any;
    }

    if (table === 'sync_events') {
      return {
        insert: async (payload: Record<string, unknown>) => {
          events.push(payload);
          return { error: null };
        },
      } as any;
    }

    throw new Error(`Unexpected table ${table}`);
  });

  return { supabaseSpy, updates, events };
}

function setupOAuthMocks({
  refreshImpl,
}: {
  refreshImpl: () => Promise<{
    credentials: { access_token?: string | null; refresh_token?: string | null; expiry_date?: number | null };
  }>;
}) {
  const oauthSpy = vi.spyOn(google.auth, 'OAuth2').mockImplementation(
    (() =>
      ({
        setCredentials: vi.fn(),
        refreshToken: refreshImpl,
        generateAuthUrl: vi.fn(),
        getToken: vi.fn(),
      }) as any) as any
  );

  return { oauthSpy };
}

describe('Google Drive token refresh', () => {
  it('refreshes tokens proactively when expiration is near', async () => {
    const { supabaseSpy, updates, events } = setupSupabaseMocks();

    const refreshImpl = vi.fn().mockResolvedValue({
      credentials: {
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        expiry_date: Date.now() + 60 * 60 * 1000,
      },
    });

    setupOAuthMocks({ refreshImpl });

    const listImpl = vi.fn().mockResolvedValue({ data: { files: [], nextPageToken: undefined } });
    const { drive } = createMockDrive({ listImpl });
    const driveSpy = vi.spyOn(google, 'drive').mockReturnValue(drive as any);

    const tokens = {
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      connectionId: 'conn-1',
    };

    const result = await listFilesInFolder('folder-123', tokens);
    expect(result).toEqual([]);

    expect(refreshImpl).toHaveBeenCalledTimes(1);
    expect(driveSpy).toHaveBeenCalledTimes(1);
    expect(listImpl).toHaveBeenCalledTimes(1);

    expect(tokens.accessToken).toBe('new-access-token');
    expect(tokens.refreshToken).toBe('new-refresh-token');
    expect(tokens.tokenExpiresAt).not.toBeNull();

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: 'active',
      last_error_code: null,
      last_error_message: null,
    });
    expect(decryptToken(updates[0]?.access_token as string)).toBe('new-access-token');
    expect(decryptToken(updates[0]?.refresh_token as string)).toBe('new-refresh-token');

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: 'completed',
      error_message: 'Token refreshed',
      external_file_id: 'token-refresh',
    });

    supabaseSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('retries request after refreshing when a 401 is returned', async () => {
    const { supabaseSpy, updates, events } = setupSupabaseMocks();

    const refreshImpl = vi.fn().mockResolvedValue({
      credentials: {
        access_token: 'retry-access-token',
        refresh_token: 'retry-refresh-token',
        expiry_date: Date.now() + 60 * 60 * 1000,
      },
    });

    setupOAuthMocks({ refreshImpl });

    const metadataMock = vi.fn().mockImplementationOnce(() => {
      const error: any = new Error('Unauthorized');
      error.response = { status: 401 };
      return Promise.reject(error);
    });
    metadataMock.mockResolvedValueOnce({
      data: {
        id: 'file-123',
        name: 'Updated Notes',
        mimeType: 'text/plain',
        size: '1024',
        modifiedTime: new Date().toISOString(),
      },
    });

    const { drive } = createMockDrive({ getImpl: metadataMock });
    const driveSpy = vi.spyOn(google, 'drive').mockReturnValue(drive as any);

    const tokens = {
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      tokenExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      connectionId: 'conn-2',
    };

    const metadata = await getFileMetadata('file-123', tokens);
    expect(metadata).toMatchObject({
      id: 'file-123',
      name: 'Updated Notes',
      mimeType: 'text/plain',
      size: 1024,
    });

    expect(refreshImpl).toHaveBeenCalledTimes(1);
    expect(metadataMock).toHaveBeenCalledTimes(2);
    expect(tokens.accessToken).toBe('retry-access-token');
    expect(tokens.refreshToken).toBe('retry-refresh-token');

    expect(updates).toHaveLength(1);
    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('completed');

    expect(driveSpy).toHaveBeenCalledTimes(1);

    supabaseSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('flags the connection and throws when refresh fails with invalid_grant', async () => {
    const { supabaseSpy, updates, events } = setupSupabaseMocks();

    const refreshImpl = vi.fn().mockRejectedValue({
      response: {
        data: {
          error: 'invalid_grant',
        },
      },
    });

    setupOAuthMocks({ refreshImpl });

    const { drive } = createMockDrive({
      downloadImpl: vi.fn().mockResolvedValue({
        data: new ArrayBuffer(0),
      }),
    });

    const driveSpy = vi.spyOn(google, 'drive').mockReturnValue(drive as any);

    const tokens = {
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      tokenExpiresAt: new Date(Date.now() + 2 * 60 * 1000).toISOString(),
      connectionId: 'conn-3',
    };

    let thrown: unknown = null;
    await expect(
      downloadFile('file-abc', tokens).catch((error) => {
        thrown = error;
        throw error;
      })
    ).rejects.toBeInstanceOf(DriveTokenRefreshError);
    expect(thrown).toBeInstanceOf(DriveTokenRefreshError);
    expect((thrown as DriveTokenRefreshError).reason).toBe('invalid_grant');

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      status: 'error',
      last_error_code: 'TOKEN_REFRESH_FAILED',
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.status).toBe('failed');
    expect(events[0]?.error_message).toBe('Token refresh failed');

    expect(tokens.accessToken).toBe('old-access-token');
    expect(tokens.refreshToken).toBe('old-refresh-token');

    supabaseSpy.mockRestore();
    expect(driveSpy).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
