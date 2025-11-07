import { NextRequest, NextResponse } from 'next/server';
import { deleteReflection } from '@/lib/services/reflectionService';
import { getAuthenticatedUserId } from '@/app/api/reflections/utils';
import { debounceRecompute } from '@/lib/services/recomputeDebounce';
import { triggerRecomputeJob } from '@/lib/services/recomputeService';

/**
 * DELETE /api/reflections/[id]
 * Delete a reflection
 *
 * Returns:
 * - 200 with { success: true }
 * - 400 if invalid ID format
 * - 401 if unauthorized
 * - 404 if reflection not found or doesn't belong to user
 * - 500 if server error
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 }
      );
    }

    const reflectionId = params.id;

    // Validate UUID format
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!UUID_PATTERN.test(reflectionId)) {
      return NextResponse.json(
        { error: 'Invalid ID', message: 'Reflection ID must be a valid UUID' },
        { status: 400 }
      );
    }

    // Delete reflection (will fail if user doesn't own it)
    await deleteReflection(userId, reflectionId);

    // Log successful deletion
    console.log(
      JSON.stringify({
        event: 'reflection_deleted',
        user_id: userId,
        timestamp: new Date().toISOString(),
        reflection_id: reflectionId,
      })
    );

    // Trigger debounced recompute job
    debounceRecompute(userId, async () => {
      try {
        await triggerRecomputeJob(userId, 'reflection_deleted');
      } catch (error) {
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

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'reflection_deletion_error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    );

    return NextResponse.json(
      {
        error: 'Server Error',
        message: 'Failed to delete reflection'
      },
      { status: 500 }
    );
  }
}
