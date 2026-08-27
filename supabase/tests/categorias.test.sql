-- ============================================================
-- Pruebas de las categorías administrables (parche 05)
--
-- Contra una base de PRUEBA, nunca producción.
-- Se corren con el rol `authenticated` y un JWT simulado, para que RLS
-- aplique igual que en la app. Como superusuario RLS no aplica y los
-- fallos reales no aparecen.
--
--   psql -d duopay_test -f supabase/tests/categorias.test.sql
--
-- Requiere los usuarios aaaaaaaa-...-0001 (tienda) y
-- ffffffff-...-0009 (super admin), y ventas ya cargadas.
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

-- El super admin de prueba.
INSERT INTO auth.users (id, email, raw_user_meta_data)
VALUES ('ffffffff-0000-0000-0000-000000000009', 'admin@duopay.com', '{"full_name":"Super Admin"}'::jsonb)
ON CONFLICT (id) DO NOTHING;
UPDATE public.profiles SET role = 'super_admin', status = 'ACTIVE'
WHERE id = 'ffffffff-0000-0000-0000-000000000009';

-- ============================================================
-- UNA TIENDA: lee el catálogo, no lo toca
-- ============================================================
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE authenticated;

DO $$
DECLARE ok BOOLEAN; n INT;
BEGIN
  SELECT count(*) INTO n FROM categories;
  PERFORM pg_temp.chk('la tienda ve las 4 categorías sembradas', n::text, '4');

  BEGIN
    INSERT INTO categories (slug, label) VALUES ('PIRATA', 'Pirata');
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE; END;
  PERFORM pg_temp.chk('una tienda NO puede crear categorías', ok::text, 'false');

  BEGIN
    UPDATE categories SET label = 'Robada' WHERE slug = 'ROPA';
    ok := (SELECT label FROM categories WHERE slug = 'ROPA') = 'Robada';
  EXCEPTION WHEN OTHERS THEN ok := FALSE; END;
  PERFORM pg_temp.chk('una tienda NO puede renombrarlas', ok::text, 'false');

  BEGIN
    DELETE FROM categories WHERE slug = 'OTRO';
  EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM pg_temp.chk('una tienda NO puede borrarlas',
    (SELECT count(*)::text FROM categories), '4');

  -- Y no puede inventarse una categoría al vender.
  BEGIN
    INSERT INTO sales (user_id, client_id, item_description, category,
                       total_amount, installments_count, first_charge_date)
    VALUES ('aaaaaaaa-0000-0000-0000-000000000001',
            '11111111-1111-4111-8111-111111111111',
            'Algo raro', 'INVENTADA', 50, 2, '2026-09-01');
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE; END;
  PERFORM pg_temp.chk('vender con una categoría inexistente falla', ok::text, 'false');

  -- El conteo de uso es solo del super admin.
  BEGIN
    PERFORM public.category_usage();
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE; END;
  PERFORM pg_temp.chk('la tienda no puede contar el uso global', ok::text, 'false');
END $$;

-- ============================================================
-- EL SUPER ADMIN: administra el catálogo
-- ============================================================
RESET ROLE;
SET request.jwt.claim.sub = 'ffffffff-0000-0000-0000-000000000009';
SET ROLE authenticated;

DO $$
DECLARE ok BOOLEAN;
BEGIN
  INSERT INTO categories (slug, label, color, sort_order)
    VALUES ('REPUESTOS', 'Repuestos', 'amber', 4);
  PERFORM pg_temp.chk('el super admin agrega una categoría',
    (SELECT label FROM categories WHERE slug = 'REPUESTOS'), 'Repuestos');

  UPDATE categories SET label = 'Repuestos y motos' WHERE slug = 'REPUESTOS';
  PERFORM pg_temp.chk('y le corrige el nombre',
    (SELECT label FROM categories WHERE slug = 'REPUESTOS'), 'Repuestos y motos');

  UPDATE categories SET is_active = FALSE WHERE slug = 'REPUESTOS';
  PERFORM pg_temp.chk('y la puede apagar',
    (SELECT is_active::text FROM categories WHERE slug = 'REPUESTOS'), 'false');

  -- Una sin usar sí se borra.
  DELETE FROM categories WHERE slug = 'REPUESTOS';
  PERFORM pg_temp.chk('una categoría sin uso se borra',
    (SELECT count(*)::text FROM categories WHERE slug = 'REPUESTOS'), '0');

  -- Una en uso NO: la clave foránea protege el historial.
  BEGIN
    DELETE FROM categories WHERE slug = 'PERFUME';
    ok := TRUE;
  EXCEPTION WHEN foreign_key_violation THEN ok := FALSE; END;
  PERFORM pg_temp.chk('una categoría con ventas NO se puede borrar', ok::text, 'false');

  -- El formato del slug está bajo llave.
  BEGIN
    INSERT INTO categories (slug, label) VALUES ('con minúsculas', 'Mala');
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE; END;
  PERFORM pg_temp.chk('un slug mal formado se rechaza', ok::text, 'false');

  BEGIN
    INSERT INTO categories (slug, label) VALUES ('VACIA', ' ');
    ok := TRUE;
  EXCEPTION WHEN OTHERS THEN ok := FALSE; END;
  PERFORM pg_temp.chk('un nombre en blanco se rechaza', ok::text, 'false');
END $$;

-- ---- el conteo de uso ------------------------------------------
DO $$
DECLARE v BIGINT; p BIGINT;
BEGIN
  SELECT ventas INTO v FROM public.category_usage() WHERE slug = 'PERFUME';
  PERFORM pg_temp.chk('cuenta la venta de perfume', v::text, '1');
  SELECT productos INTO p FROM public.category_usage() WHERE slug = 'ROPA';
  PERFORM pg_temp.chk('cuenta el producto de ropa', p::text, '1');
  SELECT ventas INTO v FROM public.category_usage() WHERE slug = 'OTRO';
  PERFORM pg_temp.chk('y las que nadie usa dan cero', v::text, '0');
END $$;

-- ---- renombrar el slug arrastra el historial --------------------
DO $$ BEGIN
  UPDATE categories SET slug = 'CALZADOS' WHERE slug = 'CALZADO';
  PERFORM pg_temp.chk('al cambiar el slug, la venta lo sigue',
    (SELECT category FROM sales WHERE item_description = 'Zapatos'), 'CALZADOS');
  UPDATE categories SET slug = 'CALZADO' WHERE slug = 'CALZADOS';
END $$;

RESET ROLE;

DO $$ BEGIN RAISE NOTICE ''; RAISE NOTICE '=== TODO PASÓ ==='; END $$;
