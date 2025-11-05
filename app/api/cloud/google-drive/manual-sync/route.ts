import { NextResponse } from 'next/server';

import { DriveTokenRefreshError, type DriveCredentials } from '@/lib/services/googleDriveService';
import { syncFolderContents } from '@/lib/services/googleDriveFolderSync';
import { decryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';
import { isLegacySchemaError } from '@/lib/services/supabaseLegacySchema';

const DEFAULT_USER_ID = 'default-user';

export async function POST(request: Request) {
  try {
    const { data: connection, error: loadError } = await supabase
      .from('cloud_connections')
      .select('id, access_token, refresh_token, token_expires_at, folder_id, folder_name')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('provider', 'google_drive')
      .maybeSingle();

    if (loadError) {
      console.error('[Google Drive Manual Sync] Failed to load connection', loadError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Could not load Google Drive connection' },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'NO_CONNECTION', message: 'Connect Google Drive before running a manual sync.' },
        { status: 401 }
      );
    }

    if (!connection.folder_id) {
      return NextResponse.json(
        {
          error: 'NO_FOLDER_SELECTED',
          message:
            'No folder selected. Click "Select Folder" in settings to choose a Google Drive folder before running manual sync.',
        },
        { status: 400 }
      );
    }

    const tokens: DriveCredentials = {
      accessToken: decryptToken(connection.access_token),
      refreshToken: decryptToken(connection.refresh_token),
      tokenExpiresAt: connection.token_expires_at,
      connectionId: connection.id,
    };

    const summary = await syncFolderContents({
      folderId: connection.folder_id,
      connectionId: connection.id,
      requestUrl: request.url,
      tokens,
    });

    const connectionUpdatePayload = {
      last_sync: new Date().toISOString(),
      status: 'active' as const,
      last_error_code: null,
      last_error_message: null,
      last_error_at: null,
    };

    const { error: updateError } = await supabase
      .from('cloud_connections')
      .update(connectionUpdatePayload)
      .eq('id', connection.id);

    if (updateError) {
      if (isLegacySchemaError(updateError)) {
        console.warn(
          '[Google Drive Manual Sync] Skipped connection metadata update; legacy schema detected',
          { error: updateError }
        );
      } else {
        console.error('[Google Drive Manual Sync] Failed to update connection metadata', updateError);
      }
    }

    return NextResponse.json(
      {
        success: true,
        folderId: connection.folder_id,
        folderName: connection.folder_name ?? null,
        syncedFiles: summary.syncedFiles,
        skippedDuplicates: summary.duplicateFiles,
        skippedUnsupported: summary.unsupportedFiles,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof DriveTokenRefreshError) {
      const status = error.reason === 'invalid_grant' ? 401 : 500;
      const message =
        error.reason === 'invalid_grant'
          ? 'Reconnect Google Drive to continue syncing.'
          : 'Failed to refresh Google Drive credentials.';
      const errorCode =
        error.reason === 'invalid_grant' ? 'TOKEN_REFRESH_REQUIRED' : 'TOKEN_REFRESH_ERROR';
      console.error('[Google Drive Manual Sync] Token refresh failed', { error, status });
      return NextResponse.json({ error: errorCode, message }, { status });
    }

    console.error('[Google Drive Manual Sync] Unexpected failure', error);
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Failed to run manual Google Drive sync.';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
