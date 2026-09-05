"use client";

import { useCallback, useEffect, useState } from "react";
import type { GastoResumenTipo, ProductoVendidoResumen } from "@repo/domain";
import { obtenerReporte } from "@/actions/reportes/obtener-reporte";
import { DateRangePicker } from "@/components/date-range-picker";
import { GastosProgresoChart } from "@/components/gastos-progreso-chart";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";
import { Icon } from "@/components/ui/icon";
import { formatearMonto } from "@/lib/moneda";

function primerDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

export function ReportesPanel({ negocioId }: { negocioId: string }) {
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [productos, setProductos] = useState<ProductoVendidoResumen[]>([]);
  const [gastos, setGastos] = useState<GastoResumenTipo[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerReporte(negocioId, { desde, hasta });
    if (result.ok) {
      setProductos(result.data.productos);
      setGastos(result.data.gastos);
      setMensaje(null);
    } else {
      setMensaje(result.error.message);
    }
  }, [negocioId, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const estrella = productos[0];
  const totalGastos = gastos.reduce((acc, g) => acc + Number(g.total), 0);

  return (
    <div className="flex flex-col gap-8">
      <DateRangePicker
        value={{ desde, hasta }}
        onChange={(rango) => {
          setDesde(rango.desde);
          setHasta(rango.hasta);
        }}
      />

      {mensaje && (
        <p role="alert" className="text-sm text-danger">
          {mensaje}
        </p>
      )}

      {(estrella || gastos.length > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {estrella && (
            <StatCard
              spotlight
              tone="primary"
              icon={<Icon name="star" fill />}
              label="Producto estrella"
              value={estrella.nombre}
            />
          )}
          {gastos.length > 0 && (
            <StatCard
              tone="danger"
              icon={<Icon name="receipt" />}
              label="Total gastos del período"
              value={formatearMonto(totalGastos.toString())}
            />
          )}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
          Productos vendidos
        </h2>
        <Card className="flex flex-col overflow-hidden p-0">
          {productos.length === 0 ? (
            <p className="px-4 py-8 text-center text-body-md text-on-surface-variant">
              No hay ventas en el período elegido.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] border-collapse text-left">
                <thead className="bg-surface-container">
                  <tr>
                    <th className="px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                      Producto
                    </th>
                    <th className="px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                      Cantidad vendida
                    </th>
                    <th className="px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                      Ingresos
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  {productos.map((p, i) => (
                    <tr key={p.itemId} className="transition-colors hover:bg-surface-container-low">
                      <td className="px-4 py-3">
                        <span className="flex items-center gap-2 text-body-md font-medium text-on-surface">
                          {i === 0 && <Badge variant="success">Estrella</Badge>}
                          {p.nombre}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-body-md text-on-surface">{p.cantidadVendida}</td>
                      <td className="px-4 py-3 text-right text-body-md font-medium text-on-surface">
                        {formatearMonto(p.ingresos)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
          Gastos por categoría
        </h2>
        <Card>
          <GastosProgresoChart gastos={gastos} />
        </Card>
      </section>
    </div>
  );
}
