"use server";

import { revalidatePath } from "next/cache";
import type { Negocio, Result } from "@repo/domain";
import { editarNegocioSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// Edita nombre y logo — nunca el tipo (fija secciones/indicadores del
// negocio, ver TipoNegocio en negocio.ts) ni el estado (eso es
// eliminarNegocio, no esta acción).
export async function editarNegocio(input: unknown): Promise<Result<Negocio>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = editarNegocioSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: "VALIDATION",
        message: parsed.error.issues[0]?.message ?? "Datos inválidos.",
        requestId,
        timestamp,
      },
    };
  }

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
        where: { id: parsed.data.negocioId },
        data: { nombre: parsed.data.nombre, logoUrl: parsed.data.logoUrl ?? null },
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
        logoUrl: negocio.logoUrl,
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
