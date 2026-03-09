import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * OAuth Callback Route
 *
 * Google redirects here after user signs in.
 * Exchanges the auth code for a session, then redirects to home.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const error = requestUrl.searchParams.get('error');
  const errorDescription = requestUrl.searchParams.get('error_description');

  // Handle OAuth errors (e.g., user denied access, domain blocked)
  if (error) {
    console.error('OAuth error:', error, errorDescription);
    // Redirect to home with error param
    return NextResponse.redirect(
      new URL(`/?auth_error=${encodeURIComponent(errorDescription || error)}`, requestUrl.origin)
    );
  }

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        flowType: 'pkce',
      },
    });

    // Exchange the code for a session
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);

    if (exchangeError) {
      console.error('Session exchange error:', exchangeError.message);

      // Friendly error for domain restriction
      let errorMessage = exchangeError.message;
      if (exchangeError.message.includes('theminers.eu') ||
          exchangeError.message.includes('Database error') ||
          exchangeError.message.includes('saving new user')) {
        errorMessage = 'Access restricted to authorized accounts only';
      }

      return NextResponse.redirect(
        new URL(`/?auth_error=${encodeURIComponent(errorMessage)}`, requestUrl.origin)
      );
    }
  }

  // Redirect to home page (session will be picked up by client)
  return NextResponse.redirect(new URL('/', requestUrl.origin));
}
