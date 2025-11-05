import { NextResponse } from 'next/server';

import {
  DriveTokenRefreshError,
  createDriveClient,
  registerWebhook,
  stopWebhook,
  type DriveCredentials,
} from '@/lib/services/googleDriveService';
import { decryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';

const RENEWAL_THRESHOLD_MS = 23 * 60 * 60 * 1000;

type CloudConnectionRow = {
  id: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  folder_id: string | null;
  webhook_id: string | null;
  updated_at: string;
};

type RenewalResult = {
  connectionId: string;
  status: 'renewed' | 'skipped' | 'failed';
  channelId?: string;
  error?: string;
};

function createTokens(row: CloudConnectionRow): DriveCredentials {
  return {
    accessToken: decryptToken(row.access_token),
    refreshToken: decryptToken(row.refresh_token),
    tokenExpiresAt: row.token_expires_at,
    connectionId: row.id,
  };
}

async function logSyncEvent(params: {
  connectionId: string;
  status: 'completed' | 'failed';
  message: string;
  externalId: string;
}) {
  const { error } = await supabase.from('sync_events').insert({
    connection_id: params.connectionId,
    event_type: 'sync_error',
    external_file_id: params.externalId,
    file_name: null,
    status: params.status,
    error_message: params.message,
  });

  if (error) {
    console.warn('[Webhook Renewal] Failed to log sync event', {
      connectionId: params.connectionId,
      error: error.message ?? error,
    });
  }
}

export async function GET(request: Request) {
  const webhookAddress = process.env.GOOGLE_DRIVE_WEBHOOK_URL;

  if (!webhookAddress) {
    console.error('[Webhook Renewal] Missing GOOGLE_DRIVE_WEBHOOK_URL');
    return NextResponse.json(
      { error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook renewal endpoint is not configured' },
      { status: 500 }
    );
  }

  const thresholdIso = new Date(Date.now() - RENEWAL_THRESHOLD_MS).toISOString();

  const { data, error } = await supabase
    .from('cloud_connections')
    .select(
      'id, user_id, access_token, refresh_token, token_expires_at, folder_id, webhook_id, updated_at'
    )
    .eq('provider', 'google_drive')
    .not('folder_id', 'is', null)
    .not('webhook_id', 'is', null)
    .lt('updated_at', thresholdIso);

  if (error) {
    console.error('[Webhook Renewal] Failed to load connections', error);
    return NextResponse.json(
      { error: 'CONNECTION_LOOKUP_FAILED', message: 'Failed to load connections for renewal' },
      { status: 500 }
    );
  }

  const connections = (data ?? []) as CloudConnectionRow[];
  if (connections.length === 0) {
    return NextResponse.json(
      {
        processed: 0,
        renewed: 0,
        failed: 0,
        details: [],
      },
      { status: 200 }
    );
  }

  const results: RenewalResult[] = [];

  for (const connection of connections) {
    const detail: RenewalResult = {
      connectionId: connection.id,
      status: 'skipped',
    };

    if (!connection.folder_id || !connection.webhook_id) {
      detail.status = 'skipped';
      detail.error = 'Missing folder or webhook identifier';
      results.push(detail);
      continue;
    }

    try {
      const tokens = createTokens(connection);
      const driveClient = createDriveClient(tokens);

      try {
        await stopWebhook(
          tokens,
          { channelId: connection.webhook_id, resourceId: connection.folder_id },
          driveClient
        );
      } catch (stopError) {
        console.warn('[Webhook Renewal] Failed to stop existing webhook', {
          connectionId: connection.id,
          error: stopError instanceof Error ? stopError.message : stopError,
        });
      }

      const registration = await registerWebhook(
        tokens,
        {
          folderId: connection.folder_id,
          webhookAddress,
          channelToken: connection.id,
        },
        driveClient
      );

      const { error: updateError } = await supabase
        .from('cloud_connections')
        .update({
          webhook_id: registration.channelId,
          status: 'active',
          last_error_code: null,
          last_error_message: null,
          last_error_at: null,
        })
        .eq('id', connection.id);

      if (updateError) {
        throw new Error(updateError.message ?? 'Failed to update connection');
      }

      await logSyncEvent({
        connectionId: connection.id,
        status: 'completed',
        message: 'Webhook renewed',
        externalId: registration.channelId,
      });

      detail.status = 'renewed';
      detail.channelId = registration.channelId;
    } catch (renewError) {
      const message =
        renewError instanceof Error ? renewError.message : 'Unknown webhook renewal failure';

      detail.status = 'failed';
      detail.error = message;

      const errorCode =
        renewError instanceof DriveTokenRefreshError && renewError.reason === 'invalid_grant'
          ? 'TOKEN_REFRESH_REQUIRED'
          : 'WEBHOOK_RENEWAL_FAILED';

      const nowIso = new Date().toISOString();

      const { error: flagError } = await supabase
        .from('cloud_connections')
        .update({
          status: 'error',
          last_error_code: errorCode,
          last_error_message: message,
          last_error_at: nowIso,
        })
        .eq('id', connection.id);

      if (flagError) {
        console.error('[Webhook Renewal] Failed to flag connection error state', flagError);
      }

      await logSyncEvent({
        connectionId: connection.id,
        status: 'failed',
        message: `Webhook renewal failed: ${message}`,
        externalId: connection.webhook_id ?? connection.id,
      });
    }

    results.push(detail);
  }

  return NextResponse.json(
    {
      processed: connections.length,
      renewed: results.filter((item) => item.status === 'renewed').length,
      failed: results.filter((item) => item.status === 'failed').length,
      details: results,
    },
    { status: 200 }
  );
}
