import type {
  PreorderStatus,
  ProfileRole,
  ProfileStatus,
  SaleStatus,
} from "@/types/database.types";

/*
 * Las categorías ya no viven aquí: son datos que administra el super
 * admin. En el servidor se leen con `allCategories()`; en pantalla, con
 * el hook `useCategories()`.
 */

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

export const PROFILE_STATUS_LABELS: Record<ProfileStatus, string> = {
  TRIAL: "En prueba",
  ACTIVE: "Activa",
  SUSPENDED: "Suspendida",
  EXPIRED: "Vencida",
};

export const PROFILE_STATUS_STYLES: Record<ProfileStatus, string> = {
  TRIAL:
    "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800",
  ACTIVE:
    "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800",
  SUSPENDED:
    "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800",
  EXPIRED:
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800",
};

export const PROFILE_ROLE_LABELS: Record<ProfileRole, string> = {
  owner: "Tienda",
  super_admin: "Super admin",
};