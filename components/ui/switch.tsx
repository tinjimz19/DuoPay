"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Interruptor sin dependencias nuevas.
 *
 * shadcn trae uno basado en @radix-ui/react-switch, pero el proyecto no
 * tiene ese paquete y no vale la pena sumar una dependencia por esto: un
 * botón con `role="switch"` y `aria-checked` es exactamente lo mismo para
 * un lector de pantalla y para el teclado.
 */
export const Switch = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<"button">, "onChange" | "type"> & {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
  }
>(function Switch({ checked, onCheckedChange, className, disabled, ...props }, ref) {
  return (
    <button
      {...props}
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full",
        "transition-colors focus-visible:outline-none focus-visible:ring-2",
        "focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked
          ? "bg-indigo-600"
          : "bg-slate-200 dark:bg-slate-700",
        className
      )}
    >
      <span
        className={cn(
          "pointer-events-none block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform",
          checked ? "translate-x-[1.375rem]" : "translate-x-0.5"
        )}
      />
    </button>
  );
});
