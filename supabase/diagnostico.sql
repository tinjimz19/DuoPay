-- ============================================================
-- DuoPay · Diagnóstico
--
-- Pégalo entero en: Supabase Dashboard > SQL Editor > New query.
-- No modifica datos: solo revisa qué piezas están instaladas y refresca
-- la caché de esquema de la API al final.
--
-- Úsalo cuando la app dé un error raro después de aplicar un parche.
-- ============================================================

-- ------------------------------------------------------------
-- 1. ¿Están todas las piezas de los parches?
-- ------------------------------------------------------------
WITH chequeos(orden, pieza, presente) AS (
  VALUES
    (1,  'Parche 01 · columna payments.deleted_via',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='payments'
                    AND column_name='deleted_via')),
    (2,  'Parche 01 · columna sales.deleted_via',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='sales'
                    AND column_name='deleted_via')),
    (3,  'Parche 01 · función recalc_sale_totals',
         EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                  WHERE n.nspname='public' AND p.proname='recalc_sale_totals')),
    (4,  'Parche 01 · trigger trg_payments_sync_sale',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_payments_sync_sale' AND NOT tgisinternal)),
    (5,  'Parche 01 · trigger trg_payments_validate_owner',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_payments_validate_owner' AND NOT tgisinternal)),
    (6,  'Parche 01 · trigger trg_sales_restore_sync',
         EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname='trg_sales_restore_sync' AND NOT tgisinternal)),
    (7,  'Parche 02 · columna sales.first_charge_date',
         EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema='public' AND table_name='sales'
                    AND column_name='first_charge_date')),
    (8,  'Parche 02 · índice idx_sales_cobranza',
         EXISTS (SELECT 1 FROM pg_indexes
                  WHERE schemaname='public' AND indexname='idx_sales_cobranza'))
)
SELECT orden AS "#",
       pieza,
       CASE WHEN presente THEN 'ok' ELSE '>>> FALTA' END AS estado
  FROM chequeos
 ORDER BY orden;


-- ------------------------------------------------------------
-- 2. ¿Hay ventas descuadradas? (amount_paid vs. la suma de abonos)
--    Con el trigger del parche 01 puesto, esto debe salir vacío.
-- ------------------------------------------------------------
SELECT s.id,
       s.item_description,
       s.amount_paid AS guardado,
       COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL), 0) AS segun_abonos
  FROM public.sales s
  LEFT JOIN public.payments p ON p.sale_id = s.id
 WHERE s.deleted_at IS NULL
 GROUP BY s.id, s.item_description, s.amount_paid
HAVING s.amount_paid IS DISTINCT FROM
       COALESCE(SUM(p.amount) FILTER (WHERE p.deleted_at IS NULL), 0);


-- ------------------------------------------------------------
-- 3. ¿Hay ventas abiertas sin quincena de cobro asignada?
--    Con el parche 02 puesto, esto debe salir vacío.
-- ------------------------------------------------------------
SELECT id, item_description, created_at
  FROM public.sales
 WHERE deleted_at IS NULL
   AND status <> 'COMPLETED'
   AND first_charge_date IS NULL;


-- ------------------------------------------------------------
-- 4. Refrescar la caché de esquema de la API
--
--    Supabase (PostgREST) guarda en memoria las columnas que conoce. Si un
--    parche agrega una columna y la caché no se entera, la app falla con
--    "Could not find the 'X' column ... in the schema cache" aunque la
--    columna exista de verdad. Esto la obliga a releer.
-- ------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
