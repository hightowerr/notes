/**
 * Contract tests for POST /api/documents/[id]/reprocess
 * Covers manual uploads, text input guardrails, and concurrent protection.
 */

import crypto from 'node:crypto';

import { beforeEach, afterEach, afterAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { POST } from '@/app/api/documents/[id]/reprocess/route';
import { processingQueue } from '@/lib/services/processingQueue';
import { uploadTestFixture, cleanupTestFixture, cleanupAllTestFixtures } from '../fixtures/test-helpers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

type CreatedFixture = {
  fileId: string;
  storagePath: string;
};

describe('POST /api/documents/[id]/reprocess', () => {
  const fixtures: CreatedFixture[] = [];
  const jsonHeaders = { 'Content-Type': 'application/json' };
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    (processingQueue as unknown as { _reset?: () => void })._reset?.();
    fetchSpy = vi
      .spyOn(global, 'fetch' as unknown as typeof fetch)
      .mockResolvedValue(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: jsonHeaders,
        })
      );
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    (processingQueue as unknown as { _reset?: () => void })._reset?.();

    while (fixtures.length > 0) {
      const entry = fixtures.pop();
      if (!entry) {
        continue;
      }
      await cleanupTestFixture(entry.fileId, entry.storagePath);
    }

    await cleanupAllTestFixtures();
  });

  afterAll(async () => {
    await cleanupAllTestFixtures();
  });

  async function insertProcessedDocument(fileId: string) {
    const processedId = crypto.randomUUID();
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setDate(expiresAt.getDate() + 30);

    await supabase.from('processed_documents').insert({
      id: processedId,
      file_id: fileId,
      markdown_content: '# Previous summary\n\n- Item 1',
      markdown_storage_path: `processed/${processedId}.md`,
      structured_output: {
        topics: ['Planning'],
        decisions: ['Move forward'],
        actions: [
          {
            text: 'Review requirements',
            estimated_hours: 1,
            effort_level: 'low',
          },
        ],
        lno_tasks: {
          leverage: [],
          neutral: [],
          overhead: [],
        },
      },
      json_storage_path: `processed/${processedId}.json`,
      confidence: 0.9,
      processing_duration: 1500,
      processed_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      filtering_decisions: null,
    });
  }

  it('requeues a completed manual upload for processing', async () => {
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    fixtures.push({ fileId: upload.fileId, storagePath: upload.storagePath });

    await supabase.from('uploaded_files').update({ status: 'completed' }).eq('id', upload.fileId);
    await insertProcessedDocument(upload.fileId);

    const request = new NextRequest(
      `http://localhost:3000/api/documents/${upload.fileId}/reprocess`,
      {
        method: 'POST',
        headers: jsonHeaders,
      }
    );

    const response = await POST(request, { params: Promise.resolve({ id: upload.fileId }) });
    expect(response.status).toBe(200);
    const body = await response.json();

    expect(body).toMatchObject({
      success: true,
      status: 'processing',
      queuePosition: null,
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const fetchArgs = fetchSpy.mock.calls[0];
    expect(fetchArgs[0]).toContain('/api/process');
    expect(JSON.parse(fetchArgs[1].body as string)).toMatchObject({ fileId: upload.fileId, trigger: 'reprocess' });

    const { data: fileRow } = await supabase
      .from('uploaded_files')
      .select('status, queue_position')
      .eq('id', upload.fileId)
      .single();
    expect(fileRow?.status).toBe('pending');
    expect(fileRow?.queue_position).toBeNull();

    const { data: processedDocs } = await supabase
      .from('processed_documents')
      .select('id')
      .eq('file_id', upload.fileId);
    expect(processedDocs).toHaveLength(0);
  });

  it('rejects reprocessing for text input documents', async () => {
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    fixtures.push({ fileId: upload.fileId, storagePath: upload.storagePath });

    await supabase
      .from('uploaded_files')
      .update({ status: 'completed', source: 'text_input' })
      .eq('id', upload.fileId);

    const request = new NextRequest(
      `http://localhost:3000/api/documents/${upload.fileId}/reprocess`,
      { method: 'POST', headers: jsonHeaders }
    );

    const response = await POST(request, { params: Promise.resolve({ id: upload.fileId }) });
    expect(response.status).toBe(400);
    const body = await response.json();

    expect(body).toMatchObject({
      success: false,
      error: 'Cannot reprocess text input documents - no file stored',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects reprocessing when document is already processing', async () => {
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    fixtures.push({ fileId: upload.fileId, storagePath: upload.storagePath });

    await supabase.from('uploaded_files').update({ status: 'processing' }).eq('id', upload.fileId);

    const request = new NextRequest(
      `http://localhost:3000/api/documents/${upload.fileId}/reprocess`,
      { method: 'POST', headers: jsonHeaders }
    );

    const response = await POST(request, { params: Promise.resolve({ id: upload.fileId }) });
    expect(response.status).toBe(409);
    const body = await response.json();

    expect(body.error).toMatch(/already being processed/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects reprocessing when document is already queued (pending)', async () => {
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    fixtures.push({ fileId: upload.fileId, storagePath: upload.storagePath });

    // Status is already pending from helper, but update to ensure timestamp refresh
    await supabase.from('uploaded_files').update({ status: 'pending' }).eq('id', upload.fileId);

    const request = new NextRequest(
      `http://localhost:3000/api/documents/${upload.fileId}/reprocess`,
      { method: 'POST', headers: jsonHeaders }
    );

    const response = await POST(request, { params: Promise.resolve({ id: upload.fileId }) });
    expect(response.status).toBe(409);
    const body = await response.json();

    expect(body.error).toMatch(/already queued for processing/i);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
