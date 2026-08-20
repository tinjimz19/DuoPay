import { Logo } from "@/components/logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="app-shell flex flex-col items-center justify-center bg-slate-50 px-4 py-8 dark:bg-slate-950">
      <div className="mb-6 flex flex-col items-center gap-3">
        <Logo />
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            DuoPay
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Fiado, pagos y pedidos al día
          </p>
        </div>
      </div>
      <div className="w-full max-w-sm">{children}</div>
      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
        Uso personal · Tus datos están aislados por usuario
      </p>
    </div>
  );
}