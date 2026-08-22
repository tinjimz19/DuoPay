"use client";

import { Loader2, UploadCloud } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { createPaymentReport } from "@/actions/payment-report-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";

const METHODS = ["Pago Móvil", "Zelle", "Transferencia", "Efectivo"] as const;
const MAX_FILE_BYTES = 5 * 1024 * 1024;

interface ReportPaymentDialogProps {
  triggerLabel: string;
  triggerVariant?: "default" | "outline" | "ghost" | "secondary";
  triggerClassName?: string;
  /** El ícono no cabe cuando el disparador es una insignia pequeña. */
  showTriggerIcon?: boolean;
}

export function ReportPaymentDialog({
  triggerLabel,
  triggerVariant = "default",
  triggerClassName,
  showTriggerIcon = true,
}: ReportPaymentDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const [method, setMethod] = React.useState<string>("");
  const [amount, setAmount] = React.useState("");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);

  function resetForm() {
    setMethod("");
    setAmount("");
    setReference("");
    setNotes("");
    setFile(null);
  }

  async function uploadProof(userId: string): Promise<string | null> {
    if (!file) return null;
    const supabase = createClient();
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `${userId}/${Date.now()}-${safeName}`;
    const { error } = await supabase.storage
      .from("payment-proofs")
      .upload(path, file, { cacheControl: "3600", upsert: false });
    if (error) throw new Error("No se pudo subir la captura");
    return path;
  }

  function handleSubmit() {
    if (!method) {
      toast.error("Selecciona el método de pago");
      return;
    }
    const parsedAmount = amount ? parseFloat(amount.replace(",", ".")) : null;
    if (amount && (!parsedAmount || parsedAmount <= 0)) {
      toast.error("Monto inválido");
      return;
    }

    startTransition(async () => {
      try {
        let proofPath: string | null = null;
        if (file) {
          if (file.size > MAX_FILE_BYTES) {
            toast.error("La captura no debe superar 5 MB");
            return;
          }
          const supabase = createClient();
          const {
            data: { user },
          } = await supabase.auth.getUser();
          if (!user) {
            toast.error("Sesión expirada, inicia sesión de nuevo");
            return;
          }
          proofPath = await uploadProof(user.id);
        }

        const res = await createPaymentReport({
          method,
          amount: parsedAmount,
          reference: reference || null,
          proofPath,
          notes: notes || null,
        });

        if (res.success) {
          toast.success(
            "¡Reporte enviado! Te activaremos en breve tras verificarlo."
          );
          resetForm();
          setOpen(false);
        } else {
          toast.error(res.error ?? "Error al enviar el reporte");
        }
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error al enviar el reporte"
        );
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className={triggerClassName}>
          {showTriggerIcon && <UploadCloud />}
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reportar pago</DialogTitle>
          <DialogDescription>
            Envía los datos de tu pago de $10/mes y lo verificamos en breve.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Método de pago</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Selecciona..." />
              </SelectTrigger>
              <SelectContent>
                {METHODS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="report-amount">
                Monto <span className="text-slate-400">(USD)</span>
              </Label>
              <Input
                id="report-amount"
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                placeholder="10.00"
                className="h-11"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="report-reference">
                Referencia <span className="text-slate-400">(opcional)</span>
              </Label>
              <Input
                id="report-reference"
                placeholder="Nº de operación"
                className="h-11"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-proof">Captura del pago</Label>
            <Input
              id="report-proof"
              type="file"
              accept="image/*,.pdf"
              className="h-11 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-medium dark:file:bg-slate-800 dark:file:text-slate-200"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            {file && (
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                {file.name}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-notes">
              Nota <span className="text-slate-400">(opcional)</span>
            </Label>
            <Textarea
              id="report-notes"
              rows={2}
              placeholder="Ej: pagué por Pago Móvil a las 3pm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="h-11"
            disabled={pending}
            onClick={handleSubmit}
          >
            {pending && <Loader2 className="animate-spin" />}
            Enviar reporte
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
