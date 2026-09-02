# API Specification

**No se eligió REST/GraphQL/tRPC como estilo primario.** El estilo de API es **Server Actions de Next.js** para toda mutación de dominio, más un **Route Handler REST mínimo** para los dos casos que por definición no pueden pasar por una Server Action ligada a sesión de usuario: el health check público de Story 1.1, y el trigger del job de cierre de período (ADR-001, invocado por Vercel Cron, sin sesión de usuario).

**Rationale de la elección:**
- Todo el sistema corre en un único proceso Next.js — no hay un cliente externo (app móvil nativa, integración de terceros) que necesite un contrato HTTP documentado formalmente. El PRD confirma explícitamente que no hay integraciones externas en el MVP.
- Server Actions dan tipado de extremo a extremo gratis (la firma de la función es el contrato) sin mantener un schema OpenAPI o GraphQL en paralelo que se puede desincronizar del código real.
- Si en el futuro se necesita exponer una API pública (app móvil, integraciones), se puede envolver la misma capa `packages/domain`/`packages/database` en Route Handlers REST sin reescribir lógica de negocio — la decisión no cierra esa puerta.

## Convención de Server Actions

Cada Server Action:
1. Se ubica en `apps/web/src/actions/<dominio>/<accion>.ts` (ej. `actions/ventas/registrar-venta.ts`).
2. Valida su input con un schema Zod definido en `packages/domain` (compartido con la validación de formularios del cliente).
3. Resuelve la cuenta autenticada desde la sesión de Supabase (vía middleware) y el negocio activo desde el argumento explícito recibido de la UI — nunca de una cookie implícita, para que el aislamiento sea auditable en el código de la propia función.
4. Ejecuta la operación dentro de `withRlsContext(cuentaId, negocioId, fn)` (ver Backend Architecture).
5. Devuelve un `Result<T, ApiError>` tipado (ver Error Handling Strategy) — nunca lanza excepciones no controladas hacia el cliente.

**Firmas representativas** (contrato, no implementación):

```typescript
// actions/ventas/registrar-venta.ts
export async function registrarVenta(
  negocioId: string,
  input: RegistrarVentaInput   // Zod-inferred desde packages/domain
): Promise<Result<Venta, ApiError>>;

// actions/negocios/crear-negocio.ts
export async function crearNegocio(
  input: CrearNegocioInput
): Promise<Result<Negocio, ApiError>>;

// actions/indicadores/obtener-indicadores.ts
export async function obtenerIndicadores(
  negocioId: string,
  periodo: PeriodoFiltro
): Promise<Result<IndicadoresFinancieros, ApiError>>;

// actions/consolidado/obtener-dashboard-consolidado.ts
export async function obtenerDashboardConsolidado(
  periodo: PeriodoFiltro
): Promise<Result<DashboardConsolidado, ApiError>>;   // única acción que usa el bypass "*" de negocio (ver Database Architecture)
```

## Route Handlers (REST mínimo)

```yaml
openapi: 3.0.0
info:
  title: Money System — Route Handlers
  version: 1.0.0
  description: Los dos únicos endpoints HTTP del sistema fuera de Server Actions.
servers:
  - url: /api
    description: Mismo origen que la app Next.js
paths:
  /health:
    get:
      summary: Estado del sistema (Story 1.1, AC2)
      security: []   # sin autenticación, por diseño (AC2 de Story 1.1)
      responses:
        "200":
          description: Sistema y base de datos operativos
          content:
            application/json:
              schema:
                type: object
                properties:
                  status: { type: string, enum: [ok] }
                  database: { type: string, enum: [connected] }
                  timestamp: { type: string, format: date-time }
        "503":
          description: Base de datos no responde
  /cron/cierre-periodo:
    get:
      summary: Trigger del job de cierre de período (ADR-001) — retiro automático (FR26/Story 6.2) + aporte a reserva (FR31/Story 6.5)
      description: Invocado exclusivamente por Vercel Cron (no hay sesión de usuario). Ver "Jobs Programados (Cierre de Período)" en Backend Architecture.
      security:
        - cronSecret: []
      responses:
        "200":
          description: Ejecutado (puede ser no-op si no es el último día del mes, o si el período ya fue aplicado)
        "401":
          description: Header Authorization ausente o no coincide con CRON_SECRET
components:
  securitySchemes:
    cronSecret:
      type: http
      scheme: bearer
      description: Header `Authorization: Bearer $CRON_SECRET`, inyectado automáticamente por Vercel Cron (ver Deployment Architecture)
```

---
