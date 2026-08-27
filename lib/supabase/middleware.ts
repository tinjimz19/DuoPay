import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { conLimite, LIMITE_MIDDLEWARE_MS } from "@/lib/con-limite";
import type { Database } from "@/types/database.types";

/**
 * ¿Hay cookie de sesión? Se mira el nombre, sin abrirla ni validarla.
 *
 * Esta es LA decisión del middleware, y ahora se toma sin tocar la red.
 * Antes se tomaba con `getSession()`, que cuando el token venció intenta
 * refrescarlo y REINTENTA 8 veces: 25 segundos medidos con la red caída.
 * Vercel corta el middleware mucho antes y devuelve
 * `MIDDLEWARE_INVOCATION_TIMEOUT`, la pantalla de 504. Y como los tokens
 * vencen cada hora, le tocaba a todo el mundo, seguido.
 *
 * Decidir a quién se manda al login no puede depender de que Supabase
 * conteste. Que la cookie sea legítima no se comprueba aquí, y no hace
 * falta: quien autoriza de verdad es RLS en Postgres, que valida el JWT en
 * cada consulta. Una cookie inventada pasa este punto y no ve un solo dato.
 */
function tieneCookieDeSesion(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some(
      (c) =>
        c.name.startsWith("sb-") &&
        c.name.includes("auth-token") &&
        // Durante el login por enlace queda una cookie
        // `...auth-token-code-verifier` que NO es una sesión. Contarla
        // mandaría al inicio a quien todavía no ha entrado.
        !c.name.includes("code-verifier") &&
        !!c.value
    );
}

/**
 * El middleware corre en CADA navegación, incluidas las peticiones RSC del
 * router. Por eso aquí solo va lo imprescindible, y con reloj.
 *
 * Antes también consultaba `profiles` para decidir suscripción y rol, y el
 * layout volvía a hacer lo mismo: cuatro viajes en serie antes de que la
 * página pidiera un dato. Esas decisiones viven ahora en los layouts.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!projectUrl || !anonKey) {
    return supabaseResponse;
  }

  const signedIn = tieneCookieDeSesion(request);
  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");

  // El marcador lo pone un layout que NO pudo confirmar la sesión. Si aun
  // así lo devolviéramos al inicio, ese layout lo volvería a mandar aquí y
  // el navegador rebotaría para siempre. Con marcador, se queda en el login.
  const vieneDeSesionVencida =
    request.nextUrl.searchParams.get("sesion") === "vencida";

  if (!signedIn && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (signedIn && isLoginRoute && !vieneDeSesionVencida) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // A dónde va ya está decidido y sin red de por medio. Lo que sigue es un
  // extra: aprovechar el paso para renovar el token si Supabase contesta
  // rápido. Si no contesta a tiempo, se sigue de largo — el layout y RLS
  // deciden igual, y más vale una pantalla incompleta que un 504.
  if (!signedIn) {
    return supabaseResponse;
  }

  const supabase = createServerClient<Database>(projectUrl, anonKey, {
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
  });

  await conLimite(supabase.auth.getSession(), LIMITE_MIDDLEWARE_MS, null);

  return supabaseResponse;
}
