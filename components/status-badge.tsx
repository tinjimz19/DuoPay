import type { PreorderStatus, SaleStatus } from "@/types/database.types";
import {
  PREORDER_STATUS_LABELS,
  PREORDER_STATUS_STYLES,
  SALE_STATUS_LABELS,
  SALE_STATUS_STYLES,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export function SaleStatusBadge({ status }: { status: SaleStatus }) {
  return (
    <Badge variant="outline" className={cn("border", SALE_STATUS_STYLES[status])}>
      {SALE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PreorderStatusBadge({ status }: { status: PreorderStatus }) {
  return (
    <Badge
      variant="outline"
      className={cn("border", PREORDER_STATUS_STYLES[status])}
    >
      {PREORDER_STATUS_LABELS[status]}
    </Badge>
  );
}