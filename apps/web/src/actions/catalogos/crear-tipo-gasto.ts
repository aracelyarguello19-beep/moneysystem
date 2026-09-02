"use server";

import { revalidatePath } from "next/cache";
import type { TipoGasto } from "@repo/domain";
import { crearTipoGastoSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// [Source: architecture/api-specification.md#Convención de Server Actions]
export const crearTipoGasto = withErrorHandling(async (input: unknown): Promise<TipoGasto> => {
  const parsed = crearTipoGastoSchema.parse(input);
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const tipoGasto = await withRlsContext(cuenta.id, parsed.negocioId, (tx) =>
    tx.tipoGasto.create({
      data: {
        cuentaId: cuenta.id,
        negocioId: parsed.negocioId,
        ambito: "LABORAL",
        nombre: parsed.nombre,
        clasificacion: parsed.clasificacion,
      },
    })
  );

  revalidatePath("/laboral/configuracion");

  return {
    id: tipoGasto.id,
    cuentaId: tipoGasto.cuentaId,
    negocioId: tipoGasto.negocioId,
    ambito: tipoGasto.ambito as TipoGasto["ambito"],
    nombre: tipoGasto.nombre,
    clasificacion: tipoGasto.clasificacion as TipoGasto["clasificacion"],
  };
});
