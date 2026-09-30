-- ------------------------------------------------------------
-- patch-06-catalogo.sql
--
-- CATÁLOGO DE PRODUCTOS para compartir (imagen, nombre, precio, categoría,
-- nota corta). Es independiente del inventario: esto es material para
-- enseñar y exportar a PDF, no lleva stock ni mueve nada.
--
-- Aislado por usuario como todo lo demás. En pantalla la función se enseña
-- solo a la cuenta autorizada; eso lo decide la app (lib/catalog-access.ts),
-- no la base. La base igual aísla por user_id, así que aunque otra cuenta
-- llegara a la tabla, solo vería lo suyo (vacío).
--
-- Correr una sola vez en el editor SQL de Supabase. Es idempotente.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.catalog_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  -- El slug de la categoría, en el mismo formato que el resto de la app. Se
  -- guarda como texto (no como el enum viejo) porque las categorías las
  -- administra el super admin y ya no se conocen al compilar.
  category TEXT NOT NULL DEFAULT 'CALZADO' CHECK (category ~ '^[A-Z0-9_]{2,32}$'),
  -- Precio de referencia (REF). Se permite nulo por si se anota un producto
  -- antes de ponerle precio; la app pide que se llene.
  price NUMERIC(10, 2) CHECK (price IS NULL OR price >= 0),
  -- Nota corta opcional: tallas, marca, color…
  note TEXT,
  -- Ruta dentro del depósito `catalogo`, no una dirección web.
  image_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.catalog_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento por usuario en catalogo" ON public.catalog_products;
CREATE POLICY "Aislamiento por usuario en catalogo"
  ON public.catalog_products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_catalog_user
  ON public.catalog_products(user_id, category, created_at)
  WHERE deleted_at IS NULL;

-- ------------------------------------------------------------
-- Depósito privado para las imágenes del catálogo.
-- Mismo patrón que payment-proofs: privado, y cada tienda solo escribe y lee
-- dentro de su propia carpeta (<user.id>/...). Las direcciones se firman al
-- mostrarlas.
-- ------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('catalogo', 'catalogo', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Tienda sube imagenes de catalogo" ON storage.objects;
CREATE POLICY "Tienda sube imagenes de catalogo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'catalogo'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda ve sus imagenes de catalogo" ON storage.objects;
CREATE POLICY "Tienda ve sus imagenes de catalogo"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'catalogo'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda reemplaza sus imagenes de catalogo" ON storage.objects;
CREATE POLICY "Tienda reemplaza sus imagenes de catalogo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'catalogo'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda borra sus imagenes de catalogo" ON storage.objects;
CREATE POLICY "Tienda borra sus imagenes de catalogo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'catalogo'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
