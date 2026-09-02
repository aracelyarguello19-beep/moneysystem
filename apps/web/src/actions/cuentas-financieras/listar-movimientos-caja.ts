"use server";

import type { MovimientoCuenta } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

export interface MovimientoCajaListado extends MovimientoCuenta {
  cuentaNombre: string;
  monedaCodigo: string;
}

// Transacciones recientes de todas las cuentas de Caja del negocio activo —
// alimenta la tabla "Transacciones Recientes" de la sesión Caja (mismo
// patrón que "Gestión de Caja Multimoneda" de Stitch).
export const listarMovimientosCaja = withErrorHandling(
  async (negocioId: string): Promise<MovimientoCajaListado[]> => {
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    const movimientos = await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.movimientoCuenta.findMany({
        where: { cuentaFinanciera: { negocioId } },
        include: { cuentaFinanciera: { include: { moneda: true } } },
        orderBy: { createdAt: "desc" },
        take: 15,
      })
    );

    return movimientos.map((m) => ({
      id: m.id,
      cuentaFinancieraId: m.cuentaFinancieraId,
      tipo: m.tipo as MovimientoCuenta["tipo"],
      monto: m.monto.toString(),
      fecha: m.fecha,
      referenciaTipo: m.referenciaTipo as MovimientoCuenta["referenciaTipo"],
      referenciaId: m.referenciaId,
      cuentaNombre: m.cuentaFinanciera.nombre,
      monedaCodigo: m.cuentaFinanciera.moneda.codigo,
    }));
  }
);
