import type { z } from "zod";

// `unknown` como default: en una intersección se absorbe, así que
// ActionResult      => { success: true }
// ActionResult<{id}> => { success: true; id: string }
// (`{}` dispara la regla @typescript-eslint/no-empty-object-type.)
export type ActionResult<T = unknown> =
  | ({ success: true } & T)
  | { success: false; error: string };

/**
 * Mensaje legible del primer problema de validación.
 * Los server actions usan safeParse y devuelven esto como `error`, en vez de
 * dejar que Zod lance y el usuario se coma un 500.
 */
export function zodMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "Los datos enviados no son válidos";
}
