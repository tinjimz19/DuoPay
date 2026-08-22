"use client";

import { Loader2 } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmación explícita para acciones que destruyen algo.
 *
 * Reemplaza al patrón de "toca dos veces": ese aviso era invisible en el
 * teléfono (solo cambiaba un color y un tooltip), se desarmaba solo a los
 * 2.5 s, y dentro de un menú desplegable de Radix era directamente
 * imposible de completar, porque el primer toque cierra el menú.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  pending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription asChild>
            <div className="text-sm text-slate-500 dark:text-slate-400">
              {description}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <Button
            type="button"
            variant="destructive"
            className="h-11 flex-1 text-sm"
            disabled={pending}
            onClick={onConfirm}
          >
            {pending && <Loader2 className="animate-spin" />}
            {confirmLabel}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11 flex-1 text-sm"
            disabled={pending}
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
