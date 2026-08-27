"use client";

import { LogOut, Settings } from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { signOut } from "@/actions/auth-actions";
import { StoreAvatar } from "@/components/store-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * El avatar abre un menú, no una modal.
 *
 * Antes esto era un diálogo que además servía de formulario de perfil:
 * tocar tu propia foto abría una pantalla completa para editar campos.
 * Ahora el avatar hace lo que uno espera que haga —desplegar opciones— y
 * la edición vive donde corresponde, en Configuración.
 */
export function AccountMenu({
  email,
  fullName,
  businessName,
  logoUrl,
}: {
  email: string;
  fullName: string | null;
  businessName: string | null;
  logoUrl: string | null;
}) {
  const [pending, startTransition] = React.useTransition();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 rounded-full"
          aria-label="Mi cuenta"
        >
          <StoreAvatar
            logoUrl={logoUrl}
            businessName={businessName}
            fallbackName={fullName ?? email}
            className="h-9 w-9"
          />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="pb-1">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {businessName || "Mi negocio"}
          </p>
          <p className="truncate text-xs font-normal text-slate-500 dark:text-slate-400">
            {email}
          </p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuItem asChild className="h-11 cursor-pointer">
          <Link href="/configuracion">
            <Settings className="h-4 w-4" />
            Configuración
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          className="h-11 cursor-pointer text-slate-600 dark:text-slate-300"
          disabled={pending}
          onSelect={() => startTransition(() => signOut())}
        >
          <LogOut className="h-4 w-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
