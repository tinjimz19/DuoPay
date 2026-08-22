-- ============================================================
-- Pruebas del inventario (parche 03)
--
-- Contra una base de PRUEBA, nunca producción: crea productos y ventas.
-- Se corren con el rol `authenticated` y un JWT simulado, para que RLS
-- aplique igual que en la app. Como superusuario RLS no aplica y los
-- fallos reales no aparecen.
--
--   psql -d duopay_test -f supabase/tests/inventario.test.sql
--
-- Requiere un cliente 11111111-1111-1111-1111-111111111111 del usuario
-- aaaaaaaa-0000-0000-0000-000000000001.
-- ============================================================

\set ON_ERROR_STOP on
\pset pager off
SET request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
SET ROLE authenticated;

CREATE OR REPLACE FUNCTION pg_temp.chk(label TEXT, got TEXT, want TEXT) RETURNS VOID AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FALLO [%]: obtuve "%", esperaba "%"', label, got, want;
  END IF;
  RAISE NOTICE 'ok  %  -> %', label, got;
END; $$ LANGUAGE plpgsql;

DO $$
DECLARE
  u  UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  u2 UUID := 'bbbbbbbb-0000-0000-0000-000000000002';
  c  UUID := '11111111-1111-1111-1111-111111111111';
  camisa UUID; perfume UUID; venta UUID;
  ok BOOLEAN;
  st  TEXT;
BEGIN
  INSERT INTO products (user_id, name, category) VALUES (u, 'Camisas', 'ROPA') RETURNING id INTO camisa;
  INSERT INTO products (user_id, name, category) VALUES (u, 'Perfume CH', 'PERFUME') RETURNING id INTO perfume;
  PERFORM pg_temp.chk('producto nuevo arranca en 0', (SELECT stock::text FROM products WHERE id=camisa), '0');

  -- entradas
  INSERT INTO stock_movements (user_id, product_id, kind, quantity) VALUES (u, camisa, 'ENTRADA', 12);
  PERFORM pg_temp.chk('entrada de 12', (SELECT stock::text FROM products WHERE id=camisa), '12');
  INSERT INTO stock_movements (user_id, product_id, kind, quantity) VALUES (u, camisa, 'ENTRADA', 3);
  PERFORM pg_temp.chk('otra entrada de 3', (SELECT stock::text FROM products WHERE id=camisa), '15');

  -- salida por daño
  INSERT INTO stock_movements (user_id, product_id, kind, quantity, notes) VALUES (u, camisa, 'SALIDA', -1, 'se manchó');
  PERFORM pg_temp.chk('salida de 1', (SELECT stock::text FROM products WHERE id=camisa), '14');

  -- ajuste: conté y eran 10
  INSERT INTO stock_movements (user_id, product_id, kind, quantity, notes)
    VALUES (u, camisa, 'AJUSTE', 10 - (SELECT stock FROM products WHERE id=camisa), 'conteo físico');
  PERFORM pg_temp.chk('corregido a 10', (SELECT stock::text FROM products WHERE id=camisa), '10');

  -- venta de 2 camisas + 1 perfume
  INSERT INTO stock_movements (user_id, product_id, kind, quantity) VALUES (u, perfume, 'ENTRADA', 5);
  INSERT INTO sales (user_id, client_id, item_description, total_amount, installments_count, first_charge_date)
    VALUES (u, c, '2 Camisas + 1 Perfume CH', 80, 2, '2026-09-01') RETURNING id INTO venta;
  INSERT INTO stock_movements (user_id, product_id, sale_id, kind, quantity) VALUES
    (u, camisa, venta, 'VENTA', -2),
    (u, perfume, venta, 'VENTA', -1);
  PERFORM pg_temp.chk('la venta descontó camisas', (SELECT stock::text FROM products WHERE id=camisa), '8');
  PERFORM pg_temp.chk('la venta descontó perfume', (SELECT stock::text FROM products WHERE id=perfume), '4');

  -- borrar la venta devuelve el stock
  UPDATE sales SET deleted_at = NOW() WHERE id = venta;
  UPDATE stock_movements SET deleted_at = NOW(), deleted_via = 'sale'
    WHERE sale_id = venta AND deleted_at IS NULL;
  PERFORM pg_temp.chk('borrar la venta devuelve camisas', (SELECT stock::text FROM products WHERE id=camisa), '10');
  PERFORM pg_temp.chk('borrar la venta devuelve perfume', (SELECT stock::text FROM products WHERE id=perfume), '5');

  -- restaurarla lo vuelve a descontar
  UPDATE stock_movements SET deleted_at = NULL, deleted_via = NULL
    WHERE sale_id = venta AND deleted_via = 'sale';
  UPDATE sales SET deleted_at = NULL WHERE id = venta;
  PERFORM pg_temp.chk('restaurar la venta descuenta otra vez', (SELECT stock::text FROM products WHERE id=camisa), '8');

  -- producto en papelera: cifra congelada
  UPDATE products SET deleted_at = NOW() WHERE id = perfume;
  UPDATE stock_movements SET deleted_at = NOW(), deleted_via = 'product'
    WHERE product_id = perfume AND deleted_at IS NULL;
  PERFORM pg_temp.chk('producto en papelera conserva su cifra', (SELECT stock::text FROM products WHERE id=perfume), '4');
  UPDATE stock_movements SET deleted_at = NULL, deleted_via = NULL
    WHERE product_id = perfume AND deleted_via = 'product';
  UPDATE products SET deleted_at = NULL WHERE id = perfume;
  PERFORM pg_temp.chk('restaurar el producto recupera su stock', (SELECT stock::text FROM products WHERE id=perfume), '4');

  -- no se puede mover stock de otro usuario
  BEGIN
    INSERT INTO stock_movements (user_id, product_id, kind, quantity) VALUES (u2, camisa, 'ENTRADA', 99);
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk('movimiento contra producto ajeno rechazado', ok::text, 'true');

  -- el signo tiene que concordar con el tipo
  BEGIN
    INSERT INTO stock_movements (user_id, product_id, kind, quantity) VALUES (u, camisa, 'ENTRADA', -5);
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk('ENTRADA negativa rechazada', ok::text, 'true');
  BEGIN
    INSERT INTO stock_movements (user_id, product_id, kind, quantity) VALUES (u, camisa, 'VENTA', 5);
    ok := false;
  EXCEPTION WHEN OTHERS THEN ok := true; END;
  PERFORM pg_temp.chk('VENTA positiva rechazada', ok::text, 'true');

  -- nombre repetido en la misma tienda
  BEGIN
    INSERT INTO products (user_id, name, category) VALUES (u, '  camisas ', 'ROPA');
    ok := false;
  EXCEPTION WHEN unique_violation THEN ok := true; END;
  PERFORM pg_temp.chk('nombre duplicado (otras mayúsculas) rechazado', ok::text, 'true');

  RAISE NOTICE '=== INVENTARIO: TODO PASÓ ===';
END $$;
