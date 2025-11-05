import { randomUUID } from 'node:crypto';

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as renewWebhooksGET } from '@/app/api/cron/renew-webhooks/route';
import { DriveTokenRefreshError } from '@/lib/services/googleDriveService';
import * as googleDriveService from '@/lib/services/googleDriveService';
import * as tokenEncryption from '@/lib/services/tokenEncryption';
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
  webhook_id: string | null;
  updated_at: string;
  status?: 'active' | 'error';
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_error_at?: string | null;
};

type SyncEventRow = {
  connection_id: string;
  event_type: string;
  status: string;
  error_message: string | null;
  external_file_id: string;
};

const connections = new Map<string, CloudConnectionRow>();
const syncEvents: SyncEventRow[] = [];

function insertConnection(row: Partial<CloudConnectionRow>) {
  const id = row.id ?? randomUUID();
  const updated = row.updated_at ?? new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();

  connections.set(id, {
    id,
    user_id: row.user_id ?? DEFAULT_USER_ID,
    provider: row.provider ?? 'google_drive',
    access_token: row.access_token ?? 'encrypted-access-token',
    refresh_token: row.refresh_token ?? 'encrypted-refresh-token',
    token_expires_at: row.token_expires_at ?? new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    folder_id: row.folder_id ?? 'drive-folder',
    webhook_id: row.webhook_id ?? 'channel-old',
    updated_at: updated,
    status: row.status ?? 'active',
    last_error_code: row.last_error_code ?? null,
    last_error_message: row.last_error_message ?? null,
    last_error_at: row.last_error_at ?? null,
  });

  return id;
}

function matchesFilter(row: CloudConnectionRow, column: keyof CloudConnectionRow, value: unknown) {
  return row[column] === value;
}

function buildCloudConnectionsQuery() {
  const eqFilters: Partial<Record<keyof CloudConnectionRow, unknown>> = {};
  const notNullColumns = new Set<keyof CloudConnectionRow>();
  const ltFilters: Partial<Record<keyof CloudConnectionRow, string>> = {};

  const query = {
    select: () => query,
    eq: (column: keyof CloudConnectionRow, value: unknown) => {
      eqFilters[column] = value;
      return query;
    },
    not: (column: keyof CloudConnectionRow, operator: string, value: unknown) => {
      if (operator === 'is' && value === null) {
        notNullColumns.add(column);
      }
      return query;
    },
    lt: async (column: keyof CloudConnectionRow, value: string) => {
      ltFilters[column] = value;

      const data = Array.from(connections.values()).filter((row) => {
        const passesEq = Object.entries(eqFilters).every(([key, eqValue]) =>
          matchesFilter(row, key as keyof CloudConnectionRow, eqValue)
        );

        if (!passesEq) {
          return false;
        }

        if (
          Array.from(notNullColumns).some(
            (col) => row[col] === null || row[col] === undefined
          )
        ) {
          return false;
        }

        const ltPass = Object.entries(ltFilters).every(([key, ltValue]) => {
          const rowValue = row[key as keyof CloudConnectionRow];
          if (typeof rowValue !== 'string') {
            return false;
          }
          return rowValue < ltValue;
        });

        return ltPass;
      });

      return {
        data,
        error: null,
      };
    },
    update: (_patch: Partial<CloudConnectionRow>) => {
      throw new Error('update() should not be called before lt()');
    },
  };

  return query;
}

function buildCloudConnectionsUpdate(patch: Partial<CloudConnectionRow>) {
  return {
    eq: async (column: keyof CloudConnectionRow, value: unknown) => {
      const rows = Array.from(connections.values()).filter((row) =>
        matchesFilter(row, column, value)
      );

      for (const row of rows) {
        const next = { ...row, ...patch, updated_at: new Date().toISOString() };
        connections.set(row.id, next);
      }

      return {
        data: rows.map((row) => ({ ...row, ...patch })),
        error: null,
      };
    },
  };
}

