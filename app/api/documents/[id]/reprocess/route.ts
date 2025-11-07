import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';

import { ErrorCode, type ErrorCodeType, generateContentHash, sanitizeFilename } from '@/lib/schemas';
import { MAX_FILE_SIZE } from '@/lib/schemas/uploadedFileSchema';
import { processingQueue } from '@/lib/services/processingQueue';
import { buildCloudStoragePath } from '@/lib/services/storagePath';
import { downloadFileById, DriveTokenRefreshError } from '@/lib/services/googleDriveService';
import { decryptToken } from '@/lib/services/tokenEncryption';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type RouteParams = {
  id: string;
};

const paramsSchema = z.object({
  id: z.string().uuid(),
});

type FileRecord = {
  id: string;
  name: string | null;
  status: string;
  source: string | null;
  storage_path: string | null;
  external_id: string | null;
  mime_type: string | null;
  size: number | null;
  content_hash: string | null;
  sync_enabled: boolean | null;
  modified_time: string | null;
};

type DrivePreparationResult = {
  connectionId: string;
  name: string;
  mimeType: string;
  size: number;
  contentHash: string;
  storagePath: string;
  modifiedTime: string | null;
  rollback: () => Promise<void>;
  removePrevious: () => Promise<void>;
};

class DriveReprocessError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code: ErrorCodeType
  ) {
    super(message);
    this.name = 'DriveReprocessError';
  }
}

function extractConnectionIdFromStoragePath(storagePath: string | null | undefined): string | null {
  if (!storagePath) {
    return null;
  }

  const parts = storagePath.split('/').filter(Boolean);
  if (parts.length >= 3 && parts[0] === 'cloud' && parts[1] === 'google-drive') {
    return parts[2] ?? null;
  }

  return null;
}

async function findConnectionIdByExternalId(externalId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('sync_events')
    .select('connection_id')
    .eq('external_file_id', externalId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('[REPROCESS] Failed to resolve Drive connection from sync events', {
      externalId,
      error,
    });
    throw new DriveReprocessError('Failed to resolve Google Drive connection', 500, ErrorCode.enum.PROCESSING_ERROR);
  }

  return data?.connection_id ?? null;
}

function isGoogleNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const anyError = error as Record<string, unknown>;
  if (anyError.status === 404 || anyError.code === 404) {
    return true;
  }

  const response = anyError.response as Record<string, unknown> | undefined;
  if (response?.status === 404) {
    return true;
  }

  return false;
}

function isGoogleUnauthorizedError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const anyError = error as Record<string, unknown>;
  if (anyError.status === 401 || anyError.code === 401) {
    return true;
  }

  const response = anyError.response as Record<string, unknown> | undefined;
  if (response?.status === 401) {
    return true;
  }

  return false;
}

