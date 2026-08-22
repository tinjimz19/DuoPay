# DuoPay

PWA de uso personal para gestionar **clientes, ventas a crédito en cuotas configurables, abonos y pedidos/encargos** de mercancía (ropa, calzado y perfumes). Multi-usuario aislado mediante Supabase Auth + Row Level Security.

## Stack

- Next.js 14 (App Router, React Server Components, Server Actions)
- Supabase (PostgreSQL, Auth, RLS)
- Tailwind CSS + shadcn/ui + Lucide Icons
- Zod + React Hook Form
- PWA instalable (manifest + íconos)
- Deploy: Vercel

## Puesta en marcha

### 1. Proyecto de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Abre **SQL Editor** y ejecuta el contenido de [`supabase/schema.sql`](supabase/schema.sql). Crea las tablas, políticas RLS y triggers.

### 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completa en `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

(Puedes copiar valores desde Supabase → Settings → API.)

### 3. Instalar y ejecutar

```bash
npm install
npm run dev
```

## Scripts

| Comando          | Descripción                       |
| ---------------- | --------------------------------- |
| `npm run dev`    | Servidor de desarrollo            |
| `npm run build`  | Build de producción + typecheck   |
| `npm run start`  | Servidor de producción            |
| `npm run lint`   | Linter (ESLint)                   |

## Estructura

```text
app/
  (auth)/login/          Autenticación (login/registro)
  (dashboard)/           Inicio, Clientes, Ventas, Pedidos + Bottom Nav
actions/                 Server Actions con validación Zod y RLS
components/
  ui/                    shadcn/ui
  navigation/            Bottom Nav y header
  sales/                 Tarjeta de venta y modal de abonos
  preorders/             Tarjeta y formulario de pedidos
  clients/               Listado y formulario de clientes
lib/supabase/            Clientes Supabase (browser, server, middleware)
lib/                     utils y formateadores
types/                   Tipos de base de datos
supabase/schema.sql      Esquema SQL (tablas, RLS, triggers)
```

## Lógica de estados

- **Venta:** `PENDING` (sin abonos) → `PARTIAL` (abonada parcialmente) → `COMPLETED` (saldada).
- **Pedido:** `PENDENT` (por comprar) → `ORDERED` (comprado) → `DELIVERED` (entregado) o `CANCELLED`.
