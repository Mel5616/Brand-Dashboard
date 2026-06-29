import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Auth proxy (this Next version renamed "middleware" → "proxy"). Refreshes the
// Supabase session on every request and redirects logged-out users to /login.
// Public paths (login, auth callback, the team gift form, and API routes) pass
// through — per-route financial gating is enforced in the routes themselves.

const PUBLIC = ["/login", "/auth", "/log-gift", "/p"];
// The only /api endpoints reachable without a session: the public team gift form.
// Everything else under /api now requires auth at the edge (defence in depth on top
// of each route's own getAccess check).
const PUBLIC_API = ["/api/influencer/products", "/api/influencer/roster", "/api/influencer/entries"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC.some(p => path === p || path.startsWith(p + "/"))
    || PUBLIC_API.some(p => path === p || path.startsWith(p + "/"));

  if (!user && !isPublic) {
    // API routes get a 401 (the client expects JSON); pages redirect to login.
    if (path.startsWith("/api")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  // run on everything except static assets
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico)$).*)"],
};
