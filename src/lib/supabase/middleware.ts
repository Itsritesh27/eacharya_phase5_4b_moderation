import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

/**
 * Refreshes the Supabase session cookie on every matched request and applies
 * coarse route protection. Fine-grained role checks happen in server guards
 * (src/lib/auth/session.ts); this is only the first gate.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const env = getSupabaseEnv();
  const { pathname } = request.nextUrl;

  // Without Supabase configured, public pages still work; private ones bounce to sign-in.
  if (!env) {
    if (pathname.startsWith("/dashboard")) {
      const url = request.nextUrl.clone();
      url.pathname = "/sign-in";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return response;
  }

  let supabase: ReturnType<typeof createServerClient>;
  try {
    supabase = createServerClient(env.url, env.key, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    });
  } catch (err) {
    // Bad Supabase URL/key (e.g. stray quotes or spaces in Netlify env vars).
    console.error("[middleware] Supabase client failed:", err);
    return failClosed(request, pathname, response);
  }

  // getUser() validates the token with the Auth server (unlike getSession()).
  let user: { id: string } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    console.error("[middleware] getUser failed:", err);
    return failClosed(request, pathname, response);
  }

  if (!user && pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = `?next=${encodeURIComponent(pathname)}`;
    return NextResponse.redirect(url);
  }

  if (user && (pathname === "/sign-in" || pathname === "/sign-up")) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

/** Public pages keep working; private pages go to sign-in. */
function failClosed(request: NextRequest, pathname: string, response: NextResponse) {
  if (pathname.startsWith("/dashboard")) {
    const url = request.nextUrl.clone();
    url.pathname = "/sign-in";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return response;
}
