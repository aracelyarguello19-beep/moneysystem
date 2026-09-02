"use client";

import { useEffect, useState } from "react";
import {
  listarMovimientosCaja,
  type MovimientoCajaListado,
} from "@/actions/cuentas-financieras/listar-movimientos-caja";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useInventarioCambiado } from "@/lib/inventario-events";

const ETIQUETA_REFERENCIA: Record<string, string> = {
  COMPRA: "Compra",
  VENTA: "Venta",
  GASTO: "Gasto",
  PAGO_CXC: "Cobro cuenta por cobrar",
  MANUAL: "Movimiento manual",
};

// Tabla "Transacciones Recientes" — mismo patrón que "Gestión de Caja
// Multimoneda" de Stitch: fecha, descripción (derivada de la referencia),
// cuenta, monto (con signo) y moneda.
export function CajaTransacciones({ negocioId }: { negocioId: string }) {
  const [movimientos, setMovimientos] = useState<MovimientoCajaListado[]>([]);

  async function cargar() {
    const result = await listarMovimientosCaja(negocioId);
    if (result.ok) setMovimientos(result.data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);

  useInventarioCambiado(cargar);

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="border-b border-outline-variant bg-surface-container-low p-4">
        <CardHeader className="mb-0">
          <CardTitle>Transacciones Recientes</CardTitle>
        </CardHeader>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-left">
          <thead>
            <tr className="border-b border-outline-variant bg-surface-container-low">
              <th className="p-3 text-label-md font-semibold text-on-surface-variant">Fecha</th>
              <th className="p-3 text-label-md font-semibold text-on-surface-variant">Descripción</th>
              <th className="p-3 text-label-md font-semibold text-on-surface-variant">Cuenta</th>
              <th className="p-3 text-right text-label-md font-semibold text-on-surface-variant">Monto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {movimientos.map((m) => (
              <tr key={m.id} className="hover:bg-surface-container-low transition-colors">
                <td className="p-3 text-body-md text-on-surface">{m.fecha.toString().slice(0, 10)}</td>
                <td className="p-3 text-body-md text-on-surface">
                  {m.referenciaTipo ? ETIQUETA_REFERENCIA[m.referenciaTipo] ?? m.referenciaTipo : "—"}
                </td>
                <td className="p-3 text-body-md text-on-surface-variant">{m.cuentaNombre}</td>
                <td
                  className={`p-3 text-right text-body-md font-semibold ${
                    m.tipo === "INGRESO" ? "text-success" : "text-error"
                  }`}
                >
                  {m.tipo === "INGRESO" ? "+" : "-"} {m.monto} {m.monedaCodigo}
                </td>
              </tr>
            ))}
            {movimientos.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-body-md text-on-surface-variant">
                  Todavía no hay movimientos registrados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
