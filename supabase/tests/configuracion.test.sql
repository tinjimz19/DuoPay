-- ============================================================
-- Pruebas de la configuración de tienda (parche 04)
--
-- Contra una base de PRUEBA, nunca producción.
-- Se corren con el rol `authenticated` y un JWT simulado, para que RLS
-- aplique igual que en la app. Como superusuario RLS no aplica y los
-- fallos reales no aparecen.
--
--   psql -d duopay_test -f supabase/tests/configuracion.test.sql
--
-- Requiere los usuarios aaaaaaaa-...-0001 y bbbbbbbb-...-0002.
-- ============================================================

\set ON_ERROR_STOP on
\pset pager off

CREATE OR REPLACE FUNCTION pg_temp.chk(label TEXT, got TEXT, want TEXT) RETURNS VOID AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FALLO [%]: obtuve "%", esperaba "%"', label, got, want;
  END IF;
  RAISE NOTICE 'ok  %  -> %', label, got;
END; $$ LANGUAGE plpgsql;

SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE authenticated;

DO $$
DECLARE
  u  UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  u2 UUID := 'bbbbbbbb-0000-0000-0000-000000000002';
  pm UUID;
  ok BOOLEAN;
BEGIN
  -- ---- alta de métodos ------------------------------------------
  INSERT INTO payment_methods (kind, bank, account, holder, document, sort_order)
    VALUES ('PAGO_MOVIL', 'Banesco', '04123334455', 'Marisol Guevara', 'V-12345678', 0)
    RETURNING id INTO pm;
  PERFORM pg_temp.chk('el user_id se rellena solo',
    (SELECT user_id::text FROM payment_methods WHERE id = pm), u::text);
  PERFORM pg_temp.chk('nace activo',
    (SELECT is_active::text FROM payment_methods WHERE id = pm), 'true');

  INSERT INTO payment_methods (kind, account, holder, sort_order)
    VALUES ('ZELLE', 'marisol@correo.com', 'Marisol Guevara', 1);
  INSERT INTO payment_methods (kind, sort_order) VALUES ('EFECTIVO', 2);
  PERFORM pg_temp.chk('la tienda ve sus tres métodos',
    (SELECT count(*)::text FROM payment_methods), '3');

  -- ---- desactivar sin borrar ------------------------------------
  UPDATE payment_methods SET is_active = FALSE WHERE kind = 'EFECTIVO';
  PERFORM pg_temp.chk('quedan dos activos',
    (SELECT count(*)::text FROM payment_methods WHERE is_active), '2');

  -- ---- no se puede sembrar en la tienda de otro ------------------
  BEGIN
    INSERT INTO payment_methods (user_id, kind, account)
      VALUES (u2, 'ZELLE', 'colado@correo.com');
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE;
  END;
  PERFORM pg_temp.chk('insertar en la tienda ajena falla', ok::text, 'false');

  -- ---- ni cambiarle el dueño a uno propio -----------------------
  BEGIN
    UPDATE payment_methods SET user_id = u2 WHERE id = pm;
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE;
  END;
  PERFORM pg_temp.chk('regalarle un método a otra tienda falla', ok::text, 'false');

  -- ---- el logo vive en el perfil --------------------------------
  UPDATE profiles SET logo_url = 'https://x/store-logos/' || u || '/logo.webp' WHERE id = u;
  PERFORM pg_temp.chk('el logo se guarda',
    (SELECT (logo_url IS NOT NULL)::text FROM profiles WHERE id = u), 'true');
END $$;

-- ---- la otra tienda no ve nada de la primera ---------------------
RESET ROLE;
SET request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';
SET ROLE authenticated;

DO $$
DECLARE ok BOOLEAN;
BEGIN
  PERFORM pg_temp.chk('la otra tienda no ve métodos ajenos',
    (SELECT count(*)::text FROM payment_methods), '0');

  -- Tampoco puede borrarlos: si RLS fallara, este DELETE se llevaría
  -- los tres métodos de la otra tienda sin error alguno.
  DELETE FROM payment_methods;
  PERFORM pg_temp.chk('un DELETE suyo no toca los ajenos',
    (SELECT count(*)::text FROM payment_methods), '0');
END $$;

RESET ROLE;
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE authenticated;

DO $$ BEGIN
  PERFORM pg_temp.chk('los tres métodos siguen ahí',
    (SELECT count(*)::text FROM payment_methods), '3');
END $$;

RESET ROLE;

-- ---- el arreglo del registro -------------------------------------
DO $$
DECLARE nuevo UUID := 'dddddddd-0000-0000-0000-000000000004';
BEGIN
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES (nuevo, 'prueba@tienda.com',
          '{"full_name":"  Ana Prueba  ","business_name":"  Variedades Ana  "}'::jsonb);

  PERFORM pg_temp.chk('al registrarse guarda el nombre del negocio',
    (SELECT business_name FROM profiles WHERE id = nuevo), 'Variedades Ana');
  PERFORM pg_temp.chk('y recorta los espacios',
    (SELECT full_name FROM profiles WHERE id = nuevo), 'Ana Prueba');
  PERFORM pg_temp.chk('con sus 3 días de prueba',
    (SELECT (trial_ends_at > NOW() + INTERVAL '2 days')::text FROM profiles WHERE id = nuevo), 'true');

  -- Un negocio vacío no debe guardarse como cadena en blanco.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
  VALUES ('eeeeeeee-0000-0000-0000-000000000005', 'sinnegocio@tienda.com',
          '{"full_name":"Sin Negocio","business_name":"   "}'::jsonb);
  PERFORM pg_temp.chk('un negocio en blanco queda nulo',
    (SELECT COALESCE(business_name,'<NULO>') FROM profiles
      WHERE id = 'eeeeeeee-0000-0000-0000-000000000005'), '<NULO>');
END $$;

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '=== TODO PASÓ ==='; END $$;
