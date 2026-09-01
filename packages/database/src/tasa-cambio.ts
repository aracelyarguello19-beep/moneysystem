import type { Prisma } from "@prisma/client";

// Task 2 (Story 5.3): resuelve la `TasaCambio` vigente a una fecha dada —
// la de `vigente_desde` más reciente que no sea posterior a esa fecha.
// Quien llama es responsable de grabar el `id` resultante en la transacción
// (compra/venta) de forma inmutable — esta función solo resuelve, nunca
// decide si conviene o no aplicar una tasa nueva más tarde.
export async function resolverTasaCambioVigente(
  tx: Prisma.TransactionClient,
  monedaId: string,
  fecha: Date
): Promise<{ id: string; tasa: Prisma.Decimal } | null> {
  return tx.tasaCambio.findFirst({
    where: { monedaId, vigenteDesde: { lte: fecha } },
    orderBy: { vigenteDesde: "desc" },
    select: { id: true, tasa: true },
  });
}
