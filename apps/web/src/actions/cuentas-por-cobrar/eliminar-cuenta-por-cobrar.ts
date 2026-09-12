"use server";

import { revalidatePath } from "next/cache";
import type { Result } from "@repo/domain";
import { withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { cancelarVenta } from "@/actions/ventas/cancelar-venta";

// A pedido: se puede eliminar una cuenta por cobrar aunque ya tenga pagos
// registrados (antes lo bloqueaba `assertCuentaPorCobrarSinPagos`) — la
// UI pregunta primero si la persona devolvió el producto:
// - Si devolvió: se cancela la venta completa antes de borrar (revierte el
//   stock al inventario y reembolsa cualquier pago ya cobrado, ver
//   cancelar-venta.ts) — la cuenta queda sin deuda y sin pagos por borrar.
// - Si no devolvió: se borra directo (condonación de deuda) — lo ya
//   cobrado queda como estaba, no se toca stock ni caja.
export async function eliminarCuentaPorCobrar(
  cuentaPorCobrarId: string,
  negocioId: string,
  input: { productoDevuelto: boolean }
): Promise<Result<{ id: string }>> {
  const requestId = crypto.randomUUID();
  const timestamp = new Date().toISOString();

  const cuenta = await getCurrentAccount();
  if (!cuenta) {
    return {
      ok: false,
      error: { code: "UNAUTHENTICATED", message: "No hay sesión activa.", requestId, timestamp },
    };
  }

  const cxc = await withRlsContext(cuenta.id, negocioId, (tx) =>
    tx.cuentaPorCobrar.findUnique({ where: { id: cuentaPorCobrarId } })
  );
  if (!cxc) {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta por cobrar no encontrada.", requestId, timestamp },
    };
  }

  if (input.productoDevuelto) {
    const resultado = await cancelarVenta(negocioId, cxc.ventaId, {});
    if (!resultado.ok) {
      return { ok: false, error: resultado.error };
    }
  }

  try {
    await withRlsContext(cuenta.id, negocioId, (tx) =>
      tx.cuentaPorCobrar.delete({ where: { id: cuentaPorCobrarId } })
    );

    revalidatePath("/laboral/cuentas-por-cobrar");
    revalidatePath("/laboral/ventas");
    revalidatePath("/laboral/inventario");
    revalidatePath("/laboral/caja");

    return { ok: true, data: { id: cuentaPorCobrarId } };
  } catch {
    return {
      ok: false,
      error: { code: "NOT_FOUND", message: "Cuenta por cobrar no encontrada.", requestId, timestamp },
    };
  }
}
