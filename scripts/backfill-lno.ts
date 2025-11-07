#!/usr/bin/env tsx

/**
 * Backfill script to regenerate LNO classifications and embeddings
 * for older processed documents that never received task graph coverage.
 *
 * Usage:
 *   NEXT_PUBLIC_SUPABASE_URL=... \
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=... \
 *   SUPABASE_SERVICE_ROLE_KEY=... \
 *   OPENAI_API_KEY=... \
 *   npx tsx scripts/backfill-lno.ts
 */

import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

import {
  scoreActions,
  extractActionTextsFromOutput,
  generateAndStoreEmbeddings,
} from '@/lib/services/aiSummarizer';
import { DocumentOutputSchema, type DocumentOutput } from '@/lib/schemas';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceKey);

const BATCH_SIZE = Number(process.env.BACKFILL_BATCH_SIZE ?? 25);

type ProcessedDocumentRow = {
  id: string;
  structured_output: unknown;
  processed_at: string | null;
};

function hasIncompleteLno(output: DocumentOutput): boolean {
  const leverageCount = output.lno_tasks?.leverage?.length ?? 0;
  const neutralCount = output.lno_tasks?.neutral?.length ?? 0;
  const overheadCount = output.lno_tasks?.overhead?.length ?? 0;

  return leverageCount === 0 || neutralCount === 0 || overheadCount === 0;
}

async function countEmbeddings(documentId: string): Promise<number> {
  const { count, error } = await supabase
    .from('task_embeddings')
    .select('task_id', { count: 'exact', head: true })
    .eq('document_id', documentId);

  if (error) {
    throw new Error(`Failed to count embeddings for ${documentId}: ${error.message}`);
  }

  return count ?? 0;
}

async function processDocument(row: ProcessedDocumentRow): Promise<{
  reclassified: boolean;
  embeddingsTriggered: boolean;
}> {
  const parsed = DocumentOutputSchema.safeParse(row.structured_output);
  if (!parsed.success) {
    console.warn('[Backfill] Skipping document with invalid structured_output', {
      documentId: row.id,
      issues: parsed.error.flatten(),
    });
    return { reclassified: false, embeddingsTriggered: false };
  }

  let output: DocumentOutput = parsed.data;
  const actionCount = output.actions?.length ?? 0;

  const needsClassification = actionCount > 0 && hasIncompleteLno(output);
  let reclassified = false;

  if (needsClassification) {
    const updatedBuckets = await scoreActions(
      { id: row.id, structured_output: output },
      '' // Outcome context is unknown for legacy docs
    );

    output = {
      ...output,
      lno_tasks: {
        leverage: updatedBuckets.leverage,
        neutral: updatedBuckets.neutral,
        overhead: updatedBuckets.overhead,
      },
    };

    const stillIncomplete = hasIncompleteLno(output);
    if (stillIncomplete && actionCount > 0) {
      const fallback = extractActionTextsFromOutput(output);
      if (fallback.length > 0) {
        const neutralSet = new Set(output.lno_tasks.neutral);
        fallback.forEach(text => neutralSet.add(text));
        output = {
          ...output,
          lno_tasks: {
            ...output.lno_tasks,
            neutral: Array.from(neutralSet),
          },
        };
      }
    }

    reclassified = true;
    const { error: updateError } = await supabase
      .from('processed_documents')
      .update({ structured_output: output })
      .eq('id', row.id);

    if (updateError) {
      throw new Error(`Failed to update processed_documents for ${row.id}: ${updateError.message}`);
    }
  }

  const embeddingCount = await countEmbeddings(row.id);
  const shouldEmbed = embeddingCount === 0 || reclassified;

  if (!shouldEmbed) {
    return { reclassified, embeddingsTriggered: false };
  }

  const embeddingResult = await generateAndStoreEmbeddings(row.id, output);

  const embeddingsTriggered = embeddingResult.success + embeddingResult.pending > 0;
  return { reclassified, embeddingsTriggered };
}

async function main() {
  let offset = 0;
  let processed = 0;
  let reclassified = 0;
  let embeddingsTriggered = 0;

  while (true) {
    const { data, error } = await supabase
      .from('processed_documents')
      .select('id, structured_output, processed_at')
      .order('processed_at', { ascending: true })
      .range(offset, offset + BATCH_SIZE - 1)
      .returns<ProcessedDocumentRow[]>();

    if (error) {
      throw new Error(`Failed to fetch processed_documents: ${error.message}`);
    }

    if (!data || data.length === 0) {
      break;
    }

    for (const row of data) {
      processed += 1;
      try {
        const result = await processDocument(row);
        if (result.reclassified) {
          reclassified += 1;
        }
        if (result.embeddingsTriggered) {
          embeddingsTriggered += 1;
        }
      } catch (docError) {
        console.error('[Backfill] Failed to process document', {
          documentId: row.id,
          error: docError instanceof Error ? docError.message : docError,
        });
      }
    }

    if (data.length < BATCH_SIZE) {
      break;
    }

    offset += BATCH_SIZE;
  }

  console.log('[Backfill] Complete', {
    processed,
    reclassified,
    embeddingsTriggered,
  });
}

main().catch(error => {
  console.error('Backfill failed:', error);
  process.exitCode = 1;
});
