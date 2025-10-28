import { NextRequest, NextResponse } from 'next/server';
import { reflectionInputSchema } from '@/lib/schemas/reflectionSchema';
import { createReflection, fetchRecentReflections } from '@/lib/services/reflectionService';
import { debounceRecompute } from '@/lib/services/recomputeDebounce';
import { triggerRecomputeJob } from '@/lib/services/recomputeService';
import { getAuthenticatedUserId } from '@/app/api/reflections/utils';
import { supabase } from '@/lib/supabase';

/**
 * GET /api/reflections
 * Fetch recent reflections for the current user
 *
 * Query params:
 * - limit: number (default: 5, max: 50)
 * - within_days: number (default: 30, max: 365)
 * - active_only: boolean (optional)
 *
 * Returns: 200 with { reflections: ReflectionWithWeight[] }
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const withinDaysParam = searchParams.get('within_days');
    const activeOnlyParam = searchParams.get('active_only');

    const parsedLimit = Number.parseInt(limitParam ?? '5', 10);
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 50) : 5;

    const parsedWithinDays = Number.parseInt(withinDaysParam ?? '30', 10);
    const withinDays = Number.isFinite(parsedWithinDays)
      ? Math.min(Math.max(parsedWithinDays, 1), 365)
      : 30;

    const activeOnly = activeOnlyParam === 'true';

    const reflections = await fetchRecentReflections(userId, {
      limit,
      withinDays,
      activeOnly,
    });

    return NextResponse.json({ reflections }, { status: 200 });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'reflection_fetch_error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    );

    return NextResponse.json(
      {
        error: 'Server Error',
        message: 'Failed to fetch reflections'
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/reflections
 * Create a new reflection
 *
 * Body: { text: string }
 *
 * Returns:
 * - 201 with reflection data (ReflectionWithWeight)
 * - 400 if validation fails
 * - 401 if unauthorized
 * - 500 if server error
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await request.json();

    // Server-side validation with Zod
    const validation = reflectionInputSchema.safeParse(body);
    if (!validation.success) {
      const error = validation.error.errors[0];

      console.error(
        JSON.stringify({
          event: 'reflection_validation_error',
          user_id: userId,
          timestamp: new Date().toISOString(),
          error: error.message,
          field: error.path.join('.')
        })
      );

      return NextResponse.json(
        {
          error: 'Validation Error',
          message: error.message,
          field: error.path.join('.')
        },
        { status: 400 }
      );
    }

    const { text } = validation.data;

    // Create reflection in database
    const reflection = await createReflection(userId, text);

    let totalReflections: number | null = null;
    try {
      const { count } = await supabase
        .from('reflections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      if (typeof count === 'number') {
        totalReflections = count;
      }
    } catch (countError) {
      console.error(
        JSON.stringify({
          event: 'reflection_count_error',
          user_id: userId,
          timestamp: new Date().toISOString(),
          error: countError instanceof Error ? countError.message : 'Unknown error'
        })
      );
    }

    // Log successful creation (no reflection text for privacy)
    console.log(
      JSON.stringify({
        event: 'reflection_created',
        user_id: userId,
        timestamp: new Date().toISOString(),
        char_count: text.length,
        reflection_id: reflection.id,
        total_reflections: totalReflections,
      })
    );

    // Trigger debounced recompute job
    // This will wait 2s after last reflection, rate-limited to 1 per 10s
    debounceRecompute(userId, async () => {
      try {
        await triggerRecomputeJob(userId, 'reflection_added');
      } catch (error) {
        // Graceful degradation: reflection saved even if recompute fails
        console.error(
          JSON.stringify({
            event: 'recompute_trigger_failed',
            user_id: userId,
            timestamp: new Date().toISOString(),
            error: error instanceof Error ? error.message : 'Unknown error'
          })
        );
      }
    });

    return NextResponse.json(reflection, { status: 201 });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'reflection_creation_error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    );

    return NextResponse.json(
      {
        error: 'Server Error',
        message: 'Failed to create reflection'
      },
      { status: 500 }
    );
  }
}
