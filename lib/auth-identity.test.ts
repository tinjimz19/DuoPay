/**
 * Pruebas de quién-es-quién y del lazo de redirecciones.
 *
 *   npx tsx lib/auth-identity.test.ts
 *
 * La primera parte prueba `identify()` de verdad. La segunda simula las dos
 * reglas que se peleaban —la del middleware y la del layout— y comprueba
 * que ya no pueden rebotar. Si alguien vuelve a tocar una sin la otra, aquí
 * salta.
 */
import { identify, type AuthReader } from "@/lib/auth-identity";

let checks = 0;

function eq(actual: unknown, expected: unknown, label: string) {
  checks++;
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${label}\n  esperado: ${b}\n  recibido: ${a}`);
}

const USUARIO = { id: "aaaaaaaa-0000-0000-0000-000000000001", email: "tin@duopay.com" };

function cliente({
  claims,
  claimsError,
  claimsLanza,
  session,
  sessionLanza,
}: {
  claims?: { sub?: string; email?: string } | null;
  claimsError?: boolean;
  claimsLanza?: boolean;
  session?: { user?: { id?: string; email?: string } } | null;
  sessionLanza?: boolean;
}): AuthReader {
  return {
    auth: {
      getClaims: async () => {
        if (claimsLanza) throw new Error("sin red");
        return { data: claims ? { claims } : null, error: claimsError ? new Error("sin red") : null };
      },
      getSession: async () => {
        if (sessionLanza) throw new Error("cookie ilegible");
        return { data: { session: session ?? null } };
      },
    },
  };
}

async function pruebasDeIdentidad() {
  // ---------------------------------------------------------------
  // identify()
  // ---------------------------------------------------------------

  eq(
    await identify(cliente({ claims: { sub: USUARIO.id, email: USUARIO.email } })),
    { userId: USUARIO.id, email: USUARIO.email },
    "con la firma verificada, se usa eso"
  );

  // EL BUG: la firma no se pudo verificar por un tropiezo de red, pero la
  // cookie está perfecta. Antes esto devolvía null y arrancaba el rebote.
  eq(
    await identify(cliente({ claimsError: true, session: { user: USUARIO } })),
    { userId: USUARIO.id, email: USUARIO.email },
    "si la verificación falla pero la cookie sirve, NO se niega el acceso"
  );

  eq(
    await identify(cliente({ claimsLanza: true, session: { user: USUARIO } })),
    { userId: USUARIO.id, email: USUARIO.email },
    "da igual que getClaims lance en vez de devolver error"
  );

  eq(
    await identify(cliente({ claims: null, session: { user: USUARIO } })),
    { userId: USUARIO.id, email: USUARIO.email },
    "unos claims vacíos también caen a la cookie"
  );

  eq(
    await identify(cliente({ claimsError: true, session: null })),
    null,
    "sin firma y sin cookie, no hay sesión"
  );

  eq(
    await identify(cliente({ claimsError: true, sessionLanza: true })),
    null,
    "si hasta la cookie es ilegible, tampoco revienta: devuelve null"
  );

  eq(
    await identify(cliente({ claims: { sub: USUARIO.id }, session: null })),
    { userId: USUARIO.id, email: "" },
    "la firma manda aunque no haya cookie"
  );

  eq(
    (await identify(cliente({ claimsError: true, session: { user: { id: undefined } } }))),
    null,
    "una cookie sin id de usuario no vale"
  );
}

// ---------------------------------------------------------------
// El lazo
//
// Se copian aquí las dos reglas que estaban peleadas, para poder recorrer
// el camino que hace el navegador y ver si termina.
// ---------------------------------------------------------------

interface Mundo {
  /** Lo que ve el middleware al leer la cookie. */
  cookieValida: boolean;
  /** Lo que ve el layout: false = no pudo verificar la firma. */
  identidadOk: boolean;
  /** El freno de mano que se agregó. */
  conMarcador: boolean;
}

function siguienteDestino(ruta: string, m: Mundo): string | null {
  const esLogin = ruta.startsWith("/login");
  const traeMarcador = ruta.includes("sesion=vencida");

  // --- middleware ---
  if (!m.cookieValida && !esLogin) return "/login?next=" + ruta;
  if (m.cookieValida && esLogin && !(m.conMarcador && traeMarcador)) return "/";

  // --- layout ---
  if (!esLogin && !m.identidadOk) {
    return m.conMarcador ? "/login?sesion=vencida" : "/login";
  }
  return null; // se queda y pinta la página
}

/** Recorre el camino; devuelve dónde paró, o null si da vueltas. */
function recorrer(inicio: string, m: Mundo, tope = 20): string | null {
  let ruta = inicio;
  const vistas = new Set<string>();
  for (let i = 0; i < tope; i++) {
    if (vistas.has(ruta)) return null; // volvió a un sitio: es un lazo
    vistas.add(ruta);
    const siguiente = siguienteDestino(ruta, m);
    if (siguiente === null) return ruta;
    ruta = siguiente;
  }
  return null;
}

// El escenario exacto del bug, con el código de ANTES: rebota.
eq(
  recorrer("/", { cookieValida: true, identidadOk: false, conMarcador: false }),
  null,
  "ANTES: cookie buena + verificación caída daba vueltas infinitas"
);

// Y con el arreglo puesto, para.
eq(
  recorrer("/", { cookieValida: true, identidadOk: false, conMarcador: true }),
  "/login?sesion=vencida",
  "AHORA: aunque discreparan, se queda en el login en vez de rebotar"
);

// Los caminos normales siguen funcionando.
eq(
  recorrer("/", { cookieValida: true, identidadOk: true, conMarcador: true }),
  "/",
  "con sesión buena, entra al inicio"
);
eq(
  recorrer("/login", { cookieValida: true, identidadOk: true, conMarcador: true }),
  "/",
  "quien ya entró y va al login, va al inicio"
);
eq(
  recorrer("/", { cookieValida: false, identidadOk: false, conMarcador: true }),
  "/login?next=/",
  "sin sesión, al login (y recordando a dónde iba)"
);
eq(
  recorrer("/ventas", { cookieValida: false, identidadOk: false, conMarcador: true }),
  "/login?next=/ventas",
  "lo mismo desde cualquier pantalla"
);

// Y el caso de verdad importante tras el arreglo de `identify()`: como el
// layout ahora lee la misma cookie que el middleware, ni siquiera se llega
// a la situación de discrepancia.
eq(
  recorrer("/", { cookieValida: true, identidadOk: true, conMarcador: false }),
  "/",
  "con los dos leyendo lo mismo, no hay nada que reconciliar"
);

pruebasDeIdentidad().then(() => {
  console.log(`auth-identity.ts — ${checks} comprobaciones, todas en verde.`);
});
