"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { zodMessage } from "@/lib/validation";
import type { Database } from "@/types/database.types";

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const updateProfileSchema = z.object({
  fullName: z.string().max(120).optional().nullable(),
  businessName: z.string().max(160).optional().nullable(),
  /**
   * Se distingue a propósito entre "no lo mandes" y "ponlo en nulo":
   * `undefined` deja el logo como está —guardar el nombre no debe
   * borrarlo— y `null` es quitar el logo.
   */
  logoUrl: z.string().max(500).url("Dirección de logo inválida").optional().nullable(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export async function updateProfile(input: UpdateProfileInput) {
  const parsedInput = updateProfileSchema.safeParse(input);
  if (!parsedInput.success) {
    return { success: false, error: zodMessage(parsedInput.error) };
  }
  const parsed = parsedInput.data;
  const supabase = createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { success: false, error: "No autorizado" };
  }

  // Solo se escribe lo que vino. Si no, subir un logo borraría el nombre
  // del negocio, porque esa llamada no manda los otros campos.
  const fila: Database["public"]["Tables"]["profiles"]["Insert"] = {
    id: user.id,
  };
  if (parsed.fullName !== undefined) {
    fila.full_name = parsed.fullName?.trim() || null;
  }
  if (parsed.businessName !== undefined) {
    fila.business_name = parsed.businessName?.trim() || null;
  }
  if (parsed.logoUrl !== undefined) {
    fila.logo_url = parsed.logoUrl;
  }

  const { error } = await supabase.from("profiles").upsert(fila);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}