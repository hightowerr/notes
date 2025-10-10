/**
 * Contract Tests: GET /api/documents
 * Tests the dashboard documents retrieval API
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

describe('GET /api/documents', () => {
  let testFileIds: string[] = [];

  // Setup: Create test data
  beforeAll(async () => {
    // Create test files with different statuses
    const testFiles = [
      {
        name: 'test-completed.pdf',
        size: 1024,
        mime_type: 'application/pdf',
        content_hash: `test-hash-completed-${Date.now()}`,
        storage_path: 'notes/test-completed.pdf',
        status: 'completed',
      },
      {
        name: 'test-review.pdf',
        size: 2048,
        mime_type: 'application/pdf',
        content_hash: `test-hash-review-${Date.now()}`,
        storage_path: 'notes/test-review.pdf',
        status: 'review_required',
      },
      {
        name: 'test-processing.pdf',
        size: 512,
        mime_type: 'application/pdf',
        content_hash: `test-hash-processing-${Date.now()}`,
        storage_path: 'notes/test-processing.pdf',
        status: 'processing',
      },
    ];

    for (const file of testFiles) {
      const { data, error } = await supabase
        .from('uploaded_files')
        .insert(file)
        .select('id')
        .single();

      if (error) throw error;
      testFileIds.push(data.id);
    }

    // Create processed document for completed file
    const { data: processedDoc, error: processedError } = await supabase
      .from('processed_documents')
      .insert({
        file_id: testFileIds[0],
        markdown_content: '# Test Document',
        markdown_storage_path: 'notes/processed/test.md',
        structured_output: {
          topics: ['Test Topic'],
          decisions: ['Test Decision'],
          actions: ['Test Action'],
          lno_tasks: {
            leverage: ['Test Leverage'],
            neutral: ['Test Neutral'],
            overhead: ['Test Overhead'],
          },
        },
        json_storage_path: 'notes/processed/test.json',
        confidence: 0.85,
        processing_duration: 5000,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (processedError) throw processedError;

    // Create processed document for review_required file (low confidence)
    const { error: reviewError } = await supabase
      .from('processed_documents')
      .insert({
        file_id: testFileIds[1],
        markdown_content: '# Review Document',
        markdown_storage_path: 'notes/processed/review.md',
        structured_output: {
          topics: ['Review Topic'],
          decisions: [],
          actions: [],
          lno_tasks: {
            leverage: [],
            neutral: [],
            overhead: [],
          },
        },
        json_storage_path: 'notes/processed/review.json',
        confidence: 0.30,
        processing_duration: 3000,
        expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
      .single();

    if (reviewError) throw reviewError;
  });

  // Cleanup: Remove test data
  afterAll(async () => {
    // Delete processed documents first (due to foreign key constraint)
    await supabase
      .from('processed_documents')
      .delete()
      .in('file_id', testFileIds);

    // Delete uploaded files
    await supabase
      .from('uploaded_files')
      .delete()
      .in('id', testFileIds);
  });

  it('should return all documents when no filters provided', async () => {
    const response = await fetch('http://localhost:3000/api/documents');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);
    expect(data.documents.length).toBeGreaterThanOrEqual(3);

    // Verify structure of returned documents
    const doc = data.documents[0];
    expect(doc).toHaveProperty('id');
    expect(doc).toHaveProperty('name');
    expect(doc).toHaveProperty('size');
    expect(doc).toHaveProperty('mimeType');
    expect(doc).toHaveProperty('uploadedAt');
    expect(doc).toHaveProperty('status');
  });

  it('should filter by status=completed', async () => {
    const response = await fetch('http://localhost:3000/api/documents?status=completed');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(Array.isArray(data.documents)).toBe(true);

    // All returned documents should have status=completed
    data.documents.forEach((doc: any) => {
      expect(doc.status).toBe('completed');
      expect(doc.summary).toBeDefined();
      expect(doc.confidence).toBeGreaterThanOrEqual(0.8);
    });
  });

  it('should filter by status=review_required', async () => {
    const response = await fetch('http://localhost:3000/api/documents?status=review_required');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // All returned documents should have status=review_required
    data.documents.forEach((doc: any) => {
      expect(doc.status).toBe('review_required');
      expect(doc.summary).toBeDefined();
      expect(doc.confidence).toBeLessThan(0.8);
    });
  });

  it('should filter by status=processing', async () => {
    const response = await fetch('http://localhost:3000/api/documents?status=processing');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Processing documents should not have summary yet
    data.documents.forEach((doc: any) => {
      expect(doc.status).toBe('processing');
      expect(doc.summary).toBeUndefined();
    });
  });

  it('should sort by confidence ascending', async () => {
    const response = await fetch('http://localhost:3000/api/documents?sort=confidence&order=asc');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Filter only documents with confidence (completed or review_required)
    const docsWithConfidence = data.documents.filter((doc: any) => doc.confidence !== undefined);

    // Verify ascending order
    for (let i = 1; i < docsWithConfidence.length; i++) {
      expect(docsWithConfidence[i].confidence).toBeGreaterThanOrEqual(docsWithConfidence[i - 1].confidence);
    }
  });

  it('should sort by date descending by default', async () => {
    const response = await fetch('http://localhost:3000/api/documents');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify descending order (most recent first)
    for (let i = 1; i < data.documents.length; i++) {
      const prevDate = new Date(data.documents[i - 1].uploadedAt);
      const currDate = new Date(data.documents[i].uploadedAt);
      expect(prevDate.getTime()).toBeGreaterThanOrEqual(currDate.getTime());
    }
  });

  it('should sort by name ascending', async () => {
    const response = await fetch('http://localhost:3000/api/documents?sort=name&order=asc');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    // Verify alphabetical order
    for (let i = 1; i < data.documents.length; i++) {
      expect(data.documents[i].name.localeCompare(data.documents[i - 1].name)).toBeGreaterThanOrEqual(0);
    }
  });

  it('should return 400 for invalid status filter', async () => {
    const response = await fetch('http://localhost:3000/api/documents?status=invalid');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid status filter');
    expect(data.code).toBe('INVALID_REQUEST');
  });

  it('should return 400 for invalid sort field', async () => {
    const response = await fetch('http://localhost:3000/api/documents?sort=invalid');
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toContain('Invalid sort field');
    expect(data.code).toBe('INVALID_REQUEST');
  });

  it('should return empty array when no documents exist with filter', async () => {
    const response = await fetch('http://localhost:3000/api/documents?status=failed');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.documents).toEqual([]);
  });

  it('should include summary data for completed documents', async () => {
    const response = await fetch('http://localhost:3000/api/documents?status=completed');
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);

    const completedDoc = data.documents[0];
    expect(completedDoc.summary).toBeDefined();
    expect(completedDoc.summary.topics).toBeDefined();
    expect(completedDoc.summary.decisions).toBeDefined();
    expect(completedDoc.summary.actions).toBeDefined();
    expect(completedDoc.summary.lno_tasks).toBeDefined();
    expect(completedDoc.summary.lno_tasks.leverage).toBeDefined();
    expect(completedDoc.summary.lno_tasks.neutral).toBeDefined();
    expect(completedDoc.summary.lno_tasks.overhead).toBeDefined();
    expect(completedDoc.confidence).toBeDefined();
    expect(completedDoc.processingDuration).toBeDefined();
  });
});
