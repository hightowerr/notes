/**
 * Test Fixture Helper Functions
 * Provides utilities for uploading test files to Supabase storage
 * and cleaning up after tests complete
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';
import { generateContentHash } from '@/lib/schemas';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export interface TestFileUpload {
  fileId: string;
  storagePath: string;
  contentHash: string;
  name: string;
  size: number;
  mimeType: string;
}

/**
 * Upload a test fixture file to Supabase storage and create database record
 * @param fixtureName - Name of file in __tests__/fixtures/ directory
 * @param options - Optional override for mime type
 * @returns Upload metadata including fileId and storage path
 */
export async function uploadTestFixture(
  fixtureName: string,
  options?: { mimeType?: string }
): Promise<TestFileUpload> {
  const fixturePath = join(__dirname, fixtureName);
  const fileBuffer = readFileSync(fixturePath);

  // Determine MIME type
  let mimeType = options?.mimeType;
  if (!mimeType) {
    if (fixtureName.endsWith('.pdf')) {
      mimeType = 'application/pdf';
    } else if (fixtureName.endsWith('.docx')) {
      mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    } else if (fixtureName.endsWith('.txt')) {
      mimeType = 'text/plain';
    } else if (fixtureName.endsWith('.md')) {
      mimeType = 'text/markdown';
    } else {
      mimeType = 'application/octet-stream';
    }
  }

  // Generate unique storage path
  const testId = crypto.randomUUID();
  const storagePath = `test-fixtures/${testId}-${fixtureName}`;

  // Upload to Supabase storage
  const { error: uploadError } = await supabase.storage
    .from('notes')
    .upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Failed to upload test fixture: ${uploadError.message}`);
  }

  // Generate content hash
  const contentHash = await generateContentHash(fileBuffer.buffer);

  // Create database record
  const { data: uploadedFile, error: dbError } = await supabase
    .from('uploaded_files')
    .insert({
      name: fixtureName,
      size: fileBuffer.length,
      mime_type: mimeType,
      content_hash: contentHash,
      storage_path: storagePath,
      status: 'pending',
    })
    .select('id')
    .single();

  if (dbError || !uploadedFile) {
    // Cleanup storage if database insert fails
    await supabase.storage.from('notes').remove([storagePath]);
    throw new Error(`Failed to create database record: ${dbError?.message}`);
  }

  return {
    fileId: uploadedFile.id,
    storagePath,
    contentHash,
    name: fixtureName,
    size: fileBuffer.length,
    mimeType,
  };
}

/**
 * Clean up test file from both storage and database
 * @param fileId - Database ID of uploaded file
 * @param storagePath - Path in Supabase storage
 */
export async function cleanupTestFixture(
  fileId: string,
  storagePath: string
): Promise<void> {
  // Delete from database (cascade will handle related records)
  await supabase.from('processing_logs').delete().eq('file_id', fileId);
  await supabase.from('processed_documents').delete().eq('file_id', fileId);
  await supabase.from('uploaded_files').delete().eq('id', fileId);

  // Delete from storage
  await supabase.storage.from('notes').remove([storagePath]);

  // Cleanup processed files if they exist
  const processedMarkdown = storagePath.replace('test-fixtures/', 'processed/').replace(/\.(txt|pdf|docx)$/, '.md');
  const processedJson = storagePath.replace('test-fixtures/', 'processed/').replace(/\.(txt|pdf|docx)$/, '.json');

  await supabase.storage.from('notes').remove([processedMarkdown, processedJson]);
}

/**
 * Clean up all test fixtures (useful for afterAll cleanup)
 */
export async function cleanupAllTestFixtures(): Promise<void> {
  // List all files in test-fixtures folder
  const { data: files } = await supabase.storage
    .from('notes')
    .list('test-fixtures');

  if (files && files.length > 0) {
    const paths = files.map(file => `test-fixtures/${file.name}`);
    await supabase.storage.from('notes').remove(paths);
  }

  // Delete all test fixture database records
  const { data: testFiles } = await supabase
    .from('uploaded_files')
    .select('id')
    .like('storage_path', 'test-fixtures/%');

  if (testFiles && testFiles.length > 0) {
    const fileIds = testFiles.map(f => f.id);

    for (const fileId of fileIds) {
      await supabase.from('processing_logs').delete().eq('file_id', fileId);
      await supabase.from('processed_documents').delete().eq('file_id', fileId);
    }

    await supabase
      .from('uploaded_files')
      .delete()
      .like('storage_path', 'test-fixtures/%');
  }
}
