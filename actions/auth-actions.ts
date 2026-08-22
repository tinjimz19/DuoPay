"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { zodMessage } from "@/lib/validation";

export async function signOut() {
  const supabase = createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const updateProfileSchema = z.object({
  fullName: z.string().max(120).optional().nullable(),
  businessName: z.string().max(160).optional().nullable(),
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

  const { error } = await supabase.from("profiles").upsert({
    id: user.id,
    full_name: parsed.fullName ?? null,
    business_name: parsed.businessName ?? null,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/", "layout");
  return { success: true };
}