import { NextResponse } from 'next/server';

import { stopWebhook, type DriveCredentials } from '@/lib/services/googleDriveService';
import { decryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';

const DEFAULT_USER_ID = 'default-user';

export async function POST() {
  try {
    const { data: connection, error } = await supabase
      .from('cloud_connections')
      .select('id, access_token, refresh_token, token_expires_at, folder_id, webhook_id')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('provider', 'google_drive')
      .maybeSingle();

    if (error) {
      console.error('[Google Drive Disconnect] Failed to load connection', error);
      return NextResponse.json(
        { error: 'CONNECTION_LOOKUP_FAILED', message: 'Failed to load Google Drive connection' },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json({ success: true, disconnected: false }, { status: 200 });
    }

    let tokens: DriveCredentials | null = null;
    let warning: string | null = null;

    try {
      tokens = {
        accessToken: decryptToken(connection.access_token),
        refreshToken: decryptToken(connection.refresh_token),
        tokenExpiresAt: connection.token_expires_at,
        connectionId: connection.id,
      };
    } catch (tokenError) {
      console.error('[Google Drive Disconnect] Failed to decrypt tokens', tokenError);
    }

    if (tokens && connection.webhook_id && connection.folder_id) {
      try {
        await stopWebhook(tokens, {
          channelId: connection.webhook_id,
          resourceId: connection.folder_id,
        });
      } catch (stopError) {
        console.error('[Google Drive Disconnect] Failed to stop webhook', stopError);
        warning = 'WEBHOOK_STOP_FAILED';
      }
    }

    const { error: deleteError } = await supabase
      .from('cloud_connections')
      .delete()
      .eq('id', connection.id);

    if (deleteError) {
      console.error('[Google Drive Disconnect] Failed to delete connection', deleteError);
      return NextResponse.json(
        { error: 'DISCONNECT_FAILED', message: 'Failed to remove Google Drive connection' },
        { status: 500 }
      );
    }

    const responseBody: Record<string, unknown> = {
      success: true,
      disconnected: true,
    };

    if (warning) {
      responseBody.warning = warning;
    }

    return NextResponse.json(responseBody, { status: 200 });
  } catch (error) {
    console.error('[Google Drive Disconnect] Unexpected error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to disconnect Google Drive' },
      { status: 500 }
    );
  }
}
