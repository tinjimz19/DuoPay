import { TriangleAlert } from "lucide-react";

export function SetupNotice() {
  return (
    <div className="app-shell flex items-center justify-center bg-slate-50 px-6 dark:bg-slate-950">
      <div className="w-full max-w-sm rounded-xl border border-amber-200 bg-white p-6 text-center shadow-sm dark:border-amber-800 dark:bg-slate-900">
        <TriangleAlert className="mx-auto h-8 w-8 text-amber-500" />
        <h1 className="mt-3 text-lg font-bold text-slate-900 dark:text-slate-100">
          Falta configurar Supabase
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Copia el archivo <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.env.example</code>{" "}
          a <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">.env.local</code> y agrega
          las credenciales de tu proyecto (URL y anon key). Luego ejecuta el
          script SQL de <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">supabase/schema.sql</code>{" "}
          en el SQL Editor de Supabase y reinicia el servidor.
        </p>
      </div>
    </div>
  );
}