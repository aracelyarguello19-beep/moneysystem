import { type Prisma } from "@prisma/client";

// Story 1.3, Task 2: el cliente Prisma y la capa de acceso a datos viven en
// `./rls-context` (la ubicación que fija architecture/unified-project-structure.md
// para `withRlsContext`). `index.ts` los re-exporta para que
// `import { prisma, withRlsContext } from "@repo/database"` siga siendo el
// único punto de entrada del paquete.
import { prisma } from "./rls-context";

export { prisma, withRlsContext, withRlsContextConsolidado } from "./rls-context";

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

// Siembra los tipos de gasto por defecto (Insumos, Compras, Publicidad) al
// crear un negocio — mismo criterio idempotente que `seedMonedaBase`, para
// que el usuario no tenga que crearlos a mano antes de poder registrar su
// primer gasto. El usuario puede seguir agregando tipos propios además.
export async function seedTiposGastoDefault(
  tx: Prisma.TransactionClient,
  params: { cuentaId: string; negocioId: string }
): Promise<void> {
  await tx.tipoGasto.createMany({
    data: [
      { cuentaId: params.cuentaId, negocioId: params.negocioId, ambito: "LABORAL", nombre: "Insumos", clasificacion: "OPERATIVO" },
      { cuentaId: params.cuentaId, negocioId: params.negocioId, ambito: "LABORAL", nombre: "Compras", clasificacion: "OPERATIVO" },
      { cuentaId: params.cuentaId, negocioId: params.negocioId, ambito: "LABORAL", nombre: "Publicidad", clasificacion: "OPERATIVO" },
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
