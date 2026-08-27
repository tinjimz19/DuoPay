import { LogOut, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/actions/auth-actions";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { currentAccount } from "@/lib/auth-server";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const account = await currentAccount();

  if (!account) {
    redirect("/login");
  }

  if (account.profile?.role !== "super_admin") {
    redirect("/");
  }

  const supabase = createClient();

  const { count: pendingReports } = await supabase
    .from("payment_reports")
    .select("id", { count: "exact", head: true })
    .eq("status", "PENDING");

  return (
    <div className="app-shell flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <Link
            href="/admin"
            className="flex items-center gap-2 font-bold text-slate-900 dark:text-slate-100"
          >
            <Logo />
            <span className="hidden sm:inline">Panel admin</span>
          </Link>
          <AdminNav pendingCount={pendingReports ?? 0} />
          {/* En el teléfono la insignia y el salir viven dentro de la
              hamburguesa: aquí solo estorbaban el ancho. */}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="hidden items-center gap-1.5 rounded-full border border-indigo-200 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700 sm:flex dark:border-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              Super admin
            </span>
            <form action={signOut}>
              <Button
                type="submit"
                variant="ghost"
                className="flex items-center gap-1.5 px-3 text-sm font-medium text-slate-600 dark:text-slate-400"
              >
                <LogOut className="h-4 w-4" />
                Salir
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 sm:max-w-3xl lg:max-w-5xl">
        {children}
      </main>
    </div>
  );
}
