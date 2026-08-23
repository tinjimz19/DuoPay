import { z } from "zod";

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

/**
 * Traduce un error de Postgres/PostgREST a algo accionable cuando la causa es
 * que a la base le falta una migración, o que la caché de esquema de la API
 * quedó vieja tras aplicarla. Ese caso se manifiesta raro: todo funciona
 * menos las operaciones que escriben la columna nueva.
 */
export function dbErrorMessage(message: string): string {
  const m = message.toLowerCase();
  const faltaColumna =
    m.includes("schema cache") ||
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find the");

  if (faltaColumna) {
    return (
      "A la base de datos le faltan cambios de una migración. Corre " +
      "supabase/diagnostico.sql en el SQL Editor de Supabase: te dice qué " +
      "falta y refresca la caché de la API."
    );
  }
  return message;
}

/**
 * UUID opcional que tolera la cadena vacía.
 *
 * Un `<select>` sin selección manda "", y `z.string().uuid()` lo rechaza con
 * "Invalid uuid" antes de que la acción pueda convertirlo en null. Ese fue el
 * error al anotar un pedido sin cliente registrado.
 */
export const optionalUuid = z
  .union([z.literal(""), z.string().uuid("Selección de cliente inválida")])
  .optional()
  .nullable()
  .transform((value) => (value ? value : null));

/** Datos mínimos para dar de alta un cliente desde otro formulario. */
export const newClientSchema = z.object({
  name: z.string().trim().min(2, "Escribe el nombre del cliente").max(120),
  phone: z
    .string()
    .trim()
    .min(7, "El teléfono del cliente es obligatorio")
    .max(30),
});
