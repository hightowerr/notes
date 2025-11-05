import { randomUUID } from 'node:crypto';

import { NextResponse } from 'next/server';

import { generateContentHash, sanitizeFilename } from '@/lib/schemas';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE } from '@/lib/schemas/uploadedFileSchema';
import {
  createDriveClient,
  downloadFile,
  getFileMetadata,
  listFilesInFolder,
  DriveTokenRefreshError,
  type DriveCredentials,
} from '@/lib/services/googleDriveService';
import { processingQueue } from '@/lib/services/processingQueue';
import { decryptToken } from '@/lib/services/tokenEncryption';
import {
  extractFileIdFromHeaders,
  getDriveWebhookDebugPayload,
  getDriveWebhookHeaders,
  type DriveWebhookHeaders,
} from '@/lib/services/webhookVerification';
import { supabase } from '@/lib/supabase';
import { buildCloudStoragePath } from '@/lib/services/storagePath';
import { isLegacySchemaError } from '@/lib/services/supabaseLegacySchema';
import {
  cancelWebhookRetry,
  scheduleWebhookRetry,
  __testing as webhookRetryTesting,
  RETRY_DELAYS_MS,
} from '@/lib/services/webhookRetry';

const SUPPORTED_MIME_TYPES = new Set<string>(ALLOWED_MIME_TYPES);

type SyncEventStatus = 'pending' | 'processing' | 'completed' | 'failed';

type CloudConnectionRow = {
  id: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: string | null;
  webhook_id: string | null;
  folder_id?: string | null;
};

type ProcessingContext = {
  connection: CloudConnectionRow;
  fileId: string;
  requestUrl: string;
  headersSnapshot: DriveWebhookHeaders;
  eventId?: string;
  attempt?: number;
};

type RetryContextPayload = {
  requestUrl: string;
  headersSnapshot: DriveWebhookHeaders;
};

type UploadedFileRow = {
  id: string;
  name: string;
  content_hash: string;
  storage_path: string | null;
  mime_type: string | null;
  size: number | null;
  sync_enabled: boolean | null;
};

const pendingWebhookTasks = new Set<Promise<void>>();

function scheduleWebhookTask(task: () => Promise<void>) {
  let promise: Promise<void>;
  promise = task()
    .catch((error) => {
      console.error('[Google Drive Webhook] Background task failed', error);
    })
    .finally(() => {
      pendingWebhookTasks.delete(promise);
    });

  pendingWebhookTasks.add(promise);
}

type RetryScheduleParams = {
  eventId: string;
  attempt: number;
  connectionId: string;
  fileId: string;
  requestUrl: string;
  headersSnapshot: DriveWebhookHeaders;
  delayOverrideMs?: number;
};

async function scheduleRetryForEvent(params: RetryScheduleParams) {
  const delay = scheduleWebhookRetry({
    eventId: params.eventId,
    attempt: params.attempt,
    delayOverrideMs: params.delayOverrideMs,
    handler: async () => {
      try {
        const { data, error } = await supabase
          .from('cloud_connections')
          .select('id, access_token, refresh_token, token_expires_at, webhook_id')
          .eq('id', params.connectionId)
          .maybeSingle();

        if (error || !data) {
          console.error('[Google Drive Webhook] Retry aborted; connection missing', {
            eventId: params.eventId,
            connectionId: params.connectionId,
            error,
          });
          await upsertSyncEvent(params.eventId, {
            status: 'failed',
            errorMessage: 'Google Drive connection unavailable for retry',
            nextRetryAt: null,
            retryContext: null,
          });
          return;
        }

        scheduleWebhookTask(() =>
          processWebhookNotification({
            connection: data as CloudConnectionRow,
            fileId: params.fileId,
            requestUrl: params.requestUrl,
            headersSnapshot: params.headersSnapshot,
            eventId: params.eventId,
            attempt: params.attempt + 1,
          })
        );
      } catch (handlerError) {
        console.error('[Google Drive Webhook] Unexpected error in retry handler', handlerError);
        await upsertSyncEvent(params.eventId, {
          status: 'failed',
          errorMessage: 'Failed to execute webhook retry',
          nextRetryAt: null,
          retryContext: null,
        });
      }
    },
  });

  if (delay === null) {
    await upsertSyncEvent(params.eventId, {
      retryCount: params.attempt,
      nextRetryAt: null,
      retryContext: null,
    });
    return false;
  }

  const nextRetryAt = new Date(Date.now() + delay).toISOString();
  await upsertSyncEvent(params.eventId, {
    retryCount: params.attempt + 1,
    nextRetryAt,
    retryContext: {
      requestUrl: params.requestUrl,
      headersSnapshot: params.headersSnapshot,
    },
  });

  return true;
}