function makeSupabaseStub() {
  return vi.spyOn(supabase, 'from').mockImplementation((tableName: string) => {
    if (tableName === 'cloud_connections') {
      const query = buildCloudConnectionsQuery() as Record<string, unknown>;
      query.update = (patch: Partial<CloudConnectionRow>) =>
        buildCloudConnectionsUpdate(patch);
      return query as ReturnType<typeof supabase.from>;
    }

    if (tableName === 'sync_events') {
      return {
        insert: async (payload: SyncEventRow | SyncEventRow[]) => {
          const rows = Array.isArray(payload) ? payload : [payload];
          syncEvents.push(
            ...rows.map((row) => ({
              ...row,
            }))
          );
          return { error: null };
        },
      } as ReturnType<typeof supabase.from>;
    }

    throw new Error(`Unexpected table requested: ${tableName}`);
  });
}

describe('Google Drive webhook renewal cron', () => {
  beforeAll(() => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
    }

    process.env.GOOGLE_DRIVE_WEBHOOK_URL = 'https://example.com/webhook';
  });

  beforeEach(() => {
    connections.clear();
    syncEvents.length = 0;
    vi.restoreAllMocks();
    makeSupabaseStub();

    vi.spyOn(tokenEncryption, 'decryptToken').mockImplementation((value: string) =>
      value.replace('encrypted-', '')
    );
    vi.spyOn(googleDriveService, 'createDriveClient').mockReturnValue({} as any);
    vi.spyOn(googleDriveService, 'stopWebhook').mockResolvedValue(undefined);
    vi.spyOn(googleDriveService, 'registerWebhook').mockImplementation(async () => ({
      channelId: `channel-${randomUUID()}`,
      resourceId: 'resource-123',
      expiration: null,
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    connections.clear();
    syncEvents.length = 0;
  });

  it('renews expiring webhooks and logs sync events', async () => {
    const connectionId = insertConnection({
      folder_id: 'folder-123',
      webhook_id: 'channel-old',
    });

    const request = new Request('http://localhost:3000/api/cron/renew-webhooks', {
      method: 'GET',
    });

    const response = await renewWebhooksGET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.processed).toBe(1);
    expect(payload.renewed).toBe(1);
    expect(payload.failed).toBe(0);

    const updatedConnection = connections.get(connectionId);
    expect(updatedConnection?.webhook_id).toMatch(/^channel-/);
    expect(updatedConnection?.status).toBe('active');
    expect(syncEvents).toHaveLength(1);
    expect(syncEvents[0]).toMatchObject({
      connection_id: connectionId,
      status: 'completed',
      error_message: 'Webhook renewed',
    });
  });

  it('returns early when no connections require renewal', async () => {
    const request = new Request('http://localhost:3000/api/cron/renew-webhooks', {
      method: 'GET',
    });

    const response = await renewWebhooksGET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.processed).toBe(0);
    expect(payload.renewed).toBe(0);
    expect(payload.failed).toBe(0);
  });

  it('flags connection error when token refresh fails', async () => {
    const connectionId = insertConnection({
      folder_id: 'folder-456',
      webhook_id: 'channel-expiring',
    });

    vi.spyOn(googleDriveService, 'registerWebhook').mockRejectedValue(
      new DriveTokenRefreshError('Token refresh failed', 'invalid_grant')
    );

    const request = new Request('http://localhost:3000/api/cron/renew-webhooks', {
      method: 'GET',
    });

    const response = await renewWebhooksGET(request);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.processed).toBe(1);
    expect(payload.failed).toBe(1);
    expect(payload.renewed).toBe(0);

    const erroredConnection = connections.get(connectionId);
    expect(erroredConnection?.status).toBe('error');
    expect(erroredConnection?.last_error_code).toBe('TOKEN_REFRESH_REQUIRED');
    expect(syncEvents).toHaveLength(1);
    expect(syncEvents[0]).toMatchObject({
      connection_id: connectionId,
      status: 'failed',
    });
  });
});
