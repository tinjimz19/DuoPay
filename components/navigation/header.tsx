import { AccountSheet } from "@/components/account-sheet";
import {
  SubscriptionBadge,
  type SubscriptionTone,
} from "@/components/subscription/subscription-badge";
import { ThemeToggle } from "@/components/theme-toggle";

export function Header({
  email,
  fullName,
  businessName,
  subscription,
}: {
  email: string;
  fullName: string | null;
  businessName: string | null;
  subscription: { label: string; tone: SubscriptionTone } | null;
}) {
  const firstName = (fullName ?? email).split(" ")[0];

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] sm:max-w-3xl lg:max-w-5xl">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              {businessName || "Mi negocio"}
            </p>
            {subscription && (
              <SubscriptionBadge
                label={subscription.label}
                tone={subscription.tone}
              />
            )}
          </div>
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