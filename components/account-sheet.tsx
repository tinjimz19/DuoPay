"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { signOut, updateProfile } from "@/actions/auth-actions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountSheet({
  email,
  fullName,
  businessName,
}: {
  email: string;
  fullName: string | null;
  businessName: string | null;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(fullName ?? "");
  const [bizName, setBizName] = React.useState(businessName ?? "");
  const [pending, startTransition] = React.useTransition();

  const initials = (fullName ?? email).slice(0, 2).toUpperCase();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await updateProfile({
        fullName: name.trim(),
        businessName: bizName.trim(),
      });
      if (res.success) {
        toast.success("Perfil actualizado");
        setOpen(false);
      } else {
        toast.error(res.error ?? "Error al guardar");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          aria-label="Mi cuenta"
        >
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
              {initials}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-left">
          <DialogTitle>Mi cuenta</DialogTitle>
          <DialogDescription className="truncate">{email}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="mt-2 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full-name">Nombre</Label>
            <Input
              id="full-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Tu nombre"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="biz-name">Nombre del negocio</Label>
            <Input
              id="biz-name"
              value={bizName}
              onChange={(e) => setBizName(e.target.value)}
              placeholder="Mi tienda"
            />
          </div>
          <Button type="submit" className="h-11 w-full" disabled={pending}>
            <UserIcon className="h-4 w-4" />
            Guardar cambios
          </Button>
        </form>

        <Button
          variant="outline"
          className="mt-4 h-11 w-full text-slate-600 dark:text-slate-300"
          onClick={() => startTransition(() => signOut())}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </Button>
      </DialogContent>
    </Dialog>
  );
}