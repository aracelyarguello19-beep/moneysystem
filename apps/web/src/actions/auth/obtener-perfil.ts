"use server";

import type { Cuenta } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export const obtenerPerfil = withErrorHandling(async (): Promise<Cuenta> => {
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const registro = await withRlsContext(cuenta.id, null, (tx) =>
    tx.cuenta.findUniqueOrThrow({ where: { id: cuenta.id } })
  );

  return {
    id: registro.id,
    email: registro.email,
    nombre: registro.nombre,
    createdAt: registro.createdAt,
  };
});
