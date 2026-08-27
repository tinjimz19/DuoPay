-- =====================================================================
-- PATCH 05 · Categorías administrables
--
-- Hasta ahora las categorías eran un ENUM de Postgres: ROPA, CALZADO,
-- PERFUME y OTRO, escritas en el tipo. Para agregar una había que
-- cambiar el esquema, y una tienda de repuestos o de comida no tenía
-- dónde meter lo suyo.
--
-- Aquí pasan a ser datos: una tabla que el super admin administra y que
-- todas las tiendas leen.
--
-- Es idempotente: se puede correr las veces que haga falta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LA TABLA
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categories (
  /* El slug es la clave y NO se edita: es lo que quedó escrito en cada
     venta vieja. El nombre visible sí se puede corregir cuando sea. */
  slug TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  /* Un nombre de color, no clases de CSS: la app lo traduce (ver
     lib/categories.ts). Guardar clases aquí las volvería imposibles de
     cambiar sin tocar la base. */
  color TEXT NOT NULL DEFAULT 'slate',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT categories_slug_formato CHECK (slug ~ '^[A-Z0-9_]{2,32}$'),
  CONSTRAINT categories_label_no_vacio CHECK (length(trim(label)) >= 2)
);

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Todas las tiendas LEEN el catálogo; solo el super admin lo modifica.
DROP POLICY IF EXISTS "Todos leen las categorias" ON public.categories;
CREATE POLICY "Todos leen las categorias"
  ON public.categories FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Solo el super admin crea categorias" ON public.categories;
CREATE POLICY "Solo el super admin crea categorias"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Solo el super admin edita categorias" ON public.categories;
CREATE POLICY "Solo el super admin edita categorias"
  ON public.categories FOR UPDATE TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "Solo el super admin borra categorias" ON public.categories;
CREATE POLICY "Solo el super admin borra categorias"
  ON public.categories FOR DELETE TO authenticated
  USING (public.is_super_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;

CREATE INDEX IF NOT EXISTS idx_categories_orden
  ON public.categories(sort_order, slug);

-- Las cuatro de siempre, para que nada de lo ya guardado quede huérfano.
INSERT INTO public.categories (slug, label, color, sort_order) VALUES
  ('ROPA',    'Ropa',    'indigo', 0),
  ('CALZADO', 'Calzado', 'violet', 1),
  ('PERFUME', 'Perfume', 'rose',   2),
  ('OTRO',    'Otro',    'slate',  3)
ON CONFLICT (slug) DO NOTHING;


-- ---------------------------------------------------------------------
-- 2. DE ENUM A TEXTO
--
-- Se hace columna por columna y solo si todavía es del tipo viejo, para
-- poder reaplicar el parche sin que reviente. El USING conserva el valor
-- que ya tenía cada fila: ninguna venta cambia de categoría.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('sales',     'ROPA'),
      ('preorders', 'PERFUME'),
      ('products',  'OTRO')
    ) AS x(tabla, por_defecto)
  LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = t.tabla
        AND column_name = 'category'
        AND udt_name = 'product_category'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN category DROP DEFAULT', t.tabla);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN category TYPE TEXT USING category::text', t.tabla);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN category SET DEFAULT %L', t.tabla, t.por_defecto);
      RAISE NOTICE 'convertida %.category a texto', t.tabla;
    END IF;
  END LOOP;
END $$;

/*
 * Rescate por si quedara algún valor sin fila en el catálogo (por ejemplo
 * si alguien agregó valores al ENUM a mano). Sin esto la clave foránea de
 * abajo no se podría crear.
 */
INSERT INTO public.categories (slug, label, color, sort_order)
SELECT DISTINCT c.category,
       initcap(replace(lower(c.category), '_', ' ')),
       'slate',
       99
FROM (
  SELECT category FROM public.sales
  UNION SELECT category FROM public.preorders
  UNION SELECT category FROM public.products
) c
WHERE c.category IS NOT NULL
  AND c.category ~ '^[A-Z0-9_]{2,32}$'
ON CONFLICT (slug) DO NOTHING;

-- Clave foránea: la base impide borrar una categoría que alguien usa, y
-- si el slug cambiara, arrastra el cambio. Es la red de seguridad del
-- historial.
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sales', 'preorders', 'products'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = format('%s_category_fkey', t)
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (category)
         REFERENCES public.categories(slug) ON UPDATE CASCADE ON DELETE RESTRICT',
        t, format('%s_category_fkey', t));
      RAISE NOTICE 'clave foránea puesta en %.category', t;
    END IF;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. CUÁNTO SE USA CADA CATEGORÍA
--
-- El super admin no tiene RLS para leer las ventas de las tiendas, así
-- que el conteo va en una función SECURITY DEFINER, cerrada con llave a
-- quien no sea super admin.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.category_usage()
RETURNS TABLE (slug TEXT, ventas BIGINT, pedidos BIGINT, productos BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Solo el super admin puede ver el uso de las categorías';
  END IF;

  RETURN QUERY
  SELECT c.slug,
         (SELECT count(*) FROM public.sales     s WHERE s.category = c.slug),
         (SELECT count(*) FROM public.preorders p WHERE p.category = c.slug),
         (SELECT count(*) FROM public.products  r WHERE r.category = c.slug)
  FROM public.categories c
  ORDER BY c.sort_order, c.slug;
END $$;

REVOKE ALL ON FUNCTION public.category_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.category_usage() TO authenticated;


-- El tipo `product_category` queda sin uso. No se elimina a propósito:
-- borrarlo no aporta nada y una base en producción no es lugar para
-- limpiezas cosméticas.

NOTIFY pgrst, 'reload schema';
