-- ============================================================
-- DuoPay · Parche 02 — Cobranza por quincenas
--
-- Ejecutar UNA VEZ en: Supabase Dashboard > SQL Editor > New query.
-- Requiere el parche 01 aplicado. Es idempotente.
--
-- En Venezuela la gente cobra el 15 y el 1ero, así que la cobranza no son
-- vencimientos sueltos por cliente: son dos jornadas al mes. Cada venta
-- guarda solo en qué quincena empieza a cobrarse; el resto (cuotas
-- exigibles, atraso, cuánto toca poner hoy) lo deriva la app.
-- ============================================================


-- ------------------------------------------------------------
-- 1. DESDE QUÉ QUINCENA SE COBRA LA VENTA
--    Siempre un día 15 (cobro de quincena) o un día 1 (cobro de fin de mes).
-- ------------------------------------------------------------
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS first_charge_date DATE;

DO $$ BEGIN
  ALTER TABLE public.sales
    ADD CONSTRAINT sales_first_charge_date_check
    CHECK (
      first_charge_date IS NULL
      OR EXTRACT(DAY FROM first_charge_date) IN (1, 15)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ------------------------------------------------------------
-- 2. VENTAS QUE YA EXISTEN
--
--    Por defecto se les asigna la quincena que les tocaba según su fecha:
--    la del 15 si la venta se hizo antes del 15, o la del 1ero del mes
--    siguiente si se hizo del 15 en adelante. Es lo veraz: una venta de
--    junio a medio pagar va a aparecer atrasada, porque lo está.
--
--    Si prefieres empezar con la cuenta en cero y que todo el mundo arranque
--    en la próxima quincena, comenta el UPDATE de abajo y usa este otro:
--
--      UPDATE public.sales SET first_charge_date =
--        CASE WHEN EXTRACT(DAY FROM (NOW() AT TIME ZONE 'America/Caracas')) < 15
--             THEN (date_trunc('month', NOW() AT TIME ZONE 'America/Caracas') + INTERVAL '14 days')::date
--             ELSE (date_trunc('month', NOW() AT TIME ZONE 'America/Caracas') + INTERVAL '1 month')::date
--        END
--       WHERE first_charge_date IS NULL AND deleted_at IS NULL AND status <> 'COMPLETED';
-- ------------------------------------------------------------
UPDATE public.sales
   SET first_charge_date = CASE
     WHEN EXTRACT(DAY FROM (created_at AT TIME ZONE 'America/Caracas')) < 15
       THEN (date_trunc('month', created_at AT TIME ZONE 'America/Caracas')
             + INTERVAL '14 days')::date
     ELSE (date_trunc('month', created_at AT TIME ZONE 'America/Caracas')
           + INTERVAL '1 month')::date
   END
 WHERE first_charge_date IS NULL;

-- Las nuevas ventas siempre traen su quincena desde la app, pero por si
-- alguna se inserta a mano desde el Dashboard.
ALTER TABLE public.sales
  ALTER COLUMN first_charge_date SET DEFAULT (
    CASE
      WHEN EXTRACT(DAY FROM (NOW() AT TIME ZONE 'America/Caracas')) < 15
        THEN (date_trunc('month', NOW() AT TIME ZONE 'America/Caracas')
              + INTERVAL '14 days')::date
      ELSE (date_trunc('month', NOW() AT TIME ZONE 'America/Caracas')
            + INTERVAL '1 month')::date
    END
  );


-- ------------------------------------------------------------
-- 3. ÍNDICE PARA LA PANTALLA DE COBRANZA
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sales_cobranza
  ON public.sales(user_id, first_charge_date)
  WHERE deleted_at IS NULL AND status <> 'COMPLETED';


-- ------------------------------------------------------------
-- 4. REVISIÓN
--    Cómo quedó repartida la cartera abierta por quincena de inicio:
--
--      SELECT first_charge_date, COUNT(*) AS ventas,
--             SUM(total_amount - amount_paid) AS por_cobrar
--        FROM public.sales
--       WHERE deleted_at IS NULL AND status <> 'COMPLETED'
--       GROUP BY first_charge_date
--       ORDER BY first_charge_date;
-- ------------------------------------------------------------
