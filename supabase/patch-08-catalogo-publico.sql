-- ------------------------------------------------------------
-- patch-08-catalogo-publico.sql
--
-- PÁGINA PÚBLICA del catálogo, compartible por un enlace secreto.
--
-- Cada tienda tiene un "slug" (un código al azar). Quien tenga el enlace
-- /c/<slug> ve el catálogo sin iniciar sesión. Sin slug, no se comparte.
--
-- Correr una sola vez en el editor SQL de Supabase. Es idempotente.
-- ------------------------------------------------------------

-- 1) El slug del catálogo público. NULL = no compartido todavía.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS catalog_slug TEXT;

DO $$ BEGIN
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_catalog_slug_key UNIQUE (catalog_slug);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) El depósito de imágenes del catálogo pasa a PÚBLICO de lectura: así
-- cualquiera con el enlace ve las fotos sin firmar cada una. Solo afecta a
-- las fotos del catálogo; las de los pedidos siguen en su depósito privado.
UPDATE storage.buckets SET public = true WHERE id = 'catalogo';

-- 3) Lectura pública del catálogo por su slug, SIN login.
--
-- SECURITY DEFINER: corre con los permisos del dueño de la función y salta
-- RLS, pero devuelve SOLO los campos públicos y SOLO de la tienda cuyo slug
-- coincide. Sin el slug (que es al azar) no hay forma de llegar a un catálogo.
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
          'name', c.name,
          'category', c.category,
          'category_label', COALESCE(cat.label, c.category),
          'price', c.price,
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

-- Que la pueda llamar cualquiera (anónimo incluido): es lo que la hace pública.
REVOKE ALL ON FUNCTION public.catalogo_publico(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.catalogo_publico(TEXT) TO anon, authenticated;
