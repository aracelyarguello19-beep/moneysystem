"use server";

import { revalidatePath } from "next/cache";
import type { TasaCambio } from "@repo/domain";
import { registrarTasaCambioSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1: crea un registro nuevo — nunca actualiza uno existente. Es un
// snapshot inmutable: la fila anterior sigue existiendo para que las
// transacciones ya grabadas con ella sigan resolviendo el mismo valor
// histórico (AC4).
//
// `negocioId` viaja explícito (null para moneda Personal) para poder
// resolver `monedaId` bajo `withRlsContext` con el contexto de negocio
// correcto: la policy compuesta de `monedas` (Story 1.6) solo hace visible
// una moneda LABORAL cuando `app.active_negocio_id` coincide con su propio
// negocio — sin esto, un `tx.moneda.findUniqueOrThrow` fallaría incluso
// para una moneda del propio usuario. Verificar la moneda con una query
// (no solo confiar en la FK) importa por seguridad: la FK de Postgres
// valida existencia contra la tabla completa sin pasar por RLS, así que por
// sí sola no evita registrar una tasa para el `monedaId` de otra cuenta.
export const registrarTasaCambio = withErrorHandling(
  async (negocioId: string | null, monedaId: string, input: unknown): Promise<TasaCambio> => {
    const parsed = registrarTasaCambioSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const tasaCambio = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      await tx.moneda.findUniqueOrThrow({ where: { id: monedaId } });

      return tx.tasaCambio.create({
        data: {
          monedaId,
          tasa: parsed.tasa,
          registradaPor: cuenta.id,
        },
      });
    });

    revalidatePath("/laboral/tasas-cambio");
    revalidatePath("/laboral/saldos");

    return {
      id: tasaCambio.id,
      monedaId: tasaCambio.monedaId,
      tasa: tasaCambio.tasa.toString(),
      vigenteDesde: tasaCambio.vigenteDesde,
      registradaPor: tasaCambio.registradaPor,
    };
  }
);
