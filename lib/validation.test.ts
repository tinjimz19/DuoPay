/**
 * Pruebas de los validadores compartidos.
 *
 *   npx tsx lib/validation.test.ts
 *
 * Cubren el bug del "input invalid": un <select> sin selección manda "" y
 * z.string().uuid() lo rechazaba antes de que la acción pudiera pasarlo a
 * null. Los UUID de ejemplo salieron de gen_random_uuid() de verdad — uno
 * inventado como 1111-1111... no cumple el RFC y falla por otra razón.
 */
import { z } from "zod";
import { optionalUuid, newClientSchema } from "@/lib/validation";

let fails = 0;
const eq = (l: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.log(`FALLO ${l}: ${JSON.stringify(got)} != ${JSON.stringify(want)}`); }
  else console.log(`ok   ${l} -> ${JSON.stringify(got)}`);
};

// El caso exacto que producía "input invalid"
const esquema = z.object({
  clientId: optionalUuid,
  newClient: newClientSchema.optional().nullable(),
});

console.log("--- el bug: cliente no registrado manda \"\" ---");
let r = esquema.safeParse({ clientId: "" });
eq('clientId "" ahora pasa y queda en null', r.success ? r.data.clientId : `ERROR: ${r.error.issues[0].message}`, null);
r = esquema.safeParse({ clientId: undefined });
eq("sin clientId", r.success ? r.data.clientId : "ERROR", null);
r = esquema.safeParse({ clientId: null });
eq("clientId null", r.success ? r.data.clientId : "ERROR", null);
r = esquema.safeParse({ clientId: "b29633db-d029-41cb-a970-2525ce4e06c8" });
eq("uuid real de Postgres #1", r.success ? r.data.clientId : `ERROR: ${r.error.issues[0].message}`, "b29633db-d029-41cb-a970-2525ce4e06c8");
r = esquema.safeParse({ clientId: "fb65656f-8b18-4951-93a1-657c63eebe5a" });
eq("uuid real de Postgres #2", r.success ? r.data.clientId : `ERROR: ${r.error.issues[0].message}`, "fb65656f-8b18-4951-93a1-657c63eebe5a");
r = esquema.safeParse({ clientId: "d4e3e166-652a-4e44-8fb4-94e5a6412bad" });
eq("uuid real de Postgres #3", r.success ? r.data.clientId : `ERROR: ${r.error.issues[0].message}`, "d4e3e166-652a-4e44-8fb4-94e5a6412bad");
r = esquema.safeParse({ clientId: "pepito" });
eq("basura se sigue rechazando", r.success ? "PASÓ (mal)" : r.error.issues[0].message, "Selección de cliente inválida");

console.log("\n--- alta de cliente: nombre Y teléfono ---");
const cn = (v: unknown) => { const x = newClientSchema.safeParse(v); return x.success ? "ok" : x.error.issues[0].message; };
eq("completo", cn({ name: "Ana Rodríguez", phone: "04141234567" }), "ok");
eq("sin teléfono", cn({ name: "Ana Rodríguez", phone: "" }), "El teléfono del cliente es obligatorio");
eq("teléfono muy corto", cn({ name: "Ana", phone: "0414" }), "El teléfono del cliente es obligatorio");
eq("sin nombre", cn({ name: "A", phone: "04141234567" }), "Escribe el nombre del cliente");
eq("recorta espacios", newClientSchema.parse({ name: "  Ana  ", phone: " 0414123 4567 " }).name, "Ana");

console.log(fails === 0 ? "\n=== TODO PASÓ ===" : `\n=== ${fails} FALLOS ===`);
if (fails) throw new Error("fallos");
