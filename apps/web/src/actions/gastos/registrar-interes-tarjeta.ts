"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Result, TipoGasto } from "@repo/domain";
import {
  assertCuentaFinancieraEsTarjeta,
  assertTipoGastoFinanciero,
  assertTipoGastoLaboral,
  assertTipoGastoPersonal,
} from "@repo/domain";
import { registrarInteresTarjetaSchema } from "@repo/domain/schemas";
import { aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// AC2: un interés/cargo de tarjeta se registra como `MovimientoTarjeta` tipo
// `INTERES` y, en la misma transacción, como `Gasto` con `tipoGastoId` de
// clasificación Financiero — nunca como un movimiento sin contrapartida en
// gastos, para que alimente el indicador de Gastos Financieros (Epic 5).
// `negocioId: null` (Story 6.4, AC2) reutiliza la misma función para el
// interés de tarjeta personal — el `Gasto` generado queda `ambito:
// 'PERSONAL'` con un `TipoGasto` Personal clasificación Financiero (ADR-002),
// en vez de Laboral/Operativo.
export async function registrarInteresTarjeta(
  negocioId: string | null,
  tarjetaId: string,
  input: unknown
): Promise<Result<CuentaFinanciera>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = registrarInteresTarjetaSchema.safeParse(input);
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
      error: { code: "UNAUTHENTICATED", message: "No hay sesión activa.", requestId, timestamp },
    };
  }

  try {
    const actualizada = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const tarjeta = await tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: tarjetaId } });
      assertCuentaFinancieraEsTarjeta({ tipo: tarjeta.tipo as CuentaFinanciera["tipo"] });

      const tipoGasto = await tx.tipoGasto.findUniqueOrThrow({
        where: { id: parsed.data.tipoGastoId },
      });
      if (negocioId) {
        assertTipoGastoLaboral({ ambito: tipoGasto.ambito as TipoGasto["ambito"] });
      } else {
        assertTipoGastoPersonal({ ambito: tipoGasto.ambito as TipoGasto["ambito"] });
      }
      assertTipoGastoFinanciero({ clasificacion: tipoGasto.clasificacion as TipoGasto["clasificacion"] });

      await aplicarMovimientoTarjeta(tx, {
        cuentaFinancieraId: tarjetaId,
        tipo: "INTERES",
        monto: parsed.data.monto,
      });

      await tx.gasto.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          ambito: negocioId ? "LABORAL" : "PERSONAL",
          tipoGastoId: parsed.data.tipoGastoId,
          monto: parsed.data.monto,
          monedaId: tarjeta.monedaId,
          formaPago: "TARJETA",
          cuentaFinancieraId: tarjetaId,
        },
      });

      return tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: tarjetaId } });
    });

    revalidatePath(negocioId ? "/laboral/tarjeta" : "/personal/tarjeta");
    revalidatePath(negocioId ? "/laboral/gastos" : "/personal/gastos");

    return {
      ok: true,
      data: {
        id: actualizada.id,
        cuentaId: actualizada.cuentaId,
        negocioId: actualizada.negocioId,
        ambito: actualizada.ambito as CuentaFinanciera["ambito"],
        tipo: actualizada.tipo as CuentaFinanciera["tipo"],
        nombre: actualizada.nombre,
        monedaId: actualizada.monedaId,
        saldoActual: actualizada.saldoActual.toString(),
        limiteCredito: actualizada.limiteCredito?.toString() ?? null,
      },
    };
  } catch {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Tarjeta o tipo de gasto no encontrado.", requestId, timestamp },
    };
  }
}
