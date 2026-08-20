import { redirect } from "next/navigation";

import { BottomNav } from "@/components/navigation/bottom-nav";
import { Header } from "@/components/navigation/header";
import { Sidebar } from "@/components/navigation/sidebar";
import { SetupNotice } from "@/components/setup-notice";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return <SetupNotice />;
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, business_name")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div className="flex min-h-dvh flex-col bg-slate-50 dark:bg-slate-950">
      <Sidebar />
      <div className="flex flex-1 flex-col md:pl-64">
        <Header
          email={user.email ?? ""}
          fullName={profile?.full_name ?? null}
          businessName={profile?.business_name ?? null}
        />
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-4 sm:max-w-3xl lg:max-w-5xl">
          {children}
        </main>
      </div>
      <BottomNav />
    </div>
  );
}