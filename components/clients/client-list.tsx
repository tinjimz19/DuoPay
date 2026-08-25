"use client";

import {
  ChevronRight,
  HandCoins,
  MessageCircle,
  Search,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import * as React from "react";

import { Paginacion, usePagination } from "@/components/pagination";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatCurrency, normalizePhone } from "@/lib/format";
import {
  buildTotalDebtReminderMessage,
  whatsappReminderUrl,
} from "@/lib/reminders";
import { cn } from "@/lib/utils";

export interface ClientWithBalance {
  id: string;
  name: string;
  phone: string;
  balance: number;
}

export function ClientList({
  clients,
  businessName,
}: {
  clients: ClientWithBalance[];
  businessName?: string | null;
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q)
    );
  }, [clients, query]);

  // Se pagina lo ya filtrado: el buscador sigue mirando la lista completa.
  const pagina = usePagination(filtered, { resetKey: query });

  return (
    <div className="scroll-mt-24 space-y-3" ref={pagina.topRef}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="h-11 pl-9"
          placeholder="Buscar por nombre o teléfono"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            <UserRound className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            {clients.length === 0
              ? "Aún no tienes clientes. Crea el primero."
              : "No se encontraron clientes."}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pagina.items.map((client) => (
            <Card
              key={client.id}
              className="border-slate-200 bg-white shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800/50"
            >
              <CardContent className="flex items-center gap-3 p-4">
                <Link
                  href={`/clientes/${client.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3"
                >
                  <Avatar className="h-10 w-10">
                    <AvatarFallback className="bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                      {client.name.slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-slate-100">
                      {client.name}
                    </p>
                    <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                      {client.phone}
                    </p>
                  </div>
                </Link>
                <div className="flex shrink-0 items-center gap-2">
                  {client.balance > 0 && (
                    <a
                      href={whatsappReminderUrl(
                        client.phone,
                        buildTotalDebtReminderMessage({
                          businessName,
                          clientName: client.name,
                          total: client.balance,
                        })
                      )}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Recordar deuda a ${client.name}`}
                      title="Recordar deuda por WhatsApp"
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-500 text-white transition-colors hover:bg-amber-600"
                    >
                      <HandCoins className="h-4 w-4" />
                    </a>
                  )}
                  <a
                    href={`https://wa.me/${normalizePhone(client.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`WhatsApp de ${client.name}`}
                    title="Contactar por WhatsApp"
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white transition-colors hover:bg-emerald-600"
                  >
                    <MessageCircle className="h-4 w-4" />
                  </a>
                  <span
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs font-semibold",
                      client.balance > 0
                        ? "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    )}
                  >
                    {client.balance > 0
                      ? formatCurrency(client.balance)
                      : "Saldado"}
                  </span>
                  <ChevronRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Paginacion pagination={pagina} noun="clientes" />
    </div>
  );
}