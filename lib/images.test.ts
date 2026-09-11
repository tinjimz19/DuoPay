/**
 * Pruebas de las fotos de los pedidos.
 *
 *   npx tsx lib/images.test.ts
 *
 * Lo que se comprueba aquí no es cosmético: la primera carpeta de la ruta
 * es lo que la política del depósito compara contra quien sube. Si esa
 * parte se rompe, o no se puede subir nada, o se sube donde no debe.
 */
import {
  BUCKET_DE_PEDIDOS,
  CALIDAD,
  LADO_MAXIMO,
  MAXIMO_BYTES,
  esImagenPermitida,
  extensionDeTipo,
  revisarFoto,
  rutaDeFotoDePedido,
} from "@/lib/images";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  if (actual !== expected) {
    throw new Error(
      `${label}\n  esperado: ${JSON.stringify(expected)}\n  recibido: ${JSON.stringify(actual)}`
    );
  }
}

const TIENDA = "8f1c3d9a-0b2e-4d6f-9a1b-2c3d4e5f6a7b";
const PEDIDO = "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d";

// --- la ruta: la primera carpeta ES la seguridad ----------------------
eq(
  rutaDeFotoDePedido(TIENDA, PEDIDO, "jpg", 1700000000000),
  `${TIENDA}/${PEDIDO}-1700000000000.jpg`,
  "la ruta completa"
);
eq(
  rutaDeFotoDePedido(TIENDA, PEDIDO, "jpg", 1700000000000).split("/")[0],
  TIENDA,
  "la primera carpeta tiene que ser la tienda: es lo que compara la política"
);
eq(
  rutaDeFotoDePedido(TIENDA, PEDIDO, "png", 1).endsWith(".png"),
  true,
  "respeta la extensión"
);

// Reemplazar una foto tiene que dar un nombre DISTINTO. Si se reusara, la
// foto vieja seguiría viéndose por la caché y parecería no guardada.
eq(
  rutaDeFotoDePedido(TIENDA, PEDIDO, "jpg", 1000) ===
    rutaDeFotoDePedido(TIENDA, PEDIDO, "jpg", 2000),
  false,
  "dos subidas del mismo pedido no comparten nombre"
);

// --- nada raro se cuela en la extensión -------------------------------
eq(rutaDeFotoDePedido(TIENDA, PEDIDO, "../../etc", 1), `${TIENDA}/${PEDIDO}-1.etc`,
   "una extensión con barras no sale de la carpeta");
eq(rutaDeFotoDePedido(TIENDA, PEDIDO, "", 1), `${TIENDA}/${PEDIDO}-1.jpg`,
   "sin extensión, jpg");
eq(rutaDeFotoDePedido(TIENDA, PEDIDO, "JPEG", 1), `${TIENDA}/${PEDIDO}-1.jpeg`,
   "la extensión va en minúsculas");

// --- el tipo del archivo ---------------------------------------------
eq(esImagenPermitida("image/jpeg"), true, "jpeg sí");
eq(esImagenPermitida("image/png"), true, "png sí");
eq(esImagenPermitida("image/webp"), true, "webp sí");
eq(esImagenPermitida("IMAGE/JPEG"), true, "no importan las mayúsculas");
eq(esImagenPermitida("image/heic"), false, "heic no: el depósito lo rechaza");
eq(esImagenPermitida("application/pdf"), false, "un pdf no es una foto");
eq(esImagenPermitida(""), false, "vacío no");
eq(esImagenPermitida(null), false, "null no");
eq(esImagenPermitida(undefined), false, "undefined no");

eq(extensionDeTipo("image/png"), "png", "png");
eq(extensionDeTipo("image/webp"), "webp", "webp");
eq(extensionDeTipo("image/jpeg"), "jpg", "jpeg pasa a jpg");
eq(extensionDeTipo("lo que sea"), "jpg", "lo desconocido cae en jpg");

// --- el aviso antes de subir -----------------------------------------
eq(revisarFoto({ tipo: "image/jpeg", bytes: 150_000 }), null, "una foto normal pasa");
eq(revisarFoto({ tipo: "image/jpeg", bytes: MAXIMO_BYTES }), null, "justo en el tope pasa");
eq(
  revisarFoto({ tipo: "image/jpeg", bytes: MAXIMO_BYTES + 1 }),
  "La foto no debe pasar de 5 MB.",
  "un byte de más ya no"
);
eq(
  revisarFoto({ tipo: "image/heic", bytes: 100 }),
  "Esa foto tiene que ser JPG, PNG o WEBP.",
  "tipo no permitido"
);
eq(revisarFoto({ tipo: "image/jpeg", bytes: 0 }), "Esa foto está vacía.", "cero bytes");
eq(revisarFoto({ tipo: "image/jpeg", bytes: NaN }), "Esa foto está vacía.", "NaN");

// El orden importa: un archivo enorme Y de tipo prohibido tiene que
// quejarse primero del tipo, que es lo que el dueño puede arreglar.
eq(
  revisarFoto({ tipo: "application/pdf", bytes: MAXIMO_BYTES * 3 }),
  "Esa foto tiene que ser JPG, PNG o WEBP.",
  "primero el tipo, después el peso"
);

// --- los números que las dos aplicaciones tienen que compartir --------
eq(BUCKET_DE_PEDIDOS, "pedidos", "el nombre del depósito");
eq(LADO_MAXIMO, 1280, "el lado largo");
eq(CALIDAD, 0.7, "la calidad");
eq(MAXIMO_BYTES, 5242880, "el mismo tope que declara la base: 5 MB");

console.log(`images.ts — ${checks} comprobaciones, todas en verde.`);
