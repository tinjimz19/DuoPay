/**
 * Pruebas del tope de tiempo, y del middleware con el reloj puesto.
 *
 *   npx tsx lib/con-limite.test.ts
 *
 * La segunda mitad monta el middleware DE VERDAD con la red caída y un
 * token vencido: el escenario exacto que devolvía
 * `MIDDLEWARE_INVOCATION_TIMEOUT` (504) en Vercel. Si alguien vuelve a
 * poner una llamada sin reloj en ese camino, aquí salta.
 */
import { NextRequest } from "next/server";

import { conLimite, LIMITE_MIDDLEWARE_MS } from "@/lib/con-limite";
import { updateSession } from "@/lib/supabase/middleware";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  esperado: ${b}\n  recibido: ${a}`);
}

function menorQue(valor: number, tope: number, label: string) {
  checks++;
  if (!(valor < tope)) {
    throw new Error(`${label}\n  ${valor} debería ser menor que ${tope}`);
  }
}

const espera = (ms: number, valor: string) =>
  new Promise<string>((r) => setTimeout(() => r(valor), ms));

async function pruebasDelTope() {
  eq(await conLimite(espera(5, "listo"), 200, "tarde"), "listo",
    "si contesta a tiempo, se usa su respuesta");

  eq(await conLimite(espera(300, "listo"), 50, "tarde"), "tarde",
    "si se pasa del tope, se usa el valor por defecto");

  eq(await conLimite(Promise.reject(new Error("truena")), 200, "a salvo"), "a salvo",
    "si revienta, tampoco tumba a quien llama");

  // Lo que importa de verdad: que corte, no que espere a que el otro acabe.
  const t0 = Date.now();
  await conLimite(espera(3000, "eterno"), 100, "cortado");
  menorQue(Date.now() - t0, 600, "cortar no debe esperar a que la promesa termine");

  eq(await conLimite(Promise.resolve(null), 200, "porDefecto"), null,
    "un null legítimo se respeta, no se confunde con haberse pasado");
}

// ---------------------------------------------------------------
// El middleware, con la red caída y el token vencido
// ---------------------------------------------------------------

process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-prueba";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

function cookieVencida() {
  const ahora = Math.floor(Date.now() / 1000);
  const token = [
    b64url({ alg: "HS256" }),
    b64url({ sub: "aaaaaaaa-0000-0000-0000-000000000001", exp: ahora - 60 }),
    "firma",
  ].join(".");
  const sesion = {
    access_token: token,
    refresh_token: "r",
    expires_at: ahora - 60,
    user: { id: "aaaaaaaa-0000-0000-0000-000000000001" },
  };
  return "base64-" + Buffer.from(JSON.stringify(sesion)).toString("base64");
}

const original = globalThis.fetch;

async function pedir(url: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(new URL(url), {});
  for (const [nombre, valor] of Object.entries(cookies)) {
    req.cookies.set(nombre, valor);
  }
  const t0 = Date.now();
  const res = await updateSession(req);
  return {
    ms: Date.now() - t0,
    destino: res.headers.get("location"),
  };
}

async function pruebasDelMiddleware() {
  // La red no contesta: así se disparan los reintentos de Supabase.
  globalThis.fetch = (async () => {
    throw new Error("red caída");
  }) as typeof fetch;

  const sesion = { "sb-abcdefghijklmnopqrst-auth-token": cookieVencida() };
  // El tope, más un respiro para el arranque de la librería.
  const TOPE = LIMITE_MIDDLEWARE_MS + 900;

  const inicio = await pedir("https://x/", sesion);
  eq(inicio.destino, null, "con sesión, se sigue de largo");
  menorQue(inicio.ms, TOPE, "navegar al inicio no puede colgarse (era 25.432 ms)");

  const ventas = await pedir("https://x/ventas", sesion);
  eq(ventas.destino, null, "lo mismo en cualquier pantalla");
  menorQue(ventas.ms, TOPE, "navegar a /ventas no puede colgarse");

  // Las decisiones de redirección NO tocan la red: tienen que ser instantáneas.
  const sinSesion = await pedir("https://x/ventas");
  eq(sinSesion.destino, "https://x/login?next=%2Fventas",
    "sin cookie, al login recordando a dónde iba");
  menorQue(sinSesion.ms, 200, "mandar al login se decide sin red");

  const yaEntro = await pedir("https://x/login", sesion);
  eq(yaEntro.destino, "https://x/", "quien ya entró y va al login, al inicio");
  menorQue(yaEntro.ms, 200, "esa decisión también es sin red");

  // El freno del rebote sigue puesto.
  const conMarcador = await pedir("https://x/login?sesion=vencida", sesion);
  eq(conMarcador.destino, null, "con el marcador se queda en el login");

  // La cookie del login por enlace no es una sesión.
  const soloVerifier = await pedir("https://x/ventas", {
    "sb-abcdefghijklmnopqrst-auth-token-code-verifier": "abc123",
  });
  eq(soloVerifier.destino, "https://x/login?next=%2Fventas",
    "una cookie de verificación no cuenta como sesión");

  globalThis.fetch = original;
}

pruebasDelTope()
  .then(pruebasDelMiddleware)
  .then(() => {
    console.log(`con-limite.ts — ${checks} comprobaciones, todas en verde.`);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
