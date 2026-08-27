-- =====================================================================
-- PATCH 04 · Configuración de la tienda
--
-- 1. Logo de la tienda (columna + bucket público)
-- 2. Métodos de pago configurables
-- 3. ARREGLO: al registrarse, el nombre del negocio se perdía
--
-- Es idempotente: se puede correr las veces que haga falta.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. LOGO DE LA TIENDA
-- ---------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Bucket PÚBLICO a propósito: el logo se pinta en la cabecera en cada
-- render. Con un bucket privado habría que firmar una URL cada vez, que
-- es justo el viaje de red que quitamos al arreglar la navegación.
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-logos', 'store-logos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Escribir, solo dentro de la carpeta propia. Leer, cualquiera.
DROP POLICY IF EXISTS "Tienda sube su logo" ON storage.objects;
CREATE POLICY "Tienda sube su logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda reemplaza su logo" ON storage.objects;
CREATE POLICY "Tienda reemplaza su logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda borra su logo" ON storage.objects;
CREATE POLICY "Tienda borra su logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'store-logos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Los logos se ven publicamente" ON storage.objects;
CREATE POLICY "Los logos se ven publicamente"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-logos');


-- ---------------------------------------------------------------------
-- 2. MÉTODOS DE PAGO
--
-- Un solo juego de columnas para todos los métodos, en vez de una tabla
-- por tipo. Aquí un Pago Móvil pide banco + teléfono + cédula, un Zelle
-- pide correo + titular y el efectivo no pide nada: son los mismos
-- cuatro campos con distinto nombre en pantalla, y la app decide cuáles
-- mostrar según el tipo.
-- ---------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE payment_method_kind AS ENUM (
    'PAGO_MOVIL', 'TRANSFERENCIA', 'ZELLE', 'BINANCE', 'EFECTIVO', 'OTRO'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_methods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  kind payment_method_kind NOT NULL,
  /* Apodo opcional: "el Banesco de mi esposa". */
  label TEXT,
  bank TEXT,
  /* Teléfono, correo o número de cuenta, según el tipo. */
  account TEXT,
  holder TEXT,
  document TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Aislamiento por usuario en metodos de pago" ON public.payment_methods;
CREATE POLICY "Aislamiento por usuario en metodos de pago"
  ON public.payment_methods FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user
  ON public.payment_methods(user_id, sort_order, created_at);

/*
 * Supabase concede esto solo, por privilegios por defecto, y por eso los
 * parches anteriores no lo escribían. Se deja explícito para que el
 * parche no dependa de un permiso ambiente: si algún día se aplica con
 * otro rol, la tabla existiría pero la app daría "permission denied".
 */
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_methods TO authenticated;

/*
 * El user_id se rellena solo con auth.uid(), pero un cliente puede
 * mandarlo a mano. Esta comprobación evita que alguien inserte un método
 * en la tienda de otro aunque la política lo dejara pasar.
 */
CREATE OR REPLACE FUNCTION public.validate_payment_method_owner()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM auth.uid() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'El método de pago no pertenece a esta tienda';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_validate_payment_method_owner ON public.payment_methods;
CREATE TRIGGER trg_validate_payment_method_owner
  BEFORE INSERT OR UPDATE ON public.payment_methods
  FOR EACH ROW EXECUTE FUNCTION public.validate_payment_method_owner();


-- ---------------------------------------------------------------------
-- 3. ARREGLO: el nombre del negocio se perdía al registrarse
--
-- El formulario de registro SÍ lo mandaba, dentro de los metadatos del
-- usuario. El trigger que crea el perfil solo leía `full_name`, así que
-- `business_name` se quedaba guardado en auth.users sin que nadie lo
-- copiara nunca. Por eso había que entrar y volver a escribirlo.
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, business_name, trial_ends_at)
  VALUES (
    new.id,
    NULLIF(TRIM(new.raw_user_meta_data->>'full_name'), ''),
    NULLIF(TRIM(new.raw_user_meta_data->>'business_name'), ''),
    NOW() + INTERVAL '3 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Rescate: a quien ya se registró, el nombre sigue estando en sus
-- metadatos. Se copia al perfil sin pisar a quien ya lo escribió a mano.
UPDATE public.profiles p
SET business_name = NULLIF(TRIM(u.raw_user_meta_data->>'business_name'), '')
FROM auth.users u
WHERE u.id = p.id
  AND NULLIF(TRIM(COALESCE(p.business_name, '')), '') IS NULL
  AND NULLIF(TRIM(u.raw_user_meta_data->>'business_name'), '') IS NOT NULL;

-- Lo mismo con el nombre de la persona, por si quedó alguno en blanco.
UPDATE public.profiles p
SET full_name = NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), '')
FROM auth.users u
WHERE u.id = p.id
  AND NULLIF(TRIM(COALESCE(p.full_name, '')), '') IS NULL
  AND NULLIF(TRIM(u.raw_user_meta_data->>'full_name'), '') IS NOT NULL;


-- PostgREST cachea el esquema; sin esto, la tabla nueva da error 400.
NOTIFY pgrst, 'reload schema';
