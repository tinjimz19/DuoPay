"use client";

import { Home, Package, ShoppingBag, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/pedidos", label: "Pedidos", icon: Package },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 md:flex">
      <div className="flex items-center gap-3 px-6 py-5">
        <Logo />
        <div>
          <p className="font-bold text-slate-900 dark:text-slate-100">DuoPay</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fiado, pagos y pedidos
          </p>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 px-3 py-4">
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
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
              )}
            >
              <Icon className="h-5 w-5" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-slate-200 px-6 py-4 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
        Uso personal · Aislado por usuario
      </div>
    </aside>
  );
}