"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { signOut } from "@/actions/auth-actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * El menú del panel admin.
 *
 * En el teléfono va dentro de una hamburguesa. Con cuatro secciones más
 * la insignia y el botón de salir, la fila medía 509 px contra una
 * pantalla de 390: no solo se veía apretada, empujaba el ancho de TODA la
 * página y dejaba scroll horizontal en cada pantalla del panel.
 *
 * De ancho `sm` en adelante hay sitio de sobra, así que ahí siguen los
 * enlaces a la vista.
 */

const items = [
  { href: "/admin", label: "Resumen" },
  { href: "/admin/tiendas", label: "Tiendas" },
  { href: "/admin/pagos", label: "Pagos" },
  { href: "/admin/categorias", label: "Categorías" },
];

function esActivo(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

export function AdminNav({ pendingCount = 0 }: { pendingCount?: number }) {
  const pathname = usePathname();
  const [pending, startTransition] = React.useTransition();

  const actual = items.find((i) => esActivo(pathname, i.href));

  return (
    <>
      {/* ---- pantalla ancha: los enlaces a la vista ---- */}
      <nav className="hidden items-center gap-1 sm:flex">
        {items.map((item) => {
          const active = esActivo(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              )}
            >
              {item.label}
              {item.href === "/admin/pagos" && pendingCount > 0 && (
                <span className="absolute -right-1.5 -top-1.5 flex h-4.5 min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ---- teléfono: hamburguesa ---- */}
      <div className="flex items-center gap-2 sm:hidden">
        {/* En qué sección estás, ahora que los enlaces no se ven. */}
        {actual && (
          <span className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {actual.label}
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative h-10 w-10 shrink-0"
              aria-label="Abrir menú"
            >
              <Menu className="h-5 w-5" />
              {/* El aviso de pagos pendientes tiene que verse con el menú
                  cerrado; si no, se pierde justo lo que hay que atender. */}
              {pendingCount > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {pendingCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-52">
            {items.map((item) => {
              const active = esActivo(pathname, item.href);
              return (
                <DropdownMenuItem
                  key={item.href}
                  asChild
                  className={cn(
                    "h-11 cursor-pointer",
                    active && "bg-indigo-50 font-semibold text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                  )}
                >
                  <Link href={item.href}>
                    <span className="flex-1">{item.label}</span>
                    {item.href === "/admin/pagos" && pendingCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                </DropdownMenuItem>
              );
            })}

            <DropdownMenuSeparator />

            <DropdownMenuItem
              className="h-11 cursor-pointer text-slate-600 dark:text-slate-300"
              disabled={pending}
              onSelect={() => startTransition(() => signOut())}
            >
              <LogOut className="h-4 w-4" />
              Salir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
