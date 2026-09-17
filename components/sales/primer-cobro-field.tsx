"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { FirstChargeOption } from "@/lib/quincenas";

/**
 * Desde cuándo se empieza a cobrar una venta.
 *
 * Vive aparte porque lo usan el alta y la edición, y si fueran dos copias
 * terminarían ofreciendo cosas distintas: la tienda vería cuatro quincenas
 * al registrar la venta y tres al corregirla.
 *
 * LA FECHA SUELTA SOLO APARECE CON UNA CUOTA
 *
 * Con dos o más cuotas habría que inventar cuándo caen las siguientes, y ese
 * cliente saldría del día de cobranza donde está todo el mundo. Así que si
 * la venta tiene varias cuotas, el botón ni se muestra; y si estaba elegido
 * y la tienda sube las cuotas, se vuelve solo a la quincena.
 */
export interface PrimerCobroValue {
  /** Quincenas por delante de la vigente. */
  offset: number;
  /** Día exacto "YYYY-MM-DD", cuando se pactó uno. Null = por quincenas. */
  fecha: string | null;
}

export function PrimerCobroField({
  options,
  value,
  onChange,
  permiteFechaSuelta,
  label = "Primer cobro",
}: {
  options: FirstChargeOption[];
  value: PrimerCobroValue;
  onChange: (value: PrimerCobroValue) => void;
  /** Solo con una cuota. */
  permiteFechaSuelta: boolean;
  label?: string;
}) {
  // Si dejó de ser de una cuota, la fecha suelta se cae sola.
  React.useEffect(() => {
    if (!permiteFechaSuelta && value.fecha) {
      onChange({ offset: value.offset, fecha: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [permiteFechaSuelta]);

  const enFecha = Boolean(value.fecha);

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      <div className="grid grid-cols-2 gap-2">
        {options.map((option) => {
          const activo = !enFecha && value.offset === option.offset;
          return (
            <button
              key={option.offset}
              type="button"
              onClick={() => onChange({ offset: option.offset, fecha: null })}
              aria-pressed={activo}
              className={cn(
                "rounded-lg px-2 py-2.5 text-center",
                activo
                  ? "border-2 border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40"
                  : "border border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              )}
            >
              <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {option.label}
              </span>
              <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                {option.daysAway === 0
                  ? "cobras ya"
                  : `en ${option.daysAway} día${option.daysAway === 1 ? "" : "s"}`}
              </span>
            </button>
          );
        })}
      </div>

      {permiteFechaSuelta && (
        <>
          <button
            type="button"
            onClick={() =>
              onChange({
                offset: value.offset,
                fecha: enFecha ? null : hoyEnCaracas(),
              })
            }
            aria-pressed={enFecha}
            className={cn(
              "w-full rounded-lg px-2 py-2.5 text-center text-sm font-semibold",
              enFecha
                ? "border-2 border-indigo-500 bg-indigo-50 text-slate-900 dark:bg-indigo-950/40 dark:text-slate-100"
                : "border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            )}
          >
            Otra fecha
          </button>

          {enFecha && (
            <div className="space-y-1">
              <Input
                type="date"
                className="h-11"
                value={value.fecha ?? ""}
                onChange={(e) =>
                  onChange({ offset: value.offset, fecha: e.target.value || null })
                }
                aria-label="Día exacto del cobro"
              />
              <p className="text-xs text-slate-400">
                Se cobra todo ese día. Para el cliente que paga de una sola vez.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Hoy en Venezuela, no en el reloj del servidor.
 *
 * Se calcula en el navegador y solo al pulsar el botón, así que no hay
 * diferencia de hidratación: cuando la página se pinta en el servidor este
 * código todavía no corrió.
 */
function hoyEnCaracas(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
