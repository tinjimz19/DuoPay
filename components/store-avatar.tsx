"use client";

import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

/** Dos letras a partir del nombre del negocio, o del dueño si no hay. */
export function storeInitials(
  businessName: string | null | undefined,
  fallbackName: string
): string {
  const fuente = businessName?.trim() || fallbackName.trim();
  if (!fuente) return "MN";

  const palabras = fuente.split(/\s+/).filter(Boolean);
  // "Boutique Marisol" -> BM; "Marisol" -> MA.
  if (palabras.length >= 2) {
    return (palabras[0][0] + palabras[1][0]).toUpperCase();
  }
  return fuente.slice(0, 2).toUpperCase();
}

/**
 * El avatar de la tienda: su logo si lo subió, y si no, sus iniciales.
 *
 * `AvatarImage` de Radix solo se muestra cuando la imagen carga de
 * verdad, así que un logo borrado del almacenamiento no deja un hueco
 * roto: cae solo a las iniciales.
 */
export function StoreAvatar({
  logoUrl,
  businessName,
  fallbackName,
  className,
}: {
  logoUrl: string | null;
  businessName: string | null;
  fallbackName: string;
  className?: string;
}) {
  return (
    <Avatar className={cn("h-9 w-9", className)}>
      {logoUrl && (
        <AvatarImage
          src={logoUrl}
          alt={businessName ? `Logo de ${businessName}` : "Logo de la tienda"}
          className="object-cover"
        />
      )}
      <AvatarFallback className="bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
        {storeInitials(businessName, fallbackName)}
      </AvatarFallback>
    </Avatar>
  );
}
