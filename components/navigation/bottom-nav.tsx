"use client";

import {
  Boxes,
  HandCoins,
  Home,
  Images,
  Loader2,
  ShoppingBag,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as React from "react";

import { cn } from "@/lib/utils";

// Cinco caben en una fila. Cobranza e Inventario entran porque se usan de
// pie, con el cliente delante. Reportes y Pedidos se consultan sentado, así
// que viven en el menú lateral y en los accesos desde Inicio.
const baseItems = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/cobranza", label: "Cobranza", icon: HandCoins },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/inventario", label: "Inventario", icon: Boxes },
];

const CATALOGO_ITEM = { href: "/catalogo", label: "Catálogo", icon: Images };

export function BottomNav({ showCatalog = false }: { showCatalog?: boolean }) {
  const pathname = usePathname();

  // Para la cuenta autorizada entra un sexto ícono; la fila pasa a seis
  // columnas. Para el resto queda igual, en cinco.
  const items = showCatalog ? [...baseItems, CATALOGO_ITEM] : baseItems;
  // Marca la pestaña tocada al instante, sin esperar al servidor. Es la mitad
  // del problema de "le di dos veces": no había ninguna señal de que el toque
  // hubiera registrado.
  const [tapped, setTapped] = React.useState<string | null>(null);

  React.useEffect(() => {
    setTapped(null);
  }, [pathname]);

  return (
    // El safe-area del iPhone deja ~34px de aire muerto bajo los íconos. Le
    // restamos casi todo: el indicador de inicio puede solaparse con el borde
    // inferior de la fila sin tapar ícono ni texto. En Android env() es 0, así
    // que ahí no cambia nada.
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[max(0px,calc(env(safe-area-inset-bottom)-1.25rem))] dark:border-slate-800 dark:bg-slate-900 md:hidden">
      <div
        className={cn(
          "mx-auto grid max-w-md",
          items.length === 6 ? "grid-cols-6" : "grid-cols-5"
        )}
      >
        {items.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          const pending = tapped === item.href && !active;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setTapped(item.href)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors active:scale-95",
                active || pending
                  ? "text-indigo-600 dark:text-indigo-400"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              )}
            >
              {pending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <Icon className="h-5 w-5" />
              )}
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}