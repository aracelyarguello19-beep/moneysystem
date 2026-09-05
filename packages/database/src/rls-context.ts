import { PrismaClient, type Prisma } from "@prisma/client";

// ============================================================================
// Data Access Layer — única puerta de acceso a datos (Story 1.3, Story 1.5)
// ============================================================================
// Esta es la pieza más crítica de todo el backend: convierte el requisito de
// negocio (NFR1/NFR2) en un mecanismo que el código no puede accidentalmente
// saltarse. Ninguna Server Action llama a `prisma` directamente — siempre pasa
// por `withRlsContext`.
// [Source: architecture/backend-architecture.md#Database Architecture,
//  architecture/coding-standards.md#Critical Fullstack Rules]

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Conectado como `app_user` (NOBYPASSRLS) vía DATABASE_URL — ver
// docs/architecture/backend-architecture.md#Database Architecture.
// El rol `postgres` (superuser) y `service_role` de Supabase ignoran RLS por
// diseño; si DATABASE_URL apuntara a cualquiera de ellos, todas las policies
// del schema serían decorativas. `packages/database/tests/aislamiento-*.test.ts`
// verifica explícitamente que el rol conectado no tenga BYPASSRLS.
// Singleton para evitar agotar conexiones con hot-reload en desarrollo.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Guarda de runtime para el bypass consolidado (Story 1.5, Task 4).
 *
 * Hasta ahora "ninguna Server Action del módulo Laboral usa `'*'` como
 * negocioId" era solo una regla de code review sin ningún mecanismo que la
 * hiciera cumplir. Un `negocioId` que llegue como `'*'` desde cualquier capa
 * (un query param, un form field, un default mal puesto) convertiría una
 * operación de un solo negocio en una operación sobre TODOS los negocios de la
 * cuenta, sin que RLS pueda distinguirlo — exactamente el agujero que el
 * aislamiento por negocio existe para cerrar.
 *
 * `withRlsContextConsolidado` fija el `'*'` internamente y nunca lo recibe como
 * argumento, así que esta guarda no lo afecta.
 */
function assertNegocioIdAislado(negocioId: string): void {
  if (negocioId === "*") {
    throw new Error(
      "withRlsContext: `'*'` no es un negocioId válido. La lectura consolidada " +
        "solo se hace con `withRlsContextConsolidado`, importable únicamente desde " +
        "actions/consolidado/* (ver architecture/coding-standards.md#Critical Fullstack Rules)."
    );
  }
  if (!UUID_RE.test(negocioId)) {
    throw new Error(`withRlsContext: negocioId inválido (se esperaba un UUID): ${negocioId}`);
  }
}

function assertCuentaId(cuentaId: string): void {
  if (!UUID_RE.test(cuentaId)) {
    throw new Error(`withRlsContext: cuentaId inválido (se esperaba un UUID): ${cuentaId}`);
  }
}

/**
 * Abre una transacción y fija el contexto de RLS antes de ejecutar `fn`.
 *
 * - `request.jwt.claims.sub` → lo que lee `auth.uid()` en cada policy
 *   (aislamiento por cuenta, Story 1.3).
 * - `app.active_negocio_id`  → lo que leen las policies compuestas
 *   (aislamiento por negocio, Story 1.5).
 *
 * Ambos se fijan con `set_config(..., is_local => true)`: viven solo dentro de
 * esta transacción y se descartan al terminarla, así que una conexión reciclada
 * del pool nunca arrastra el contexto de la request anterior.
 *
 * Cuando `negocioId` es `null` (ámbito Personal / operaciones de cuenta) se fija
 * explícitamente en cadena vacía en lugar de dejarlo sin fijar: `nullif('', '')`
 * es `null`, así que las policies por negocio dan falso igual, pero el valor
 * queda fijado de forma explícita en vez de depender de que nadie lo haya
 * seteado antes en esta misma transacción.
 */
export async function withRlsContext<T>(
  cuentaId: string,
  negocioId: string | null,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  assertCuentaId(cuentaId);
  if (negocioId !== null) assertNegocioIdAislado(negocioId);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('request.jwt.claims', $1, true)`,
        JSON.stringify({ sub: cuentaId, role: "authenticated" })
      );
      await tx.$executeRawUnsafe(
        `select set_config('app.active_negocio_id', $1, true)`,
        negocioId ?? ""
      );
      // Guarda de pertenencia (Hallazgo 3, auditoría RLS): `negocioId` llega
      // desde el cliente (selector de negocio activo) sin validar. La policy
      // de `negocios` ya exige `cuenta_id = auth.uid()`, así que este lookup
      // usa RLS mismo para confirmar que el negocio es de esta cuenta antes
      // de dejar correr `fn` — un `negocioId` ajeno no filtra datos (RLS ya lo
      // impide en cada tabla), pero sin esta guarda una escritura podía crear
      // filas con un `negocio_id` que no pertenece a la cuenta dueña.
      if (negocioId !== null) {
        const negocio = await tx.negocio.findUnique({ where: { id: negocioId } });
        if (!negocio) {
          throw new Error(
            `withRlsContext: negocioId no pertenece a la cuenta autenticada: ${negocioId}`
          );
        }
      }
      return fn(tx);
    },
    // Default de Prisma (5s) alcanza para una operación de un solo ítem, pero
    // una Venta/Compra con varios ítems hace un round-trip remoto por ítem
    // (findUnique + update de stock, etc.) y puede superarlo bajo latencia de
    // red normal contra Supabase, abortando la transacción a mitad de camino
    // ("Transaction not found... obtained before disconnecting").
    { timeout: 15000, maxWait: 5000 }
  );
}

// ⚠️ BYPASS CONSOLIDADO RESTRINGIDO (Coding Standards, Story 5.4) ⚠️
// Setea `app.active_negocio_id = '*'`, lo que hace visibles TODOS los
// negocios de la cuenta en una sola query — únicamente para LECTURA. Este
// import está autorizado EXCLUSIVAMENTE desde
// `apps/web/src/actions/consolidado/obtener-dashboard-consolidado.ts`.
// Ningún otro archivo del repo debe importarlo: RLS no puede distinguir
// "intención de lectura" de "intención de escritura" dentro de la misma
// policy `USING`, así que esta restricción se aplica en código/code review,
// no hay lint automático para esto (riesgo conocido y documentado).
// [Source: architecture/backend-architecture.md#Database Architecture, architecture/coding-standards.md#Critical Fullstack Rules]
export async function withRlsContextConsolidado<T>(
  cuentaId: string,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  assertCuentaId(cuentaId);

  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRawUnsafe(
        `select set_config('request.jwt.claims', $1, true)`,
        JSON.stringify({ sub: cuentaId, role: "authenticated" })
      );
      await tx.$executeRawUnsafe(`select set_config('app.active_negocio_id', '*', true)`);
      return fn(tx);
    },
    { timeout: 15000, maxWait: 5000 }
  );
}
