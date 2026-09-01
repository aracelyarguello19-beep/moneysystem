"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera, Gasto, TipoGasto } from "@repo/domain";
import {
  assertCuentaFinancieraEsTarjeta,
  assertCuentaFinancieraNoEsTarjeta,
  assertTipoGastoPersonal,
} from "@repo/domain";
import { registrarGastoSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, aplicarMovimientoTarjeta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC2: mismo modelo `Gasto` y mismo schema Zod que `registrarGasto`
// (Story 4.1) — el shape del input es idéntico, solo cambia `ambito`/
// `negocioId` (siempre PERSONAL/null acá) y el guard de ámbito
// (`assertTipoGastoPersonal` en vez de `assertTipoGastoLaboral`). No se
// duplica el schema (Article IV, No Invention): `registrarGastoSchema` ya
// cubre exactamente estos campos.
// [Source: architecture/backend-architecture.md#Service Architecture, Story 4.1/4.2]
export const registrarGastoPersonal = withErrorHandling(
  async (input: unknown): Promise<Gasto> => {
    const parsed = registrarGastoSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const gasto = await withRlsContext(cuenta.id, null, async (tx) => {
      const tipoGasto = await tx.tipoGasto.findUniqueOrThrow({
        where: { id: parsed.tipoGastoId },
      });
      assertTipoGastoPersonal({ ambito: tipoGasto.ambito as TipoGasto["ambito"] });

      const nuevo = await tx.gasto.create({
        data: {
          cuentaId: cuenta.id,
          negocioId: null,
          ambito: "PERSONAL",
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

    revalidatePath("/personal/gastos");

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
