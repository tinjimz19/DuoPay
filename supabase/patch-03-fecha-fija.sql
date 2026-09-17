-- ------------------------------------------------------------
-- patch-03-fecha-fija.sql
--
-- Permite el PAGO ÚNICO en una fecha concreta.
--
-- Hasta ahora `first_charge_date` solo aceptaba el 1 o el 15, porque la
-- cobranza va por quincenas. Pero el cliente que paga todo de una vez pacta
-- un día suelto ("me paga el 25"), y ese día no existe en el calendario de
-- quincenas. Con una sola cuota no hay cuotas siguientes que calendarizar,
-- así que ahí se permite cualquier fecha.
--
-- Las ventas por quincenas (2+ cuotas) siguen obligadas al 1 o al 15.
--
-- Correr una sola vez en el editor SQL de Supabase. Es idempotente:
-- volver a correrlo no hace daño.
-- ------------------------------------------------------------

ALTER TABLE public.sales
  DROP CONSTRAINT IF EXISTS sales_first_charge_date_check;

ALTER TABLE public.sales
  ADD CONSTRAINT sales_first_charge_date_check
  CHECK (
    first_charge_date IS NULL
    OR EXTRACT(DAY FROM first_charge_date) IN (1, 15)
    OR installments_count = 1
  );