async function recoverScheduledRetries() {
  try {
    const { data, error } = await supabase
      .from('sync_events')
      .select('id, connection_id, external_file_id, retry_count, next_retry_at, retry_context')
      .eq('status', 'failed')
      .not('next_retry_at', 'is', null);

    if (error) {
      console.error('[Google Drive Webhook] Failed to load pending retries', error);
      return;
    }

    if (!data || data.length === 0) {
      return;
    }

    const now = Date.now();

    for (const event of data) {
      if (!event.next_retry_at) {
        continue;
      }

      let context: RetryContextPayload | null = null;
      const rawContext = event.retry_context ?? null;

      if (typeof rawContext === 'string') {
        try {
          context = JSON.parse(rawContext) as RetryContextPayload;
        } catch {
          context = null;
        }
      } else if (rawContext && typeof rawContext === 'object') {
        context = rawContext as RetryContextPayload;
      }

      if (!context || !context.requestUrl || !context.headersSnapshot) {
        continue;
      }

      const retryCount = typeof event.retry_count === 'number' ? event.retry_count : 0;
      if (retryCount >= RETRY_DELAYS_MS.length) {
        continue;
      }

      const attemptIndex = Math.max(0, retryCount - 1);
      const scheduledTime = Date.parse(event.next_retry_at);
      const delayOverrideMs = Number.isFinite(scheduledTime) ? Math.max(0, scheduledTime - now) : 0;

      await scheduleRetryForEvent({
        eventId: event.id,
        attempt: attemptIndex,
        connectionId: event.connection_id,
        fileId: event.external_file_id,
        requestUrl: context.requestUrl,
        headersSnapshot: context.headersSnapshot,
        delayOverrideMs,
      });
    }
  } catch (recoveryError) {
    console.error('[Google Drive Webhook] Retry recovery failed', recoveryError);
  }
}

function recoverScheduledRetriesForTesting() {
  return recoverScheduledRetries();
}

let recoveryPromise: Promise<void> | null = null;

function ensureRetryRecovery() {
  if (!recoveryPromise) {
    recoveryPromise = recoverScheduledRetries();
  }
  return recoveryPromise;
}

export const __testing = {
  waitForAllTasks: async () => {
    await Promise.all([...pendingWebhookTasks]);
  },
  getPendingTaskCount: () => pendingWebhookTasks.size,
  getPendingRetryCount: () => webhookRetryTesting.getPendingRetryCount(),
  clearScheduledRetries: () => webhookRetryTesting.clearAllRetries(),
  recoverScheduledRetries: recoverScheduledRetriesForTesting,
};

