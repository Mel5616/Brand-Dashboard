import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

// Server-side sign-out: clears the Supabase auth cookies on the response and
// redirects to /login. Doing this on the server guarantees the SSR session
// cookie is removed — the browser-only signOut can leave it behind, which made
// the proxy bounce the user straight back in ("logout doesn't work").
export async function GET(request: Request) {
  const url = new URL("/login", request.url);
  const response = NextResponse.redirect(url);
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  try { await supabase.auth.signOut(); } catch { /* clear cookies regardless */ }
  return response;
}
