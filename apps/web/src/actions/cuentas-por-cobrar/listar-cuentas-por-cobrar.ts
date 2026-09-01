"use server";

import type { CuentaPorCobrar } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

// AC1/AC4: incluye `venta.fecha` como fecha de origen. El total agregado
// (AC3) se calcula en el cliente con `calcularTotalAdeudado` sobre este
// mismo listado — evita duplicar la lógica de agregación en dos lugares.
export const listarCuentasPorCobrar = withErrorHandling(
  async (negocioId: string): Promise<(CuentaPorCobrar & { fechaOrigen: Date })[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const cuentas = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaPorCobrar.findMany({
        where: { negocioId },
        include: { venta: true },
        orderBy: { createdAt: "desc" },
      })
    );

    return cuentas.map((c) => ({
      id: c.id,
      negocioId: c.negocioId,
      ventaId: c.ventaId,
      cliente: c.cliente,
      montoOriginal: c.montoOriginal.toString(),
      montoPagado: c.montoPagado.toString(),
      estado: c.estado as CuentaPorCobrar["estado"],
      fechaOrigen: c.venta.fecha,
    }));
  }
);
