-- ============================================================
-- DuoPay · Parche 01 — Integridad de abonos y papelera
--
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query.
-- Es idempotente: se puede volver a correr sin romper nada.
--
-- Qué resuelve:
--   1. amount_paid / status de una venta pasan a derivarse SIEMPRE de la
--      suma de sus abonos. Se acaba la condición de carrera de dos abonos
--      simultáneos y se puede borrar o corregir un abono sin descuadrar.
--   2. Un abono no puede apuntar a la venta de otro usuario.
--   3. La papelera distingue lo que borraste tú de lo que cayó en cascada,
--      para que restaurar un cliente no reviva ventas que borraste aparte.
--   4. Índices para las consultas del dashboard y de reportes.
-- ============================================================


-- ------------------------------------------------------------
-- 1. ORIGEN DEL BORRADO
--    deleted_via NULL     = lo borró el usuario directamente
--    deleted_via 'sale'   = cayó al borrar su venta
--    deleted_via 'client' = cayó al borrar su cliente
-- ------------------------------------------------------------
ALTER TABLE public.sales    ADD COLUMN IF NOT EXISTS deleted_via TEXT;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS deleted_via TEXT;

DO $$ BEGIN
  ALTER TABLE public.sales
    ADD CONSTRAINT sales_deleted_via_check
    CHECK (deleted_via IS NULL OR deleted_via = 'client');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.payments
    ADD CONSTRAINT payments_deleted_via_check
    CHECK (deleted_via IS NULL OR deleted_via IN ('sale', 'client'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Datos existentes: todo lo que hoy está en papelera se borró en cascada
-- desde su cliente o su venta, porque hasta ahora no había otra vía.
UPDATE public.sales
   SET deleted_via = 'client'
 WHERE deleted_at IS NOT NULL
   AND deleted_via IS NULL
   AND client_id IN (SELECT id FROM public.clients WHERE deleted_at IS NOT NULL);

UPDATE public.payments
   SET deleted_via = 'sale'
 WHERE deleted_at IS NOT NULL
   AND deleted_via IS NULL;


-- ------------------------------------------------------------
-- 2. UN ABONO SOLO PUEDE COLGAR DE UNA VENTA PROPIA
--    La política RLS de payments solo comprobaba user_id, así que un
--    cliente malicioso podía insertar un abono contra la venta de otra
--    tienda. SECURITY DEFINER para poder leer sales sin depender de RLS.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_payment_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.sales s
     WHERE s.id = NEW.sale_id AND s.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'El abono no corresponde a una venta de este usuario';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_validate_owner ON public.payments;
CREATE TRIGGER trg_payments_validate_owner
  BEFORE INSERT OR UPDATE OF sale_id, user_id ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_owner();


-- ------------------------------------------------------------
-- 3. amount_paid Y status SE DERIVAN DE LOS ABONOS
--    Sin SECURITY DEFINER a propósito: la función corre con los permisos
--    de quien la dispara, así que RLS sigue impidiendo tocar ventas ajenas.
--    Una venta en papelera conserva sus cifras congeladas.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recalc_sale_totals(p_sale_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_total  NUMERIC(10,2);
  v_paid   NUMERIC(10,2);
  v_status sale_status;
BEGIN
  IF p_sale_id IS NULL THEN
    RETURN;
  END IF;

  SELECT total_amount INTO v_total
    FROM public.sales
   WHERE id = p_sale_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.payments
   WHERE sale_id = p_sale_id AND deleted_at IS NULL;

  v_status := (CASE
    WHEN v_paid >= v_total THEN 'COMPLETED'
    WHEN v_paid > 0        THEN 'PARTIAL'
    ELSE                        'PENDING'
  END)::sale_status;

  UPDATE public.sales
     SET amount_paid = v_paid,
         status      = v_status
   WHERE id = p_sale_id
     AND (amount_paid IS DISTINCT FROM v_paid
          OR status   IS DISTINCT FROM v_status);
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_sale_totals()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalc_sale_totals(OLD.sale_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalc_sale_totals(NEW.sale_id);

  IF TG_OP = 'UPDATE' AND OLD.sale_id IS DISTINCT FROM NEW.sale_id THEN
    PERFORM public.recalc_sale_totals(OLD.sale_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_sync_sale ON public.payments;
CREATE TRIGGER trg_payments_sync_sale
  AFTER INSERT OR UPDATE OR DELETE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.sync_sale_totals();

-- Al sacar una venta de la papelera se recalcula por si acaso.
-- El WHEN evita recursión: el UPDATE del recálculo no toca deleted_at.
CREATE OR REPLACE FUNCTION public.sync_sale_totals_on_restore()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.recalc_sale_totals(NEW.id);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_restore_sync ON public.sales;
CREATE TRIGGER trg_sales_restore_sync
  AFTER UPDATE OF deleted_at ON public.sales
  FOR EACH ROW
  WHEN (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL)
  EXECUTE FUNCTION public.sync_sale_totals_on_restore();


-- ------------------------------------------------------------
-- 4. CUADRE DE LO YA EXISTENTE
--
--    PRIMERO revisa si hay descuadres con esta consulta. Si devuelve 0
--    filas, no hay nada que corregir y puedes saltarte el UPDATE.
--
--      SELECT s.id, s.item_description, s.amount_paid AS guardado,
--             COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL), 0) AS real
--        FROM public.sales s
--        LEFT JOIN public.payments p ON p.sale_id = s.id
--       WHERE s.deleted_at IS NULL
--       GROUP BY s.id, s.item_description, s.amount_paid
--      HAVING s.amount_paid IS DISTINCT FROM
--             COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL), 0);
--
--    Los abonos pasan a ser la fuente de verdad.
-- ------------------------------------------------------------
WITH sums AS (
  SELECT s.id,
         s.total_amount,
         COALESCE((
           SELECT SUM(p.amount) FROM public.payments p
            WHERE p.sale_id = s.id AND p.deleted_at IS NULL
         ), 0) AS paid
    FROM public.sales s
   WHERE s.deleted_at IS NULL
),
calc AS (
  SELECT id,
         paid,
         (CASE
            WHEN paid >= total_amount THEN 'COMPLETED'
            WHEN paid > 0             THEN 'PARTIAL'
            ELSE                           'PENDING'
          END)::sale_status AS status
    FROM sums
)
UPDATE public.sales s
   SET amount_paid = calc.paid,
       status      = calc.status
  FROM calc
 WHERE s.id = calc.id
   AND (s.amount_paid IS DISTINCT FROM calc.paid
        OR s.status   IS DISTINCT FROM calc.status);


-- ------------------------------------------------------------
-- 5. ÍNDICES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_user_status
  ON public.sales(user_id, status) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_user_created
  ON public.payments(user_id, created_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_payments_sale_active
  ON public.payments(sale_id) WHERE deleted_at IS NULL;
