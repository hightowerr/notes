/**
 * Integration Tests for File Upload Flow (T001)
 * Tests the complete user journey from upload to database storage
 *
 * Prerequisites:
 * - Supabase project configured with environment variables
 * - Database tables created (uploaded_files, processing_logs)
 * - Storage bucket 'notes' created
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { supabase } from '@/lib/supabase';
import { generateContentHash } from '@/lib/schemas';
import { POST } from '@/app/api/upload/route';

describe('T001 Integration Tests - File Upload Flow', () => {
  const testFileIds: string[] = [];

  afterAll(async () => {
    // Cleanup: Delete test files from database and storage
    for (const fileId of testFileIds) {
      // Get storage path first
      const { data: file } = await supabase
        .from('uploaded_files')
        .select('storage_path')
        .eq('id', fileId)
        .single();

      if (file?.storage_path) {
        // Delete from storage
        await supabase.storage.from('notes').remove([file.storage_path]);
      }

      // Delete from uploaded_files (cascade will delete logs)
      await supabase.from('uploaded_files').delete().eq('id', fileId);
    }
  });

  describe('End-to-End Upload Journey', () => {
    it('should complete full upload journey: file → storage → database → logs', async () => {
      // Step 1: Create test file with unique content to avoid duplicate hash issues
      const testContent = `This is a test PDF document content for integration testing. ${Date.now()}`;
      const file = new File([testContent], 'integration-test.pdf', {
        type: 'application/pdf',
      });

      // Step 2: Upload via API endpoint
      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      expect(response.status).toBe(201);

      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.fileId).toBeDefined();

      const fileId = result.fileId;
      testFileIds.push(fileId);

      // Step 3: Verify file in database
      const { data: uploadedFile, error: dbError } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', fileId)
        .single();

      expect(dbError).toBeNull();
      expect(uploadedFile).toBeDefined();
      expect(uploadedFile.name).toBe('integration-test.pdf');
      expect(uploadedFile.size).toBe(testContent.length);
      expect(uploadedFile.mime_type).toBe('application/pdf');
      expect(uploadedFile.status).toBe('processing');
      expect(uploadedFile.content_hash).toMatch(/^[a-f0-9]{64}$/); // SHA-256

      // Step 4: Verify file in storage
      const { data: storageFiles, error: storageError } = await supabase
        .storage
        .from('notes')
        .list();

      expect(storageError).toBeNull();
      expect(storageFiles).toBeDefined();

      const uploadedStorageFile = storageFiles?.find((f) =>
        f.name === uploadedFile.storage_path
      );
      expect(uploadedStorageFile).toBeDefined();

      // Step 5: Verify processing log
      const { data: logs, error: logError } = await supabase
        .from('processing_logs')
        .select('*')
        .eq('file_id', fileId)
        .eq('operation', 'upload');

      expect(logError).toBeNull();
      expect(logs).toBeDefined();
      expect(logs.length).toBeGreaterThan(0);

      const uploadLog = logs[0];
      expect(uploadLog.status).toBe('completed');
      expect(uploadLog.duration).toBeGreaterThan(0);
      expect(uploadLog.metadata).toBeDefined();
      expect(uploadLog.metadata.filename).toBe('integration-test.pdf');
      expect(uploadLog.metadata.content_hash).toBe(uploadedFile.content_hash);
    }, 30000); // 30s timeout for integration test

    it('should handle duplicate file uploads (same content hash)', async () => {
      const testContent = `Duplicate content test ${Date.now()}`;
      const file1 = new File([testContent], 'duplicate-1.pdf', {
        type: 'application/pdf',
      });

      // First upload
      const formData1 = new FormData();
      formData1.append('file', file1);

      const request1 = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData1,
      });

      const response1 = await POST(request1);
      expect(response1.status).toBe(201);
      const result1 = await response1.json();
      testFileIds.push(result1.fileId);

      // Second upload with same content, different name
      const file2 = new File([testContent], 'duplicate-2.pdf', {
        type: 'application/pdf',
      });

      const formData2 = new FormData();
      formData2.append('file', file2);

      const request2 = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData2,
      });

      const response2 = await POST(request2);

      // Should fail due to duplicate content_hash with 409 Conflict
      expect(response2.status).toBe(409);
      const result2 = await response2.json();
      expect(result2.success).toBe(false);
      expect(result2.code).toBe('DUPLICATE_FILE');
      expect(result2.error).toContain('Duplicate file detected');
    }, 30000);
  });

  describe('Content Hash Verification', () => {
    it('should generate consistent SHA-256 hashes', async () => {
      const content = 'Test content for hashing';
      const buffer = new TextEncoder().encode(content).buffer;

      const hash1 = await generateContentHash(buffer);
      const hash2 = await generateContentHash(buffer);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      expect(hash1.length).toBe(64); // SHA-256 = 64 hex chars
    });
  });

  describe('Database Constraints', () => {
    it('should enforce file size constraint (max 10MB)', async () => {
      // This test verifies database constraint, but API should reject before DB
      const largeSize = 11 * 1024 * 1024; // 11MB

      const { error } = await supabase.from('uploaded_files').insert({
        name: 'oversized.pdf',
        size: largeSize,
        mime_type: 'application/pdf',
        content_hash: 'a'.repeat(64),
        storage_path: 'test/oversized.pdf',
        status: 'pending',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('size');
    });

    it('should enforce valid mime_type constraint', async () => {
      const { error } = await supabase.from('uploaded_files').insert({
        name: 'invalid.pptx',
        size: 1000,
        mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        content_hash: 'b'.repeat(64),
        storage_path: 'test/invalid.pptx',
        status: 'pending',
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('mime_type');
    });

    it('should enforce valid status constraint', async () => {
      const { error } = await supabase.from('uploaded_files').insert({
        name: 'test.pdf',
        size: 1000,
        mime_type: 'application/pdf',
        content_hash: 'c'.repeat(64),
        storage_path: 'test/test.pdf',
        status: 'invalid_status' as any,
      });

      expect(error).toBeDefined();
      expect(error?.message).toContain('status');
    });
  });
});
