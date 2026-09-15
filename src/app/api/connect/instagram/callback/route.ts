import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

function getRequestBaseUrl(request: Request) {
  const host = request.headers.get('host');
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000';
  const protocol = host.includes('localhost') ? 'http' : 'https';
  return `${protocol}://${host}`;
}

function instagramRedirectUri(baseUrl: string) {
  const explicit = process.env.INSTAGRAM_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return new URL('/api/connect/instagram/callback', baseUrl).toString();
}

export async function GET(request: Request) {
  const baseUrl = getRequestBaseUrl(request);
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');

  const cookieStore = await cookies();
  const savedState = cookieStore.get('instagram_oauth_state')?.value;

  if (!code || !state || state !== savedState) {
    return NextResponse.redirect(new URL('/connect/instagram?oauth=error&reason=invalid_state', baseUrl));
  }

  const clientId = process.env.INSTAGRAM_CLIENT_ID?.trim()
    || process.env.INSTAGRAM_APP_ID?.trim()
    || process.env.META_CLIENT_ID?.trim();

  const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET?.trim()
    || process.env.INSTAGRAM_APP_SECRET?.trim()
    || process.env.META_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    return NextResponse.redirect(new URL('/connect/instagram?oauth=error&reason=missing_config', baseUrl));
  }

  try {
    const callbackUrl = instagramRedirectUri(baseUrl);

    // Direct Instagram OAuth token exchange (POST to api.instagram.com/oauth/access_token)
    const formData = new URLSearchParams();
    formData.set('client_id', clientId);
    formData.set('client_secret', clientSecret);
    formData.set('grant_type', 'authorization_code');
    formData.set('redirect_uri', callbackUrl);
    formData.set('code', code);

    const tokenRes = await fetch('https://api.instagram.com/oauth/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      console.error('Instagram Token Exchange Failed:', tokenData);
      const errMsg = tokenData.error_message || tokenData.error?.message || 'token_exchange_failed';
      return NextResponse.redirect(new URL(`/connect/instagram?oauth=error&reason=${encodeURIComponent(errMsg)}`, baseUrl));
    }

    let accessToken = tokenData.access_token;
    let expiresAt: string | null = null;

    // Optional: Exchange short-lived token for long-lived (60 days) access token
    try {
      const longLivedUrl = new URL('https://graph.instagram.com/access_token');
      longLivedUrl.searchParams.set('grant_type', 'ig_exchange_token');
      longLivedUrl.searchParams.set('client_secret', clientSecret);
      longLivedUrl.searchParams.set('access_token', accessToken);

      const longRes = await fetch(longLivedUrl.toString());
      if (longRes.ok) {
        const longData = await longRes.json();
        if (longData.access_token) {
          accessToken = longData.access_token;
          if (longData.expires_in) {
            expiresAt = new Date(Date.now() + longData.expires_in * 1000).toISOString();
          }
        }
      }
    } catch (longErr) {
      console.warn('Instagram long-lived token exchange note:', longErr);
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.redirect(new URL('/login', baseUrl));
    }

    // Save token under 'instagram' and 'meta' so all sync engines can access it
    const platformsToSave = ['instagram', 'meta'];
    for (const p of platformsToSave) {
      await supabase
        .from('oauth_tokens')
        .upsert({
          user_id: user.id,
          platform: p,
          access_token: accessToken,
          refresh_token: null,
          expires_at: expiresAt,
          scope: 'user_profile,user_media',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform' });

      await supabase
        .from('sync_status')
        .upsert({
          user_id: user.id,
          platform: p,
          status: 'idle',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform' });
    }

    return NextResponse.redirect(new URL('/connect/instagram?oauth=success', baseUrl));
  } catch (err) {
    console.error('Instagram Auth Error:', err);
    return NextResponse.redirect(new URL('/connect/instagram?oauth=error&reason=server_error', baseUrl));
  }
}
