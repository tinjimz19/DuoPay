import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { ProfileRole, ProfileStatus } from "@/types/database.types";

export interface AccountProfile {
  full_name: string | null;
  business_name: string | null;
  role: ProfileRole;
  status: ProfileStatus;
  trial_ends_at: string | null;
  subscription_ends_at: string | null;
}

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
 * 2. `getClaims()` en vez de `getUser()`: si el proyecto de Supabase usa
 *    llaves asimétricas, verifica la firma del JWT localmente y no sale a la
 *    red. Si todavía usa el secreto compartido, cae solo a `getUser()` y se
 *    comporta como antes — no hay nada que romper.
 *
 * Para RENDERIZAR esto sobra. Los server actions que mueven plata siguen
 * usando `getUser()`, que revalida contra el servidor de Auth.
 */
export const currentAccount = cache(async (): Promise<Account | null> => {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = createClient();

  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims as
    | { sub?: string; email?: string }
    | undefined;

  if (error || !claims?.sub) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select(
      "full_name, business_name, role, status, trial_ends_at, subscription_ends_at"
    )
    .eq("id", claims.sub)
    .maybeSingle();

  return {
    userId: claims.sub,
    email: claims.email ?? "",
    profile: (profile as AccountProfile | null) ?? null,
  };
});
