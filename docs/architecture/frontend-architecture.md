# Frontend Architecture

## Component Architecture

**Component Organization:**
```text
apps/web/src/
├── app/
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── registro/page.tsx
│   ├── (app)/
│   │   ├── layout.tsx                 # incluye Selector Laboral/Personal + Selector de Negocio
│   │   ├── negocios/page.tsx          # gestión de negocios (Story 1.4)
│   │   ├── laboral/
│   │   │   ├── dashboard/page.tsx     # indicadores del negocio activo (Story 5.1-5.2)
│   │   │   ├── catalogo/page.tsx      # ítems (Story 2.1)
│   │   │   ├── compras/page.tsx
│   │   │   ├── ventas/page.tsx
│   │   │   ├── cuentas-por-cobrar/page.tsx
│   │   │   ├── gastos/page.tsx
│   │   │   ├── tarjeta/page.tsx
│   │   │   └── configuracion/page.tsx # catálogos moneda/tipo-gasto
│   │   ├── personal/
│   │   │   ├── balance/page.tsx
│   │   │   ├── gastos/page.tsx
│   │   │   ├── reserva/page.tsx
│   │   │   └── tarjeta/page.tsx
│   │   └── consolidado/page.tsx       # dashboard consolidado (Story 5.4)
│   └── api/health/route.ts
├── actions/                           # Server Actions, organizadas por dominio (ver API Specification)
├── components/
│   ├── ui/                            # shadcn/ui (copiado, no editado a mano salvo tokens)
│   ├── forms/                         # formularios de carga rápida (venta/compra/gasto/retiro)
│   └── dashboard/                     # tarjetas de indicador, gráficos, tablas
├── stores/
│   └── negocio-activo.store.ts        # Zustand — negocio activo + ámbito
└── lib/
    └── supabase/                      # clientes server/browser de @supabase/ssr
```

**Component Template:**
```typescript
// components/forms/registrar-venta-form.tsx
"use client";

import { useNegocioActivoStore } from "@/stores/negocio-activo.store";
import { registrarVenta } from "@/actions/ventas/registrar-venta";
import { registrarVentaSchema } from "@repo/domain/schemas";

export function RegistrarVentaForm() {
  const negocioId = useNegocioActivoStore((s) => s.negocioActivoId);
  // react-hook-form + zodResolver(registrarVentaSchema) — mismo schema
  // que valida en el servidor dentro de la Server Action.
  // onSubmit -> registrarVenta(negocioId, data)
  return /* ... */ null;
}
```

## State Management Architecture

**State Structure:**
```typescript
// stores/negocio-activo.store.ts
interface NegocioActivoState {
  ambito: "LABORAL" | "PERSONAL";
  negocioActivoId: string | null;   // null solo si ámbito === "PERSONAL" o no hay negocios aún
  setAmbito: (ambito: "LABORAL" | "PERSONAL") => void;
  setNegocioActivo: (negocioId: string) => void;
}
// Persistido en localStorage (zustand/middleware persist) — recuerda
// la última selección entre sesiones, sin volver a pedirla (UX Vision del PRD).
```

**State Management Patterns:**
- Zustand solo para estado de **UI efímera y de navegación** (negocio activo, ámbito) — nunca para datos que vienen del servidor.
- React Query para todo **estado de servidor** (indicadores, listados, saldos) con `staleTime` corto (30s) y `invalidateQueries` disparado tras cada Server Action exitosa relevante — cumple NFR4 (tiempo real) sin necesidad de WebSockets/polling agresivo para este volumen.
- Ninguna mutación de estado directa: todo cambio de datos de dominio pasa por una Server Action, nunca por `setState` sobre datos de servidor.

## Routing Architecture

**Route Organization:** ver árbol de `app/` arriba. `(auth)` y `(app)` son route groups — `(app)` está protegido por middleware; `(auth)` es público.

**Protected Route Pattern:**
```typescript
// middleware.ts
import { createServerClient } from "@supabase/ssr";

export async function middleware(request: NextRequest) {
  const { supabase, response } = createServerSupabaseClient(request);
  const { data: { user } } = await supabase.auth.getUser();

  const isAuthRoute = request.nextUrl.pathname.startsWith("/login")
    || request.nextUrl.pathname.startsWith("/registro");
  const isPublicRoute = request.nextUrl.pathname.startsWith("/api/health") || isAuthRoute;

  if (!user && !isPublicRoute) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return response;
}
```

## Frontend Services Layer

**API Client Setup:** no hay un "cliente HTTP" tradicional — las Server Actions se invocan como funciones. La única configuración de cliente es la de Supabase (para leer la sesión en Client Components donde haga falta, ej. mostrar el email del usuario).

```typescript
// lib/supabase/browser.ts
import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Service Example (React Query + Server Action):**
```typescript
// hooks/use-indicadores.ts
import { useQuery } from "@tanstack/react-query";
import { obtenerIndicadores } from "@/actions/indicadores/obtener-indicadores";

export function useIndicadores(negocioId: string, periodo: PeriodoFiltro) {
  return useQuery({
    queryKey: ["indicadores", negocioId, periodo],
    queryFn: async () => {
      const result = await obtenerIndicadores(negocioId, periodo);
      if (!result.ok) throw result.error;
      return result.data;
    },
    staleTime: 30_000,
  });
}
```

---
