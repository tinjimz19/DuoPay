"use client";

import { UserPlus } from "lucide-react";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Elegir cliente, o darlo de alta ahí mismo.
 *
 * Antes el pedido aceptaba un nombre suelto de texto libre: eso no crea
 * cliente, no queda teléfono y después no hay a quién cobrarle. Aquí el alta
 * pide nombre Y teléfono, igual que el formulario de clientes, así el
 * registro nunca queda a medias.
 */
export type ClientSelection =
  | { kind: "none" }
  | { kind: "existing"; id: string }
  | { kind: "new"; name: string; phone: string };

export const EMPTY_CLIENT_SELECTION: ClientSelection = { kind: "none" };

const NONE = "__none__";
const NEW = "__new__";

/** Qué le falta a la selección para poder guardar (null = está lista). */
export function clientSelectionError(
  value: ClientSelection,
  { required }: { required: boolean }
): string | null {
  if (value.kind === "none") {
    return required ? "Selecciona un cliente" : null;
  }
  if (value.kind === "existing") {
    return null;
  }
  if (value.name.trim().length < 2) {
    return "Escribe el nombre del cliente";
  }
  if (value.phone.trim().length < 7) {
    return "El teléfono del cliente es obligatorio";
  }
  return null;
}

export function ClientPicker({
  clients,
  value,
  onChange,
  required = false,
  label = "Cliente",
  showError = false,
}: {
  clients: { id: string; name: string }[];
  value: ClientSelection;
  onChange: (value: ClientSelection) => void;
  /** En una venta el cliente es obligatorio; en un pedido no. */
  required?: boolean;
  label?: string;
  showError?: boolean;
}) {
  const error = showError ? clientSelectionError(value, { required }) : null;

  const selectValue =
    value.kind === "existing" ? value.id : value.kind === "new" ? NEW : NONE;

  function handleSelect(next: string) {
    if (next === NEW) {
      onChange({ kind: "new", name: "", phone: "" });
    } else if (next === NONE) {
      onChange({ kind: "none" });
    } else {
      onChange({ kind: "existing", id: next });
    }
  }

  return (
    <div className="space-y-2">
      <Label htmlFor="cliente-selector">
        {label}
        {!required && <span className="text-slate-400"> (opcional)</span>}
      </Label>

      <Select value={selectValue} onValueChange={handleSelect}>
        <SelectTrigger id="cliente-selector" className="h-11">
          <SelectValue
            placeholder={required ? "Selecciona un cliente" : "Sin cliente"}
          />
        </SelectTrigger>
        <SelectContent>
          {!required && <SelectItem value={NONE}>Sin cliente</SelectItem>}
          <SelectItem value={NEW}>
            <span className="flex items-center gap-2">
              <UserPlus className="h-3.5 w-3.5" />
              Cliente nuevo
            </span>
          </SelectItem>
          {clients.map((client) => (
            <SelectItem key={client.id} value={client.id}>
              {client.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {value.kind === "new" && (
        <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-900 dark:bg-indigo-950/30">
          <p className="text-xs text-indigo-700 dark:text-indigo-300">
            Se registra como cliente al guardar.
          </p>
          <Input
            className="h-11"
            placeholder="Nombre del cliente"
            autoFocus
            value={value.name}
            onChange={(e) =>
              onChange({ ...value, kind: "new", name: e.target.value })
            }
            aria-label="Nombre del cliente nuevo"
          />
          <Input
            className="h-11"
            type="tel"
            inputMode="tel"
            placeholder="Teléfono · +58 412 000 0000"
            value={value.phone}
            onChange={(e) =>
              onChange({ ...value, kind: "new", phone: e.target.value })
            }
            aria-label="Teléfono del cliente nuevo"
          />
        </div>
      )}

      {error && (
        <p className="text-sm font-medium text-destructive">{error}</p>
      )}
    </div>
  );
}
