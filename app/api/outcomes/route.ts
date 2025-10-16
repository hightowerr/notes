import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { outcomeInputSchema } from '@/lib/schemas/outcomeSchema';
import { assembleOutcome, validateAssembledLength } from '@/lib/services/outcomeService';
import { recomputeService } from '@/lib/services/recomputeService';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Hardcoded user ID for P0 (single-user)
const DEFAULT_USER_ID = 'default-user';

/**
 * GET /api/outcomes
 * Fetch the active outcome for the user
 *
 * @returns 200 with outcome object, or 404 if no active outcome
 */
export async function GET() {
  try {
    console.log('[Outcomes API] Fetching active outcome...');

    // Query for active outcome
    const { data, error } = await supabase
      .from('user_outcomes')
      .select('*')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      console.error('[Outcomes API] Database error:', error);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to fetch outcome' },
        { status: 500 }
      );
    }

    // No active outcome found
    if (!data) {
      console.log('[Outcomes API] No active outcome found');
      return NextResponse.json(
        { outcome: null, message: 'No active outcome set' },
        { status: 404 }
      );
    }

    console.log('[Outcomes API] Active outcome found:', data.id);
    return NextResponse.json({ outcome: data }, { status: 200 });

  } catch (error) {
    console.error('[Outcomes API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/outcomes
 * Create or update outcome
 *
 * Flow:
 * 1. Validate input with Zod schema
 * 2. Check for existing active outcome
 * 3. If exists: deactivate old, create new (replacement)
 * 4. If not exists: create new (first-time creation)
 * 5. Count actions for recompute job (future enhancement)
 * 6. Return success with outcome details
 *
 * @returns 201 (created) or 200 (updated) with outcome details
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log('[Outcomes API] Creating/updating outcome...');

    // Validate input
    const validation = outcomeInputSchema.safeParse(body);
    if (!validation.success) {
      console.error('[Outcomes API] Validation error:', validation.error.flatten());
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          details: validation.error.flatten().fieldErrors
        },
        { status: 400 }
      );
    }

    const { direction, object, metric, clarifier, state_preference, daily_capacity_hours } = validation.data;

    // Assemble outcome text
    const assembledText = assembleOutcome({
      direction,
      object,
      metric,
      clarifier
    });

    // Validate assembled text length
    if (!validateAssembledLength(assembledText)) {
      console.error('[Outcomes API] Assembled text too long:', assembledText.length);
      return NextResponse.json(
        {
          error: 'VALIDATION_ERROR',
          message: 'Assembled outcome text exceeds maximum length'
        },
        { status: 400 }
      );
    }

    console.log('[Outcomes API] Assembled text:', assembledText);

    // Check for existing active outcome
    const { data: existingOutcome } = await supabase
      .from('user_outcomes')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('is_active', true)
      .maybeSingle();

    const isUpdate = !!existingOutcome;

    // If existing outcome, deactivate it first (replacement flow)
    let deactivatedOutcomeId: string | null = null;

    if (existingOutcome) {
      console.log('[Outcomes API] Deactivating existing outcome:', existingOutcome.id);
      const { error: deactivateError } = await supabase
        .from('user_outcomes')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('id', existingOutcome.id);

      if (deactivateError) {
        console.error('[Outcomes API] Failed to deactivate old outcome:', deactivateError);
        return NextResponse.json(
          { error: 'DATABASE_ERROR', message: 'Failed to replace outcome' },
          { status: 500 }
        );
      }

      deactivatedOutcomeId = existingOutcome.id;
    }

    // Insert new active outcome
    const { data: newOutcome, error: insertError } = await supabase
      .from('user_outcomes')
      .insert({
        user_id: DEFAULT_USER_ID,
        direction,
        object_text: object,
        metric_text: metric,
        clarifier,
        assembled_text: assembledText,
        is_active: true,
        state_preference: state_preference || null,
        daily_capacity_hours: daily_capacity_hours || null
      })
      .select()
      .single();

    if (insertError || !newOutcome) {
      console.error('[Outcomes API] Failed to insert outcome:', insertError);

      if (deactivatedOutcomeId) {
        const { error: reactivateError } = await supabase
          .from('user_outcomes')
          .update({ is_active: true, updated_at: new Date().toISOString() })
          .eq('id', deactivatedOutcomeId);

        if (reactivateError) {
          console.error(
            '[Outcomes API] Failed to reactivate previous outcome after insert failure:',
            reactivateError
          );
        }
      }

      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to save outcome' },
        { status: 500 }
      );
    }

    console.log('[Outcomes API] Outcome saved successfully:', newOutcome.id);

    // Count actions for recompute job (placeholder - actual recompute in T012)
    const { count } = await supabase
      .from('processed_documents')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', DEFAULT_USER_ID);

    const actionCount = count || 0;
    console.log(`[Outcomes API] Found ${actionCount} actions for recompute`);

    // T012: Trigger recompute job (non-blocking)
    await recomputeService.enqueue({
      outcomeId: newOutcome.id,
      userId: DEFAULT_USER_ID,
      actionCount
    });

    // Return appropriate response based on create vs update
    if (isUpdate) {
      return NextResponse.json(
        {
          id: newOutcome.id,
          assembled_text: newOutcome.assembled_text,
          updated_at: newOutcome.updated_at,
          message: `Outcome updated. Re-scoring ${actionCount} actions...`
        },
        { status: 200 }
      );
    } else {
      return NextResponse.json(
        {
          id: newOutcome.id,
          assembled_text: newOutcome.assembled_text,
          created_at: newOutcome.created_at,
          message: `Outcome created successfully. Re-scoring ${actionCount} actions...`
        },
        { status: 201 }
      );
    }

  } catch (error) {
    console.error('[Outcomes API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
