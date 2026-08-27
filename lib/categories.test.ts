/**
 * Pruebas del catálogo de categorías.
 *
 *   npx tsx lib/categories.test.ts
 *
 * Puro cálculo, no tocan la base de datos. Si algo se rompe, lanza.
 */
import {
  CATEGORY_COLORS,
  CATEGORY_COLOR_OPTIONS,
  categoryBadgeClass,
  categoryLabelMap,
  findCategory,
  isValidCategorySlug,
  slugifyCategory,
  type Category,
} from "@/lib/categories";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  esperado: ${b}\n  recibido: ${a}`);
}

const CATALOGO: Category[] = [
  { slug: "ROPA", label: "Ropa", color: "indigo", sort_order: 0, is_active: true },
  { slug: "PERFUME", label: "Perfume", color: "rose", sort_order: 1, is_active: true },
  { slug: "REPUESTOS", label: "Repuestos", color: "amber", sort_order: 2, is_active: false },
];

// ---------------------------------------------------------------
// slugify: de lo que escribe una persona a lo que guarda la base
// ---------------------------------------------------------------

eq(slugifyCategory("Repuestos"), "REPUESTOS", "una palabra");
eq(slugifyCategory("Repuestos de moto"), "REPUESTOS_DE_MOTO", "varias palabras");
eq(slugifyCategory("Lencería"), "LENCERIA", "quita el acento");
eq(slugifyCategory("Niños"), "NINOS", "la eñe pasa a N");
eq(slugifyCategory("Línea Blanca"), "LINEA_BLANCA", "acento y mayúsculas");
eq(slugifyCategory("  Joyería  "), "JOYERIA", "recorta los espacios");
eq(slugifyCategory("Comida / Bebida"), "COMIDA_BEBIDA", "los signos se caen");
eq(slugifyCategory("Ropa 2026"), "ROPA_2026", "los números se quedan");
eq(slugifyCategory("!!!"), "", "sin letras no queda slug");
eq(
  slugifyCategory("una categoría con un nombre larguísimo que no cabe").length,
  32,
  "se corta a 32"
);

// Lo que produce slugify siempre tiene que pasar la validación de la base
// (salvo cuando no quedó nada, que la app rechaza aparte).
for (const nombre of [
  "Ropa", "Calzado", "Perfume", "Repuestos de moto", "Lencería",
  "Niños", "Comida rápida", "Línea Blanca", "Joyería", "Ferretería",
  "Artículos de limpieza", "Juguetería", "Ropa 2026",
]) {
  checks++;
  const slug = slugifyCategory(nombre);
  if (!isValidCategorySlug(slug)) {
    throw new Error(`"${nombre}" produjo un slug que la base rechazaría: "${slug}"`);
  }
}

// ---------------------------------------------------------------
// Validación del slug
// ---------------------------------------------------------------

eq(isValidCategorySlug("ROPA"), true, "slug bueno");
eq(isValidCategorySlug("REPUESTOS_DE_MOTO"), true, "con guiones bajos");
eq(isValidCategorySlug("R"), false, "una sola letra no");
eq(isValidCategorySlug("ropa"), false, "minúsculas no");
eq(isValidCategorySlug("ROPA BONITA"), false, "con espacio no");
eq(isValidCategorySlug("LENCERÍA"), false, "con acento no");
eq(isValidCategorySlug(""), false, "vacío no");
eq(isValidCategorySlug("A".repeat(33)), false, "más de 32 no");

// ---------------------------------------------------------------
// Buscar una categoría
// ---------------------------------------------------------------

eq(findCategory(CATALOGO, "PERFUME").label, "Perfume", "la encuentra");
eq(findCategory(CATALOGO, "PERFUME").color, "rose", "con su color");
eq(findCategory(CATALOGO, "REPUESTOS").is_active, false, "y su estado");

// El caso que importa: una venta vieja con una categoría que ya no está en
// el catálogo. La clave foránea lo impide, pero si pasara no debe romperse
// la pantalla.
eq(
  findCategory(CATALOGO, "DESCONOCIDA").label,
  "Desconocida",
  "una categoría fuera del catálogo se pinta legible"
);
eq(
  findCategory(CATALOGO, "LINEA_BLANCA").label,
  "Linea blanca",
  "y los guiones bajos se leen como espacios"
);
eq(findCategory(CATALOGO, null).label, "Otro", "sin categoría, Otro");
eq(findCategory([], "ROPA").label, "Ropa", "con catálogo vacío tampoco revienta");

// ---------------------------------------------------------------
// Colores
// ---------------------------------------------------------------

eq(
  categoryBadgeClass("amber"),
  CATEGORY_COLORS.amber.badge,
  "un color conocido da sus clases"
);
eq(
  categoryBadgeClass("un-color-que-no-existe"),
  CATEGORY_COLORS.slate.badge,
  "uno inventado cae a gris en vez de quedar sin estilo"
);
eq(categoryBadgeClass(null), CATEGORY_COLORS.slate.badge, "nulo también");

// Toda clase de color tiene que estar escrita literal para que Tailwind la
// incluya: si alguna se armara concatenando, saldría sin color en producción.
for (const c of CATEGORY_COLOR_OPTIONS) {
  checks++;
  if (!c.badge.includes(`bg-${c.value}-`) && c.value !== "slate") {
    throw new Error(`el color ${c.value} no trae sus clases literales`);
  }
  if (!c.dot.startsWith("bg-")) {
    throw new Error(`el color ${c.value} no trae clase de punto`);
  }
}

// ---------------------------------------------------------------
// Diccionario para el servidor
// ---------------------------------------------------------------

const mapa = categoryLabelMap(CATALOGO);
eq(mapa.get("ROPA"), "Ropa", "diccionario");
eq(mapa.get("REPUESTOS"), "Repuestos", "incluye las apagadas");
eq(mapa.get("NO_EXISTE"), undefined, "y no inventa");
eq(mapa.size, 3, "una entrada por categoría");

console.log(`categories.ts — ${checks} comprobaciones, todas en verde.`);
