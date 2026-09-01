"use server";

import type { Negocio } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export const listarNegocios = withErrorHandling(async (): Promise<Negocio[]> => {
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const negocios = await withRlsContext(cuenta.id, null, (tx) =>
    tx.negocio.findMany({
      where: { cuentaId: cuenta.id },
      orderBy: { createdAt: "asc" },
    })
  );

  return negocios.map((n) => ({
    id: n.id,
    cuentaId: n.cuentaId,
    nombre: n.nombre,
    estado: n.estado as Negocio["estado"],
    createdAt: n.createdAt,
    archivedAt: n.archivedAt,
  }));
});
