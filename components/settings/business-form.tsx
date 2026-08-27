"use client";

import { Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { updateProfile } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BusinessForm({
  fullName,
  businessName,
}: {
  fullName: string | null;
  businessName: string | null;
}) {
  const router = useRouter();
  const [negocio, setNegocio] = React.useState(businessName ?? "");
  const [nombre, setNombre] = React.useState(fullName ?? "");
  const [pending, startTransition] = React.useTransition();

  const sucio =
    negocio.trim() !== (businessName ?? "").trim() ||
    nombre.trim() !== (fullName ?? "").trim();

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (negocio.trim().length < 2) {
      toast.error("Ponle un nombre a tu negocio");
      return;
    }
    startTransition(async () => {
      const res = await updateProfile({
        fullName: nombre.trim(),
        businessName: negocio.trim(),
      });
      if (res.success) {
        toast.success("Datos guardados");
        router.refresh();
      } else {
        toast.error(res.error ?? "No se pudo guardar");
      }
    });
  }

  return (
    <form onSubmit={guardar} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="cfg-negocio">Nombre del negocio</Label>
        <Input
          id="cfg-negocio"
          className="h-11"
          placeholder="Boutique Marisol"
          value={negocio}
          onChange={(e) => setNegocio(e.target.value)}
        />
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Es el nombre con el que te presentas en los mensajes de WhatsApp.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cfg-nombre">Tu nombre</Label>
        <Input
          id="cfg-nombre"
          className="h-11"
          placeholder="Marisol Guevara"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={pending || !sucio}>
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {sucio ? "Guardar cambios" : "Todo guardado"}
      </Button>
    </form>
  );
}
