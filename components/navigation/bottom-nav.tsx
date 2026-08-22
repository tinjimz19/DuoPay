"use client";

import { HandCoins, Home, Package, ShoppingBag, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

// Cinco caben en una fila. Cobranza entra porque es la pantalla del día de
// cobro; Reportes se consulta sentado, así que vive en el menú lateral y en
// el acceso desde Inicio.
const items = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/cobranza", label: "Cobranza", icon: HandCoins },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/pedidos", label: "Pedidos", icon: Package },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    // El safe-area del iPhone deja ~34px de aire muerto bajo los íconos. Le
    // restamos casi todo: el indicador de inicio puede solaparse con el borde
    // inferior de la fila sin tapar ícono ni texto. En Android env() es 0, así
    // que ahí no cambia nada.
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[max(0px,calc(env(safe-area-inset-bottom)-1.25rem))] dark:border-slate-800 dark:bg-slate-900 md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-5">
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors",
                active
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}