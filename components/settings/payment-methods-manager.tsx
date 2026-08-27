"use client";

import { Loader2, Pencil, Plus, Trash2, Wallet } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  deletePaymentMethod,
  savePaymentMethod,
  setPaymentMethodActive,
} from "@/actions/payment-method-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
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
import { Switch } from "@/components/ui/switch";
import {
  PAYMENT_KINDS,
  PAYMENT_KIND_OPTIONS,
  paymentMethodError,
  paymentMethodLines,
  paymentMethodTitle,
  type PaymentMethod,
  type PaymentMethodKind,
} from "@/lib/payment-methods";

type Borrador = {
  id: string | null;
  kind: PaymentMethodKind;
  label: string;
  bank: string;
  account: string;
  holder: string;
  document: string;
};

const VACIO: Borrador = {
  id: null,
  kind: "PAGO_MOVIL",
  label: "",
  bank: "",
  account: "",
  holder: "",
  document: "",
};

function desde(m: PaymentMethod): Borrador {
  return {
    id: m.id,
    kind: m.kind,
    label: m.label ?? "",
    bank: m.bank ?? "",
    account: m.account ?? "",
    holder: m.holder ?? "",
    document: m.document ?? "",
  };
}

function FormularioMetodo({
  abierto,
  onOpenChange,
  inicial,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  inicial: Borrador;
}) {
  const router = useRouter();
  const [draft, setDraft] = React.useState(inicial);
  const [pending, startTransition] = React.useTransition();

  // Al reabrir el diálogo hay que recargar el borrador: el componente no
  // se desmonta, así que si no, reaparecen los datos del método anterior.
  React.useEffect(() => {
    if (abierto) setDraft(inicial);
  }, [abierto, inicial]);

  const spec = PAYMENT_KINDS[draft.kind];
  const falta = paymentMethodError(draft);

  function guardar() {
    if (falta) {
      toast.error(falta);
      return;
    }
    startTransition(async () => {
      const res = await savePaymentMethod({
        id: draft.id,
        kind: draft.kind,
        label: draft.label,
        // Solo se mandan los campos que este método usa; si no, cambiar de
        // Pago Móvil a Zelle dejaría un banco colgando en la fila.
        bank: spec.fields.some((f) => f.key === "bank") ? draft.bank : null,
        account: spec.fields.some((f) => f.key === "account") ? draft.account : null,
        holder: spec.fields.some((f) => f.key === "holder") ? draft.holder : null,
        document: spec.fields.some((f) => f.key === "document") ? draft.document : null,
      });
      if (res.success) {
        toast.success(draft.id ? "Método actualizado" : "Método agregado");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {draft.id ? "Editar método de pago" : "Nuevo método de pago"}
          </DialogTitle>
          <DialogDescription>
            Estos datos se le mandan al cliente junto con el recordatorio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pm-kind">Método</Label>
            <Select
              value={draft.kind}
              onValueChange={(v) =>
                setDraft((d) => ({ ...d, kind: v as PaymentMethodKind }))
              }
            >
              <SelectTrigger id="pm-kind" className="h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAYMENT_KIND_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    <span className="flex flex-col items-start">
                      <span>{o.label}</span>
                      <span className="text-xs text-slate-500">{o.hint}</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {spec.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`pm-${field.key}`}>
                {field.label}
                {!field.required && (
                  <span className="text-slate-400"> (opcional)</span>
                )}
              </Label>
              <Input
                id={`pm-${field.key}`}
                className="h-11"
                inputMode={field.inputMode}
                placeholder={field.placeholder}
                value={draft[field.key]}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, [field.key]: e.target.value }))
                }
              />
            </div>
          ))}

          <div className="space-y-2">
            <Label htmlFor="pm-label">
              Apodo <span className="text-slate-400">(opcional)</span>
            </Label>
            <Input
              id="pm-label"
              className="h-11"
              placeholder="El Banesco de mi esposa"
              value={draft.label}
              onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
            />
          </div>

          <Button
            type="button"
            className="h-11 w-full"
            disabled={pending}
            onClick={guardar}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar método
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fila({ metodo }: { metodo: PaymentMethod }) {
  const router = useRouter();
  const [editar, setEditar] = React.useState(false);
  const [borrar, setBorrar] = React.useState(false);
  const [pending, startTransition] = React.useTransition();
  const inicial = React.useMemo(() => desde(metodo), [metodo]);

  function alternar(activo: boolean) {
    startTransition(async () => {
      const res = await setPaymentMethodActive(metodo.id, activo);
      if (res.success) router.refresh();
      else toast.error(res.error);
    });
  }

  function eliminar() {
    startTransition(async () => {
      const res = await deletePaymentMethod(metodo.id);
      if (res.success) {
        toast.success("Método eliminado");
        setBorrar(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  const lineas = paymentMethodLines(metodo);

  return (
    <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="flex items-start gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p
            className={
              metodo.is_active
                ? "font-semibold leading-tight text-slate-900 dark:text-slate-100"
                : "font-semibold leading-tight text-slate-400 dark:text-slate-500"
            }
          >
            {paymentMethodTitle(metodo)}
          </p>
          {lineas.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {lineas.map((l) => (
                <p
                  key={l}
                  className="truncate text-xs text-slate-500 dark:text-slate-400"
                >
                  {l}
                </p>
              ))}
            </div>
          )}
          {!metodo.is_active && (
            <p className="mt-1 text-xs font-medium text-slate-400">
              Apagado · no se manda en los recordatorios
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Switch
            checked={metodo.is_active}
            disabled={pending}
            onCheckedChange={alternar}
            aria-label={`${metodo.is_active ? "Apagar" : "Encender"} ${paymentMethodTitle(metodo)}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={pending}
            onClick={() => setEditar(true)}
            aria-label={`Editar ${paymentMethodTitle(metodo)}`}
          >
            <Pencil className="h-4 w-4 text-slate-400" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={pending}
            onClick={() => setBorrar(true)}
            aria-label={`Eliminar ${paymentMethodTitle(metodo)}`}
          >
            <Trash2 className="h-4 w-4 text-slate-400" />
          </Button>
        </div>
      </CardContent>

      <FormularioMetodo
        abierto={editar}
        onOpenChange={setEditar}
        inicial={inicial}
      />
      <ConfirmDialog
        open={borrar}
        onOpenChange={setBorrar}
        title="¿Eliminar este método de pago?"
        description="Se borra de una vez, no va a la papelera. Puedes volver a agregarlo cuando quieras."
        confirmLabel="Eliminar"
        pending={pending}
        onConfirm={eliminar}
      />
    </Card>
  );
}

export function PaymentMethodsManager({
  methods,
}: {
  methods: PaymentMethod[];
}) {
  const [nuevo, setNuevo] = React.useState(false);

  return (
    <div className="space-y-3">
      {methods.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <Wallet className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Todavía no has puesto cómo te pagan. Al agregarlos, tus
              recordatorios de WhatsApp los llevan incluidos.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {methods.map((m) => (
            <Fila key={m.id} metodo={m} />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => setNuevo(true)}
      >
        <Plus className="h-4 w-4" />
        Agregar método de pago
      </Button>

      <FormularioMetodo
        abierto={nuevo}
        onOpenChange={setNuevo}
        inicial={VACIO}
      />
    </div>
  );
}
