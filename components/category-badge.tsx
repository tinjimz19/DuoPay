"use client";

import { useCategories } from "@/components/categories-provider";
import { Badge } from "@/components/ui/badge";
import { categoryBadgeClass } from "@/lib/categories";
import { cn } from "@/lib/utils";

/**
 * La insignia de categoría.
 *
 * Antes tenía los cuatro colores escritos a mano; ahora el nombre y el
 * color salen del catálogo. Una categoría apagada se sigue pintando: lo
 * que ya se vendió tiene que poder verse igual.
 */
export function CategoryBadge({ category }: { category: string }) {
  const { get } = useCategories();
  const c = get(category);

  return (
    <Badge
      variant="outline"
      className={cn("border", categoryBadgeClass(c.color))}
    >
      {c.label}
    </Badge>
  );
}
