import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

/**
 * Los redirects descartan la respuesta original; sin esto, un refresh de
 * token ocurrido durante el request se perdería y la sesión moriría.
 */
function redirectWithSession(
  url: URL,
  supabaseResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(url);
  supabaseResponse.cookies
    .getAll()
    .forEach((cookie) => redirectResponse.cookies.set(cookie));
  return redirectResponse;
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!projectUrl || !anonKey) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(
    projectUrl,
    anonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");
  const isSubscriptionRoute = request.nextUrl.pathname.startsWith("/suscripcion");
  const isAdminRoute = request.nextUrl.pathname.startsWith("/admin");

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return redirectWithSession(url, supabaseResponse);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, trial_ends_at, subscription_ends_at")
      .eq("id", user.id)
      .maybeSingle();

    // El super admin solo opera el panel: /admin es su único acceso.
    if (profile?.role === "super_admin") {
      if (!isAdminRoute || isSubscriptionRoute) {
        const url = request.nextUrl.clone();
        url.pathname = "/admin";
        url.search = "";
        return redirectWithSession(url, supabaseResponse);
      }
      return supabaseResponse;
    }

    if (isLoginRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return redirectWithSession(url, supabaseResponse);
    }

    // Sin perfil no se puede evaluar la suscripción: se permite el paso
    // para no bloquear cuentas durante una migración.
    const hasAccess =
      !profile ||
      (profile.status === "TRIAL" &&
        !!profile.trial_ends_at &&
        new Date(profile.trial_ends_at).getTime() > Date.now()) ||
      (profile.status === "ACTIVE" &&
        !!profile.subscription_ends_at &&
        new Date(profile.subscription_ends_at).getTime() > Date.now());

    if (!hasAccess && !isSubscriptionRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/suscripcion";
      url.search = "";
      return redirectWithSession(url, supabaseResponse);
    }

    if (hasAccess && isSubscriptionRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return redirectWithSession(url, supabaseResponse);
    }
  }

  return supabaseResponse;
}