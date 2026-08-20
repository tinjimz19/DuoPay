import type { ProductCategory } from "@/types/database.types";
import { CATEGORY_LABELS } from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const CATEGORY_STYLES: Record<ProductCategory, string> = {
  ROPA:
    "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800",
  CALZADO:
    "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800",
  PERFUME:
    "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800",
  OTRO:
    "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700",
};

export function CategoryBadge({ category }: { category: ProductCategory }) {
  return (
    <Badge variant="outline" className={cn("border", CATEGORY_STYLES[category])}>
      {CATEGORY_LABELS[category]}
    </Badge>
  );
}