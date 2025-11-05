import { randomUUID } from 'node:crypto';

import type { drive_v3 } from 'googleapis';

import { generateContentHash, sanitizeFilename } from '@/lib/schemas';
import { ALLOWED_MIME_TYPES } from '@/lib/schemas/uploadedFileSchema';
import {
  createDriveClient,
  downloadFile,
  listFilesInFolder,
  type DriveCredentials,
} from '@/lib/services/googleDriveService';
import { processingQueue } from '@/lib/services/processingQueue';
import { buildCloudStoragePath } from '@/lib/services/storagePath';
import { supabase } from '@/lib/supabase';

const SUPPORTED_MIME_TYPES = new Set<string>(ALLOWED_MIME_TYPES);

type LogSyncEventParams = {
  connectionId: string;
  externalFileId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  errorMessage?: string | null;
};

async function logSyncEvent(params: LogSyncEventParams) {
  await supabase.from('sync_events').insert({
    connection_id: params.connectionId,
    event_type: 'file_added',
    external_file_id: params.externalFileId,
    file_name: params.fileName,
    status: params.status,
    error_message: params.errorMessage ?? null,
  });
}

export type SyncFolderSummary = {
  syncedFiles: number;
  duplicateFiles: string[];
  unsupportedFiles: string[];
};

type SyncFolderParams = {
  folderId: string;
  connectionId: string;
  requestUrl: string;
  tokens: DriveCredentials;
  driveClient?: drive_v3.Drive;
};

export async function syncFolderContents(params: SyncFolderParams): Promise<SyncFolderSummary> {
  const driveClient = params.driveClient ?? createDriveClient(params.tokens);
  const files = await listFilesInFolder(
    params.folderId,
    params.tokens,
    { connectionId: params.connectionId },
    driveClient
  );

  const processUrl = new URL('/api/process', params.requestUrl);
  if (processUrl.hostname === 'localhost' || processUrl.hostname === '127.0.0.1') {
    processUrl.protocol = 'http:';
  }
  const processUrlString = processUrl.toString();

  let syncedFiles = 0;
  const duplicateFiles: string[] = [];
  const unsupportedFiles: string[] = [];

  for (const file of files) {
    if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
      console.warn('[Drive Sync] Skipping unsupported file', {
        connectionId: params.connectionId,
        fileId: file.id,
        mimeType: file.mimeType,
      });

      await logSyncEvent({
        connectionId: params.connectionId,
        externalFileId: file.id,
        fileName: file.name,
        status: 'failed',
        errorMessage: `Unsupported file type: ${file.mimeType}`,
      });
      unsupportedFiles.push(file.name);
      continue;
    }

    try {
      const fileBuffer = await downloadFile(file.id, params.tokens, driveClient);
      const arrayBuffer = fileBuffer.buffer.slice(
        fileBuffer.byteOffset,
        fileBuffer.byteOffset + fileBuffer.byteLength
      );

      const contentHash = await generateContentHash(arrayBuffer);

      const { data: existingFile } = await supabase
        .from('uploaded_files')
        .select('id, name')
        .eq('content_hash', contentHash)
        .maybeSingle();

      if (existingFile) {
        duplicateFiles.push(file.name);
        await logSyncEvent({
          connectionId: params.connectionId,
          externalFileId: file.id,
          fileName: file.name,
          status: 'failed',
          errorMessage: `Duplicate of ${existingFile.name}`,
        });
        continue;
      }

      const fileId = randomUUID();
      const safeName = sanitizeFilename(file.name);
      const storagePath = buildCloudStoragePath({
        provider: 'google_drive',
        connectionId: params.connectionId,
        contentHash,
        filename: safeName,
      });

      const uploadResult = await supabase.storage
        .from('notes')
        .upload(storagePath, arrayBuffer, {
          contentType: file.mimeType,
          upsert: false,
        });

      if (uploadResult.error) {
        console.error('[Drive Sync] Failed to store file in bucket', {
          connectionId: params.connectionId,
          fileId: file.id,
          error: uploadResult.error.message,
        });

        await logSyncEvent({
          connectionId: params.connectionId,
          externalFileId: file.id,
          fileName: file.name,
          status: 'failed',
          errorMessage: `Failed to store file: ${uploadResult.error.message}`,
        });
        continue;
      }

      const queueResult = processingQueue.enqueue(fileId, file.name);
      const initialStatus = queueResult.immediate ? 'processing' : 'pending';

      const { error: insertError } = await supabase.from('uploaded_files').insert({
        id: fileId,
        name: file.name,
        size: fileBuffer.byteLength,
        mime_type: file.mimeType,
        content_hash: contentHash,
        uploaded_at: new Date().toISOString(),
        storage_path: storagePath,
        status: initialStatus,
        source: 'google_drive',
        external_id: file.id,
        modified_time: file.modifiedTime,
        sync_enabled: true,
        queue_position: queueResult.queuePosition,
      });

      if (insertError) {
        console.error('[Drive Sync] Failed to record uploaded file', {
          connectionId: params.connectionId,
          fileId: file.id,
          error: insertError.message,
        });

        await supabase.storage.from('notes').remove([storagePath]);

        await logSyncEvent({
          connectionId: params.connectionId,
          externalFileId: file.id,
          fileName: file.name,
          status: 'failed',
          errorMessage: `Failed to record file: ${insertError.message}`,
        });
        continue;
      }

      if (queueResult.immediate) {
        fetch(processUrlString, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId }),
        }).catch((error) => {
          console.error('[Drive Sync] Failed to trigger processing job', error);
        });
      }

      syncedFiles += 1;

      await logSyncEvent({
        connectionId: params.connectionId,
        externalFileId: file.id,
        fileName: file.name,
        status: 'completed',
      });
    } catch (error) {
      console.error('[Drive Sync] Failed to sync file', {
        connectionId: params.connectionId,
        fileId: file.id,
        error: error instanceof Error ? error.message : error,
      });

      await logSyncEvent({
        connectionId: params.connectionId,
        externalFileId: file.id,
        fileName: file.name,
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error syncing file',
      });
    }
  }

  return {
    syncedFiles,
    duplicateFiles,
    unsupportedFiles,
  };
}

