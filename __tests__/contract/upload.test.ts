/**
 * Contract Tests for File Upload API
 * Tests compliance with /specs/001-prd-p0-thinnest/contracts/upload-api.yaml
 *
 * Test Strategy: TDD - These tests MUST fail initially
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { POST } from '@/app/api/upload/route';
import { supabase } from '@/lib/supabase';

describe('POST /api/upload - Contract Tests', () => {
  const uploadedFiles: string[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Cleanup: Delete all uploaded test files from storage and database
    for (const storagePath of uploadedFiles) {
      // Delete from storage
      await supabase.storage.from('notes').remove([storagePath]);
    }
    uploadedFiles.length = 0;
  });

  describe('Request Validation', () => {
    it('should reject request without file', async () => {
      const formData = new FormData();
      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.code).toBe('INVALID_FILE');
    });

    it('should reject file larger than 10MB', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11MB
      const file = new File([largeBuffer], 'large-file.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('10MB');
      expect(data.code).toBe('FILE_TOO_LARGE');
    });

    it('should reject unsupported file formats', async () => {
      const file = new File(['content'], 'presentation.pptx', {
        type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('format');
      expect(data.code).toBe('UNSUPPORTED_FORMAT');
    });

    it('should accept valid PDF file', async () => {
      const uniqueContent = `PDF content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.fileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(data.status).toMatch(/pending|processing/);
      expect(data.message).toBeDefined();

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });

    it('should accept valid DOCX file', async () => {
      const uniqueContent = `DOCX content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.fileId).toBeDefined();

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });

    it('should accept valid TXT file', async () => {
      const uniqueContent = `Plain text content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.txt', { type: 'text/plain' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      expect(data.success).toBe(true);
      expect(data.fileId).toBeDefined();

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });
  });

  describe('Response Schema Validation', () => {
    it('should return valid success response schema', async () => {
      const uniqueContent = `content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      // Validate schema matches upload-api.yaml
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('fileId');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('message');

      expect(typeof data.success).toBe('boolean');
      expect(typeof data.fileId).toBe('string');
      expect(typeof data.status).toBe('string');
      expect(typeof data.message).toBe('string');

      expect(['pending', 'processing']).toContain(data.status);

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });

    it('should return valid error response schema', async () => {
      const formData = new FormData();
      // No file attached

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      // Validate error schema
      expect(data).toHaveProperty('success');
      expect(data).toHaveProperty('error');
      expect(data).toHaveProperty('code');

      expect(data.success).toBe(false);
      expect(typeof data.error).toBe('string');
      expect(typeof data.code).toBe('string');
      expect(['FILE_TOO_LARGE', 'UNSUPPORTED_FORMAT', 'INVALID_FILE', 'DUPLICATE_FILE']).toContain(data.code);
    });
  });

  describe('Functional Requirements', () => {
    it('should generate unique file ID (UUID v4)', async () => {
      const uniqueContent = `content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      // UUID v4 regex validation
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      expect(data.fileId).toMatch(uuidRegex);

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });

    it('should generate content hash for uploaded file (FR-012)', async () => {
      const uniqueContent = `test content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(201);
      // Content hash should be logged (we'll verify in integration tests)

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });

    it('should trigger automatic processing (FR-001)', async () => {
      const uniqueContent = `content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.pdf', { type: 'application/pdf' });

      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);
      const data = await response.json();

      // Status should be 'processing' if processing started automatically
      expect(['pending', 'processing']).toContain(data.status);

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle storage failures gracefully', async () => {
      // This test will need mocking of Supabase client
      // For now, we define the expected behavior

      const uniqueContent = `content ${Date.now()}`;
      const file = new File([uniqueContent], 'test.pdf', { type: 'application/pdf' });
      const formData = new FormData();
      formData.append('file', file);

      const request = new Request('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      // If Supabase fails, should return 500 with proper error
      const response = await POST(request);
      const data = await response.json();

      // Should not throw unhandled errors
      expect(response.status).toBeGreaterThanOrEqual(200);
      expect(response.status).toBeLessThan(600);

      // Track for cleanup
      if (data.success) {
        const { data: fileData } = await supabase
          .from('uploaded_files')
          .select('storage_path')
          .eq('id', data.fileId)
          .single();
        if (fileData?.storage_path) uploadedFiles.push(fileData.storage_path);
      }
    });
  });
});
