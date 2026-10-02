-- ------------------------------------------------------------
-- patch-07-viajes.sql
--
-- VIAJES para los pedidos / encargos.
--
-- La tienda viaja a comprar en fechas concretas (el 7, el 20…). Cada pedido
-- se ancla a un viaje para no tenerlos todos regados: lo que ya no cabe en
-- el viaje del 7 se anota para el del 20, y cada lista queda aparte.
--
-- Un viaje es SOLO una fecha. Los pedidos sin viaje asignado quedan en
-- "Sin viaje" (trip_id NULL). Al borrar un viaje, sus pedidos NO se pierden:
-- vuelven a "Sin viaje".
--
-- Correr una sola vez en el editor SQL de Supabase. Es idempotente.
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  travel_date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento por usuario en viajes" ON public.trips;
CREATE POLICY "Aislamiento por usuario en viajes"
  ON public.trips FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Un viaje por fecha y tienda: no tiene sentido dos "7 de octubre".
CREATE UNIQUE INDEX IF NOT EXISTS uq_trips_user_date
  ON public.trips(user_id, travel_date);

-- Los pedidos se anclan a un viaje. NULL = "Sin viaje". Al borrar el viaje,
-- sus pedidos vuelven a "Sin viaje" en vez de borrarse con él.
ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS trip_id UUID REFERENCES public.trips(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_preorders_trip
  ON public.preorders(trip_id)
  WHERE deleted_at IS NULL;
