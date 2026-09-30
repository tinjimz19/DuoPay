/**
 * Ordena las categorías para pantalla y PDF: Calzado primero —es la principal—
 * y el resto por su nombre.
 *
 * Vive en lib/ y no en un componente para que la lista y el botón de exportar
 * la usen sin depender uno del otro (evita el import circular entre ambos).
 */
export function ordenarCategorias(
  slugs: string[],
  label: (slug: string) => string
): string[] {
  return [...new Set(slugs)].sort((a, b) => {
    if (a === "CALZADO") return -1;
    if (b === "CALZADO") return 1;
    return label(a).localeCompare(label(b), "es");
  });
}
