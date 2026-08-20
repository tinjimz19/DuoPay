"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Plus, UserRound } from "lucide-react";
import * as React from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { createClient, updateClient } from "@/actions/client-actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export interface ClientFormData {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
}

const clientSchema = z.object({
  name: z.string().min(2, "Escribe el nombre del cliente"),
  phone: z
    .string()
    .max(30)
    .transform((v) => v.trim())
    .optional()
    .or(z.literal("")),
  notes: z
    .string()
    .max(500)
    .transform((v) => v.trim())
    .optional()
    .or(z.literal("")),
});

type ClientValues = z.infer<typeof clientSchema>;

export function ClientFormDialog({
  client,
  compact = false,
  triggerClassName,
  onCreated,
}: {
  client?: ClientFormData | null;
  compact?: boolean;
  triggerClassName?: string;
  onCreated?: (client: { id: string; name: string }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const isEdit = Boolean(client);

  const form = useForm<ClientValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      name: client?.name ?? "",
      phone: client?.phone ?? "",
      notes: client?.notes ?? "",
    },
  });

  async function onSubmit(values: ClientValues) {
    setLoading(true);
    const res = isEdit
      ? await updateClient({ id: client!.id, ...values })
      : await createClient({ ...values });

    setLoading(false);

    if (!res.success) {
      toast.error(res.error ?? "Error al guardar");
      return;
    }

    toast.success(isEdit ? "Cliente actualizado" : "Cliente creado");
    const newClientId = "id" in res ? (res as { id: string }).id : undefined;
    if (!isEdit && onCreated && newClientId) {
      onCreated({ id: newClientId, name: values.name });
    }
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {compact ? (
          <Button type="button" variant="outline" className={triggerClassName}>
            <UserRound className="h-4 w-4" />
            Nuevo cliente
          </Button>
        ) : isEdit ? (
          <Button variant="outline" className={triggerClassName}>
            Editar
          </Button>
        ) : (
          <Button className={cn("h-11", triggerClassName)}>
            <Plus className="h-4 w-4" />
            Nuevo cliente
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
          {!compact && (
            <DialogDescription>
              {isEdit
                ? "Actualiza los datos de contacto del cliente."
                : "Registra un cliente para venderle a fiado."}
            </DialogDescription>
          )}
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input placeholder="Nombre del cliente" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Teléfono{" "}
                    <span className="text-slate-400">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="tel"
                      placeholder="+58 412 000 0000"
                      inputMode="tel"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {!compact && (
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Notas <span className="text-slate-400">(opcional)</span>
                    </FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Referencias, direcciones, etc."
                        rows={2}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading && <Loader2 className="animate-spin" />}
              {isEdit ? "Guardar cambios" : "Crear cliente"}
            </Button>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}