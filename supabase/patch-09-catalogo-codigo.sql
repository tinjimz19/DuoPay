-- ------------------------------------------------------------
-- PATCH 09 · CÓDIGO DE REFERENCIA del catálogo
--
-- Cada producto lleva un número secuencial por tienda (001, 002, 003 …) para
-- identificarlo fácil y poder dictarlo al pedir por WhatsApp. Se asigna solo,
-- en el orden en que se fue creando cada producto, y NO cambia aunque borres
-- o agregues otros productos.
--
-- Además, la página pública deja de mostrar el precio: la función que la
-- alimenta ya no devuelve `price`, y en su lugar devuelve `ref_code`.
--
-- Ejecuta este archivo UNA vez en el SQL Editor de Supabase.
-- (Es seguro volver a correrlo: no renumera lo que ya tiene código.)
-- ------------------------------------------------------------

-- 1. La columna.
ALTER TABLE public.catalog_products
  ADD COLUMN IF NOT EXISTS ref_code INTEGER;

-- 2. Numerar lo que YA existe, por tienda y en orden de creación. Si alguna
--    tienda ya tuviera códigos, se continúa desde su máximo (no se pisa nada).
WITH base AS (
  SELECT user_id, COALESCE(MAX(ref_code), 0) AS maxref
  FROM public.catalog_products
  GROUP BY user_id
),
numerados AS (
  SELECT c.id,
         c.user_id,
         ROW_NUMBER() OVER (
           PARTITION BY c.user_id ORDER BY c.created_at, c.id
         ) AS n
  FROM public.catalog_products c
  WHERE c.ref_code IS NULL
)
UPDATE public.catalog_products c
SET ref_code = b.maxref + numerados.n
FROM numerados
JOIN base b ON b.user_id = numerados.user_id
WHERE c.id = numerados.id;

-- 3. Asignar el próximo número al crear un producto nuevo. Va en la base (no en
--    la app) para que cualquier alta quede numerada sin importar desde dónde
--    venga. Para una sola tienda que agrega productos de a uno no hay carrera
--    posible, así que un MAX+1 basta.
CREATE OR REPLACE FUNCTION public.set_catalog_ref_code()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.ref_code IS NULL THEN
    SELECT COALESCE(MAX(ref_code), 0) + 1
      INTO NEW.ref_code
      FROM public.catalog_products
      WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_catalog_ref_code ON public.catalog_products;
CREATE TRIGGER trg_catalog_ref_code
  BEFORE INSERT ON public.catalog_products
  FOR EACH ROW
  EXECUTE FUNCTION public.set_catalog_ref_code();

-- 4. La página pública: sin precio, con código de referencia.
CREATE OR REPLACE FUNCTION public.catalogo_publico(p_slug TEXT)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'business_name', pr.business_name,
    'logo_url', pr.logo_url,
    'products', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'ref_code', c.ref_code,
          'name', c.name,
          'category', c.category,
          'category_label', COALESCE(cat.label, c.category),
          'note', c.note,
          'image_path', c.image_path
        )
        ORDER BY (c.category <> 'CALZADO'), COALESCE(cat.label, c.category), c.created_at DESC
      )
      FROM public.catalog_products c
      LEFT JOIN public.categories cat ON cat.slug = c.category
      WHERE c.user_id = pr.id AND c.deleted_at IS NULL
    ), '[]'::jsonb)
  )
  FROM public.profiles pr
  WHERE pr.catalog_slug = p_slug
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.catalogo_publico(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_publico(TEXT) TO anon, authenticated;
