import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { orchestrateTaskPriorities } from '@/lib/mastra/services/agentOrchestration';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';

const defaultExecutionMetadata = {
  steps_taken: 0,
  tool_call_count: {},
  thinking_time_ms: 0,
  tool_execution_time_ms: 0,
  total_time_ms: 0,
  error_count: 0,
  success_rate: 0,
};

export async function POST(request: Request) {
  try {
    const payload = await request.json();

    const outcomeId = payload?.outcome_id;
    const userId = payload?.user_id;

    if (!outcomeId || !userId) {
      return NextResponse.json(
        { error: 'VALIDATION_ERROR', message: 'outcome_id and user_id are required' },
        { status: 400 }
      );
    }

    if (userId !== DEFAULT_USER_ID) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Invalid user' },
        { status: 403 }
      );
    }

    const { data: activeOutcome, error: outcomeError } = await supabase
      .from('user_outcomes')
      .select('id')
      .eq('id', outcomeId)
      .eq('user_id', DEFAULT_USER_ID)
      .eq('is_active', true)
      .maybeSingle();

    if (outcomeError) {
      console.error('[Agent Prioritize API] Failed to validate outcome:', outcomeError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to validate outcome' },
        { status: 500 }
      );
    }

    if (!activeOutcome) {
      return NextResponse.json(
        {
          error: 'NO_ACTIVE_OUTCOME',
          message: 'Active outcome not found for prioritization',
        },
        { status: 403 }
      );
    }

    const { data: existingSession } = await supabase
      .from('agent_sessions')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .maybeSingle();

    if (existingSession?.id) {
      const { error: deleteError } = await supabase
        .from('agent_sessions')
        .delete()
        .eq('id', existingSession.id);

      if (deleteError) {
        console.error('[Agent Prioritize API] Failed to remove previous session:', deleteError);
        return NextResponse.json(
          { error: 'DATABASE_ERROR', message: 'Failed to reset previous session' },
          { status: 500 }
        );
      }
    }

    const sessionId = crypto.randomUUID();
    const now = new Date().toISOString();

    const { data: session, error: insertError } = await supabase
      .from('agent_sessions')
      .insert({
        id: sessionId,
        user_id: DEFAULT_USER_ID,
        outcome_id: outcomeId,
        status: 'running',
        prioritized_plan: null,
        execution_metadata: defaultExecutionMetadata,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (insertError || !session) {
      console.error('[Agent Prioritize API] Failed to create session:', insertError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to create agent session' },
        { status: 500 }
      );
    }

    queueMicrotask(() => {
      orchestrateTaskPriorities({
        sessionId: session.id,
        userId: DEFAULT_USER_ID,
        outcomeId,
      }).catch((error) => {
        console.error('[Agent Prioritize API] Background orchestration failed', error);
      });
    });

    return NextResponse.json(
      {
        session_id: session.id,
        status: session.status,
        prioritized_plan: session.prioritized_plan,
        execution_metadata: session.execution_metadata ?? defaultExecutionMetadata,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Agent Prioritize API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unexpected error triggering prioritization' },
      { status: 500 }
    );
  }
}