async function prepareDriveDocument(file: FileRecord): Promise<DrivePreparationResult> {
  if (!file.external_id) {
    throw new DriveReprocessError('Google Drive file reference is missing', 500, ErrorCode.enum.PROCESSING_ERROR);
  }

  const connectionId =
    extractConnectionIdFromStoragePath(file.storage_path) ??
    (await findConnectionIdByExternalId(file.external_id));

  if (!connectionId) {
    throw new DriveReprocessError(
      'Unable to locate Google Drive connection for this document',
      500,
      ErrorCode.enum.PROCESSING_ERROR
    );
  }

  const { data: connection, error: connectionError } = await supabase
    .from('cloud_connections')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('id', connectionId)
    .maybeSingle();

  if (connectionError) {
    console.error('[REPROCESS] Failed to load Drive connection', {
      connectionId,
      error: connectionError,
    });
    throw new DriveReprocessError('Failed to load Google Drive connection', 500, ErrorCode.enum.PROCESSING_ERROR);
  }

  if (!connection) {
    throw new DriveReprocessError('Google Drive connection not found', 500, ErrorCode.enum.PROCESSING_ERROR);
  }

  let accessToken: string;
  let refreshToken: string;

  try {
    accessToken = decryptToken(connection.access_token);
    refreshToken = decryptToken(connection.refresh_token);
  } catch (error) {
    console.error('[REPROCESS] Failed to decrypt Drive credentials', {
      connectionId,
      error,
    });
    throw new DriveReprocessError(
      'Failed to decrypt Google Drive credentials',
      500,
      ErrorCode.enum.PROCESSING_ERROR
    );
  }

  let download;

  try {
    download = await downloadFileById(file.external_id, {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_expires_at: connection.token_expires_at ?? null,
      connection_id: connection.id,
    });
  } catch (error) {
    if (error instanceof DriveTokenRefreshError) {
      if (error.reason === 'invalid_grant') {
        throw new DriveReprocessError(
          'Google Drive authentication expired. Please reconnect your account.',
          401,
          ErrorCode.enum.PROCESSING_ERROR
        );
      }

      throw new DriveReprocessError(
        'Failed to refresh Google Drive credentials',
        500,
        ErrorCode.enum.PROCESSING_ERROR
      );
    }

    if (isGoogleNotFoundError(error)) {
      throw new DriveReprocessError(
        'File no longer available in Google Drive',
        404,
        ErrorCode.enum.FILE_NOT_FOUND
      );
    }

    if (isGoogleUnauthorizedError(error)) {
      throw new DriveReprocessError(
        'Google Drive authentication expired. Please reconnect your account.',
        401,
        ErrorCode.enum.PROCESSING_ERROR
      );
    }

    console.error('[REPROCESS] Failed to download Drive file', {
      connectionId,
      externalId: file.external_id,
      error,
    });

    throw new DriveReprocessError(
      'Failed to download file from Google Drive',
      500,
      ErrorCode.enum.PROCESSING_ERROR
    );
  }

  const fileBuffer = download.buffer;
  const byteLength = fileBuffer.byteLength;

  if (byteLength <= 0) {
    throw new DriveReprocessError('Downloaded Google Drive file is empty', 500, ErrorCode.enum.PROCESSING_ERROR);
  }

  if (byteLength > MAX_FILE_SIZE) {
    throw new DriveReprocessError(
      `Google Drive file exceeds the maximum supported size of ${Math.round(MAX_FILE_SIZE / (1024 * 1024))}MB`,
      400,
      ErrorCode.enum.INVALID_REQUEST
    );
  }

  const arrayBuffer = fileBuffer.buffer.slice(
    fileBuffer.byteOffset,
    fileBuffer.byteOffset + fileBuffer.byteLength
  );

  const contentHash = await generateContentHash(arrayBuffer);

  const preferredName =
    typeof download.name === 'string' && download.name.trim().length > 0
      ? download.name.trim()
      : file.name ?? 'Google Drive Document';

  const sanitizedPrimary =
    typeof download.name === 'string' ? sanitizeFilename(download.name) : '';
  const sanitizedFallback = sanitizeFilename(preferredName);
  const safePathName =
    sanitizedPrimary || sanitizedFallback || `google-drive-${contentHash.slice(0, 8)}`;

  const storagePath = buildCloudStoragePath({
    provider: 'google_drive',
    connectionId,
    contentHash,
    filename: safePathName,
  });

  const contentType =
    typeof download.mimeType === 'string' && download.mimeType.length > 0
      ? download.mimeType
      : file.mime_type ?? 'application/octet-stream';

  const uploadResult = await supabase.storage.from('notes').upload(storagePath, arrayBuffer, {
    contentType,
    upsert: true,
  });

  if (uploadResult.error) {
    console.error('[REPROCESS] Failed to upload Drive file to storage', {
      connectionId,
      storagePath,
      error: uploadResult.error,
    });

    throw new DriveReprocessError('Failed to store downloaded Google Drive file', 500, ErrorCode.enum.STORAGE_ERROR);
  }

  const previousStoragePath =
    file.storage_path && file.storage_path !== storagePath ? file.storage_path : null;

  return {
    connectionId,
    name: preferredName,
    mimeType: contentType,
    size: byteLength,
    contentHash,
    storagePath,
    modifiedTime: download.modifiedTime ?? null,
    rollback: async () => {
      const { error } = await supabase.storage.from('notes').remove([storagePath]);
      if (error) {
        console.error('[REPROCESS] Failed to rollback Drive upload', {
          connectionId,
          storagePath,
          error,
        });
      }
    },
    removePrevious: async () => {
      if (!previousStoragePath) {
        return;
      }
      const { error } = await supabase.storage.from('notes').remove([previousStoragePath]);
      if (error) {
        console.error('[REPROCESS] Failed to remove previous Drive asset', {
          connectionId,
          storagePath: previousStoragePath,
          error,
        });
      }
    },
  };
}

