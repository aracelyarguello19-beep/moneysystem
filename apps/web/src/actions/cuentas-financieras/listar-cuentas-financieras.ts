"use server";

import type { CuentaFinanciera } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// Fuente única de cuentas financieras del negocio activo (Caja): los 4
// tipos juntos (Efectivo, Banco, Tarjeta de crédito, Otro) — reemplaza a
// `obtenerSaldos`/`listarTarjetas`, que fragmentaban esta misma tabla en dos
// acciones según tipo.
export const listarCuentasFinancieras = withErrorHandling(
  async (negocioId: string): Promise<CuentaFinanciera[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const cuentas = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaFinanciera.findMany({
        where: { cuentaId: cuenta.id, negocioId },
        orderBy: { createdAt: "asc" },
      })
    );

    return cuentas.map((c) => ({
      id: c.id,
      cuentaId: c.cuentaId,
      negocioId: c.negocioId,
      tipo: c.tipo as CuentaFinanciera["tipo"],
      nombre: c.nombre,
      banco: c.banco,
      alias: c.alias,
      detalleOtro: c.detalleOtro,
      monedaId: c.monedaId,
      saldoActual: c.saldoActual.toString(),
      limiteCredito: c.limiteCredito?.toString() ?? null,
    }));
  }
);
