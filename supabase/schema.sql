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