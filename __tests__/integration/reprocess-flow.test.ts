/**
 * Integration test: manual document reprocessing flow
 * Ensures existing processed output is replaced and pipeline runs end-to-end.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { POST as processPOST } from '@/app/api/process/route';
import { POST as reprocessPOST } from '@/app/api/documents/[id]/reprocess/route';
import { processingQueue } from '@/lib/services/processingQueue';
import { uploadTestFixture, cleanupTestFixture, cleanupAllTestFixtures } from '../fixtures/test-helpers';

vi.mock('@/lib/services/noteProcessor', () => ({
  convertToMarkdown: vi.fn(() => ({
    markdown: '# Mock Document\n\n- Point A\n- Point B',
    contentHash: `mock-hash-${Math.random().toString(16).slice(2)}`,
  })),
}));

vi.mock('@/lib/services/aiSummarizer', () => ({
  extractStructuredData: vi.fn(() => ({
    output: {
      topics: ['Mock Topic'],
      decisions: ['Mock Decision'],
      actions: [
        {
          text: 'Mock Action',
          estimated_hours: 1,
          effort_level: 'low',
        },
      ],
      lno_tasks: {
        leverage: ['Leverage Task'],
        neutral: ['Neutral Task'],
        overhead: ['Overhead Task'],
      },
    },
    confidence: 0.92,
  })),
  calculateLowConfidence: vi.fn(() => 0.5),
  scoreActionsWithSemanticSimilarity: vi.fn((actions) => actions),
  generateAndStoreEmbeddings: vi.fn(() => ({
    success: 1,
    failed: 0,
    pending: 0,
    embeddingsStatus: 'completed',
  })),
}));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

describe('Reprocess Flow - Integration', () => {
  let fileId: string;
  let storagePath: string;
  let initialProcessedId: string | null = null;
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    fileId = upload.fileId;
    storagePath = upload.storagePath;

    // Initial processing to seed processed_documents
    const request = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId }),
    });

    const response = await processPOST(request);
    expect(response.status).toBe(200);

    const { data: processedDoc } = await supabase
      .from('processed_documents')
      .select('id')
      .eq('file_id', fileId)
      .single();

    initialProcessedId = processedDoc?.id ?? null;
    expect(initialProcessedId).toBeTruthy();

    await supabase.from('uploaded_files').update({ status: 'completed' }).eq('id', fileId);
  });

  afterAll(async () => {
    if (fileId && storagePath) {
      await cleanupTestFixture(fileId, storagePath);
    }
    await cleanupAllTestFixtures();
  });

  beforeEach(() => {
    (processingQueue as unknown as { _reset?: () => void })._reset?.();

    fetchSpy = vi.spyOn(global, 'fetch' as unknown as typeof fetch).mockImplementation(async (url, init) => {
      if (typeof url === 'string' && url.includes('/api/process')) {
        const body = init?.body ? JSON.parse(init.body as string) : {};
        const request = new NextRequest(url, {
          method: init?.method ?? 'POST',
          headers: init?.headers as HeadersInit,
          body: JSON.stringify(body),
        });
        return processPOST(request);
      }

      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    (processingQueue as unknown as { _reset?: () => void })._reset?.();
  });

  it('reprocesses a manual document and replaces processed outputs', async () => {
    const reprocessRequest = new NextRequest(`http://localhost:3000/api/documents/${fileId}/reprocess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    const response = await reprocessPOST(reprocessRequest, { params: Promise.resolve({ id: fileId }) });
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.success).toBe(true);
    expect(payload.status).toBe('processing');
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Wait for the processing to complete by polling the database
    const { data: fileRow } = await supabase
      .from('uploaded_files')
      .select('status, updated_at, content_hash')
      .eq('id', fileId)
      .single();

    expect(fileRow?.status === 'completed' || fileRow?.status === 'review_required').toBe(true);

    const { data: processedDoc } = await supabase
      .from('processed_documents')
      .select('id, markdown_storage_path, json_storage_path')
      .eq('file_id', fileId)
      .single();

    expect(processedDoc).toBeTruthy();
    expect(processedDoc!.id).not.toBe(initialProcessedId);
    expect(processedDoc!.markdown_storage_path).toMatch(/^processed\/.+\.md$/);
    expect(processedDoc!.json_storage_path).toMatch(/^processed\/.+\.json$/);

    const { data: reprocessLogs } = await supabase
      .from('processing_logs')
      .select('operation, status')
      .eq('file_id', fileId)
      .eq('operation', 'reprocess');

    const completedLog = reprocessLogs?.find((entry) => entry.status === 'completed');
    expect(completedLog).toBeTruthy();
  }, 15000);
});
