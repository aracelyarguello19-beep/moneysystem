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

// AC1/AC2/AC3 completos: el gasto se registra con su `tipoGastoId` (la
// clasificación se hereda de `TipoGasto.clasificacion`, nunca se duplica),
// y el efecto sobre saldo/deuda (AC2, wireado retroactivamente en Story 4.2
// una vez que `CuentaFinanciera`/el ledger pasaron a existir) está completo.
// [Source: architecture/backend-architecture.md#Service Architecture, Story 4.2 Completion Notes]
export const registrarGasto = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<Gasto> => {
    const parsed = registrarGastoSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gasto = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      const tipoGasto = await tx.tipoGasto.findUniqueOrThrow({
        where: { id: parsed.tipoGastoId },
      });
      assertTipoGastoLaboral({ ambito: tipoGasto.ambito as TipoGasto["ambito"] });

      const nuevo = await tx.gasto.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          ambito: parsed.ambito,
          tipoGastoId: parsed.tipoGastoId,
          monto: parsed.monto,
          monedaId: parsed.monedaId,
          fecha: parsed.fecha,
          formaPago: parsed.formaPago,
          cuentaFinancieraId: parsed.cuentaFinancieraId,
        },
      });

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
          referenciaId: nuevo.id,
        });
      } else {
        assertCuentaFinancieraNoEsTarjeta({ tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"] });
        await aplicarMovimientoCuenta(tx, {
          cuentaFinancieraId: parsed.cuentaFinancieraId,
          tipo: "EGRESO",
          monto: parsed.monto,
          referenciaTipo: "GASTO",
          referenciaId: nuevo.id,
        });
      }

      return nuevo;
    });

    revalidatePath("/laboral/gastos");
    revalidatePath("/laboral/indicadores");

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
