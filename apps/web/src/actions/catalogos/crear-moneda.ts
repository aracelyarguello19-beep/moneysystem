"use server";

import { revalidatePath } from "next/cache";
import type { Moneda } from "@repo/domain";
import { crearMonedaSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// [Source: architecture/api-specification.md#Convención de Server Actions]
export const crearMoneda = withErrorHandling(async (input: unknown): Promise<Moneda> => {
  const parsed = crearMonedaSchema.parse(input);
  const cuenta = await getCurrentAccount();
  if (!cuenta) throw new Error("No hay sesión activa");

  const moneda = await withRlsContext(cuenta.id, parsed.negocioId, (tx) =>
    tx.moneda.create({
      data: {
        cuentaId: cuenta.id,
        negocioId: parsed.negocioId,
        ambito: parsed.ambito,
        codigo: parsed.codigo,
        nombre: parsed.nombre,
      },
    })
  );

  revalidatePath(parsed.ambito === "LABORAL" ? "/laboral/configuracion" : "/personal/configuracion");

  return {
    id: moneda.id,
    cuentaId: moneda.cuentaId,
    negocioId: moneda.negocioId,
    ambito: moneda.ambito as Moneda["ambito"],
    codigo: moneda.codigo,
    nombre: moneda.nombre,
    esBase: moneda.esBase,
    activa: moneda.activa,
  };
});
