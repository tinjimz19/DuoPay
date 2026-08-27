"use client";

import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Pencil,
  Plus,
  Tag,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  createCategory,
  deleteCategory,
  moveCategory,
  setCategoryActive,
  updateCategory,
} from "@/actions/category-actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  CATEGORY_COLOR_OPTIONS,
  categoryBadgeClass,
  categoryDotClass,
  slugifyCategory,
  type Category,
  type CategoryColor,
} from "@/lib/categories";
import { cn } from "@/lib/utils";

export interface CategoryWithUsage extends Category {
  /** Cuántas ventas, pedidos y productos la tienen puesta, en todas las tiendas. */
  usage: number;
}

function SelectorColor({
  value,
  onChange,
}: {
  value: string;
  onChange: (color: CategoryColor) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {CATEGORY_COLOR_OPTIONS.map((c) => (
        <button
          key={c.value}
          type="button"
          onClick={() => onChange(c.value)}
          aria-label={c.label}
          aria-pressed={value === c.value}
          title={c.label}
          className={cn(
            "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-colors",
            value === c.value
              ? "border-slate-900 dark:border-slate-100"
              : "border-transparent hover:border-slate-300 dark:hover:border-slate-600"
          )}
        >
          <span className={cn("h-6 w-6 rounded-full", categoryDotClass(c.value))} />
        </button>
      ))}
    </div>
  );
}

function FormularioCategoria({
  abierto,
  onOpenChange,
  categoria,
}: {
  abierto: boolean;
  onOpenChange: (v: boolean) => void;
  /** null = una nueva. */
  categoria: Category | null;
}) {
  const router = useRouter();
  const [label, setLabel] = React.useState(categoria?.label ?? "");
  const [color, setColor] = React.useState<string>(categoria?.color ?? "indigo");
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    if (!abierto) return;
    setLabel(categoria?.label ?? "");
    setColor(categoria?.color ?? "indigo");
  }, [abierto, categoria]);

  const esNueva = !categoria;
  const slug = esNueva ? slugifyCategory(label) : categoria.slug;

  function guardar() {
    if (label.trim().length < 2) {
      toast.error("El nombre debe tener al menos 2 letras");
      return;
    }
    startTransition(async () => {
      const res = esNueva
        ? await createCategory({ label: label.trim(), color })
        : await updateCategory({ slug: categoria.slug, label: label.trim(), color });

      if (res.success) {
        toast.success(esNueva ? "Categoría creada" : "Categoría actualizada");
        onOpenChange(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {esNueva ? "Nueva categoría" : "Editar categoría"}
          </DialogTitle>
          <DialogDescription>
            Queda disponible para todas las tiendas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-label">Nombre</Label>
            <Input
              id="cat-label"
              className="h-11"
              placeholder="Repuestos"
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            {esNueva && slug && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Se guardará como{" "}
                <code className="rounded bg-slate-100 px-1 py-0.5 font-mono dark:bg-slate-800">
                  {slug}
                </code>
                . Ese código no se puede cambiar después, porque es el que
                queda escrito en cada venta.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Color</Label>
            <SelectorColor value={color} onChange={setColor} />
            <div className="pt-1">
              <Badge
                variant="outline"
                className={cn("border", categoryBadgeClass(color))}
              >
                {label.trim() || "Así se verá"}
              </Badge>
            </div>
          </div>

          <Button
            type="button"
            className="h-11 w-full"
            disabled={pending}
            onClick={guardar}
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {esNueva ? "Crear categoría" : "Guardar cambios"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Fila({
  categoria,
  primera,
  ultima,
}: {
  categoria: CategoryWithUsage;
  primera: boolean;
  ultima: boolean;
}) {
  const router = useRouter();
  const [editar, setEditar] = React.useState(false);
  const [borrar, setBorrar] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  const enUso = categoria.usage > 0;

  function correr(direction: "up" | "down") {
    startTransition(async () => {
      const res = await moveCategory(categoria.slug, direction);
      if (res.success) router.refresh();
      else toast.error(res.error);
    });
  }

  function alternar(activa: boolean) {
    startTransition(async () => {
      const res = await setCategoryActive(categoria.slug, activa);
      if (res.success) router.refresh();
      else toast.error(res.error);
    });
  }

  function eliminar() {
    startTransition(async () => {
      const res = await deleteCategory(categoria.slug);
      if (res.success) {
        toast.success("Categoría eliminada");
        setBorrar(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  }

  return (
    <Card className="border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <CardContent className="flex items-center gap-2 p-3">
        <div className="flex shrink-0 flex-col">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={pending || primera}
            onClick={() => correr("up")}
            aria-label={`Subir ${categoria.label}`}
          >
            <ChevronUp className="h-4 w-4 text-slate-400" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={pending || ultima}
            onClick={() => correr("down")}
            aria-label={`Bajar ${categoria.label}`}
          >
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <Badge
            variant="outline"
            className={cn(
              "border",
              categoryBadgeClass(categoria.color),
              !categoria.is_active && "opacity-50"
            )}
          >
            {categoria.label}
          </Badge>
          <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
            {enUso
              ? `En uso · ${categoria.usage} registro${categoria.usage === 1 ? "" : "s"}`
              : "Sin usar"}
            {!categoria.is_active && " · apagada"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <Switch
            checked={categoria.is_active}
            disabled={pending}
            onCheckedChange={alternar}
            aria-label={`${categoria.is_active ? "Apagar" : "Encender"} ${categoria.label}`}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={pending}
            onClick={() => setEditar(true)}
            aria-label={`Editar ${categoria.label}`}
          >
            <Pencil className="h-4 w-4 text-slate-400" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            disabled={pending || enUso}
            onClick={() => setBorrar(true)}
            aria-label={`Eliminar ${categoria.label}`}
            title={
              enUso
                ? "No se puede borrar: hay registros con esta categoría. Apágala."
                : `Eliminar ${categoria.label}`
            }
          >
            <Trash2
              className={cn("h-4 w-4", enUso ? "text-slate-200 dark:text-slate-700" : "text-slate-400")}
            />
          </Button>
        </div>
      </CardContent>

      <FormularioCategoria
        abierto={editar}
        onOpenChange={setEditar}
        categoria={categoria}
      />
      <ConfirmDialog
        open={borrar}
        onOpenChange={setBorrar}
        title={`¿Eliminar "${categoria.label}"?`}
        description="Nadie la está usando, así que se puede borrar sin riesgo. Deja de aparecer en todas las tiendas."
        confirmLabel="Eliminar"
        pending={pending}
        onConfirm={eliminar}
      />
    </Card>
  );
}

export function CategoriesManager({
  categories,
}: {
  categories: CategoryWithUsage[];
}) {
  const [nueva, setNueva] = React.useState(false);

  return (
    <div className="space-y-3">
      {categories.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="flex flex-col items-center gap-2 p-6 text-center">
            <Tag className="h-8 w-8 text-slate-300 dark:text-slate-600" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              No hay categorías. Crea la primera.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {categories.map((c, i) => (
            <Fila
              key={c.slug}
              categoria={c}
              primera={i === 0}
              ultima={i === categories.length - 1}
            />
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => setNueva(true)}
      >
        <Plus className="h-4 w-4" />
        Agregar categoría
      </Button>

      <FormularioCategoria
        abierto={nueva}
        onOpenChange={setNueva}
        categoria={null}
      />
    </div>
  );
}
