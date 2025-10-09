/**
 * Contract Tests for Processing Pipeline
 * Tests FR-002, FR-003, FR-004, FR-009, FR-010, FR-011, FR-013
 *
 * THESE TESTS SHOULD FAIL INITIALLY (TDD Red Phase)
 */

import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { DocumentOutputSchema, ProcessedDocumentSchema } from '@/lib/schemas';
import { createClient } from '@supabase/supabase-js';
import { POST } from '@/app/api/process/route';
import { uploadTestFixture, cleanupTestFixture, cleanupAllTestFixtures } from '../fixtures/test-helpers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

describe('Processing Pipeline - Contract Tests', () => {
  let testFileId: string;
  let testStoragePath: string;

  beforeAll(async () => {
    // Upload actual test file to Supabase storage
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    testFileId = upload.fileId;
    testStoragePath = upload.storagePath;
  });

  afterEach(async () => {
    // Cleanup processed documents after each test
    if (testFileId) {
      await supabase.from('processing_logs').delete().eq('file_id', testFileId);
      await supabase.from('processed_documents').delete().eq('file_id', testFileId);
    }
  });

  afterAll(async () => {
    // Cleanup test fixture
    if (testFileId && testStoragePath) {
      await cleanupTestFixture(testFileId, testStoragePath);
    }
    // Clean up any orphaned test fixtures
    await cleanupAllTestFixtures();
  });

  describe('FR-002: File Conversion to Markdown', () => {
    it('should convert TXT to Markdown format', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.markdownContent).toBeDefined();
      expect(typeof data.markdownContent).toBe('string');
      expect(data.markdownContent.length).toBeGreaterThan(0);
      expect(data.markdownContent).toContain('Meeting Notes');
    });

    it('should convert another TXT file to Markdown', async () => {
      // Upload second test file
      const upload = await uploadTestFixture('sample-strategy-doc.txt');

      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: upload.fileId }),
      });

      const response = await POST(request);
      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.markdownContent).toBeDefined();
      expect(data.markdownContent).toContain('Product Strategy');

      // Cleanup
      await cleanupTestFixture(upload.fileId, upload.storagePath);
    });
  });

  describe('FR-003: Structured Data Extraction', () => {
    it('should extract topics, decisions, actions, and LNO tasks', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Validate against DocumentOutputSchema
      expect(() => DocumentOutputSchema.parse(data.structuredOutput)).not.toThrow();

      expect(data.structuredOutput.topics).toBeInstanceOf(Array);
      expect(data.structuredOutput.topics.length).toBeGreaterThan(0);
      expect(data.structuredOutput.decisions).toBeInstanceOf(Array);
      expect(data.structuredOutput.actions).toBeInstanceOf(Array);
      expect(data.structuredOutput.lno_tasks).toHaveProperty('leverage');
      expect(data.structuredOutput.lno_tasks).toHaveProperty('neutral');
      expect(data.structuredOutput.lno_tasks).toHaveProperty('overhead');
    });

    it('should validate all extracted fields are strings', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      const response = await POST(request);
      const data = await response.json();
      const output = data.structuredOutput;

      output.topics.forEach((topic: any) => expect(typeof topic).toBe('string'));
      output.decisions.forEach((decision: any) => expect(typeof decision).toBe('string'));
      output.actions.forEach((action: any) => expect(typeof action).toBe('string'));
      output.lno_tasks.leverage.forEach((task: any) => expect(typeof task).toBe('string'));
      output.lno_tasks.neutral.forEach((task: any) => expect(typeof task).toBe('string'));
      output.lno_tasks.overhead.forEach((task: any) => expect(typeof task).toBe('string'));
    });
  });

  describe('FR-004: JSON + Markdown Output', () => {
    it('should store both JSON and Markdown in Supabase', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      await POST(request);

      // Check processed_documents table
      const { data: processedDoc } = await supabase
        .from('processed_documents')
        .select('*')
        .eq('file_id', testFileId)
        .single();

      expect(processedDoc).toBeDefined();
      expect(processedDoc!.markdown_storage_path).toMatch(/^processed\/.+\.md$/);
      expect(processedDoc!.json_storage_path).toMatch(/^processed\/.+\.json$/);

      // Validate stored data against schema
      expect(() => ProcessedDocumentSchema.parse({
        ...processedDoc,
        processedAt: new Date(processedDoc!.processed_at),
        expiresAt: new Date(processedDoc!.expires_at),
      })).not.toThrow();
    });

    it('should set expires_at to 30 days from processed_at', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      await POST(request);

      const { data: processedDoc } = await supabase
        .from('processed_documents')
        .select('processed_at, expires_at')
        .eq('file_id', testFileId)
        .single();

      const processedAt = new Date(processedDoc!.processed_at);
      const expiresAt = new Date(processedDoc!.expires_at);
      const daysDiff = Math.floor((expiresAt.getTime() - processedAt.getTime()) / (1000 * 60 * 60 * 24));

      expect(daysDiff).toBe(30);
    });
  });

  describe('FR-007: Processing Metrics Logging', () => {
    it('should log processing duration and confidence score', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(data.processingDuration).toBeGreaterThan(0);
      expect(data.confidence).toBeGreaterThanOrEqual(0);
      expect(data.confidence).toBeLessThanOrEqual(1);
    });

    it('should create processing log entries for each operation', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      await POST(request);

      const { data: logs } = await supabase
        .from('processing_logs')
        .select('*')
        .eq('file_id', testFileId)
        .order('timestamp', { ascending: true });

      expect(logs).toBeDefined();
      expect(logs!.length).toBeGreaterThan(0);

      // Should have logs for convert, summarize, store operations
      const operations = logs!.map((log: any) => log.operation);
      expect(operations).toContain('convert');
      expect(operations).toContain('summarize');
      expect(operations).toContain('store');
    });
  });

  describe('FR-010: Invalid JSON Retry Logic', () => {
    it('should retry once if AI returns invalid JSON', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId, forceInvalidJson: true }),
      });

      const response = await POST(request);
      const data = await response.json();

      // Should still succeed after retry
      expect(data.success).toBe(true);

      // Check retry was logged
      const { data: logs } = await supabase
        .from('processing_logs')
        .select('*')
        .eq('file_id', testFileId)
        .eq('operation', 'retry');

      expect(logs).toBeDefined();
      expect(logs!.length).toBeGreaterThan(0);
    });
  });

  describe('FR-011: Low Confidence Flagging', () => {
    it('should mark document as review_required if confidence < 0.8', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId, forceLowConfidence: true }),
      });

      const response = await POST(request);
      const data = await response.json();
      expect(data.confidence).toBeLessThan(0.8);

      // Check uploaded_files status
      const { data: file } = await supabase
        .from('uploaded_files')
        .select('status')
        .eq('id', testFileId)
        .single();

      expect(file!.status).toBe('review_required');
    });
  });

  describe('FR-013: Performance Target', () => {
    it('should complete processing within 8 seconds', async () => {
      const startTime = Date.now();

      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId }),
      });

      await POST(request);

      const duration = Date.now() - startTime;

      // Allow 10% buffer (8.8s) for test environment overhead
      expect(duration).toBeLessThan(8800);
    }, 10000); // Set test timeout to 10 seconds
  });

  describe('Error Handling', () => {
    it('should return 400 for missing fileId', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request);
      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.code).toBe('INVALID_REQUEST');
    });

    it('should return 404 for non-existent fileId', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: '00000000-0000-0000-0000-000000000000' }),
      });

      const response = await POST(request);
      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.code).toBe('FILE_NOT_FOUND');
    });

    it('should return 500 and log error if processing fails', async () => {
      const request = new NextRequest('http://localhost:3000/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileId: testFileId, forceFailure: true }),
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.code).toBe('PROCESSING_ERROR');

      // Check error was logged
      const { data: logs } = await supabase
        .from('processing_logs')
        .select('*')
        .eq('file_id', testFileId)
        .eq('status', 'failed');

      expect(logs).toBeDefined();
      expect(logs!.length).toBeGreaterThan(0);
      expect(logs![0].error).toBeDefined();
    });
  });
});
