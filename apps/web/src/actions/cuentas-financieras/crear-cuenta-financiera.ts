"use server";

import { revalidatePath } from "next/cache";
import type { CuentaFinanciera } from "@repo/domain";
import { crearCuentaFinancieraSchema } from "@repo/domain/schemas";
import { buscarOCrearMoneda, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Punto único de creación para los 4 tipos de cuenta de Caja (Efectivo,
// Banco, Tarjeta de crédito, Otro) — reemplaza a `crearTarjeta`, que
// duplicaba este mismo mecanismo solo para TARJETA.
export const crearCuentaFinanciera = withErrorHandling(
  async (negocioId: string, input: unknown): Promise<CuentaFinanciera> => {
    const parsed = crearCuentaFinancieraSchema.parse(input);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const cuentaFinanciera = await withRlsContext(cuenta.id, negocioId, async (tx) => {
      // CAJA es la única vía para dar de alta una moneda nueva (código
      // libre) — el resto elige entre las que ya existen (`parsed.monedaId`,
      // garantizado por el refine del schema).
      const monedaId =
        parsed.tipo === "CAJA"
          ? (await buscarOCrearMoneda(tx, { cuentaId: cuenta.id, negocioId, codigo: parsed.monedaCodigo! })).id
          : parsed.monedaId!;

      const nombre =
        parsed.nombre?.trim() ||
        (parsed.tipo === "CAJA"
          ? "Efectivo"
          : parsed.tipo === "BANCO"
            ? parsed.banco!
            : parsed.tipo === "TARJETA"
              ? "Tarjeta de crédito"
              : parsed.detalleOtro!);

      return tx.cuentaFinanciera.create({
        data: {
          cuentaId: cuenta.id,
          negocioId,
          tipo: parsed.tipo,
          nombre,
          monedaId,
          banco: parsed.banco ?? null,
          alias: parsed.alias ?? null,
          detalleOtro: parsed.detalleOtro ?? null,
          limiteCredito: parsed.limiteCredito ?? null,
        },
      });
    });

    revalidatePath("/laboral/caja");

    return {
      id: cuentaFinanciera.id,
      cuentaId: cuentaFinanciera.cuentaId,
      negocioId: cuentaFinanciera.negocioId,
      tipo: cuentaFinanciera.tipo as CuentaFinanciera["tipo"],
      nombre: cuentaFinanciera.nombre,
      banco: cuentaFinanciera.banco,
      alias: cuentaFinanciera.alias,
      detalleOtro: cuentaFinanciera.detalleOtro,
      monedaId: cuentaFinanciera.monedaId,
      saldoActual: cuentaFinanciera.saldoActual.toString(),
      limiteCredito: cuentaFinanciera.limiteCredito?.toString() ?? null,
    };
  }
);
