/**
 * Quién ve la función de Catálogo.
 *
 * Es una lista blanca de correos, no un rol de la base: el catálogo es una
 * función a la medida de una cuenta puntual, no algo del modelo de permisos.
 * Se compara en minúsculas para que "Tin@..." y "tin@..." sean el mismo.
 *
 * Esto decide la VISIBILIDAD (el menú y la página). El aislamiento de los
 * datos lo sigue haciendo la base por user_id, como en todo lo demás.
 */
export const CATALOGO_EMAILS = ["tinjimz67@gmail.com"] as const;

export function puedeVerCatalogo(email: string | null | undefined): boolean {
  if (!email) return false;
  return (CATALOGO_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
}
