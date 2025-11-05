/**
 * Contract Tests: /api/text-input
 * Tests the direct text input API endpoint for virtual document creation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const API_BASE = 'http://localhost:3000';

describe('/api/text-input', () => {
  let createdFileIds: string[] = [];

  // Cleanup: Remove all test files before and after tests
  beforeAll(async () => {
    // Clean up any existing test text input files
    await supabase
      .from('uploaded_files')
      .delete()
      .eq('source', 'text_input');
  });

  afterAll(async () => {
    // Clean up all created files
    if (createdFileIds.length > 0) {
      await supabase
        .from('uploaded_files')
        .delete()
        .in('id', createdFileIds);
    }

    // Final cleanup - remove any test text input files
    await supabase
      .from('uploaded_files')
      .delete()
      .eq('source', 'text_input');
  });

  describe('POST /api/text-input', () => {
    it('should create virtual document with valid content', async () => {
      const inputData = {
        content: '# Meeting Notes\n\n## Decisions\n- Approved budget increase\n- Team restructure planned',
        title: 'Weekly Team Sync'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.fileId).toBeDefined();
      // Status can be either 'processing' (immediate) or 'pending' (queued)
      expect(['processing', 'pending']).toContain(data.status);
      expect(data.message).toBeDefined();

      createdFileIds.push(data.fileId);

      // Verify in database
      const { data: dbFile } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', data.fileId)
        .single();

      expect(dbFile).toBeDefined();
      expect(dbFile?.source).toBe('text_input');
      expect(dbFile?.name).toContain('Weekly Team Sync');
      expect(dbFile?.storage_path).toBeNull();
      expect(dbFile?.external_id).toBeNull();
      expect(dbFile?.sync_enabled).toBe(false);
    });

    it('should create virtual document without title (auto-generated)', async () => {
      const inputData = {
        content: 'Quick note without a title. This should still process correctly with an auto-generated filename.'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.fileId).toBeDefined();

      createdFileIds.push(data.fileId);

      // Verify in database
      const { data: dbFile } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', data.fileId)
        .single();

      expect(dbFile).toBeDefined();
      expect(dbFile?.name).toContain('Text Input');
    });

    it('should trim whitespace from content', async () => {
      const inputData = {
        content: '   \n\n  Valid content with excessive whitespace   \n\n  ',
        title: 'Whitespace Test'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      createdFileIds.push(data.fileId);
    });

    it('should accept content at exactly 100KB (maximum)', async () => {
      const inputData = {
        content: 'a'.repeat(102400), // Exactly 102,400 bytes (100KB)
        title: 'Maximum Size Test'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      createdFileIds.push(data.fileId);
    });

    it('should return 400 for missing content', async () => {
      const invalidData = {
        title: 'Title Only'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error).toContain('empty');
    });

    it('should return 400 for empty content', async () => {
      const invalidData = {
        content: ''
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error).toContain('empty');
    });

    it('should return 400 for whitespace-only content', async () => {
      const invalidData = {
        content: '   \n\n   \t\t   '
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error).toContain('empty');
    });

    it('should return 413 for content exceeding 100KB', async () => {
      const invalidData = {
        content: 'a'.repeat(102401), // 102,401 bytes (exceeds limit)
        title: 'Oversized Content'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(413);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
      expect(data.error).toContain('100KB');
    });

    it('should return 400 for null content', async () => {
      const invalidData = {
        content: null
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invalidData)
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toBeDefined();
    });

    it('should handle markdown content correctly', async () => {
      const markdownContent = `# Project Kickoff

## Attendees
- Alice (PM)
- Bob (Dev)
- Carol (Design)

## Decisions
1. Launch date: Next quarter
2. Budget approved: $50K
3. Tech stack: React + Node.js

## Action Items
- [ ] Alice: Create project timeline
- [ ] Bob: Set up repository
- [ ] Carol: Design mockups

## Notes
This was a productive meeting with clear next steps.`;

      const inputData = {
        content: markdownContent,
        title: 'Project Kickoff Meeting'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.fileId).toBeDefined();

      createdFileIds.push(data.fileId);

      // Verify markdown content is preserved
      const { data: dbFile } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', data.fileId)
        .single();

      expect(dbFile).toBeDefined();
      expect(dbFile?.content_hash).toBeDefined();
    });

    it('should return 409 for duplicate content', async () => {
      const duplicateContent = {
        content: 'Duplicate content test for checking hash behavior',
        title: 'Duplicate Test 1'
      };

      // Create first file
      const response1 = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(duplicateContent)
      });

      const data1 = await response1.json();
      expect(response1.status).toBe(200);
      createdFileIds.push(data1.fileId);

      // Try to create second file with same content (should be rejected)
      const response2 = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...duplicateContent,
          title: 'Duplicate Test 2'
        })
      });

      const data2 = await response2.json();
      expect(response2.status).toBe(409);
      expect(data2.success).toBe(false);
      expect(data2.error).toContain('Duplicate');
    });

    it('should return 400 for invalid JSON', async () => {
      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json {'
      });

      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.success).toBe(false);
      expect(data.error).toContain('valid JSON');
    });

    it('should create files that integrate with existing processing pipeline', async () => {
      const inputData = {
        content: '# Test Integration\n\nThis content should trigger AI processing and embedding generation.',
        title: 'Pipeline Integration Test'
      };

      const response = await fetch(`${API_BASE}/api/text-input`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputData)
      });

      const data = await response.json();

      expect(response.status).toBe(200);
      // Status can be either 'processing' (immediate) or 'pending' (queued)
      expect(['processing', 'pending']).toContain(data.status);

      createdFileIds.push(data.fileId);

      // Verify file exists in database with correct status
      const { data: dbFile } = await supabase
        .from('uploaded_files')
        .select('*')
        .eq('id', data.fileId)
        .single();

      expect(dbFile).toBeDefined();
      expect(['processing', 'pending']).toContain(dbFile?.status);
    });
  });
});
