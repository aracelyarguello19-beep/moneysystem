"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Gasto, TipoGasto } from "@repo/domain";
import {
  assertCuentaFinancieraEsTarjeta,
  assertCuentaFinancieraNoEsTarjeta,
  assertTipoGastoLaboral,
} from "@repo/domain";
import { registrarGastoSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Editar un gasto ya registrado no es solo actualizar la fila: el gasto
// original ya movió saldo real (EGRESO en cuenta/caja o CONSUMO en tarjeta,
// ver registrar-gasto.ts). Si cambiáramos el monto/forma de pago/cuenta sin
// revertir ese movimiento primero, el saldo quedaría desincronizado del
// historial. Por eso cada edición revierte el movimiento anterior (INGRESO o
// PAGO_RESUMEN, según corresponda — no existe un tipo "REVERSION" dedicado,
// pero el signo da el mismo resultado neto) y aplica uno nuevo con los
// valores actualizados, siempre referenciando el mismo gastoId — el ledger
// es append-only por diseño (ver ledger.ts), así que la corrección queda
// auditable en vez de mutar una fila histórica.
export const editarGasto = withErrorHandling(
  async (gastoId: string, negocioId: string, input: unknown): Promise<Gasto> => {
    const parsed = registrarGastoSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gasto = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const anterior = await tx.gasto.findUniqueOrThrow({ where: { id: gastoId } });

      const tipoGasto = await tx.tipoGasto.findUniqueOrThrow({ where: { id: parsed.tipoGastoId } });
      assertTipoGastoLaboral({ ambito: tipoGasto.ambito as TipoGasto["ambito"] });

      // 1. Revertir el movimiento del gasto original.
      if (anterior.formaPago === "TARJETA") {
        await aplicarMovimientoTarjeta(tx, {
          cuentaFinancieraId: anterior.cuentaFinancieraId,
          tipo: "PAGO_RESUMEN",
          monto: anterior.monto.toString(),
          referenciaTipo: "GASTO",
          referenciaId: gastoId,
        });
      } else {
        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: anterior.cuentaFinancieraId,
          tipo: "INGRESO",
          monto: anterior.monto.toString(),
          referenciaTipo: "GASTO",
          referenciaId: gastoId,
        });
      }

      // 2. Actualizar los datos del gasto.
      const actualizado = await tx.gasto.update({
        where: { id: gastoId },
        data: {
          ambito: parsed.ambito,
          tipoGastoId: parsed.tipoGastoId,
          monto: parsed.monto,
          monedaId: parsed.monedaId,
          fecha: parsed.fecha,
          formaPago: parsed.formaPago,
          cuentaFinancieraId: parsed.cuentaFinancieraId,
        },
      });

      // 3. Aplicar el movimiento con los valores nuevos.
      const cuentaFinanciera = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.cuentaFinancieraId },
      });

      if (parsed.formaPago === "TARJETA") {
        assertCuentaFinancieraEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
        await aplicarMovimientoTarjeta(tx, {
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          tipo: "CONSUMO",
          monto: parsed.monto,
          referenciaTipo: "GASTO",
          referenciaId: gastoId,
        });
      } else {
        assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          tipo: "EGRESO",
          monto: parsed.monto,
          referenciaTipo: "GASTO",
          referenciaId: gastoId,
        });
      }

      return actualizado;
    });

    // Sin revalidatePath("/laboral/gastos") — ver mismo comentario en
    // registrar-gasto.ts.
    revalidatePath("/laboral/indicadores");
    revalidatePath("/laboral/caja");

    return {
      id: gasto.id,
      cuentaId: gasto.cuentaId,
      negocioId: gasto.negocioId,
      ambito: gasto.ambito as Gasto["ambito"],
      tipoGastoId: gasto.tipoGastoId,
      monto: gasto.monto.toString(),
      monedaId: gasto.monedaId,
      fecha: gasto.fecha,
      formaPago: gasto.formaPago as Gasto["formaPago"],
      cuentaFinancieraId: gasto.cuentaFinancieraId,
    };
  }
);
