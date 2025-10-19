import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

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

    return NextResponse.json(
      {
        session,
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
