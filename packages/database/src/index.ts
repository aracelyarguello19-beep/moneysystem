import { PrismaClient, type Prisma } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Conectado como `app_user` (NOBYPASSRLS) vía DATABASE_URL — ver
// docs/architecture/backend-architecture.md#Database Architecture.
// Singleton para evitar agotar conexiones con hot-reload en desarrollo.
export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

// [Source: architecture/backend-architecture.md#Database Architecture]
export async function withRlsContext<T>(
  cuentaId: string,
  negocioId: string | null,
  fn: (tx: Prisma.TransactionClient) => Promise<T>
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('request.jwt.claims', $1, true)`,
      JSON.stringify({ sub: cuentaId, role: "authenticated" })
    );
    if (negocioId) {
      await tx.$executeRawUnsafe(
        `select set_config('app.active_negocio_id', $1, true)`,
        negocioId
      );
    }
    return fn(tx);
  });
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
  return prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `select set_config('request.jwt.claims', $1, true)`,
      JSON.stringify({ sub: cuentaId, role: "authenticated" })
    );
    await tx.$executeRawUnsafe(`select set_config('app.active_negocio_id', '*', true)`);
    return fn(tx);
  });
}

// Story 1.6, Task 2: siembra el Guaraní como moneda base al crear un negocio
// nuevo (ambito LABORAL) o en el primer acceso al catálogo Personal (ambito
// PERSONAL, negocioId null). Debe llamarse dentro del mismo `withRlsContext`
// que hace la operación que la dispara, para que quede sujeta a RLS como
// cualquier otra escritura. `skipDuplicates` la vuelve idempotente contra los
// índices únicos parciales (uq_moneda_laboral/uq_moneda_personal), definidos
// solo en SQL — Postgres emite `ON CONFLICT DO NOTHING` sin necesidad de que
// Prisma conozca el índice.
// [Source: architecture/database-schema.md, Story 1.6 AC4]
export async function seedMonedaBase(
  tx: Prisma.TransactionClient,
  params: { cuentaId: string; negocioId: string | null; ambito: "LABORAL" | "PERSONAL" }
): Promise<void> {
  await tx.moneda.createMany({
    data: [
      {
        cuentaId: params.cuentaId,
        negocioId: params.negocioId,
        ambito: params.ambito,
        codigo: "PYG",
        nombre: "Guaraní",
        esBase: true,
        activa: true,
      },
    ],
    skipDuplicates: true,
  });
}

export * from "./inventario";
export * from "./ledger";
export * from "./tasa-cambio";

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
