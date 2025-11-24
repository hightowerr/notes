import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuthenticatedUserId } from '@/app/api/reflections/utils';
import { processReflectionToggle } from '@/app/api/reflections/toggleShared';

const toggleSchema = z.object({
  reflection_id: z.string().uuid(),
  is_active: z.boolean(),
});

export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId();

    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized', message: 'Authentication required' },
        { status: 401 },
      );
    }

    const body = await request.json();
    const parsed = toggleSchema.safeParse(body);

    if (!parsed.success) {
      const issue = parsed.error.issues[0];

      return NextResponse.json(
        {
          error: 'Validation Error',
          message: issue.message ?? 'Invalid request payload',
          field: issue.path.join('.'),
        },
        { status: 400 },
      );
    }

    const { reflection_id: reflectionId, is_active: isActive } = parsed.data;

    const result = await processReflectionToggle(userId, reflectionId, isActive);
    if (!result.ok) {
      return result.response;
    }

    return NextResponse.json(result.payload);
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'reflection_toggle_unexpected_error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
    );

    return NextResponse.json(
      {
        error: 'Server Error',
        message: 'Failed to update reflection',
      },
      { status: 500 },
    );
  }
}
