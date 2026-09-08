"use client";

import { useId } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { PuntoTendencia } from "@/actions/indicadores/obtener-dashboard";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatearMonto } from "@/lib/moneda";

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { dataKey?: string; value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const ventas = payload.find((p) => p.dataKey === "ventas")?.value ?? 0;
  const gastos = payload.find((p) => p.dataKey === "gastos")?.value ?? 0;
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-lg">
      <p className="mb-1 text-xs text-on-surface-variant">{label}</p>
      <p className="flex items-center gap-1.5 text-label-lg font-semibold text-on-surface">
        <span className="h-2 w-2 rounded-full bg-success" />
        Ventas: {formatearMonto(ventas)}
      </p>
      <p className="flex items-center gap-1.5 text-label-lg font-semibold text-on-surface">
        <span className="h-2 w-2 rounded-full bg-error" />
        Gastos: {formatearMonto(gastos)}
      </p>
    </div>
  );
}

// Ventas (verde, --color-success) vs Gastos (rojo, --color-error) — mismo
// estilo Recharts que `ResumenGastosChart` (área con degradé + línea + punto
// hueco), con dos series en vez de una, por eso lleva leyenda (ver
// marks-and-anatomy.md: "legend siempre presente para 2+ series"). Recibe
// los puntos ya calculados y agrupados (por día o por mes, según el período
// elegido) por `obtenerDashboard`, para que el gráfico siempre refleje el
// mismo rango que el resto del dashboard.
export function VentasVsGastosChart({ puntos }: { puntos: PuntoTendencia[] }) {
  const gradientVentasId = useId();
  const gradientGastosId = useId();

  const datos = puntos.map((p) => ({
    etiqueta: p.etiqueta,
    ventas: Number(p.ventas),
    gastos: Number(p.gastos),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ventas vs Gastos</CardTitle>
        <CardDescription>Tendencia del período elegido</CardDescription>
      </CardHeader>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientVentasId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id={gradientGastosId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-error)" stopOpacity={0.28} />
                <stop offset="100%" stopColor="var(--color-error)" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="var(--color-outline-variant)" horizontal vertical={false} />

            <XAxis
              dataKey="etiqueta"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
              tickMargin={8}
              interval="preserveStartEnd"
              minTickGap={24}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "var(--color-on-surface-variant)" }}
              tickFormatter={(v: number) => Math.round(v).toLocaleString("es-PY")}
              width={56}
            />

            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "var(--color-outline)", strokeWidth: 1 }} />

            <Area
              type="linear"
              dataKey="ventas"
              stroke="transparent"
              fill={`url(#${gradientVentasId})`}
              strokeWidth={0}
              dot={false}
              activeDot={false}
            />
            <Area
              type="linear"
              dataKey="gastos"
              stroke="transparent"
              fill={`url(#${gradientGastosId})`}
              strokeWidth={0}
              dot={false}
              activeDot={false}
            />

            <Line
              type="linear"
              dataKey="ventas"
              stroke="var(--color-success)"
              strokeWidth={2}
              dot={{ fill: "var(--color-surface-container-lowest)", stroke: "var(--color-success)", strokeWidth: 2, r: 5 }}
              activeDot={{ r: 6, fill: "var(--color-surface-container-lowest)", stroke: "var(--color-success)", strokeWidth: 2 }}
            />
            <Line
              type="linear"
              dataKey="gastos"
              stroke="var(--color-error)"
              strokeWidth={2}
              dot={{ fill: "var(--color-surface-container-lowest)", stroke: "var(--color-error)", strokeWidth: 2, r: 5 }}
              activeDot={{ r: 6, fill: "var(--color-surface-container-lowest)", stroke: "var(--color-error)", strokeWidth: 2 }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 flex justify-center gap-6">
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-success" />
          <span className="text-body-md text-on-surface-variant">Ventas</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-3 w-3 rounded-full bg-error" />
          <span className="text-body-md text-on-surface-variant">Gastos</span>
        </div>
      </div>
    </Card>
  );
}