async function upsertSyncEvent(
  eventId: string,
  patch: Partial<{
    status: SyncEventStatus;
    fileName: string | null;
    errorMessage: string | null;
    retryCount: number | null;
    nextRetryAt: string | null;
    retryContext: RetryContextPayload | null;
  }>
) {
  const updates: Record<string, unknown> = {};

  if (patch.status) {
    updates.status = patch.status;
  }

  if (patch.fileName !== undefined) {
    updates.file_name = patch.fileName;
  }

  if (patch.errorMessage !== undefined) {
    updates.error_message = patch.errorMessage;
  }

  if (patch.retryCount !== undefined) {
    updates.retry_count = patch.retryCount;
  }

  if (patch.nextRetryAt !== undefined) {
    updates.next_retry_at = patch.nextRetryAt;
  }

  if (patch.retryContext !== undefined) {
    updates.retry_context = patch.retryContext;
  }

  if (Object.keys(updates).length === 0) {
    return;
  }

  const { error } = await supabase.from('sync_events').update(updates).eq('id', eventId);

  if (!error) {
    return;
  }

  if (isLegacySchemaError(error)) {
    const legacyUpdates: Record<string, unknown> = {};

    if (updates.status !== undefined) {
      legacyUpdates.status = updates.status;
    }
    if (updates.file_name !== undefined) {
      legacyUpdates.file_name = updates.file_name;
    }
    if (updates.error_message !== undefined) {
      legacyUpdates.error_message = updates.error_message;
    }

    if (updates.retry_context !== undefined) {
      legacyUpdates.retry_context = updates.retry_context;
    }

    if (Object.keys(legacyUpdates).length > 0) {
      const fallback = await supabase
        .from('sync_events')
        .update(legacyUpdates)
        .eq('id', eventId);

      if (!fallback.error) {
        return;
      }

      console.error('[Google Drive Webhook] Legacy sync_event update failed', {
        eventId,
        updates: legacyUpdates,
        error: fallback.error,
      });
      return;
    }
  }

  console.error('[Google Drive Webhook] Failed to update sync event', {
    eventId,
    updates,
    error,
  });
}

type ConnectionErrorCode = 'TOKEN_DECRYPT_FAILED' | 'WEBHOOK_EXPIRED';

async function flagConnectionError(
  connectionId: string,
  code: ConnectionErrorCode,
  message: string,
  extraPatch: Record<string, unknown> = {}
) {
  const payload = {
    status: 'error',
    last_error_code: code,
    last_error_message: message,
    last_error_at: new Date().toISOString(),
    ...extraPatch,
  };

  const { error } = await supabase
    .from('cloud_connections')
    .update(payload)
    .eq('id', connectionId);

  if (!error) {
    return;
  }

  if (isLegacySchemaError(error)) {
    console.warn('[Google Drive Webhook] Retrying connection error flag without newer columns', {
      connectionId,
      code,
      error,
    });

    const legacyPayload: Record<string, unknown> = {};

    if (Object.prototype.hasOwnProperty.call(payload, 'webhook_id')) {
      legacyPayload.webhook_id = payload.webhook_id ?? null;
    }

    if (Object.keys(legacyPayload).length === 0) {
      return;
    }

    const fallback = await supabase
      .from('cloud_connections')
      .update(legacyPayload)
      .eq('id', connectionId);

    if (fallback.error) {
      console.error('[Google Drive Webhook] Legacy fallback failed to update connection', {
        connectionId,
        code,
        error: fallback.error,
      });
    }
    return;
  }

  console.error('[Google Drive Webhook] Failed to flag connection error', {
    connectionId,
    code,
    error,
  });
}

async function handleChannelExpiration(connection: CloudConnectionRow, expirationIso: string | null) {
  const parsedExpiration = expirationIso ? Date.parse(expirationIso) : Number.NaN;
  const formattedExpiration =
    !Number.isNaN(parsedExpiration) && parsedExpiration > 0
      ? new Date(parsedExpiration).toISOString()
      : null;

  const message =
    formattedExpiration !== null
      ? `Google Drive webhook channel expired at ${formattedExpiration}`
      : 'Google Drive webhook channel expired';

  const syncEventPromise = supabase.from('sync_events').insert({
    connection_id: connection.id,
    event_type: 'sync_error',
    external_file_id: connection.id,
    file_name: null,
    status: 'failed',
    error_message: message,
  });

  const flagErrorPromise = flagConnectionError(connection.id, 'WEBHOOK_EXPIRED', message, {
    webhook_id: null,
  });

  const [eventResult] = await Promise.all([syncEventPromise, flagErrorPromise]);

  if (eventResult.error) {
    console.error('[Google Drive Webhook] Failed to log channel expiration event', {
      connectionId: connection.id,
      error: eventResult.error,
    });
  }
}

