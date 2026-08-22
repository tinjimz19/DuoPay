-- ============================================================
-- Pruebas de integridad de abonos y papelera
--
-- Verifican el comportamiento que instala
-- supabase/patch-01-integridad-abonos.sql. Se corren contra una base de
-- PRUEBA, nunca contra producción: crean y borran ventas y abonos.
--
--   createdb duopay_test
--   psql -d duopay_test -f supabase/schema.sql          # o el base mínimo
--   psql -d duopay_test -f supabase/patch-01-integridad-abonos.sql
--   psql -d duopay_test -f supabase/tests/integridad-abonos.test.sql
--
-- Si algo falla, el script aborta con el escenario que se rompió.
-- Requiere un cliente con id 11111111-1111-1111-1111-111111111111.
-- ============================================================

\set ON_ERROR_STOP on
\pset pager off
CREATE OR REPLACE FUNCTION chk(label TEXT, got TEXT, want TEXT) RETURNS VOID AS $$
BEGIN
  IF got IS DISTINCT FROM want THEN
    RAISE EXCEPTION 'FALLO [%]: obtuve "%", esperaba "%"', label, got, want;
  END IF;
  RAISE NOTICE 'ok  %  -> %', label, got;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sale_state(p UUID) RETURNS TEXT AS $$
  SELECT amount_paid::text || ' / ' || status::text FROM public.sales WHERE id = p;
$$ LANGUAGE sql;

DO $$
DECLARE
  u  UUID := 'aaaaaaaa-0000-0000-0000-000000000001';
  u2 UUID := 'bbbbbbbb-0000-0000-0000-000000000002';
  c  UUID := '11111111-1111-1111-1111-111111111111';
  s  UUID;
  s_directa UUID;
  s_cascada UUID;
  p1 UUID; p2 UUID;
  ok BOOLEAN;
BEGIN
  -- ============ 1. ciclo normal de abonos ============
  INSERT INTO sales (user_id, client_id, item_description, total_amount, installments_count)
  VALUES (u, c, 'Perfume', 100, 2) RETURNING id INTO s;
  PERFORM chk('venta nueva', sale_state(s), '0.00 / PENDING');

  INSERT INTO payments (user_id, sale_id, amount, payment_number) VALUES (u, s, 50, 1) RETURNING id INTO p1;
  PERFORM chk('primer abono 50', sale_state(s), '50.00 / PARTIAL');

  INSERT INTO payments (user_id, sale_id, amount, payment_number) VALUES (u, s, 50, 2) RETURNING id INTO p2;
  PERFORM chk('segundo abono 50 salda', sale_state(s), '100.00 / COMPLETED');

  -- ============ 2. corregir un abono mal tecleado ============
  UPDATE payments SET amount = 30 WHERE id = p1;
  PERFORM chk('corrijo 50->30, vuelve a PARTIAL', sale_state(s), '80.00 / PARTIAL');

  -- ============ 3. borrar y restaurar un abono suelto ============
  UPDATE payments SET deleted_at = NOW(), deleted_via = NULL WHERE id = p2;
  PERFORM chk('borro abono suelto', sale_state(s), '30.00 / PARTIAL');
  UPDATE payments SET deleted_at = NULL WHERE id = p2;
  PERFORM chk('restauro abono suelto', sale_state(s), '80.00 / PARTIAL');

  -- ============ 4. deleteSale: cifras congeladas ============
  UPDATE sales SET deleted_at = NOW() WHERE id = s;
  UPDATE payments SET deleted_at = NOW(), deleted_via = 'sale'
    WHERE sale_id = s AND deleted_at IS NULL;
  PERFORM chk('venta en papelera conserva sus cifras', sale_state(s), '80.00 / PARTIAL');

  -- ============ 5. restoreSale ============
  UPDATE payments SET deleted_at = NULL, deleted_via = NULL
    WHERE sale_id = s AND deleted_via = 'sale';
  UPDATE sales SET deleted_at = NULL, deleted_via = NULL WHERE id = s;
  PERFORM chk('venta restaurada recupera sus abonos', sale_state(s), '80.00 / PARTIAL');

  -- ============ 6. un abono borrado a mano NO revive con la venta ============
  UPDATE payments SET deleted_at = NOW(), deleted_via = NULL WHERE id = p2;  -- borrado directo
  UPDATE sales SET deleted_at = NOW() WHERE id = s;
  UPDATE payments SET deleted_at = NOW(), deleted_via = 'sale'
    WHERE sale_id = s AND deleted_at IS NULL;
  UPDATE payments SET deleted_at = NULL, deleted_via = NULL
    WHERE sale_id = s AND deleted_via = 'sale';
  UPDATE sales SET deleted_at = NULL, deleted_via = NULL WHERE id = s;
  PERFORM chk('el abono borrado a mano sigue borrado', sale_state(s), '30.00 / PARTIAL');

  -- ============ 7. cascada de cliente: solo revive lo que ella arrastró ==
  INSERT INTO sales (user_id, client_id, item_description, total_amount)
    VALUES (u, c, 'Borrada aparte hace meses', 40) RETURNING id INTO s_directa;
  INSERT INTO sales (user_id, client_id, item_description, total_amount)
    VALUES (u, c, 'Viva al borrar el cliente', 60) RETURNING id INTO s_cascada;

  UPDATE sales SET deleted_at = NOW(), deleted_via = NULL WHERE id = s_directa;

  -- deleteClient
  UPDATE sales SET deleted_at = NOW(), deleted_via = 'client'
    WHERE client_id = c AND deleted_at IS NULL;
  UPDATE clients SET deleted_at = NOW() WHERE id = c;

  -- restoreClient
  UPDATE payments SET deleted_at = NULL, deleted_via = NULL
    WHERE sale_id IN (SELECT id FROM sales WHERE client_id = c AND deleted_via = 'client')
      AND deleted_via = 'client';
  UPDATE sales SET deleted_at = NULL, deleted_via = NULL
    WHERE client_id = c AND deleted_via = 'client';
  UPDATE clients SET deleted_at = NULL WHERE id = c;

  PERFORM chk('la venta borrada aparte NO revivió',
    (SELECT (deleted_at IS NOT NULL)::text FROM sales WHERE id = s_directa), 'true');
  PERFORM chk('la venta de la cascada SÍ revivió',
    (SELECT (deleted_at IS NULL)::text FROM sales WHERE id = s_cascada), 'true');
  PERFORM chk('la venta con abonos volvió cuadrada', sale_state(s), '30.00 / PARTIAL');

  -- ============ 8. un abono no puede apuntar a la venta de otro ============
  BEGIN
    INSERT INTO payments (user_id, sale_id, amount) VALUES (u2, s, 10);
    ok := false;
  EXCEPTION WHEN OTHERS THEN
    ok := true;
  END;
  PERFORM chk('abono contra venta ajena rechazado', ok::text, 'true');

  -- ============ 9. varios abonos a la vez suman bien ============
  INSERT INTO payments (user_id, sale_id, amount, payment_number)
  SELECT u, s, 10, 10 + g FROM generate_series(1,5) g;
  PERFORM chk('5 abonos de 10 en un golpe', sale_state(s), '80.00 / PARTIAL');

  -- ============ 10. sobrepasar el total lo marca saldado, no negativo ====
  INSERT INTO payments (user_id, sale_id, amount, payment_number) VALUES (u, s, 20, 99);
  PERFORM chk('completa exacto', sale_state(s), '100.00 / COMPLETED');

  RAISE NOTICE '=== TODOS LOS ESCENARIOS PASARON ===';
END $$;
