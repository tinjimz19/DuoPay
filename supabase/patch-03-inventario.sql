-- ============================================================
-- DuoPay · Parche 03 — Inventario
--
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query.
-- Requiere los parches 01 y 02. Es idempotente.
--
-- Idea: el inventario es solo nombre + categoría + cantidad. Pero la
-- cantidad NO se guarda a mano: es la suma de los movimientos vivos del
-- producto, calculada por un trigger. Misma lección que amount_paid — un
-- contador que la app incrementa termina descuadrado en cuanto se borra o
-- se restaura algo.
--
--   ENTRADA  +N  compraste mercancía
--   VENTA    -N  salió con una venta (lleva sale_id)
--   SALIDA   -N  se dañó, se regaló, uso personal
--   AJUSTE   ±N  contaste y eran otras
-- ============================================================


-- ------------------------------------------------------------
-- 1. PRODUCTOS
--    `stock` lo mantiene el trigger de la sección 4.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  category product_category NOT NULL DEFAULT 'OTRO',
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento por usuario en productos" ON public.products;
CREATE POLICY "Aislamiento por usuario en productos"
  ON public.products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admin ve productos de tiendas" ON public.products;
CREATE POLICY "Super admin ve productos de tiendas"
  ON public.products FOR SELECT USING (public.is_super_admin());

-- Un solo "Camisas" por tienda, sin importar mayúsculas.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_user_name
  ON public.products(user_id, lower(btrim(name))) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_products_user_active
  ON public.products(user_id, category) WHERE deleted_at IS NULL;


-- ------------------------------------------------------------
-- 2. MOVIMIENTOS
--    La cantidad va con signo y el CHECK obliga a que concuerde con el
--    tipo, para que los datos se expliquen solos.
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.stock_movement_kind AS ENUM
    ('ENTRADA', 'VENTA', 'SALIDA', 'AJUSTE');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
  kind public.stock_movement_kind NOT NULL,
  quantity INT NOT NULL CHECK (quantity <> 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,
  deleted_via TEXT,
  CONSTRAINT stock_movements_sign_check CHECK (
    (kind = 'ENTRADA' AND quantity > 0)
    OR (kind IN ('VENTA', 'SALIDA') AND quantity < 0)
    OR kind = 'AJUSTE'
  ),
  CONSTRAINT stock_movements_sale_check CHECK (
    kind = 'VENTA' OR sale_id IS NULL
  ),
  CONSTRAINT stock_movements_deleted_via_check CHECK (
    deleted_via IS NULL OR deleted_via IN ('sale', 'client', 'product')
  )
);

ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento por usuario en movimientos" ON public.stock_movements;
CREATE POLICY "Aislamiento por usuario en movimientos"
  ON public.stock_movements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Super admin ve movimientos de tiendas" ON public.stock_movements;
CREATE POLICY "Super admin ve movimientos de tiendas"
  ON public.stock_movements FOR SELECT USING (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_stock_movements_product
  ON public.stock_movements(product_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_sale
  ON public.stock_movements(sale_id) WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_user
  ON public.stock_movements(user_id, created_at) WHERE deleted_at IS NULL;


-- ------------------------------------------------------------
-- 3. UN MOVIMIENTO SOLO TOCA COSAS PROPIAS
--    La política RLS solo comprueba user_id; sin esto se podría mover el
--    stock de otra tienda. Mismo agujero que se tapó en payments.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_stock_movement_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.products p
     WHERE p.id = NEW.product_id AND p.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'El movimiento no corresponde a un producto de este usuario';
  END IF;

  IF NEW.sale_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.id = NEW.sale_id AND s.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'El movimiento no corresponde a una venta de este usuario';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_validate_owner ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_validate_owner
  BEFORE INSERT OR UPDATE OF product_id, sale_id, user_id ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.validate_stock_movement_owner();


-- ------------------------------------------------------------
-- 4. products.stock SE DERIVA DE LOS MOVIMIENTOS
--    Sin SECURITY DEFINER a propósito: RLS sigue protegiendo lo ajeno.
--    Un producto en papelera conserva su cifra congelada.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_product_stock(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_stock INT;
BEGIN
  IF p_product_id IS NULL THEN
    RETURN;
  END IF;

  PERFORM 1 FROM public.products
   WHERE id = p_product_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(quantity), 0) INTO v_stock
    FROM public.stock_movements
   WHERE product_id = p_product_id AND deleted_at IS NULL;

  UPDATE public.products
     SET stock = v_stock
   WHERE id = p_product_id
     AND stock IS DISTINCT FROM v_stock;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_product_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_product_stock(OLD.product_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_product_stock(NEW.product_id);

  IF TG_OP = 'UPDATE' AND OLD.product_id IS DISTINCT FROM NEW.product_id THEN
    PERFORM public.recalc_product_stock(OLD.product_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stock_movements_sync ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_stock();

-- Al sacar un producto de la papelera se recalcula.
-- El WHEN evita recursión: el UPDATE del recálculo no toca deleted_at.
CREATE OR REPLACE FUNCTION public.sync_product_stock_on_restore()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalc_product_stock(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_products_restore_sync ON public.products;
CREATE TRIGGER trg_products_restore_sync
  AFTER UPDATE OF deleted_at ON public.products
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.sync_product_stock_on_restore();


-- ------------------------------------------------------------
-- 5. REVISIÓN
--    Productos cuyo stock no cuadra con sus movimientos. Debe salir vacío.
--
--      SELECT p.id, p.name, p.stock AS guardado,
--             COALESCE(SUM(m.quantity) FILTER (WHERE m.deleted_at IS NULL), 0) AS segun_movimientos
--        FROM public.products p
--        LEFT JOIN public.stock_movements m ON m.product_id = p.id
--       WHERE p.deleted_at IS NULL
--       GROUP BY p.id, p.name, p.stock
--      HAVING p.stock IS DISTINCT FROM
--             COALESCE(SUM(m.quantity) FILTER (WHERE m.deleted_at IS NULL), 0);
-- ------------------------------------------------------------
