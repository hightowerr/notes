import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import { reflectionWithWeightSchema } from '@/lib/schemas/reflectionSchema';
import { enrichReflection } from '@/lib/services/reflectionService';
import { getAuthenticatedUserId } from '@/app/api/reflections/utils';

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

    const { data, error } = await supabase
      .from('reflections')
      .update({ is_active_for_prioritization: isActive })
      .eq('id', reflectionId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) {
      const notFound = error?.code === 'PGRST116' || (!error && !data);

      if (notFound) {
        return NextResponse.json(
          { error: 'Not Found', message: 'Reflection not found' },
          { status: 404 },
        );
      }

      console.error(
        JSON.stringify({
          event: 'reflection_toggle_error',
          user_id: userId,
          reflection_id: reflectionId,
          timestamp: new Date().toISOString(),
          error: error?.message ?? 'Unknown error',
        }),
      );

      return NextResponse.json(
        { error: 'Server Error', message: 'Failed to update reflection' },
        { status: 500 },
      );
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
        }),
      );

      return NextResponse.json(
        {
          error: 'Server Error',
          message: 'Reflection update produced invalid data',
        },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      reflection: validation.data,
    });
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
