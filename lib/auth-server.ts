import { cache } from "react";

import { identify } from "@/lib/auth-identity";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRole, ProfileStatus } from "@/types/database.types";

export interface AccountProfile {
  full_name: string | null;
  business_name: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
  logo_url: string | null;
}

/**
 * A dónde se manda a alguien cuando el servidor no pudo confirmar su sesión.
 *
 * Lleva marcador a propósito: es el freno de mano del lazo. Si el middleware
 * y el layout volvieran a discrepar, este parámetro hace que el middleware NO
 * lo devuelva al inicio y que la pantalla de login no lo empuje sola. En el
 * peor caso se queda en el login, que es molesto pero termina; sin esto, el
 * navegador rebota para siempre.
 */
export const LOGIN_SESION_VENCIDA = "/login?sesion=vencida";

export interface Account {
  userId: string;
  email: string;
  profile: AccountProfile | null;
}

/**
 * Quién está usando la app y en qué estado está su tienda.
 *
 * Dos cosas la hacen barata, que es de lo que dependía la lentitud al navegar:
 *
 * 1. `cache()` de React: aunque el layout, la página y un componente la pidan,
 *    en un mismo render se resuelve UNA sola vez.
 * 2. `getClaims()` en vez de `getUser()`: con llaves asimétricas verifica la
 *    firma del JWT localmente y no sale a la red.
 *
 * Nunca devuelve "no hay sesión" por un tropiezo de red: ver `identificar()`
 * más abajo, que es donde estaba el lazo de redirecciones.
 */
export const currentAccount = cache(async (): Promise<Account | null> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = createClient();

  const identidad = await identify(supabase);
  if (!identidad) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, business_name, role, status, trial_ends_at, subscription_ends_at, logo_url"
    )
    .eq("id", identidad.userId)
    .maybeSingle();

  return {
    userId: identidad.userId,
    email: identidad.email,
    profile: (profile as AccountProfile | null) ?? null,
  };
});
