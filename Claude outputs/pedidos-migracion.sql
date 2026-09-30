-- =====================================================================
-- DuoPay · PEDIDOS: foto de referencia y conversión en venta
-- =====================================================================
--
-- Cómo se corre: Supabase -> SQL Editor -> pegar todo -> Run.
--
-- Se puede correr DOS VECES sin romper nada: cada pieza comprueba antes
-- si ya existe. Eso importa porque una migración que solo se puede
-- correr una vez es una migración que da miedo correr.
--
-- Qué hace, en orden:
--   1. Le agrega a `preorders` la foto y el vínculo con la venta.
--   2. Crea el depósito privado de fotos, con las mismas reglas de
--      carpeta por tienda que ya usan las capturas de pago.
--   3. Crea la función que convierte un pedido en venta.
--
-- =====================================================================


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
