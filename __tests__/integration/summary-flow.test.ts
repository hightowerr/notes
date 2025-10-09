/**
 * Integration Tests for Complete Summary Flow
 * End-to-end user journey: Upload → Process → Display Summary
 *
 * THESE TESTS SHOULD FAIL INITIALLY (TDD Red Phase)
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { POST as processPOST } from '@/app/api/process/route';
import { GET as statusGET } from '@/app/api/status/[fileId]/route';
import { uploadTestFixture, cleanupTestFixture, cleanupAllTestFixtures } from '../fixtures/test-helpers';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

describe('Complete Summary Flow - Integration Tests', () => {
  let uploadedFileId: string;
  let uploadedStoragePath: string;

  beforeAll(async () => {
    // Upload actual test fixture file
    const upload = await uploadTestFixture('sample-meeting-notes.txt');
    uploadedFileId = upload.fileId;
    uploadedStoragePath = upload.storagePath;
  });

  afterAll(async () => {
    // Cleanup test data
    if (uploadedFileId && uploadedStoragePath) {
      await cleanupTestFixture(uploadedFileId, uploadedStoragePath);
    }
    // Clean up any orphaned test fixtures
    await cleanupAllTestFixtures();
  });

  it('should complete full upload → process → summarize flow', async () => {
    // Step 1: Upload file (already done in beforeAll)
    expect(uploadedFileId).toBeDefined();

    // Step 2: Trigger processing
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    const processResponse = await processPOST(processRequest);
    expect(processResponse.status).toBe(200);
    const processData = await processResponse.json();

    // Step 3: Verify processing completed
    expect(processData.success).toBe(true);
    expect(processData.documentId).toBeDefined();

    // Step 4: Check file status updated to completed
    const { data: fileData } = await supabase
      .from('uploaded_files')
      .select('status')
      .eq('id', uploadedFileId)
      .single();

    expect(fileData!.status).toMatch(/completed|review_required/);

    // Step 5: Verify summary data structure (from our fixture file content)
    expect(processData.structuredOutput.topics).toBeInstanceOf(Array);
    expect(processData.structuredOutput.topics.length).toBeGreaterThan(0);
    expect(processData.structuredOutput.decisions).toBeInstanceOf(Array);
    expect(processData.structuredOutput.actions).toBeInstanceOf(Array);
    expect(processData.structuredOutput.lno_tasks.leverage).toBeInstanceOf(Array);
  }, 15000); // Increase timeout for AI processing

  it('should poll status endpoint and receive completion data', async () => {
    // Process the file
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    await processPOST(processRequest);

    // Poll status endpoint
    const statusRequest = new NextRequest(`http://localhost:3000/api/status/${uploadedFileId}`, {
      method: 'GET',
    });

    const statusResponse = await statusGET(statusRequest, {
      params: Promise.resolve({ fileId: uploadedFileId }),
    });

    expect(statusResponse.status).toBe(200);
    const statusData = await statusResponse.json();

    expect(statusData.status).toMatch(/completed|review_required|processing/);
    expect(statusData.fileId).toBe(uploadedFileId);

    if (statusData.status === 'completed' || statusData.status === 'review_required') {
      expect(statusData.summary).toBeDefined();
      expect(statusData.confidence).toBeGreaterThanOrEqual(0);
      expect(statusData.processingDuration).toBeGreaterThan(0);
    }
  }, 15000);

  it('should return processing status while job is running', async () => {
    // Create a new file to test "processing" status
    const upload = await uploadTestFixture('sample-strategy-doc.txt');

    // Set status to processing manually
    await supabase
      .from('uploaded_files')
      .update({ status: 'processing' })
      .eq('id', upload.fileId);

    const statusRequest = new NextRequest(`http://localhost:3000/api/status/${upload.fileId}`, {
      method: 'GET',
    });

    const statusResponse = await statusGET(statusRequest, {
      params: Promise.resolve({ fileId: upload.fileId }),
    });

    const statusData = await statusResponse.json();

    expect(statusData.status).toBe('processing');
    expect(statusData.summary).toBeUndefined();

    // Cleanup
    await cleanupTestFixture(upload.fileId, upload.storagePath);
  });

  it('should display toast notification on completion', async () => {
    // This test validates the contract for frontend notification
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    await processPOST(processRequest);

    // Check that processing completed
    const { data: processedDoc } = await supabase
      .from('processed_documents')
      .select('*')
      .eq('file_id', uploadedFileId)
      .single();

    expect(processedDoc).toBeDefined();

    // Frontend should display toast: "Summary ready for [filename]"
    // This is validated via UI testing (manual/E2E)
  }, 15000);

  it('should log metrics to console with hash, duration, confidence', async () => {
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    const response = await processPOST(processRequest);
    const data = await response.json();

    // Verify metrics are included in response
    expect(data.metrics).toBeDefined();
    expect(data.metrics.fileHash).toBeDefined();
    expect(data.metrics.processingDuration).toBeGreaterThan(0);
    expect(data.metrics.confidence).toBeGreaterThanOrEqual(0);
    expect(data.metrics.confidence).toBeLessThanOrEqual(1);
  }, 15000);

  it('should store Markdown file in Supabase storage', async () => {
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    await processPOST(processRequest);

    const { data: processedDoc } = await supabase
      .from('processed_documents')
      .select('markdown_storage_path')
      .eq('file_id', uploadedFileId)
      .single();

    expect(processedDoc!.markdown_storage_path).toBeDefined();

    // Verify file exists in storage
    const { data: storageData, error } = await supabase
      .storage
      .from('notes')
      .download(processedDoc!.markdown_storage_path);

    expect(error).toBeNull();
    expect(storageData).toBeDefined();
    expect(storageData!.size).toBeGreaterThan(0);
  }, 15000);

  it('should store JSON file in Supabase storage', async () => {
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    await processPOST(processRequest);

    const { data: processedDoc } = await supabase
      .from('processed_documents')
      .select('json_storage_path, structured_output')
      .eq('file_id', uploadedFileId)
      .single();

    expect(processedDoc!.json_storage_path).toBeDefined();

    // Verify file exists in storage
    const { data: storageData, error } = await supabase
      .storage
      .from('notes')
      .download(processedDoc!.json_storage_path);

    expect(error).toBeNull();
    expect(storageData).toBeDefined();

    // Verify JSON content matches database
    const jsonContent = JSON.parse(await storageData!.text());
    expect(jsonContent).toEqual(processedDoc!.structured_output);
  }, 15000);

  it('should create complete processing log trail', async () => {
    const processRequest = new NextRequest('http://localhost:3000/api/process', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileId: uploadedFileId }),
    });

    await processPOST(processRequest);

    const { data: logs } = await supabase
      .from('processing_logs')
      .select('*')
      .eq('file_id', uploadedFileId)
      .order('timestamp', { ascending: true });

    expect(logs).toBeDefined();
    expect(logs!.length).toBeGreaterThan(0);

    // Verify log sequence: convert → summarize → store
    const operations = logs!.map((log: any) => log.operation);
    const convertIndex = operations.indexOf('convert');
    const summarizeIndex = operations.indexOf('summarize');
    const storeIndex = operations.indexOf('store');

    expect(convertIndex).toBeGreaterThanOrEqual(0);
    expect(summarizeIndex).toBeGreaterThan(convertIndex);
    expect(storeIndex).toBeGreaterThan(summarizeIndex);

    // All completed logs should have duration
    logs!.filter((log: any) => log.status === 'completed').forEach((log: any) => {
      expect(log.duration).toBeGreaterThan(0);
    });
  }, 15000);

  it('should handle concurrent processing requests', async () => {
    // Upload 3 test files
    const uploads = await Promise.all([
      uploadTestFixture('sample-meeting-notes.txt'),
      uploadTestFixture('sample-strategy-doc.txt'),
      uploadTestFixture('sample-meeting-notes.txt'), // Reuse fixture
    ]);

    const fileIds = uploads.map(u => u.fileId);

    // Process all concurrently
    const responses = await Promise.all(
      fileIds.map(fileId => {
        const request = new NextRequest('http://localhost:3000/api/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileId }),
        });
        return processPOST(request);
      })
    );

    // All should eventually succeed
    const results = await Promise.all(responses.map(r => r.json()));
    results.forEach(result => {
      expect(result.success).toBe(true);
    });

    // Cleanup
    await Promise.all(uploads.map(u => cleanupTestFixture(u.fileId, u.storagePath)));
  }, 30000); // 30 seconds for concurrent processing
});
