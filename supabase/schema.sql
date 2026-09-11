-- ============================================================
-- DuoPay - Esquema de base de datos (Supabase / PostgreSQL)
-- Ejecutar en: Supabase Dashboard > SQL Editor > New query
-- ============================================================

-- 1. TABLA DE PERFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  business_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios gestionan su propio perfil"
  ON public.profiles FOR ALL
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger para crear el perfil automáticamente al registrarse
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (new.id, new.raw_user_meta_data->>'full_name');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 2. TABLA DE CLIENTES
CREATE TABLE IF NOT EXISTS public.clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aislamiento por usuario en clientes"
  ON public.clients FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_clients_user_id ON public.clients(user_id);


-- 3. TABLA DE VENTAS / MERCANCÍA ENTREGADA A FIADO
DO $$ BEGIN
  CREATE TYPE sale_status AS ENUM ('PENDING', 'PARTIAL', 'COMPLETED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE product_category AS ENUM ('ROPA', 'CALZADO', 'PERFUME', 'OTRO');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  client_id UUID NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  item_description TEXT NOT NULL,
  category product_category NOT NULL DEFAULT 'ROPA',
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount > 0),
  installments_count INT NOT NULL DEFAULT 2 CHECK (installments_count > 0),
  installment_amount NUMERIC(10, 2) GENERATED ALWAYS AS (ROUND(total_amount / installments_count::numeric, 2)) STORED,
  amount_paid NUMERIC(10, 2) DEFAULT 0.00,
  status sale_status DEFAULT 'PENDING',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aislamiento por usuario en ventas"
  ON public.sales FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sales_user_id ON public.sales(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_client_id ON public.sales(client_id);

-- Trigger para mantener updated_at al día
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sales_updated_at ON public.sales;
CREATE TRIGGER trg_sales_updated_at
  BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();


-- 4. TABLA DE ABONOS / REGISTRO DE PAGOS DE CUOTAS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount NUMERIC(10, 2) NOT NULL CHECK (amount > 0),
  payment_number INT CHECK (payment_number > 0),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aislamiento por usuario en pagos"
  ON public.payments FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_sale_id ON public.payments(sale_id);


-- 5. TABLA DE PEDIDOS / ENCARGOS FUTUROS (REABASTECIMIENTO)
DO $$ BEGIN
  CREATE TYPE preorder_status AS ENUM ('PENDENT', 'ORDERED', 'DELIVERED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.preorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name_raw TEXT,
  product_name TEXT NOT NULL,
  category product_category NOT NULL DEFAULT 'PERFUME',
  quantity INT DEFAULT 1,
  estimated_price NUMERIC(10, 2),
  status preorder_status DEFAULT 'PENDENT',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.preorders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Aislamiento por usuario en pedidos"
  ON public.preorders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_preorders_user_id ON public.preorders(user_id);


-- 6. MIGRACIÓN: teléfono del cliente obligatorio (para bases existentes)
-- En una base ya creada, completa los teléfonos que faltan y marca la columna NOT NULL:
--   UPDATE public.clients SET phone = '0000000' WHERE phone IS NULL OR phone = '';
--   ALTER TABLE public.clients ALTER COLUMN phone SET NOT NULL;


-- 7. SUSCRIPCIONES Y ROLES DE TIENDA
-- role:    owner (negocio) | super_admin (dueño de DuoPay)
-- status:  TRIAL (prueba) | ACTIVE (pagado) | SUSPENDED | EXPIRED

DO $$ BEGIN
  CREATE TYPE public.profile_role AS ENUM ('owner', 'super_admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.profile_status AS ENUM ('TRIAL', 'ACTIVE', 'SUSPENDED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role public.profile_role NOT NULL DEFAULT 'owner',
  ADD COLUMN IF NOT EXISTS status public.profile_status NOT NULL DEFAULT 'TRIAL',
  ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS subscription_ends_at TIMESTAMPTZ;

-- Si las columnas ya existían (sin default ni valores), normalizarlas:
ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT 'owner';
ALTER TABLE public.profiles ALTER COLUMN status SET DEFAULT 'TRIAL';

UPDATE public.profiles SET role = 'owner' WHERE role IS NULL;
UPDATE public.profiles SET status = 'TRIAL' WHERE status IS NULL;
UPDATE public.profiles SET trial_ends_at = created_at + INTERVAL '3 days' WHERE trial_ends_at IS NULL;

-- Backfill para bases existentes: los negocios actuales quedan activos 30 días.
--   UPDATE public.profiles SET subscription_ends_at = NOW() + INTERVAL '30 days', status = 'ACTIVE' WHERE role = 'owner';
-- Promover al super admin (ejecutar manualmente con tu id):
--   UPDATE public.profiles SET role = 'super_admin', status = 'ACTIVE' WHERE id = '<tu-user-id>';

-- El trigger de registro ahora otorga 3 días de prueba.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, trial_ends_at)
  VALUES (
    new.id,
    new.raw_user_meta_data->>'full_name',
    NOW() + INTERVAL '3 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Helper: true si el usuario actual es super admin (bypasea RLS).
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'super_admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Emails de las cuentas (viven en auth.users, no accesibles con anon key).
-- Devuelve filas solo si quien consulta es super admin.
CREATE OR REPLACE FUNCTION public.store_emails()
RETURNS TABLE (id UUID, email TEXT)
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT u.id, u.email
  FROM auth.users u
  WHERE public.is_super_admin();
$$;

REVOKE ALL ON FUNCTION public.store_emails() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.store_emails() TO authenticated;

-- Políticas de lectura/gestión para el super admin.
DROP POLICY IF EXISTS "Super admin gestiona tiendas" ON public.profiles;
CREATE POLICY "Super admin gestiona tiendas"
  ON public.profiles FOR SELECT
  USING (public.is_super_admin());

DROP POLICY IF EXISTS "Super admin actualiza tiendas" ON public.profiles;
CREATE POLICY "Super admin actualiza tiendas"
  ON public.profiles FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- Lectura de métricas de uso por tienda (solo lectura, para el panel admin).
CREATE POLICY "Super admin ve clientes de tiendas"
  ON public.clients FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Super admin ve ventas de tiendas"
  ON public.sales FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Super admin ve pagos de tiendas"
  ON public.payments FOR SELECT USING (public.is_super_admin());
CREATE POLICY "Super admin ve pedidos de tiendas"
  ON public.preorders FOR SELECT USING (public.is_super_admin());

-- Protección: un owner no puede auto-promoverse ni extender su propia suscripción.
-- Solo un super admin puede modificar role/status/fechas.
-- auth.uid() IS NULL = acceso desde Supabase Dashboard (SQL/Table Editor): se permite.
CREATE OR REPLACE FUNCTION public.protect_profile_subscription()
RETURNS TRIGGER AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_super_admin() THEN
    NEW.role := OLD.role;
    NEW.status := OLD.status;
    NEW.trial_ends_at := OLD.trial_ends_at;
    NEW.subscription_ends_at := OLD.subscription_ends_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_subscription ON public.profiles;
CREATE TRIGGER trg_protect_profile_subscription
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_subscription();


-- 9. REPORTES DE PAGO DE SUSCRIPCIÓN
-- La tienda sube su captura y el super admin confirma para activar/renovar.
DO $$ BEGIN
  CREATE TYPE public.payment_report_status AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.payment_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE DEFAULT auth.uid(),
  amount NUMERIC(10, 2),
  method TEXT NOT NULL,
  reference TEXT,
  proof_path TEXT,
  notes TEXT,
  status public.payment_report_status NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

ALTER TABLE public.payment_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tienda crea sus reportes de pago"
  ON public.payment_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Tienda ve sus reportes de pago"
  ON public.payment_reports FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Super admin revisa reportes de pago"
  ON public.payment_reports FOR SELECT
  USING (public.is_super_admin());

CREATE POLICY "Super admin actualiza reportes de pago"
  ON public.payment_reports FOR UPDATE
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE INDEX IF NOT EXISTS idx_payment_reports_user_id ON public.payment_reports(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_reports_status ON public.payment_reports(status);

-- Bucket privado para las capturas
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-proofs', 'payment-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Cada tienda solo sube/lee dentro de su propia carpeta; el super admin lee todo.
DROP POLICY IF EXISTS "Tienda sube capturas a su carpeta" ON storage.objects;
CREATE POLICY "Tienda sube capturas a su carpeta"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda ve sus capturas" ON storage.objects;
CREATE POLICY "Tienda ve sus capturas"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Super admin ve todas las capturas" ON storage.objects;
CREATE POLICY "Super admin ve todas las capturas"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.is_super_admin());


-- 10. PAPELERA (SOFT DELETE)
-- Borrar mueve a papelera (deleted_at); restaurar lo devuelve; purgar elimina de verdad.
ALTER TABLE public.clients   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.sales     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.payments  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.preorders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_clients_deleted_at   ON public.clients(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_sales_deleted_at     ON public.sales(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at  ON public.payments(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_preorders_deleted_at ON public.preorders(user_id) WHERE deleted_at IS NULL;


-- 11. PEDIDOS: FOTO DE REFERENCIA Y CONVERSION EN VENTA
-- ---------------------------------------------------------------------
-- 1. LAS DOS COLUMNAS NUEVAS
-- ---------------------------------------------------------------------
--
-- `image_path` guarda la RUTA dentro del depósito, no una dirección web.
-- Es a propósito: el depósito es privado y las direcciones se firman al
-- momento de mostrarlas, con vencimiento. Guardar una dirección firmada
-- en la base sería guardar algo que caduca.
--
-- `sale_id` es lo que impide el error caro: convertir dos veces el mismo
-- pedido y dejar al cliente debiendo el doble. Mientras esté lleno, el
-- botón de convertir no aparece y la función de abajo se niega.

ALTER TABLE public.preorders
  ADD COLUMN IF NOT EXISTS image_path TEXT,
  ADD COLUMN IF NOT EXISTS sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_preorders_sale_id
  ON public.preorders(sale_id) WHERE sale_id IS NOT NULL;


-- ---------------------------------------------------------------------
-- 2. EL DEPÓSITO DE FOTOS
-- ---------------------------------------------------------------------
--
-- Privado, igual que `payment-proofs`. Cada tienda solo entra a su propia
-- carpeta: la ruta es `<id-de-la-tienda>/<archivo>` y la política compara
-- esa primera carpeta contra quien está pidiendo. Una tienda no puede ver
-- ni borrar la foto de otra aunque adivine el nombre del archivo.
--
-- El límite de 5 MB y la lista de tipos los aplica el propio depósito, no
-- la aplicación: una validación que vive en el navegador se salta con la
-- consola abierta.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'pedidos', 'pedidos', false, 5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Tienda sube fotos de pedido a su carpeta" ON storage.objects;
CREATE POLICY "Tienda sube fotos de pedido a su carpeta"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'pedidos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda ve sus fotos de pedido" ON storage.objects;
CREATE POLICY "Tienda ve sus fotos de pedido"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'pedidos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Reemplazar la foto y quitarla también hacen falta: sin estas dos, una
-- foto equivocada se queda para siempre y ocupando el plan gratuito.
DROP POLICY IF EXISTS "Tienda reemplaza sus fotos de pedido" ON storage.objects;
CREATE POLICY "Tienda reemplaza sus fotos de pedido"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'pedidos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Tienda borra sus fotos de pedido" ON storage.objects;
CREATE POLICY "Tienda borra sus fotos de pedido"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'pedidos'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );


-- ---------------------------------------------------------------------
-- 3. CONVERTIR UN PEDIDO EN VENTA
-- ---------------------------------------------------------------------
--
-- POR QUÉ ESTO VIVE EN LA BASE Y NO EN CADA APLICACIÓN
--
-- Son dos escrituras que tienen que pasar juntas o no pasar: se crea la
-- venta y se marca el pedido. Si se hicieran por separado desde la
-- aplicación y la segunda fallara —se fue el internet justo ahí— quedaría
-- una venta creada y un pedido que todavía muestra el botón de convertir.
-- El siguiente toque crea una SEGUNDA venta y el cliente queda debiendo
-- el doble. Aquí adentro las dos son una sola transacción: o pasan las
-- dos o no pasa ninguna.
--
-- Y hay un segundo motivo: la app móvil habla con la base directamente,
-- sin servidor propio. Si esto viviera en el servidor de la web, el móvil
-- tendría que repetir la lógica, y dos copias de la misma regla siempre
-- terminan diciendo cosas distintas.
--
-- EL CANDADO
--
-- `FOR UPDATE` bloquea la fila del pedido hasta el final de la
-- transacción. Dos toques al mismo tiempo —el dedo nervioso, o el
-- teléfono y la computadora a la vez— entran en fila: el primero
-- convierte, el segundo encuentra `sale_id` lleno y se niega. Sin el
-- candado, los dos leerían "todavía no está convertido" y crearían dos
-- ventas.
--
-- SEGURIDAD
--
-- Va como INVOKER (lo normal), no como DEFINER: las reglas de aislamiento
-- por tienda se siguen aplicando igual que en cualquier otra consulta.
-- Aun así se comprueba a mano que el pedido y el cliente sean de quien
-- llama, porque un `client_id` de otra tienda pasaría las reglas de
-- `sales` —ahí lo que se comprueba es el `user_id` de la venta— y dejaría
-- una venta apuntando a un cliente ajeno.

CREATE OR REPLACE FUNCTION public.convertir_pedido_en_venta(
  p_pedido      UUID,
  p_cliente     UUID,
  p_descripcion TEXT,
  p_total       NUMERIC,
  p_cuotas      INT,
  p_nota        TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_pedido public.preorders%ROWTYPE;
  v_venta  UUID;
  v_quien  UUID := auth.uid();
BEGIN
  IF v_quien IS NULL THEN
    RAISE EXCEPTION 'Se venció la sesión. Vuelve a entrar.';
  END IF;

  -- El candado. Traer el pedido y dejarlo bloqueado hasta el final.
  SELECT * INTO v_pedido
    FROM public.preorders
   WHERE id = p_pedido
     AND user_id = v_quien
     AND deleted_at IS NULL
     FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Este pedido ya no existe.';
  END IF;

  IF v_pedido.sale_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido ya se convirtió en venta.';
  END IF;

  IF v_pedido.status = 'CANCELLED' THEN
    RAISE EXCEPTION 'Este pedido está cancelado. Reactívalo antes de convertirlo.';
  END IF;

  -- El cliente tiene que ser de esta misma tienda.
  IF NOT EXISTS (
    SELECT 1 FROM public.clients
     WHERE id = p_cliente AND user_id = v_quien AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Ese cliente ya no existe.';
  END IF;

  IF p_total IS NULL OR p_total <= 0 THEN
    RAISE EXCEPTION 'El monto debe ser mayor a 0.';
  END IF;

  IF p_cuotas IS NULL OR p_cuotas < 1 OR p_cuotas > 36 THEN
    RAISE EXCEPTION 'Las cuotas van de 1 a 36.';
  END IF;

  IF p_descripcion IS NULL OR length(btrim(p_descripcion)) < 3 THEN
    RAISE EXCEPTION 'Describe la mercancía.';
  END IF;

  INSERT INTO public.sales (
    user_id, client_id, item_description, category,
    total_amount, installments_count, notes
  )
  VALUES (
    v_quien,
    p_cliente,
    btrim(p_descripcion),
    v_pedido.category,          -- la categoría viene del pedido: ya se eligió una vez
    p_total,
    p_cuotas,
    NULLIF(btrim(COALESCE(p_nota, '')), '')
  )
  RETURNING id INTO v_venta;

  -- Entregado y enlazado. A partir de aquí el botón de convertir
  -- desaparece y esta misma función se niega a repetirlo.
  UPDATE public.preorders
     SET sale_id = v_venta,
         status  = 'DELIVERED',
         client_id = COALESCE(client_id, p_cliente)
   WHERE id = p_pedido;

  RETURN v_venta;
END;
$$;

GRANT EXECUTE ON FUNCTION public.convertir_pedido_en_venta(
  UUID, UUID, TEXT, NUMERIC, INT, TEXT
) TO authenticated;


-- ---------------------------------------------------------------------
-- COMPROBACIÓN
-- ---------------------------------------------------------------------
-- Después de correr todo, esto tiene que devolver tres filas:
--
--   SELECT 'columna' AS que, column_name AS detalle
--     FROM information_schema.columns
--    WHERE table_name = 'preorders' AND column_name IN ('image_path', 'sale_id')
--   UNION ALL
--   SELECT 'funcion', routine_name
--     FROM information_schema.routines
--    WHERE routine_name = 'convertir_pedido_en_venta';
