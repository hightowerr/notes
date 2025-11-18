import { NextResponse } from 'next/server';
import { parsePlanFromAgentResponse } from '@/lib/mastra/services/resultParser';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { cleanupExpiredAgentSessions } from '@/lib/services/agentSessionCleanup';

const supabase = getSupabaseAdminClient();

export async function GET(request: Request) {
  const url = new URL(request.url);
  const outcomeId = url.searchParams.get('outcomeId');
  const userId = url.searchParams.get('userId');

  if (!outcomeId) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'outcomeId is required' },
      { status: 400 }
    );
  }

  if (!userId) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'userId is required' },
      { status: 400 }
    );
  }

  try {
    await cleanupExpiredAgentSessions();

    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('*')
      .eq('user_id', userId)
      .eq('outcome_id', outcomeId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('[Agent Latest Session API] Failed to fetch session:', error);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to fetch latest agent session' },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'No completed session found' },
        { status: 404 }
      );
    }

    let prioritizedPlan = session.prioritized_plan;
    if (typeof prioritizedPlan === 'string') {
      const parsed = parsePlanFromAgentResponse(prioritizedPlan);
      if (parsed.success) {
        prioritizedPlan = parsed.plan;
      } else {
        const trimmed = prioritizedPlan.trim();
        const firstBrace = trimmed.indexOf('{');
        const lastBrace = trimmed.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          const candidate = trimmed.slice(firstBrace, lastBrace + 1);
          try {
            prioritizedPlan = JSON.parse(candidate);
          } catch (error) {
            console.error('[Agent Latest Session API] Failed to parse trimmed prioritized plan', error);
          }
        }
      }
    }

    const sanitizedSession = {
      ...session,
      prioritized_plan: prioritizedPlan,
    };

    return NextResponse.json(
      {
        session: sanitizedSession,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Agent Latest Session API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unexpected error fetching latest session' },
      { status: 500 }
    );
  }
}
