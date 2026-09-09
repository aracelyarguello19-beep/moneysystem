"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { Result } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// Borrado permanente (no archivado): la fila de `negocios` tiene
// `onDelete: Cascade` hacia ventas, compras, gastos, cuentas por cobrar,
// cuentas financieras, ítems, tipos de gasto y monedas — eliminar el negocio
// elimina todos sus datos en una sola operación. El popup de confirmación en
// `EliminarNegocioButton` es la única salvaguarda; no hay soft-delete.
//
// No usa `withErrorHandling`: mismo criterio que `archivarNegocio` (Story
// 1.3, AC3) — un id inexistente y uno de otra cuenta deben fallar idéntico
// hacia afuera bajo RLS (P2025 → NOT_FOUND genérico).
// [Source: architecture/error-handling-strategy.md#Error Response Format]
export async function eliminarNegocio(negocioId: string): Promise<Result<void>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const cuenta = await getCurrentAccount();
  if (!cuenta) {
    return {
      ok: false,
      error: {
        code: "UNAUTHENTICATED",
        message: "No hay sesión activa.",
        requestId,
        timestamp,
      },
    };
  }

  try {
    await withRlsContext(cuenta.id, null, (tx) =>
      tx.negocio.delete({ where: { id: negocioId } })
    );

    revalidatePath("/negocios");

    return { ok: true, data: undefined };
  } catch (error) {
    // P2025: el `where` no encontró fila (ya borrado, o de otra cuenta bajo
    // RLS). P2003: violación de FK — alguna tabla con `negocio_id` todavía no
    // tiene `ON DELETE CASCADE` aplicado en la base real. Cualquier otro
    // código quedaba antes escondido detrás de "Negocio no encontrado",
    // que no correspondía y no daba pista de qué lo bloqueaba.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return {
        ok: false,
        error: { code: "NOT_FOUND", message: "Negocio no encontrado.", requestId, timestamp },
      };
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003") {
      return {
        ok: false,
        error: {
          code: "DATABASE_ERROR",
          message:
            "No se pudo eliminar: todavía tiene datos relacionados que la base de datos no puede borrar en cascada.",
          requestId,
          timestamp,
        },
      };
    }
    console.error("eliminarNegocio: error inesperado", error);
    return {
      ok: false,
      error: {
        code: "UNKNOWN",
        message: error instanceof Error ? error.message : "No se pudo eliminar el negocio.",
        requestId,
        timestamp,
      },
    };
  }
}
