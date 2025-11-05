import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as googleCallbackGET } from '@/app/api/cloud/google-drive/callback/route';
import { POST as googleConnectPOST } from '@/app/api/cloud/google-drive/connect/route';
import { supabase } from '@/lib/supabase';
import { decryptToken, encryptToken } from '@/lib/services/tokenEncryption';
import * as googleDriveService from '@/lib/services/googleDriveService';

const DEFAULT_USER_ID = 'default-user';
const TABLE = 'cloud_connections';

describe('Google Drive Cloud Sync - Contract Tests', () => {
  beforeAll(async () => {
    if (!process.env.ENCRYPTION_KEY) {
      process.env.ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
    }

    await supabase.from(TABLE).delete().eq('user_id', DEFAULT_USER_ID);
  });

  beforeEach(async () => {
    await supabase.from(TABLE).delete().eq('user_id', DEFAULT_USER_ID);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await supabase.from(TABLE).delete().eq('user_id', DEFAULT_USER_ID);
  });

  it('returns Google OAuth URL and state cookie when initiating connection', async () => {
    vi.spyOn(googleDriveService, 'buildOAuthState').mockReturnValue('state-test');
    vi.spyOn(googleDriveService, 'generateGoogleDriveAuthUrl').mockReturnValue(
      'https://accounts.google.com/o/oauth2/v2/auth?mock=1'
    );

    const response = await googleConnectPOST();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth?mock=1');

    const setCookie = response.headers.get('set-cookie');
    expect(setCookie).toBeTruthy();
    expect(setCookie).toContain('google_oauth_state=state-test');
  });

  it('returns 409 when connection already exists', async () => {
    const tokenExpiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    await supabase.from(TABLE).insert({
      user_id: DEFAULT_USER_ID,
      provider: 'google_drive',
      access_token: encryptToken('existing-access'),
      refresh_token: encryptToken('existing-refresh'),
      token_expires_at: tokenExpiresAt,
    });

    const response = await googleConnectPOST();
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('ALREADY_CONNECTED');
  });

  it('persists encrypted tokens and redirects after OAuth callback success', async () => {
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    vi.spyOn(googleDriveService, 'exchangeCodeForTokens').mockResolvedValue({
      accessToken: 'access-token-123',
      refreshToken: 'refresh-token-456',
      tokenExpiresAt: expiresAt,
    });

    const request = new Request('http://localhost:3000/api/cloud/google-drive/callback?code=sample-code&state=state-test', {
      headers: {
        cookie: 'google_oauth_state=state-test',
      },
    });

    const response = await googleCallbackGET(request);

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toContain('/settings/cloud?connected=google_drive');

    const { data, error } = await supabase
      .from(TABLE)
      .select('access_token, refresh_token, token_expires_at, provider')
      .eq('user_id', DEFAULT_USER_ID)
      .maybeSingle();

    expect(error).toBeNull();
    expect(data).toBeTruthy();
    expect(data?.provider).toBe('google_drive');
    expect(data?.access_token).not.toBe('access-token-123');
    expect(data?.refresh_token).not.toBe('refresh-token-456');
    expect(decryptToken(data!.access_token)).toBe('access-token-123');
    expect(decryptToken(data!.refresh_token)).toBe('refresh-token-456');
    expect(data?.token_expires_at).toBe(expiresAt);
  });

  it('returns JSON 409 when callback is invoked with Accept: application/json and connection exists', async () => {
    const tokenExpiresAt = new Date(Date.now() + 45 * 60 * 1000).toISOString();
    await supabase.from(TABLE).insert({
      user_id: DEFAULT_USER_ID,
      provider: 'google_drive',
      access_token: encryptToken('existing-access'),
      refresh_token: encryptToken('existing-refresh'),
      token_expires_at: tokenExpiresAt,
    });

    const request = new Request('http://localhost:3000/api/cloud/google-drive/callback?code=test&state=state-test', {
      headers: {
        cookie: 'google_oauth_state=state-test',
        accept: 'application/json',
      },
    });

    const response = await googleCallbackGET(request);
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toBe('Disconnect existing account first');
  });
});
