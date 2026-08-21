"use client";

import { BarChart3, Home, Package, ShoppingBag, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const items = [
  { href: "/", label: "Inicio", icon: Home },
  { href: "/ventas", label: "Ventas", icon: ShoppingBag },
  { href: "/clientes", label: "Clientes", icon: Users },
  { href: "/reportes", label: "Reportes", icon: BarChart3 },
  { href: "/pedidos", label: "Pedidos", icon: Package },
];

interface BottomNavProps {
  cutoffLabel?: string | null;
  cutoffUrgent?: boolean;
}

export function BottomNav({ cutoffLabel, cutoffUrgent }: BottomNavProps) {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900 md:hidden">
      {cutoffLabel && (
        <p
          className={cn(
            "py-1 text-center text-[10px] font-medium",
            cutoffUrgent
              ? "bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400"
              : "text-slate-400 dark:text-slate-500"
          )}
        >
          {cutoffLabel}
        </p>
      )}
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