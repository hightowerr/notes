import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

import { exchangeCodeForTokens } from '@/lib/services/googleDriveService';
import { encryptToken } from '@/lib/services/tokenEncryption';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

const DEFAULT_USER_ID = 'default-user';
const OAUTH_STATE_COOKIE = 'google_oauth_state';

function readStateCookie(request: Request): string | undefined {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return undefined;

  for (const entry of cookieHeader.split(';')) {
    const [rawName, ...rest] = entry.trim().split('=');
    if (rawName === OAUTH_STATE_COOKIE) {
      return decodeURIComponent(rest.join('='));
    }
  }

  return undefined;
}

function wantsJson(request: Request) {
  const acceptHeader = request.headers.get('accept') ?? '';
  return acceptHeader.includes('application/json');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const authCode = url.searchParams.get('code');
  const requestState = url.searchParams.get('state') ?? undefined;
  const storedState = readStateCookie(request);

  if (!authCode) {
    console.error('[Google Drive Callback] Missing authorization code');

    if (wantsJson(request)) {
      const response = NextResponse.json({ error: 'Missing auth code' }, { status: 400 });
      response.cookies.delete(OAUTH_STATE_COOKIE);
      return response;
    }

    const redirectUrl = new URL('/settings/cloud?error=missing-code', request.url);
    const redirect = NextResponse.redirect(redirectUrl, 303);
    redirect.cookies.delete(OAUTH_STATE_COOKIE);
    return redirect;
  }

  if (storedState && storedState !== requestState) {
    console.error('[Google Drive Callback] OAuth state mismatch', {
      expected: storedState,
      received: requestState,
    });

    if (wantsJson(request)) {
      const response = NextResponse.json(
        { error: 'State mismatch. Please retry the connection flow.' },
        { status: 400 }
      );
      response.cookies.delete(OAUTH_STATE_COOKIE);
      return response;
    }

    const redirectUrl = new URL('/settings/cloud?error=state-mismatch', request.url);
    const redirect = NextResponse.redirect(redirectUrl, 303);
    redirect.cookies.delete(OAUTH_STATE_COOKIE);
    return redirect;
  }

  try {
    const { data: existingConnection, error: queryError } = await supabase
      .from('cloud_connections')
      .select('id')
      .eq('user_id', DEFAULT_USER_ID)
      .eq('provider', 'google_drive')
      .maybeSingle();

    if (queryError) {
      console.error('[Google Drive Callback] Failed to check existing connection', queryError);
      return NextResponse.json(
        { error: 'DATABASE_ERROR', message: 'Failed to check cloud connection' },
        { status: 500 }
      );
    }

    if (existingConnection) {
      if (wantsJson(request)) {
        const response = NextResponse.json(
          { error: 'Disconnect existing account first' },
          { status: 409 }
        );
        response.cookies.delete(OAUTH_STATE_COOKIE);
        return response;
      }

      const redirectUrl = new URL('/settings/cloud?error=already-connected', request.url);
      const redirect = NextResponse.redirect(redirectUrl, 303);
      redirect.cookies.delete(OAUTH_STATE_COOKIE);
      return redirect;
    }

    const tokens = await exchangeCodeForTokens(authCode);
    const encryptedAccessToken = encryptToken(tokens.accessToken);
    const encryptedRefreshToken = encryptToken(tokens.refreshToken);

    const { error: insertError } = await supabase.from('cloud_connections').insert({
      user_id: DEFAULT_USER_ID,
      provider: 'google_drive',
      access_token: encryptedAccessToken,
      refresh_token: encryptedRefreshToken,
      token_expires_at: tokens.tokenExpiresAt,
    });

    if (insertError) {
      console.error('[Google Drive Callback] Failed to persist connection', insertError);
      if (wantsJson(request)) {
        const response = NextResponse.json(
          { error: 'Failed to store cloud connection' },
          { status: 500 }
        );
        response.cookies.delete(OAUTH_STATE_COOKIE);
        return response;
      }

      const redirectUrl = new URL('/settings/cloud?error=persist-failure', request.url);
      const redirect = NextResponse.redirect(redirectUrl, 303);
      redirect.cookies.delete(OAUTH_STATE_COOKIE);
      return redirect;
    }

    const redirectUrl = new URL('/settings/cloud?connected=google_drive', request.url);
    const response = NextResponse.redirect(redirectUrl, 303);
    response.cookies.delete(OAUTH_STATE_COOKIE);

    return response;
  } catch (error) {
    console.error('[Google Drive Callback] Failed to exchange tokens', error);

    if (wantsJson(request)) {
      const response = NextResponse.json(
        { error: 'Failed to exchange authorization code' },
        { status: 500 }
      );
      response.cookies.delete(OAUTH_STATE_COOKIE);
      return response;
    }

    const redirectUrl = new URL('/settings/cloud?error=token-exchange', request.url);
    const redirect = NextResponse.redirect(redirectUrl, 303);
    redirect.cookies.delete(OAUTH_STATE_COOKIE);
    return redirect;
  }
}
