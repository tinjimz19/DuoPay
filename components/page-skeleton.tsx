/**
 * Lo que se ve mientras el servidor arma la página.
 *
 * Sin esto, Next bloquea la navegación entera sin pintar nada: tocas una
 * pestaña, la pantalla se queda igual medio segundo largo y uno vuelve a
 * tocar creyendo que no registró. Un `loading.tsx` a nivel de grupo hace la
 * navegación instantánea y además vuelve útil el prefetch de `<Link>`, que
 * en rutas dinámicas precarga justo hasta este límite.
 */
export function PageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando…</span>

      <div className="space-y-2">
        <div className="h-6 w-40 animate-pulse rounded-md bg-slate-200 dark:bg-slate-800" />
        <div className="h-4 w-56 animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-800/70" />
      </div>

      <div className="h-28 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70" />

      <div className="space-y-2">
        {Array.from({ length: rows }, (_, i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl bg-slate-200/70 dark:bg-slate-800/70"
            // Un desfase mínimo para que no latan todos a la vez.
            style={{ animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
