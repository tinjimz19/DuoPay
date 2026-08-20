import type { ProductCategory, PreorderStatus, SaleStatus } from "@/types/database.types";

export const CATEGORY_LABELS: Record<ProductCategory, string> = {
  ROPA: "Ropa",
  CALZADO: "Calzado",
  PERFUME: "Perfume",
  OTRO: "Otro",
};

export const CATEGORY_OPTIONS: { value: ProductCategory; label: string }[] = [
  { value: "ROPA", label: "Ropa" },
  { value: "CALZADO", label: "Calzado" },
  { value: "PERFUME", label: "Perfume" },
  { value: "OTRO", label: "Otro" },
];

export const SALE_STATUS_LABELS: Record<SaleStatus, string> = {
  PENDING: "Pendiente",
  PARTIAL: "En cuotas",
  COMPLETED: "Saldado",
};

export const SALE_STATUS_STYLES: Record<SaleStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  PARTIAL: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  COMPLETED:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
};

export const PREORDER_STATUS_LABELS: Record<PreorderStatus, string> = {
  PENDENT: "Pendiente",
  ORDERED: "Comprado",
  DELIVERED: "Entregado",
  CANCELLED: "Cancelado",
};

export const PREORDER_STATUS_STYLES: Record<PreorderStatus, string> = {
  PENDENT:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
  ORDERED:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  DELIVERED:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  CANCELLED:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export const PREORDER_STATUS_OPTIONS: {
  value: PreorderStatus;
  label: string;
}[] = [
  { value: "PENDENT", label: "Pendiente" },
  { value: "ORDERED", label: "Comprado" },
  { value: "DELIVERED", label: "Entregado" },
  { value: "CANCELLED", label: "Cancelado" },
];