type FolderChangeContext = {
  connection: CloudConnectionRow & { folder_id: string };
  folderId: string;
  requestUrl: string;
  headersSnapshot: DriveWebhookHeaders;
};

async function processFolderChange({
  connection,
  folderId,
  requestUrl,
  headersSnapshot,
}: FolderChangeContext) {
  console.info('[Google Drive Webhook] Processing folder change notification', {
    connectionId: connection.id,
    folderId,
  });

  try {
    const tokens: DriveCredentials = {
      accessToken: decryptToken(connection.access_token),
      refreshToken: decryptToken(connection.refresh_token),
      tokenExpiresAt: connection.token_expires_at,
      connectionId: connection.id,
    };

    const driveClient = createDriveClient(tokens);

    // List all files in the monitored folder
    const driveFiles = await listFilesInFolder(
      folderId,
      tokens,
      { connectionId: connection.id },
      driveClient
    );

    // Get all currently synced files from this connection
    const { data: syncedFiles } = await supabase
      .from('uploaded_files')
      .select('external_id, content_hash, modified_time')
      .eq('source', 'google_drive')
      .not('external_id', 'is', null);

    const syncedFileMap = new Map(
      (syncedFiles || []).map(f => [f.external_id, f])
    );

    // Process each Drive file
    for (const driveFile of driveFiles) {
      const existing = syncedFileMap.get(driveFile.id);

      if (!existing) {
        // New file - process it
        console.info('[Google Drive Webhook] Detected new file from folder poll', {
          fileId: driveFile.id,
          fileName: driveFile.name,
        });

        scheduleWebhookTask(() =>
          processWebhookNotification({
            connection,
            fileId: driveFile.id,
            requestUrl,
            headersSnapshot: {
              ...headersSnapshot,
              resourceState: 'add',
            },
          })
        );
      } else if (
        driveFile.modifiedTime &&
        existing.modified_time &&
        new Date(driveFile.modifiedTime) > new Date(existing.modified_time)
      ) {
        // Modified file - reprocess it
        console.info('[Google Drive Webhook] Detected modified file from folder poll', {
          fileId: driveFile.id,
          fileName: driveFile.name,
          driveModifiedTime: driveFile.modifiedTime,
          dbModifiedTime: existing.modified_time,
        });

        scheduleWebhookTask(() =>
          processWebhookNotification({
            connection,
            fileId: driveFile.id,
            requestUrl,
            headersSnapshot: {
              ...headersSnapshot,
              resourceState: 'update',
            },
          })
        );
      }
    }

    // Update last_sync timestamp
    await supabase
      .from('cloud_connections')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', connection.id);

  } catch (error) {
    console.error('[Google Drive Webhook] Folder change processing failed', {
      connectionId: connection.id,
      folderId,
      error,
    });

    await supabase.from('sync_events').insert({
      connection_id: connection.id,
      event_type: 'sync_error',
      external_file_id: folderId,
      status: 'failed',
      error_message: error instanceof Error ? error.message : 'Folder polling failed',
    });
  }
}

