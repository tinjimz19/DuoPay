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

/**
 * El middleware corre en CADA navegación, incluidas las peticiones RSC del
 * router. Por eso aquí solo va lo imprescindible: refrescar el token y sacar
 * a quien no tiene sesión.
 *
 * Antes también consultaba `profiles` para decidir suscripción y rol, y el
 * layout volvía a hacer exactamente lo mismo: cuatro viajes a Supabase en
 * serie antes de que la página pidiera un solo dato. Esas decisiones se
 * mudaron a los layouts, que ya necesitan el perfil para pintar la cabecera.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!projectUrl || !anonKey) {
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

  // getSession lee la cookie y solo sale a la red cuando el token ya venció:
  // en la mayoría de las navegaciones son CERO viajes. Antes se usaba
  // getUser(), que consulta al servidor de Auth siempre.
  //
  // Es seguro porque aquí no se autoriza nada: este redirect es comodidad de
  // navegación. Quien decide de verdad es el layout con `currentAccount()`
  // (firma verificada) y, por debajo, las políticas RLS de Postgres. Una
  // cookie falsificada pasaría este punto y se estrellaría contra las dos.
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const signedIn = Boolean(session);

  const isLoginRoute = request.nextUrl.pathname.startsWith("/login");

  if (!signedIn && !isLoginRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", request.nextUrl.pathname);
    return redirectWithSession(url, supabaseResponse);
  }

  // El marcador lo pone un layout que NO pudo confirmar la sesión. Si aun
  // así lo devolviéramos al inicio, ese layout lo volvería a mandar aquí y
  // el navegador rebotaría para siempre. Con marcador, se queda en el login.
  const vieneDeSesionVencida =
    request.nextUrl.searchParams.get("sesion") === "vencida";

  if (signedIn && isLoginRoute && !vieneDeSesionVencida) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return redirectWithSession(url, supabaseResponse);
  }

  return supabaseResponse;
}
