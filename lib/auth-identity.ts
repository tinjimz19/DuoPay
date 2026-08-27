/**
 * Quién es la persona, con red o sin ella.
 *
 * Vive aparte de `auth-server.ts` a propósito: ese importa `next/headers` y
 * no se puede montar fuera de Next, y esta decisión es justo la que hay que
 * poder probar. Aquí solo se recibe un cliente ya armado.
 *
 * EL PROBLEMA QUE RESUELVE
 *
 * `getClaims()` verifica la firma del JWT localmente SOLO cuando ya tiene la
 * llave pública a mano. Si no —instancia recién levantada, token firmado con
 * el secreto viejo— sale a la red. Y ahí, un tropiezo de un segundo devolvía
 * "no hay sesión" con una cookie perfectamente válida.
 *
 * Como el middleware lee esa misma cookie con `getSession()` y sí veía la
 * sesión, cada uno mandaba la persona al otro:
 *
 *     /       -> middleware: hay sesión, pasa
 *             -> layout: getClaims() falló, redirige a /login
 *     /login  -> middleware: hay sesión, redirige a /
 *             -> ... para siempre
 *
 * De ahí el "dice Sesión iniciada y no muestra el inicio", y que fuera
 * intermitente: dependía de que ese viaje de red fallara.
 *
 * POR QUÉ CAER A LA COOKIE NO ES UN AGUJERO
 *
 * Esto solo decide QUÉ SE DIBUJA. Los datos los sigue guardando RLS en
 * Postgres, que valida el JWT en cada consulta: con una cookie falsificada
 * esta función devolvería un cascarón y todas las consultas saldrían vacías.
 * Y los server actions que mueven plata siguen llamando a `getUser()`, que
 * revalida contra el servidor de Auth.
 */

export interface Identity {
  userId: string;
  email: string;
}

/** Lo mínimo que se le pide al cliente de Supabase, para poder simularlo. */
export interface AuthReader {
  auth: {
    getClaims: () => Promise<{
      data: { claims?: { sub?: string; email?: string } | null } | null;
      error: unknown;
    }>;
    getSession: () => Promise<{
      data: { session: { user?: { id?: string; email?: string } } | null };
    }>;
  };
}

export async function identify(
  supabase: AuthReader
): Promise<Identity | null> {
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims?.sub) {
      return { userId: claims.sub, email: claims.email ?? "" };
    }
  } catch {
    // Da igual si devolvió error o si lanzó: en ambos casos hay plan B.
  }

  // Plan B: la misma cookie que mira el middleware. Que los dos lean lo
  // mismo es lo que hace imposible el rebote.
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session?.user?.id) {
      return { userId: session.user.id, email: session.user.email ?? "" };
    }
  } catch {
    // Sin cookie utilizable no hay nada que hacer.
  }

  return null;
}
