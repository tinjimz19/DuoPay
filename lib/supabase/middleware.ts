import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database.types";

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

  if (!user && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, status, trial_ends_at, subscription_ends_at")
      .eq("id", user.id)
      .maybeSingle();

    // Sin perfil no se puede evaluar la suscripción: se permite el paso
    // para no bloquear cuentas durante una migración.
    const hasAccess =
      !profile ||
      profile.role === "super_admin" ||
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
      return NextResponse.redirect(url);
    }

    if (hasAccess && isSubscriptionRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}