export async function POST(request: NextRequest, { params }: { params: Promise<RouteParams> }) {
  const { id } = await params;

  const validation = paramsSchema.safeParse({ id });
  if (!validation.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid document id',
        code: ErrorCode.enum.INVALID_REQUEST,
      },
      { status: 400 }
    );
  }

  let drivePreparation: DrivePreparationResult | null = null;
  let driveUpdateCommitted = false;
  let source: string = 'manual_upload';

  try {
    const { data: fileRecord, error: fetchError } = await supabase
      .from('uploaded_files')
      .select(
        'id, name, status, source, storage_path, external_id, mime_type, size, content_hash, sync_enabled, modified_time'
      )
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error('[REPROCESS] Failed to load document record:', {
        id,
        error: fetchError.message,
      });
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to load document record',
          code: ErrorCode.enum.STORAGE_ERROR,
        },
        { status: 500 }
      );
    }

    if (!fileRecord) {
      return NextResponse.json(
        {
          success: false,
          error: 'Document not found',
          code: ErrorCode.enum.FILE_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    const record = fileRecord as FileRecord;
    source = record.source ?? 'manual_upload';

    if (source === 'text_input') {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot reprocess text input documents - no file stored',
          code: ErrorCode.enum.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    if (record.status === 'processing') {
      return NextResponse.json(
        {
          success: false,
          error: 'Document is already being processed. Please wait for the current operation to finish.',
          code: ErrorCode.enum.PROCESSING_ERROR,
        },
        { status: 409 }
      );
    }

    if (record.status === 'pending') {
      return NextResponse.json(
        {
          success: false,
          error: 'Document is already queued for processing. Please wait for the current operation to finish.',
          code: ErrorCode.enum.PROCESSING_ERROR,
        },
        { status: 409 }
      );
    }

    if (source === 'google_drive') {
      drivePreparation = await prepareDriveDocument(record);
    }

    const { error: deleteError } = await supabase
      .from('processed_documents')
      .delete()
      .eq('file_id', id);

    if (deleteError) {
      console.error('[REPROCESS] Failed to remove processed document:', {
        id,
        error: deleteError.message,
      });
      if (drivePreparation) {
        await drivePreparation.rollback();
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to reset processed document',
          code: ErrorCode.enum.STORAGE_ERROR,
        },
        { status: 500 }
      );
    }

    const queueFilename = drivePreparation?.name ?? record.name ?? 'Document';
    const queuePayload = { trigger: 'reprocess' as const };
    const queueResult = processingQueue.enqueue(id, queueFilename, queuePayload);

    const now = new Date().toISOString();
    const fileUpdates: Record<string, unknown> = {
      status: 'pending',
      updated_at: now,
      queue_position: queueResult.queuePosition,
    };

    if (drivePreparation) {
      fileUpdates.storage_path = drivePreparation.storagePath;
      fileUpdates.size = drivePreparation.size;
      fileUpdates.mime_type = drivePreparation.mimeType;
      fileUpdates.content_hash = drivePreparation.contentHash;
      fileUpdates.name = drivePreparation.name;
      fileUpdates.modified_time = drivePreparation.modifiedTime;
    }

    const { error: updateError } = await supabase
      .from('uploaded_files')
      .update(fileUpdates)
      .eq('id', id);

    if (updateError) {
      console.error('[REPROCESS] Failed to update document status:', {
        id,
        error: updateError.message,
      });
      if (drivePreparation) {
        await drivePreparation.rollback();
      }
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update document status',
          code: ErrorCode.enum.STORAGE_ERROR,
        },
        { status: 500 }
      );
    }

    driveUpdateCommitted = true;

    if (drivePreparation) {
      await drivePreparation.removePrevious();
    }

    await logReprocessEvent(id, 'started', {
      source,
      queued: !queueResult.immediate,
      queuePosition: queueResult.queuePosition,
      connectionId: drivePreparation?.connectionId ?? null,
    });

    if (!queueResult.immediate) {
      return NextResponse.json(
        {
          success: true,
          status: 'processing',
          message: 'Document queued for reprocessing',
          queuePosition: queueResult.queuePosition,
        },
        { status: 200 }
      );
    }

    const processUrl = new URL('/api/process', request.url);
    if (processUrl.hostname === 'localhost' || processUrl.hostname === '127.0.0.1') {
      processUrl.protocol = 'http:';
    }

    const processResponse = await fetch(processUrl.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileId: id,
        trigger: 'reprocess',
      }),
    });

    if (!processResponse.ok) {
      const message = await extractErrorMessage(processResponse);

      await supabase
        .from('uploaded_files')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', id);

      await logReprocessEvent(id, 'failed', {
        source,
        error: message,
      });

      return NextResponse.json(
        {
          success: false,
          error: message || 'Reprocessing failed. Please try again.',
          code: ErrorCode.enum.PROCESSING_ERROR,
        },
        { status: processResponse.status >= 400 ? processResponse.status : 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        status: 'processing',
        message: 'Document reprocessed successfully',
        queuePosition: queueResult.queuePosition ?? null,
      },
      { status: 200 }
    );
  } catch (error) {
    if (drivePreparation && !driveUpdateCommitted) {
      await drivePreparation.rollback();
    }

    if (error instanceof DriveReprocessError) {
      await logReprocessEvent(id, 'failed', {
        source: 'google_drive',
        error: error.message,
        connectionId: drivePreparation?.connectionId ?? null,
      });

      return NextResponse.json(
        {
          success: false,
          error: error.message,
          code: error.code,
        },
        { status: error.status }
      );
    }

    console.error('[REPROCESS] Unexpected error:', {
      id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    await logReprocessEvent(id, 'failed', {
      source,
      error: error instanceof Error ? error.message : 'Unexpected error',
    });

    return NextResponse.json(
      {
        success: false,
        error: 'Reprocessing failed. Please try again.',
        code: ErrorCode.enum.PROCESSING_ERROR,
      },
      { status: 500 }
    );
  }
}

async function logReprocessEvent(
  fileId: string,
  status: 'started' | 'completed' | 'failed',
  metadata?: Record<string, unknown>
) {
  try {
    await supabase.from('processing_logs').insert({
      file_id: fileId,
      operation: 'reprocess',
      status,
      metadata,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[REPROCESS] Failed to log reprocess event:', {
      fileId,
      status,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

async function extractErrorMessage(response: Response): Promise<string | null> {
  try {
    const data = await response.clone().json();

    if (typeof data?.error === 'string') {
      return data.error;
    }

    return null;
  } catch {
    try {
      const text = await response.text();
      return text || null;
    } catch {
      return null;
    }
  }
}
