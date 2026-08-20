"use server";

import { revalidateTag, unstable_cache } from "next/cache";

export interface BcvRate {
  rate: number;
  currency: "EUR";
  updatedAt: string | null;
  source: string;
}

async function fetchEuroRate(): Promise<BcvRate> {
  const res = await fetch("https://ve.dolarapi.com/v1/euros/oficial", {
    cache: "no-store",
    headers: { "User-Agent": "DuoPay/1.0" },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`BCV API respondió ${res.status}`);
  const data = await res.json();
  const rate = Number(data?.promedio);
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error("Tasa BCV no disponible");
  }
  return {
    rate,
    currency: "EUR",
    updatedAt: data?.fechaActualizacion ?? null,
    source: "BCV",
  };
}

const getCachedEuroRate = unstable_cache(fetchEuroRate, ["bcv-euro-rate"], {
  revalidate: 7200,
  tags: ["bcv-euro-rate"],
});

export async function getEuroRate(): Promise<BcvRate> {
  return getCachedEuroRate();
}

export async function refreshEuroRate(): Promise<BcvRate> {
  revalidateTag("bcv-euro-rate");
  return getCachedEuroRate();
}