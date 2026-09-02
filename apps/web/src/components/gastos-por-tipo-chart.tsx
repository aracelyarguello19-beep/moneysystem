"use client";

import { useCallback, useEffect, useState } from "react";
import {
  obtenerDesgloseGastosPorTipo,
  type DesgloseGastoTipo,
} from "@/actions/gastos/obtener-desglose-por-tipo";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { useInventarioCambiado } from "@/lib/inventario-events";

const MAX_CATEGORIAS = 4;
const COLORES = [
  "var(--color-primary)",
  "var(--color-secondary)",
  "var(--color-tertiary)",
  "var(--color-warning)",
  "var(--color-surface-container-high)",
];

function agruparConOtros(items: DesgloseGastoTipo[]): DesgloseGastoTipo[] {
  if (items.length <= MAX_CATEGORIAS) return items;
  const principales = items.slice(0, MAX_CATEGORIAS - 1);
  const resto = items.slice(MAX_CATEGORIAS - 1);
  const totalResto = resto.reduce((acc, i) => acc + Number(i.total), 0);
  return [...principales, { tipoGastoNombre: "Otros", total: totalResto.toString() }];
}

// Dona "OPEX Breakdown" del mes en curso — mismo patrón visual que
// "Gastos Operativos Detallados" de Stitch, pero data-driven (conic-gradient
// en vez de los 3 segmentos clip-path fijos del mockup) para soportar
// cualquier cantidad de tipos de gasto reales del negocio.
export function GastosPorTipoChart({ negocioId }: { negocioId: string }) {
  const [datos, setDatos] = useState<DesgloseGastoTipo[] | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerDesgloseGastosPorTipo(negocioId);
    if (result.ok) setDatos(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioCambiado(cargar);

  if (!datos) return null;

  const agrupados = agruparConOtros(datos);
  const total = agrupados.reduce((acc, i) => acc + Number(i.total), 0);

  if (total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gastos por categoría</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted">Todavía no hay gastos registrados este mes.</p>
      </Card>
    );
  }

  let acumulado = 0;
  const stops = agrupados.map((item, i) => {
    const desde = (acumulado / total) * 360;
    acumulado += Number(item.total);
    const hasta = (acumulado / total) * 360;
    return `${COLORES[i % COLORES.length]} ${desde}deg ${hasta}deg`;
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos por categoría</CardTitle>
      </CardHeader>
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-center sm:justify-center">
        <div
          className="relative h-48 w-48 shrink-0 rounded-full"
          style={{ background: `conic-gradient(${stops.join(", ")})` }}
        >
          <div className="absolute inset-4 flex flex-col items-center justify-center rounded-full bg-surface-container-lowest">
            <span className="text-label-md text-on-surface-variant">Total</span>
            <span className="text-headline-sm font-bold text-on-surface">{total.toLocaleString("es-PY")}</span>
          </div>
        </div>
        <div className="flex w-full flex-col gap-3 sm:max-w-xs">
          {agrupados.map((item, i) => (
            <div key={item.tipoGastoNombre} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 rounded-full"
                  style={{ background: COLORES[i % COLORES.length] }}
                />
                <span className="text-body-md text-on-surface-variant">{item.tipoGastoNombre}</span>
              </div>
              <span className="text-label-lg font-semibold text-on-surface">
                {Number(item.total).toLocaleString("es-PY")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
