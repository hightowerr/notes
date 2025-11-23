import { NextResponse } from 'next/server';

import { parsePlanFromAgentResponse } from '@/lib/mastra/services/resultParser';
import { getSupabaseAdminClient } from '@/lib/supabase/admin';
import { cleanupExpiredAgentSessions } from '@/lib/services/agentSessionCleanup';

const supabase = getSupabaseAdminClient();

type RouteParams = {
  sessionId: string;
};

export async function GET(_: Request, { params }: { params: Promise<RouteParams> }) {
  const { sessionId } = await params;

  if (!sessionId) {
    return NextResponse.json(
      { error: 'VALIDATION_ERROR', message: 'sessionId is required' },
      { status: 400 }
    );
  }

  try {
    await cleanupExpiredAgentSessions();

    const { data: session, error } = await supabase
      .from('agent_sessions')
      .select('*')
      .eq('id', sessionId)
      .maybeSingle();

    if (error) {
      console.error('[Agent Session API] Failed to fetch session:', error);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to fetch agent session' },
        { status: 500 }
      );
    }

    if (!session) {
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Session not found' },
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
            console.error('[Agent Session API] Failed to parse trimmed prioritized plan', error);
          }
        }
      }
    }

    const sanitizedSession = {
      ...session,
      prioritized_plan: prioritizedPlan,
      excluded_tasks: session.excluded_tasks,
    };

    return NextResponse.json(
      {
        session: sanitizedSession,
        trace: null,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Agent Session API] Unexpected error:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Unexpected error fetching session' },
      { status: 500 }
    );
  }
}
