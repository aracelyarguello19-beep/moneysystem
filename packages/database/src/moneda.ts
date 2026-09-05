import { type Prisma } from "@prisma/client";

// Story rediseño Caja multimoneda: una cuenta Efectivo nueva declara su
// moneda por código libre (ej. "USD") en vez de elegir una del catálogo —
// el catálogo de Monedas como pantalla aparte se elimina, así que esta es
// la única vía para dar de alta una moneda nueva. Búsqueda case-insensitive
// ("usd" y "USD" resuelven a la misma fila) para no duplicar por
// mayúsculas; si no existe, se crea con `nombre` igual al código (editable
// más adelante si hiciera falta) y `esBase: false`.
export async function buscarOCrearMoneda(
  tx: Prisma.TransactionClient,
  params: { cuentaId: string; negocioId: string; codigo: string }
): Promise<{ id: string; creada: boolean }> {
  const codigo = params.codigo.trim().toUpperCase();

  const existente = await tx.moneda.findFirst({
    where: {
      cuentaId: params.cuentaId,
      negocioId: params.negocioId,
      ambito: "LABORAL",
      codigo: { equals: codigo, mode: "insensitive" },
    },
  });
  if (existente) return { id: existente.id, creada: false };

  const nueva = await tx.moneda.create({
    data: {
      cuentaId: params.cuentaId,
      negocioId: params.negocioId,
      ambito: "LABORAL",
      codigo,
      nombre: codigo,
      esBase: false,
      activa: true,
    },
  });
  return { id: nueva.id, creada: true };
}
