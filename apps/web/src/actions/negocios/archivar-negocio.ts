"use server";

import { revalidatePath } from "next/cache";
import type { Negocio, Result } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// No usa `withErrorHandling`: el AC3 de Story 1.3 exige que un intento de
// acceso a un negocio de otra cuenta por id directo se rechace en la capa de
// datos, no solo en la interfaz. `tx.negocio.update({ where: { id } })` bajo
// RLS falla (P2025) tanto si el id no existe como si pertenece a otra
// cuenta — ambos casos deben verse idénticos hacia afuera (nunca revelar
// cuál de los dos ocurrió), así que se mapean al mismo `NOT_FOUND`.
// [Source: architecture/error-handling-strategy.md#Error Response Format]
export async function archivarNegocio(negocioId: string): Promise<Result<Negocio>> {
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
    const negocio = await withRlsContext(cuenta.id, null, (tx) =>
      tx.negocio.update({
        where: { id: negocioId },
        data: { estado: "ARCHIVADO", archivedAt: new Date() },
      })
    );

    revalidatePath("/negocios");

    return {
      ok: true,
      data: {
        id: negocio.id,
        cuentaId: negocio.cuentaId,
        nombre: negocio.nombre,
        tipo: negocio.tipo as Negocio["tipo"],
        estado: negocio.estado as Negocio["estado"],
        createdAt: negocio.createdAt,
        archivedAt: negocio.archivedAt,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "NOT_FOUND",
        message: "Negocio no encontrado.",
        requestId,
        timestamp,
      },
    };
  }
}