async function processWebhookNotification({
  connection,
  fileId,
  requestUrl,
  headersSnapshot,
  eventId: providedEventId,
  attempt = 0,
}: ProcessingContext) {
  const eventId = providedEventId ?? randomUUID();
  const resourceState = headersSnapshot.resourceState?.toLowerCase() ?? null;
  const isModificationState = resourceState === 'update' || resourceState === 'change';

  cancelWebhookRetry(eventId);

  let existingFile: UploadedFileRow | null = null;
  let isModification = isModificationState;

  if (isModification) {
    const { data, error } = await supabase
      .from('uploaded_files')
      .select('id, name, content_hash, storage_path, mime_type, size, sync_enabled')
      .eq('external_id', fileId)
      .maybeSingle();

    if (error) {
      console.error('[Google Drive Webhook] Failed to load existing file for update', {
        fileId,
        error,
      });
      isModification = false;
    } else if (!data) {
      console.warn('[Google Drive Webhook] Update notification without existing file', { fileId });
      isModification = false;
    } else {
      existingFile = data as UploadedFileRow;
    }
  }

  const eventType = isModification ? 'file_modified' : 'file_added';

  if (attempt === 0) {
    const { error: eventInsertError } = await supabase.from('sync_events').insert({
      id: eventId,
      connection_id: connection.id,
      event_type: eventType,
      external_file_id: fileId,
      status: 'pending',
    });

    if (eventInsertError) {
      console.error('[Google Drive Webhook] Failed to log sync event', {
        eventId,
        error: eventInsertError,
      });
      return;
    }
  } else {
    await upsertSyncEvent(eventId, {
      status: 'pending',
      errorMessage: null,
      retryCount: attempt,
      nextRetryAt: null,
    });
  }

  let tokens: DriveCredentials;
  let driveClient: ReturnType<typeof createDriveClient>;

  try {
    tokens = {
      accessToken: decryptToken(connection.access_token),
      refreshToken: decryptToken(connection.refresh_token),
      tokenExpiresAt: connection.token_expires_at,
      connectionId: connection.id,
    };
    driveClient = createDriveClient(tokens);
  } catch (error) {
    console.error('[Google Drive Webhook] Failed to create Drive client', {
      connectionId: connection.id,
      error,
    });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: 'Failed to decrypt Drive credentials',
      retryContext: null,
    });
    await flagConnectionError(
      connection.id,
      'TOKEN_DECRYPT_FAILED',
      'Failed to decrypt Drive credentials',
      {
        webhook_id: null,
      }
    );
    return;
  }

  try {
    const metadata = await getFileMetadata(fileId, tokens, driveClient);
    const metadataSize = Number.isFinite(metadata.size) ? metadata.size : 0;

    await upsertSyncEvent(eventId, {
      status: 'processing',
      fileName: metadata.name,
      retryCount: attempt,
      nextRetryAt: null,
    });

    console.info(`[Webhook] Processing file: ${metadata.name}`, {
      fileId,
      eventType,
      attempt,
      resourceState: headersSnapshot.resourceState,
    });

    if (!SUPPORTED_MIME_TYPES.has(metadata.mimeType)) {
      const message = `Unsupported file type: ${metadata.mimeType}`;
      console.warn('[Google Drive Webhook] Unsupported file type', {
        fileId,
        mimeType: metadata.mimeType,
      });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: message,
      retryContext: null,
    });
      return;
    }

    if (isModification && metadataSize <= 0) {
      console.warn('[Google Drive Webhook] Missing size metadata for updated file', {
        fileId,
        mimeType: metadata.mimeType,
      });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: 'Unable to determine file size for updated Google Drive file',
      retryContext: null,
    });
      return;
    }

    if (metadataSize > MAX_FILE_SIZE) {
      const message = `File exceeds maximum size limit (${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB)`;
      console.warn('[Google Drive Webhook] File too large; skipping download', {
        fileId,
        reportedSize: metadata.size,
        maxBytes: MAX_FILE_SIZE,
      });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: message,
      retryContext: null,
    });
      return;
    }

    const fileBuffer = await downloadFile(fileId, tokens, driveClient);
    const arrayBuffer = fileBuffer.buffer.slice(
      fileBuffer.byteOffset,
      fileBuffer.byteOffset + fileBuffer.byteLength
    );

    if (fileBuffer.byteLength > MAX_FILE_SIZE) {
      const message = `File exceeds maximum size limit (${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB)`;
      console.warn('[Google Drive Webhook] Downloaded file exceeds size limit', {
        fileId,
        downloadedBytes: fileBuffer.byteLength,
        maxBytes: MAX_FILE_SIZE,
      });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: message,
      retryContext: null,
    });
    return;
  }

    const contentHash = await generateContentHash(arrayBuffer);

    if (isModification && existingFile) {
      if (existingFile.content_hash === contentHash) {
      await upsertSyncEvent(eventId, {
        status: 'completed',
        errorMessage: 'No content changes detected',
        nextRetryAt: null,
        retryContext: null,
      });
        return;
      }

      let duplicateQuery = supabase
        .from('uploaded_files')
        .select('id, name')
        .eq('content_hash', contentHash)
        .neq('id', existingFile.id);

      const { data: duplicateCandidate, error: duplicateError } = await duplicateQuery.maybeSingle();

      if (duplicateError) {
        console.error('[Google Drive Webhook] Duplicate check failed', duplicateError);
        await upsertSyncEvent(eventId, {
          status: 'failed',
          errorMessage: 'Failed to validate duplicate detection',
        });
        return;
      }

    if (duplicateCandidate) {
      const message = `Duplicate of ${duplicateCandidate.name}`;
      console.info('[Google Drive Webhook] Duplicate file detected', {
        fileId,
        existingFileId: duplicateCandidate.id,
      });
      await upsertSyncEvent(eventId, {
        status: 'failed',
        errorMessage: message,
        retryContext: null,
      });
      return;
    }

      const sanitized = sanitizeFilename(metadata.name);
      const safeName = sanitized || `drive-file-${fileId}`;
      const storagePath = buildCloudStoragePath({
        provider: 'google_drive',
        connectionId: connection.id,
        contentHash,
        filename: safeName,
      });

      const uploadResult = await supabase.storage.from('notes').upload(storagePath, arrayBuffer, {
        contentType: metadata.mimeType,
        upsert: false,
      });

    if (uploadResult.error) {
      console.error('[Google Drive Webhook] Failed to upload updated file', {
        fileId,
        error: uploadResult.error,
      });
      await upsertSyncEvent(eventId, {
        status: 'failed',
        errorMessage: `Failed to store updated file: ${uploadResult.error.message}`,
        retryContext: null,
      });
      return;
    }

      const queueResult = processingQueue.enqueue(existingFile.id, metadata.name);
      const initialStatus = queueResult.immediate ? 'processing' : 'pending';

      const { error: deleteProcessedError } = await supabase
        .from('processed_documents')
        .delete()
        .eq('file_id', existingFile.id);

    if (deleteProcessedError) {
      console.error('[Google Drive Webhook] Failed to clear previous processed output', {
        fileId,
        error: deleteProcessedError,
      });
      await supabase.storage.from('notes').remove([storagePath]);
      await upsertSyncEvent(eventId, {
        status: 'failed',
        errorMessage: 'Failed to clear previous processed output',
        retryContext: null,
      });
      return;
    }

      const { error: updateFileError } = await supabase
        .from('uploaded_files')
        .update({
          name: metadata.name,
          size: fileBuffer.byteLength || metadata.size,
          mime_type: metadata.mimeType,
          content_hash: contentHash,
          storage_path: storagePath,
          status: initialStatus,
          queue_position: queueResult.queuePosition,
          modified_time: metadata.modifiedTime,
          sync_enabled: existingFile.sync_enabled ?? true,
        })
        .eq('id', existingFile.id);

      if (updateFileError) {
        console.error('[Google Drive Webhook] Failed to update existing file record', updateFileError);
        await supabase.storage.from('notes').remove([storagePath]);
      await upsertSyncEvent(eventId, {
        status: 'failed',
        errorMessage: `Failed to update file: ${updateFileError.message}`,
        retryContext: null,
      });
        return;
      }

      if (existingFile.storage_path && existingFile.storage_path !== storagePath) {
        await supabase.storage.from('notes').remove([existingFile.storage_path]);
      }

      await upsertSyncEvent(eventId, {
        status: 'completed',
        errorMessage: null,
        nextRetryAt: null,
        retryContext: null,
      });

      if (queueResult.immediate) {
        const processUrl = new URL('/api/process', requestUrl);
        if (processUrl.hostname === 'localhost' || processUrl.hostname === '127.0.0.1') {
          processUrl.protocol = 'http:';
        }

        fetch(processUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId: existingFile.id }),
        }).catch((error) => {
          console.error('[Google Drive Webhook] Failed to trigger processing job', error);
        });
      }

      return;
    }

    let duplicateQuery = supabase.from('uploaded_files').select('id, name').eq('content_hash', contentHash);
    const { data: existingFileByHash, error: duplicateError } = await duplicateQuery.maybeSingle();

    if (duplicateError) {
      console.error('[Google Drive Webhook] Duplicate check failed', duplicateError);
      await upsertSyncEvent(eventId, {
        status: 'failed',
        errorMessage: 'Failed to validate duplicate detection',
        retryContext: null,
      });
      return;
    }

    if (existingFileByHash) {
      const message = `Duplicate of ${existingFileByHash.name}`;
      console.info('[Google Drive Webhook] Duplicate file detected', {
        fileId,
        existingFileId: existingFileByHash.id,
      });
        await upsertSyncEvent(eventId, {
          status: 'failed',
          errorMessage: message,
          retryContext: null,
        });
        return;
      }

    const fileUuid = randomUUID();
    const sanitized = sanitizeFilename(metadata.name);
    const safeName = sanitized || `drive-file-${fileId}`;
    const storagePath = buildCloudStoragePath({
      provider: 'google_drive',
      connectionId: connection.id,
      contentHash,
      filename: safeName,
    });

    const uploadResult = await supabase.storage.from('notes').upload(storagePath, arrayBuffer, {
      contentType: metadata.mimeType,
      upsert: false,
    });

    if (uploadResult.error) {
      console.error('[Google Drive Webhook] Failed to upload file to storage', {
        fileId,
        error: uploadResult.error,
      });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: `Failed to store file: ${uploadResult.error.message}`,
      retryContext: null,
    });
      return;
    }

    const queueResult = processingQueue.enqueue(fileUuid, metadata.name);
    const initialStatus = queueResult.immediate ? 'processing' : 'pending';
    const insertedAt = new Date().toISOString();

    const { error: insertFileError } = await supabase.from('uploaded_files').insert({
      id: fileUuid,
      name: metadata.name,
      size: fileBuffer.byteLength || metadata.size,
      mime_type: metadata.mimeType,
      content_hash: contentHash,
      uploaded_at: insertedAt,
      storage_path: storagePath,
      status: initialStatus,
      source: 'google_drive',
      external_id: metadata.id,
      modified_time: metadata.modifiedTime,
      sync_enabled: true,
      queue_position: queueResult.queuePosition,
    });

    if (insertFileError) {
      console.error('[Google Drive Webhook] Failed to record uploaded file', insertFileError);
      await supabase.storage.from('notes').remove([storagePath]);
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage: `Failed to record file: ${insertFileError.message}`,
      retryContext: null,
    });
      return;
    }

    await upsertSyncEvent(eventId, {
      status: 'completed',
      errorMessage: null,
      nextRetryAt: null,
      retryContext: null,
    });

    if (queueResult.immediate) {
      const processUrl = new URL('/api/process', requestUrl);
      if (processUrl.hostname === 'localhost' || processUrl.hostname === '127.0.0.1') {
        processUrl.protocol = 'http:';
      }

      fetch(processUrl.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: fileUuid }),
      }).catch((error) => {
        console.error('[Google Drive Webhook] Failed to trigger processing job', error);
      });
    }
  } catch (error) {
    if (error instanceof DriveTokenRefreshError) {
      console.error('[Google Drive Webhook] Token refresh failed during processing', {
        connectionId: connection.id,
        error,
      });
      const message =
        error.reason === 'invalid_grant'
          ? 'Google Drive access expired. Reconnect Google Drive.'
          : 'Failed to refresh Google Drive credentials.';
      await upsertSyncEvent(eventId, {
        status: 'failed',
        errorMessage: message,
        nextRetryAt: null,
      });
      return;
    }

    console.error('[Google Drive Webhook] Processing failed', {
      error,
      headers: headersSnapshot,
    });
    await upsertSyncEvent(eventId, {
      status: 'failed',
      errorMessage:
        error instanceof Error ? error.message : 'Failed to process Google Drive notification',
      nextRetryAt: null,
    });

    await scheduleRetryForEvent({
      eventId,
      attempt,
      connectionId: connection.id,
      fileId,
      requestUrl,
      headersSnapshot,
    });
  }
}

