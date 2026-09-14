"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { CuentaFinanciera, Result } from "@repo/domain";
import {
  assertCuentaFinancieraEsCaja,
  assertMonedaEsBase,
  assertMonedaNoEsBase,
  CuentaFinancieraTipoInvalidoError,
  MonedaInvalidaError,
} from "@repo/domain";
import { comprarMonedaSchema } from "@repo/domain/schemas";
import { aplicarMovimientoCuenta, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";

// Comprar moneda extranjera con efectivo en Gs, desde la tarjeta de una
// cuenta CAJA extranjera en Caja (ej. "Comprar" en la tarjeta de Efectivo
// BRL/USD): dos movimientos atómicos en la misma transacción — EGRESO en
// la CAJA en Gs por `monto × cotizacion`, INGRESO en la CAJA extranjera
// por `monto` tal cual (nunca se convierte lo que se acredita, solo lo que
// se debita). La `cotizacion` cargada acá crea un snapshot nuevo de
// TasaCambio (mismo criterio inmutable que Ventas/Compras, Story 5.3) que
// pasa a ser la "vigente" de esa moneda desde este momento hasta la
// próxima carga.
//
// No usa `withErrorHandling`: sus mensajes de validación específicos
// (moneda equivocada, cuenta no es Efectivo) tienen que llegar al usuario
// tal cual, no como el genérico "Ocurrió un error al procesar la operación."
export async function comprarMoneda(negocioId: string, input: unknown): Promise<Result<CuentaFinanciera>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const parsed = comprarMonedaSchema.safeParse(input);
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
      const origen = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraOrigenId },
      });
      assertCuentaFinancieraEsCaja({ tipo: origen.tipo as CuentaFinanciera["tipo"] });
      const monedaOrigen = await tx.moneda.findUniqueOrThrow({ where: { id: origen.monedaId } });
      assertMonedaEsBase(monedaOrigen);

      const destino = await tx.cuentaFinanciera.findUniqueOrThrow({
        where: { id: parsed.data.cuentaFinancieraDestinoId },
      });
      assertCuentaFinancieraEsCaja({ tipo: destino.tipo as CuentaFinanciera["tipo"] });
      const monedaDestino = await tx.moneda.findUniqueOrThrow({ where: { id: destino.monedaId } });
      assertMonedaNoEsBase(monedaDestino);

      await tx.tasaCambio.create({
        data: { monedaId: destino.monedaId, tasa: parsed.data.cotizacion, registradaPor: cuenta.id },
      });

      const montoEnGs = new Prisma.Decimal(parsed.data.monto).times(parsed.data.cotizacion).toString();

      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: origen.id,
        tipo: "EGRESO",
        monto: montoEnGs,
        referenciaTipo: "COMPRA_MONEDA",
        referenciaId: destino.id,
      });
      await aplicarMovimientoCuenta(tx, {
        cuentaFinancieraId: destino.id,
        tipo: "INGRESO",
        monto: parsed.data.monto,
        referenciaTipo: "COMPRA_MONEDA",
        referenciaId: origen.id,
      });

      return tx.cuentaFinanciera.findUniqueOrThrow({ where: { id: destino.id } });
    });

    revalidatePath("/laboral/caja");

    return {
      ok: true,
      data: {
        id: actualizada.id,
        cuentaId: actualizada.cuentaId,
        negocioId: actualizada.negocioId,
        tipo: actualizada.tipo as CuentaFinanciera["tipo"],
        nombre: actualizada.nombre,
        banco: actualizada.banco,
        alias: actualizada.alias,
        detalleOtro: actualizada.detalleOtro,
        monedaId: actualizada.monedaId,
        saldoActual: actualizada.saldoActual.toString(),
        limiteCredito: actualizada.limiteCredito?.toString() ?? null,
      },
    };
  } catch (e) {
    if (e instanceof CuentaFinancieraTipoInvalidoError || e instanceof MonedaInvalidaError) {
      return { ok: false, error: { code: "VALIDATION", message: e.message, requestId, timestamp } };
    }
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta de origen o destino no encontrada.", requestId, timestamp },
    };
  }
}
