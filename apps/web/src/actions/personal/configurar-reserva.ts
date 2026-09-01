"use server";

import { revalidatePath } from "next/cache";
import type { ReservaFinanciera } from "@repo/domain";
import { configurarReservaSchema } from "@repo/domain/schemas";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1: única reserva por cuenta (`cuentaId` @unique) — upsert según exista.
// Pausar el aporte automático es `aportePorPeriodo: "0"` (ADR-001, punto
// 7) — no hay un endpoint de pausa separado porque ninguna AC lo pide.
// `progresoAcumulado`/`ultimoPeriodoAplicado` nunca se tocan acá — son
// exclusivos del job de cierre de período.
export const configurarReserva = withErrorHandling(
  async (input: unknown): Promise<ReservaFinanciera> => {
    const parsed = configurarReservaSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const reserva = await withRlsContext(cuenta.id, null, (tx) =>
      tx.reservaFinanciera.upsert({
        where: { cuentaId: cuenta.id },
        create: {
          cuentaId: cuenta.id,
          objetivoMonto: parsed.objetivoMonto,
          aportePorPeriodo: parsed.aportePorPeriodo,
        },
        update: {
          objetivoMonto: parsed.objetivoMonto,
          aportePorPeriodo: parsed.aportePorPeriodo,
        },
      })
    );

    revalidatePath("/personal/reserva");
    revalidatePath("/personal/balance");

    return {
      id: reserva.id,
      cuentaId: reserva.cuentaId,
      objetivoMonto: reserva.objetivoMonto.toString(),
      aportePorPeriodo: reserva.aportePorPeriodo.toString(),
      periodo: reserva.periodo as ReservaFinanciera["periodo"],
      progresoAcumulado: reserva.progresoAcumulado.toString(),
      ultimoPeriodoAplicado: reserva.ultimoPeriodoAplicado,
    };
  }
);