export async function POST(request: Request) {
  await ensureRetryRecovery();
  const headers = request.headers;
  const snapshot = getDriveWebhookHeaders(headers);

  if (!snapshot.channelToken) {
    console.warn('[Google Drive Webhook] Missing channel token; ignoring notification', snapshot);
    return NextResponse.json(
      { accepted: false, reason: 'missing_channel_token' },
      { status: 202 }
    );
  }

  const channelIdentifier = snapshot.channelId ?? snapshot.channelToken ?? 'unknown';

  console.info(`[Webhook] Received notification for channel ${channelIdentifier}`, {
    channelId: snapshot.channelId,
    channelToken: snapshot.channelToken,
    resourceState: snapshot.resourceState,
    resourceId: snapshot.resourceId,
    messageNumber: snapshot.messageNumber,
  });

  let connection: CloudConnectionRow | null | undefined;

  try {
    const { data, error } = await supabase
      .from('cloud_connections')
      .select('id, access_token, refresh_token, token_expires_at, webhook_id, folder_id')
      .eq('id', snapshot.channelToken)
      .maybeSingle();

    if (error) {
      console.error('[Google Drive Webhook] Failed to load connection', {
        connectionId: snapshot.channelToken,
        error,
      });
      return NextResponse.json({ error: 'CONNECTION_LOOKUP_FAILED' }, { status: 500 });
    }

    connection = data;
  } catch (error) {
    console.error('[Google Drive Webhook] Connection lookup threw', error);
    return NextResponse.json({ error: 'CONNECTION_LOOKUP_FAILED' }, { status: 500 });
  }

  if (!connection) {
    console.warn('[Google Drive Webhook] No connection found for channel token', snapshot);
    return NextResponse.json({ accepted: false, reason: 'unknown_channel' }, { status: 202 });
  }

  if (connection.webhook_id && snapshot.channelId && connection.webhook_id !== snapshot.channelId) {
    console.warn('[Google Drive Webhook] Channel ID mismatch; ignoring notification', {
      expected: connection.webhook_id,
      received: snapshot.channelId,
      connectionId: connection.id,
    });
    return NextResponse.json({ accepted: false, reason: 'channel_mismatch' }, { status: 202 });
  }

  const expirationHeader = snapshot.channelExpiration;
  if (expirationHeader) {
    const expirationTime = Date.parse(expirationHeader);
    if (!Number.isNaN(expirationTime) && expirationTime <= Date.now()) {
      console.warn('[Google Drive Webhook] Channel expiration detected', {
        connectionId: connection.id,
        expirationHeader,
      });

      scheduleWebhookTask(() => handleChannelExpiration(connection, expirationHeader));

      return NextResponse.json({ accepted: false, reason: 'channel_expired' }, { status: 202 });
    }
  }

  const fileId = extractFileIdFromHeaders(headers);
  const isFolderNotification = !fileId || (connection.folder_id && fileId === connection.folder_id);

  if (isFolderNotification) {
    // This is a folder-level change notification
    if (!connection.folder_id) {
      console.warn('[Google Drive Webhook] Folder notification but no folder_id configured', {
        connectionId: connection.id,
      });
      return NextResponse.json({ accepted: false, reason: 'missing_folder_id' }, { status: 202 });
    }

    console.info('[Google Drive Webhook] Processing folder change notification', {
      connectionId: connection.id,
      folderId: connection.folder_id,
      resourceState: snapshot.resourceState,
    });

    scheduleWebhookTask(() =>
      processFolderChange({
        connection: connection as CloudConnectionRow & { folder_id: string },
        folderId: connection.folder_id!,
        requestUrl: request.url,
        headersSnapshot: snapshot,
      })
    );

    return NextResponse.json({ accepted: true, type: 'folder_change' }, { status: 202 });
  }

  // Individual file notification
  scheduleWebhookTask(() =>
    processWebhookNotification({
      connection,
      fileId,
      requestUrl: request.url,
      headersSnapshot: snapshot,
    })
  );

  return NextResponse.json({ accepted: true, type: 'file_change' }, { status: 202 });
}
