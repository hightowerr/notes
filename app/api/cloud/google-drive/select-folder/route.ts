import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createDriveClient,
  registerWebhook,
  DriveTokenRefreshError,
  type DriveCredentials,
} from '@/lib/services/googleDriveService';
import { decryptToken } from '@/lib/services/tokenEncryption';
import { supabase } from '@/lib/supabase';
import { isLegacySchemaError } from '@/lib/services/supabaseLegacySchema';
import { syncFolderContents } from '@/lib/services/googleDriveFolderSync';

const DEFAULT_USER_ID = 'default-user';

const RequestSchema = z.object({
  folderId: z.string().min(1, 'folderId is required'),
  folderName: z
    .string()
    .trim()
    .min(1, 'folderName must be a non-empty string')
    .max(255, 'folderName must be less than 255 characters')
    .optional(),
});

export async function POST(request: Request) {
  const webhookAddress = process.env.GOOGLE_DRIVE_WEBHOOK_URL;

  if (!webhookAddress) {
    console.error('[Google Drive Select Folder] Missing GOOGLE_DRIVE_WEBHOOK_URL');
    return NextResponse.json(
      { error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook URL is not configured' },
      { status: 500 }
    );
  }

  let payload: z.infer<typeof RequestSchema>;
  try {
    const raw = await request.json();
    const parsed = RequestSchema.safeParse(raw);
    if (!parsed.success) {
      const [firstError] = parsed.error.issues;
      return NextResponse.json(
        { error: firstError?.message ?? 'Invalid request payload' },
        { status: 400 }
      );
    }
    payload = parsed.data;
  } catch (error) {
    console.error('[Google Drive Select Folder] Failed to parse request body', error);
    return NextResponse.json(
      { error: 'INVALID_JSON', message: 'Request body must be valid JSON' },
      { status: 400 }
    );
  }

  try {
    const { data: connection, error: loadError } = await supabase
      .from('cloud_connections')
      .select('id, access_token, refresh_token, token_expires_at')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('provider', 'google_drive')
      .maybeSingle();

    if (loadError) {
      console.error('[Google Drive Select Folder] Failed to load connection', loadError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Could not load cloud connection' },
        { status: 500 }
      );
    }

    if (!connection) {
      return NextResponse.json(
        { error: 'NO_CONNECTION', message: 'No Google Drive connection found' },
        { status: 401 }
      );
    }

    const tokens: DriveCredentials = {
      accessToken: decryptToken(connection.access_token),
      refreshToken: decryptToken(connection.refresh_token),
      tokenExpiresAt: connection.token_expires_at,
      connectionId: connection.id,
    };

    const driveClient = createDriveClient(tokens);
    const syncResult = await syncFolderContents({
      folderId: payload.folderId,
      connectionId: connection.id,
      requestUrl: request.url,
      tokens,
      driveClient,
    });

    const webhookResult = await registerWebhook(
      tokens,
      {
        folderId: payload.folderId,
        webhookAddress,
        channelToken: connection.id,
      },
      driveClient
    );

    const { error: updateError } = await supabase
      .from('cloud_connections')
      .update({
        folder_id: payload.folderId,
        folder_name: payload.folderName ?? null,
        webhook_id: webhookResult.channelId,
        webhook_registered_at: new Date().toISOString(),
        last_sync: new Date().toISOString(),
        status: 'active',
        last_error_code: null,
        last_error_message: null,
        last_error_at: null,
      })
      .eq('id', connection.id);

    let finalUpdateError = updateError;

    if (finalUpdateError && isLegacySchemaError(finalUpdateError)) {
      console.warn('[Google Drive Select Folder] Retrying connection update without newer columns', finalUpdateError);
      const fallback = await supabase
        .from('cloud_connections')
        .update({
          folder_id: payload.folderId,
          webhook_id: webhookResult.channelId,
        })
        .eq('id', connection.id);

      finalUpdateError = fallback.error;
    }

    if (finalUpdateError) {
      console.error('[Google Drive Select Folder] Failed to update connection', finalUpdateError);
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: 'Failed to update cloud connection' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        folderId: payload.folderId,
        folderName: payload.folderName ?? null,
        syncedFiles: syncResult.syncedFiles,
        skippedDuplicates: syncResult.duplicateFiles,
        skippedUnsupported: syncResult.unsupportedFiles,
        webhookId: webhookResult.channelId,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof DriveTokenRefreshError) {
      const isInvalidGrant = error.reason === 'invalid_grant';
      const status = isInvalidGrant ? 401 : 500;
      const message = isInvalidGrant
        ? 'Reconnect Google Drive to continue syncing.'
        : 'Failed to refresh Google Drive credentials';
      const errorCode = isInvalidGrant ? 'TOKEN_REFRESH_REQUIRED' : 'TOKEN_REFRESH_ERROR';
      console.error('[Google Drive Select Folder] Token refresh failed', { error, status });
      return NextResponse.json({ error: errorCode, message }, { status });
    }

    console.error('[Google Drive Select Folder] Unexpected failure', error);
    const message =
      error instanceof Error && error.message ? error.message : 'Failed to select Google Drive folder';
    return NextResponse.json({ error: 'INTERNAL_ERROR', message }, { status: 500 });
  }
}
