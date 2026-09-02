"use client";

import { useCallback, useEffect, useState } from "react";
import type { GastoResumenTipo, ProductoVendidoResumen } from "@repo/domain";
import { obtenerReporte } from "@/actions/reportes/obtener-reporte";
import { DateRangePicker } from "@/components/date-range-picker";
import { GastosProgresoChart } from "@/components/gastos-progreso-chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/ui/stat-card";

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

      <div className="flex flex-wrap gap-3">
        {estrella && (
          <StatCard spotlight tone="primary" icon="⭐" label={`Producto estrella`} value={estrella.nombre} />
        )}
        {gastos.length > 0 && (
          <StatCard tone="danger" label="Total gastos del período" value={totalGastos.toString()} />
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Productos vendidos</CardTitle>
        </CardHeader>
        <CardContent>
          {productos.length === 0 ? (
            <p className="text-sm text-muted">No hay ventas en el período elegido.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-default text-left text-xs uppercase text-muted">
                    <th className="py-1">Producto</th>
                    <th className="py-1">Cantidad vendida</th>
                    <th className="py-1">Ingresos</th>
                  </tr>
                </thead>
                <tbody>
                  {productos.map((p, i) => (
                    <tr key={p.itemId} className="border-b border-default">
                      <td className="py-1">
                        {i === 0 && <Badge variant="success" className="mr-2">Estrella</Badge>}
                        {p.nombre}
                      </td>
                      <td className="py-1">{p.cantidadVendida}</td>
                      <td className="py-1">{p.ingresos}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Gastos por categoría</CardTitle>
        </CardHeader>
        <CardContent>
          <GastosProgresoChart gastos={gastos} />
        </CardContent>
      </Card>
    </div>
  );
}
