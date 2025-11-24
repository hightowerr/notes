import { performance } from 'node:perf_hooks';

import { NextResponse } from 'next/server';

import { reflectionWithWeightSchema } from '@/lib/schemas/reflectionSchema';
import { enrichReflection } from '@/lib/services/reflectionService';
import { toggleReflectionEffect } from '@/lib/services/reflectionAdjuster';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';

type ToggleResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; response: NextResponse };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function processReflectionToggle(
  userId: string,
  reflectionId: string,
  isActive: boolean
): Promise<ToggleResult> {
  let supabase;
  try {
    supabase = getSupabaseAdminClient();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'reflection_toggle_client_error',
        user_id: userId,
        reflection_id: reflectionId,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      })
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server Error', message: 'Supabase admin client unavailable' },
        { status: 500 }
      ),
    };
  }

  const startedAt = performance.now();

  if (!UUID_PATTERN.test(reflectionId)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Invalid ID', message: 'Reflection ID must be a valid UUID' },
        { status: 400 }
      ),
    };
  }

  let data;
  let error;
  try {
    const result = await supabase
      .from('reflections')
      .update({ is_active_for_prioritization: isActive })
      .eq('id', reflectionId)
      .eq('user_id', userId)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } catch (unexpected) {
    console.error(
      JSON.stringify({
        event: 'reflection_toggle_update_exception',
        user_id: userId,
        reflection_id: reflectionId,
        timestamp: new Date().toISOString(),
        error: unexpected instanceof Error ? unexpected.message : 'Unknown error',
      })
    );
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server Error', message: 'Failed to update reflection' },
        { status: 500 }
      ),
    };
  }

  if (error || !data) {
    const notFound = error?.code === 'PGRST116' || (!error && !data);
    if (notFound) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: 'Not Found', message: 'Reflection not found' },
          { status: 404 }
        ),
      };
    }

    console.error(
      JSON.stringify({
        event: 'reflection_toggle_error',
        user_id: userId,
        reflection_id: reflectionId,
        timestamp: new Date().toISOString(),
        error: error?.message ?? 'Unknown error',
        code: error?.code,
        details: error?.details,
      })
    );

    return {
      ok: false,
      response: NextResponse.json(
        { error: 'Server Error', message: 'Failed to update reflection' },
        { status: 500 }
      ),
    };
  }

  const reflectionWithMetadata = enrichReflection(data);
  const validation = reflectionWithWeightSchema.safeParse(reflectionWithMetadata);

  if (!validation.success) {
    console.error(
      JSON.stringify({
        event: 'reflection_toggle_validation_error',
        user_id: userId,
        reflection_id: reflectionId,
        timestamp: new Date().toISOString(),
        issues: validation.error.flatten(),
      })
    );

    return {
      ok: false,
      response: NextResponse.json(
        {
          error: 'Server Error',
          message: 'Reflection update produced invalid data',
        },
        { status: 500 }
      ),
    };
  }

  const toggleResult = await toggleReflectionEffect(reflectionId, isActive);
  const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));

  return {
    ok: true,
    payload: {
      success: true,
      reflection: validation.data,
      effects_applied: toggleResult.effectsApplied,
      effects_removed: toggleResult.effectsRemoved,
      tasks_affected: toggleResult.tasksAffected,
      latency_ms: latencyMs,
    },
  };
}
