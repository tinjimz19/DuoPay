"use client";

import * as React from "react";

import { Input } from "@/components/ui/input";
import { sanitizeMoneyInput } from "@/lib/money";

type MoneyInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "onChange" | "inputMode"
> & {
  value: string;
  /** Recibe el texto ya saneado: dígitos, un separador y máximo dos decimales. */
  onChange: (value: string) => void;
};

/**
 * Campo para escribir plata.
 *
 * `type="text"` a propósito: con `type="number"` el navegador se come lo que
 * considera inválido y, con el teclado en español, la coma es justamente eso
 * — por eso no se podían poner decimales. `inputMode="decimal"` mantiene el
 * teclado numérico del teléfono, con el separador del idioma del equipo.
 *
 * Acepta coma o punto sin discutir, y muestra tal cual lo que se escribió.
 */
export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  function MoneyInput({ value, onChange, placeholder = "0,00", ...props }, ref) {
    return (
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(sanitizeMoneyInput(event.target.value))}
      />
    );
  }
);
