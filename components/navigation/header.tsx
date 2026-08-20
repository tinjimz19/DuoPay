import { AccountSheet } from "@/components/account-sheet";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({
  email,
  fullName,
  businessName,
}: {
  email: string;
  fullName: string | null;
  businessName: string | null;
}) {
  const firstName = (fullName ?? email).split(" ")[0];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-2 sm:max-w-3xl lg:max-w-5xl">
        <div className="min-w-0">
          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
            {businessName || "Mi negocio"}
          </p>
          <h1 className="truncate text-lg font-bold text-slate-900 dark:text-slate-100">
            Hola, {firstName}
          </h1>
        </div>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <AccountSheet
            email={email}
            fullName={fullName}
            businessName={businessName}
          />
        </div>
      </div>
    </header>
  );
}