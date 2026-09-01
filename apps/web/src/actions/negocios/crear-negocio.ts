"use server";

import { revalidatePath } from "next/cache";
import type { Negocio } from "@repo/domain";
import { crearNegocioSchema } from "@repo/domain/schemas";
import { seedMonedaBase, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// [Source: architecture/api-specification.md#Convención de Server Actions]
export const crearNegocio = withErrorHandling(async (input: unknown): Promise<Negocio> => {
  const parsed = crearNegocioSchema.parse(input);
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const negocio = await withRlsContext(cuenta.id, null, (tx) =>
    tx.negocio.create({
      data: { cuentaId: cuenta.id, nombre: parsed.nombre },
    })
  );

  // Story 1.6, AC4: el Guaraní queda disponible como moneda base desde la
  // creación del negocio. Va en una segunda transacción RLS porque la policy
  // de `monedas` exige `app.active_negocio_id` == negocio_id de la fila
  // insertada, y ese id recién se conoce después de crear el negocio.
  await withRlsContext(cuenta.id, negocio.id, (tx) =>
    seedMonedaBase(tx, { cuentaId: cuenta.id, negocioId: negocio.id, ambito: "LABORAL" })
  );

  revalidatePath("/negocios");

  return {
    id: negocio.id,
    cuentaId: negocio.cuentaId,
    nombre: negocio.nombre,
    estado: negocio.estado as Negocio["estado"],
    createdAt: negocio.createdAt,
    archivedAt: negocio.archivedAt,
  };
});
