import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import {
  buildOAuthState,
  generateGoogleDriveAuthUrl,
} from '@/lib/services/googleDriveService';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';
const OAUTH_STATE_COOKIE = 'google_oauth_state';

export async function POST() {
  try {
    const { data: existingConnection, error: queryError } = await supabase
      .from('cloud_connections')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('provider', 'google_drive')
      .maybeSingle();

    if (queryError) {
      console.error('[Google Drive Connect] Failed to check existing connection', queryError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to check cloud connection' },
        { status: 500 }
      );
    }

    if (existingConnection) {
      return NextResponse.json(
        {
          error: 'ALREADY_CONNECTED',
          message: 'Disconnect existing account first',
        },
        { status: 409 }
      );
    }

    const state = buildOAuthState();
    const authUrl = generateGoogleDriveAuthUrl(state);

    const response = NextResponse.json({ authUrl });

    response.cookies.set({
      name: OAUTH_STATE_COOKIE,
      value: state,
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 10, // 10 minutes
    });

    return response;
  } catch (error) {
    console.error('[Google Drive Connect] Failed to initiate OAuth', error);
    return NextResponse.json(
      { error: 'OAUTH_INIT_FAILURE', message: 'Failed to generate Google OAuth URL' },
      { status: 500 }
    );
  }
}
