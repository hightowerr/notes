import { NextResponse } from 'next/server';

import { createClient } from '@/lib/supabase/server';
import { invalidateManualTasks, ManualTaskPlacementError } from '@/lib/services/manualTaskPlacement';

export async function POST(_request: Request, context: { params: { id: string } }) {
  const outcomeId = context.params.id;
  if (!outcomeId) {
    return NextResponse.json({ error: 'Outcome id is required' }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const { data: outcome } = await supabase
      .from('user_outcomes')
      .select('id')
      .eq('id', outcomeId)
      .maybeSingle<{ id: string }>();

    if (!outcome) {
      return NextResponse.json({ error: 'Outcome not found' }, { status: 404 });
    }

    const { invalidatedCount } = await invalidateManualTasks({ outcomeId });

    return NextResponse.json(
      {
        invalidated_count: invalidatedCount,
        message: `${invalidatedCount} manual task(s) moved to discard pile`,
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof ManualTaskPlacementError
        ? error.message
        : 'Failed to invalidate manual tasks';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
