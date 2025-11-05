import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { adaptCloudConnectionRow } from '@/lib/services/googleDriveService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';

export async function GET() {
  try {
    const selection =
      'id, provider, folder_id, folder_name, created_at, last_sync, status, last_error_code, last_error_message, last_error_at';
    let { data, error } = await supabase
      .from('cloud_connections')
      .select(selection)
      .eq('user_id', DEFAULT_USER_ID)
      .order('created_at', { ascending: false });

    if (
      error &&
      typeof error.message === 'string' &&
      (error.message.includes('folder_name') ||
        error.message.includes('last_sync') ||
        error.message.includes('status') ||
        error.message.includes('last_error'))
    ) {
      console.warn('[Cloud Connections] Optional columns missing, falling back', { error: error.message });
      const fallback = await supabase
        .from('cloud_connections')
        .select('id, provider, folder_id, created_at')
        .eq('user_id', DEFAULT_USER_ID)
        .order('created_at', { ascending: false });

      if (!fallback.error) {
        data =
          fallback.data?.map((row) => ({
            ...row,
            folder_name: null,
            last_sync: null,
            status: 'active',
            last_error_code: null,
            last_error_message: null,
            last_error_at: null,
          })) ?? [];
        error = null;
      } else {
        error = fallback.error;
      }
    }

    if (error) {
      console.error('[Cloud Connections] Failed to load connections', error);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to retrieve cloud connections' },
        { status: 500 }
      );
    }

    const connections =
      data?.map((row) => {
        const summary = adaptCloudConnectionRow(row);
        return {
          id: summary.id,
          provider: summary.provider,
          provider_display_name: summary.providerDisplayName,
          folder_id: summary.folderId,
          folder_name: summary.folderName,
          sync_enabled: summary.syncEnabled,
          last_sync: summary.lastSync,
          created_at: summary.createdAt,
          status: summary.status,
          last_error_code: summary.lastErrorCode,
          last_error_message: summary.lastErrorMessage,
          last_error_at: summary.lastErrorAt,
        };
      }) ?? [];

    let recentEvents: Array<{
      id: string;
      connection_id: string;
      event_type: string;
      file_name: string | null;
      status: string;
      error_message: string | null;
      created_at: string;
      external_file_id: string;
      retry_count?: number | null;
      next_retry_at?: string | null;
    }> = [];

    const connectionIds = connections.map((connection) => connection.id);

    if (connectionIds.length > 0) {
      const eventSelection =
        'id, connection_id, event_type, file_name, status, error_message, created_at, external_file_id, retry_count, next_retry_at';
      let eventsDataResult = await supabase
        .from('sync_events')
        .select(eventSelection)
        .in('connection_id', connectionIds)
        .order('created_at', { ascending: false })
        .limit(20);

      if (
        eventsDataResult.error &&
        typeof eventsDataResult.error.message === 'string' &&
        (eventsDataResult.error.message.includes('retry_count') ||
          eventsDataResult.error.message.includes('next_retry_at'))
      ) {
        console.warn('[Cloud Connections] retry metadata columns missing, falling back', {
          error: eventsDataResult.error.message,
        });

        eventsDataResult = await supabase
          .from('sync_events')
          .select('id, connection_id, event_type, file_name, status, error_message, created_at, external_file_id')
          .in('connection_id', connectionIds)
          .order('created_at', { ascending: false })
          .limit(20);
      }

      if (eventsDataResult.error) {
        console.warn('[Cloud Connections] Failed to load sync events', eventsDataResult.error);
      } else {
        recentEvents =
          eventsDataResult.data?.map((event) => ({
            id: event.id,
            connection_id: event.connection_id,
            event_type: event.event_type,
            file_name: event.file_name ?? null,
            status: event.status,
            error_message: event.error_message ?? null,
            created_at: event.created_at,
            external_file_id: event.external_file_id,
            retry_count: 'retry_count' in event ? event.retry_count ?? 0 : 0,
            next_retry_at: 'next_retry_at' in event ? event.next_retry_at ?? null : null,
          })) ?? [];
      }
    }

    return NextResponse.json({ connections, sync_events: recentEvents }, { status: 200 });
  } catch (error) {
    console.error('[Cloud Connections] Unexpected error', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Failed to load cloud connections' },
      { status: 500 }
    );
  }
}
