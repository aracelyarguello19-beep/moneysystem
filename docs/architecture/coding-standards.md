# Coding Standards

Mínimas pero críticas — solo reglas específicas de este proyecto que previenen errores concretos, pensadas para agentes de desarrollo IA (@dev).

## Critical Fullstack Rules

- **Contexto de Negocio Obligatorio:** ninguna Server Action del módulo Laboral llama a Prisma directamente — siempre pasa por `withRlsContext(cuentaId, negocioId, fn)`. Una función que reciba un `negocioId` y no lo use dentro de `withRlsContext` es un bug, no una variación aceptable.
- **Bypass Consolidado Restringido:** `withRlsContextConsolidado` (con `app.active_negocio_id = '*'`) solo se importa desde `actions/consolidado/*`. Ningún otro archivo del repo debe importarlo — se verifica en code review, no hay lint automático para esto (documentado como riesgo conocido, ver Security).
- **Dinero como Decimal, nunca `number`:** todo monto monetario es `string` (Decimal serializado) en `packages/domain` y `Prisma.Decimal` en la capa de datos. Ningún cálculo financiero usa el tipo `number` de JavaScript — la imprecisión de punto flotante es inaceptable en un sistema financiero.
- **Moneda Siempre Acompañada:** ningún campo/parámetro que represente un monto se pasa sin su `monedaId` (o su `codigo`) junto — refuerza NFR6 estructuralmente en el tipo, no solo en la base de datos.
- **Tasa de Cambio Inmutable:** una transacción nunca recalcula su conversión a Guaraníes leyendo la tasa "actual" — siempre usa el `tasaCambioId` que quedó grabado en el momento de creación (FR35). Un reporte histórico jamás vuelve a resolver la tasa vigente hoy.
- **Type Sharing:** todo tipo de dominio y schema Zod vive en `packages/domain` — ni `apps/web` ni `packages/database` redefinen un tipo que ya existe ahí.
- **Server Actions como Única Puerta de Mutación:** ningún Client Component hace `fetch` a un endpoint propio para mutar datos de dominio — siempre invoca una Server Action importada. El único `fetch` legítimo es hacia servicios externos que no existen en este MVP.
- **Environment Variables:** acceso solo a través de un objeto de configuración validado con Zod en el arranque (`lib/env.ts`) — nunca `process.env.X` disperso en el código.
- **Revalidation Explícita:** toda Server Action que muta datos llama a `revalidatePath`/`revalidateTag` sobre las rutas que dependen de esos datos antes de retornar — no se confía en que el cliente recargue por su cuenta.

## Naming Conventions

| Element | Frontend | Backend | Example |
|---|---|---|---|
| Components | PascalCase | - | `RegistrarVentaForm.tsx` |
| Hooks | camelCase con `use` | - | `useIndicadores.ts` |
| Server Actions | camelCase, verbo + entidad | camelCase, verbo + entidad | `registrarVenta`, `archivarNegocio` |
| Domain Types | PascalCase (español, ubicuo con el PRD) | PascalCase | `Venta`, `CuentaFinanciera`, `IndicadoresFinancieros` |
| Database Tables | - | snake_case (español) | `cuentas_por_cobrar`, `movimientos_cuenta` |
| Database Columns | - | snake_case | `negocio_id`, `costo_unitario` |

**Nota sobre el idioma de los nombres:** tablas, columnas y tipos de dominio usan **español**, deliberadamente — es el mismo lenguaje ubicuo que usa el PRD (Negocio, Venta, CuentaPorCobrar, GananciaLíquida). Mantener el mismo vocabulario entre el documento de producto y el código reduce el riesgo de traducción incorrecta de una regla de negocio al implementarla — principio de Domain-Driven Design aplicado sin necesidad de tooling adicional.

---
