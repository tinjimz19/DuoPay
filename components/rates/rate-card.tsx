"use client";

import { RefreshCw } from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { getEuroRate, refreshEuroRate, type BcvRate } from "@/actions/rates";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatBs, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

const AUTO_REFRESH_MS = 2 * 60 * 60 * 1000;

export function RateCard({ initial }: { initial?: BcvRate | null }) {
  const [rate, setRate] = React.useState<BcvRate | null>(initial ?? null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!initial) {
      getEuroRate().then(setRate).catch(() => {});
    }
    const id = setInterval(() => {
      getEuroRate().then(setRate).catch(() => {});
    }, AUTO_REFRESH_MS);
    return () => clearInterval(id);
  }, [initial]);

  async function handleRefresh() {
    setLoading(true);
    try {
      setRate(await refreshEuroRate());
    } catch {
      toast.error("No se pudo actualizar la tasa. Intenta de nuevo.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="flex items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Tasa BCV · Euro
          </p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {rate ? formatBs(rate.rate) : "—"}
          </p>
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
            {rate?.updatedAt
              ? `Actualizada ${formatDate(rate.updatedAt)}`
              : "Se actualiza automáticamente cada 2 h"}
          </p>
        </div>
        <Button
          variant="outline"
          className="shrink-0"
          onClick={handleRefresh}
          disabled={loading}
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          Actualizar
        </Button>
      </CardContent>
    </Card>
  );
}