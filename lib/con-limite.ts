/**
 * Un tope de tiempo para cualquier promesa.
 *
 * POR QUÉ EXISTE
 *
 * `getSession()` de Supabase, cuando el token venció y el refresco falla,
 * REINTENTA con esperas crecientes. Medido con la red caída: **8 intentos y
 * 25,4 segundos**. En el middleware de Vercel eso no termina en error, sino
 * en `MIDDLEWARE_INVOCATION_TIMEOUT` — la pantalla de 504 que salía. Y como
 * los tokens vencen cada hora, le tocaba a todo el mundo, seguido.
 *
 * Configurar `autoRefreshToken: false` NO lo evita: se midió y da los mismos
 * 8 intentos. La única defensa es cortar por fuera.
 *
 * El trabajo cortado puede seguir corriendo en segundo plano; da igual, lo
 * que importa es que nadie se quede esperándolo.
 */
export async function conLimite<T>(
  promesa: Promise<T>,
  ms: number,
  siSePasa: T
): Promise<T> {
  let reloj: ReturnType<typeof setTimeout> | undefined;

  const alarma = new Promise<T>((resolve) => {
    reloj = setTimeout(() => resolve(siSePasa), ms);
  });

  try {
    // Si la promesa revienta, tampoco debe tumbar a quien llama: para eso
    // está el valor por defecto.
    return await Promise.race([promesa.catch(() => siSePasa), alarma]);
  } finally {
    if (reloj) clearTimeout(reloj);
  }
}

/** Lo que se le da al middleware: tiene que responder ya. */
export const LIMITE_MIDDLEWARE_MS = 1500;

/**
 * El render tiene algo más de aire, pero tampoco puede colgarse: son dos
 * llamadas seguidas, así que el peor caso de `identify()` son 4 s. Con más
 * margen se acercaría al límite de la función y volveríamos a un 504, solo
 * que en otra pantalla.
 */
export const LIMITE_RENDER_MS = 2000;
