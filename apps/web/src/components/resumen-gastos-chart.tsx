"use client";

import { useCallback, useEffect, useId, useState } from "react";
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
import {
  obtenerTendenciaGastos,
  type PuntoTendenciaGasto,
} from "@/actions/gastos/obtener-tendencia-gastos";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangePicker } from "@/components/date-range-picker";
import { useGastoCambiado } from "@/lib/gasto-events";
import { formatearMonto } from "@/lib/moneda";

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function primerDiaDelMes(): string {
  const hoy = new Date();
  return iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value?: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 shadow-lg">
      <p className="text-xs text-on-surface-variant">{label}</p>
      <p className="flex items-center gap-1.5 text-label-lg font-semibold text-on-surface">
        <span className="h-2 w-2 rounded-full bg-error" />
        {formatearMonto(payload[0]?.value ?? 0)}
      </p>
    </div>
  );
}

// Línea de tendencia de gastos del período elegido — reemplaza a la dona de
// "Gastos por categoría": un dueño quiere ver primero si está gastando más o
// menos que antes (la forma es "cambio en el tiempo"), la categoría es un
// detalle secundario que ya vive en cada fila del listado. Un solo indicador
// (total de gastos) no necesita leyenda — el título ya dice qué se grafica
// (ver marks-and-anatomy.md). Renderizado con Recharts (a pedido) en vez del
// SVG a mano que tenía antes — el resto de la tarjeta (total, selector de
// fecha, estados vacío/error) sigue igual.
export function ResumenGastosChart({ negocioId }: { negocioId: string }) {
  const gradientId = useId();
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(() => iso(new Date()));
  const [puntos, setPuntos] = useState<PuntoTendenciaGasto[] | null>(null);
  const [total, setTotal] = useState("0");
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerTendenciaGastos(negocioId, { desde, hasta });
    if (result.ok) {
      setError(null);
      setPuntos(result.data.puntos);
      setTotal(result.data.total);
    } else {
      setError(result.error.message);
    }
  }, [negocioId, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useGastoCambiado(cargar);

  function onCambioRango(r: { desde: string; hasta: string }) {
    setDesde(r.desde);
    setHasta(r.hasta);
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Resumen de gastos</CardTitle>
        </CardHeader>
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      </Card>
    );
  }

  if (!puntos) return null;

  const sinGastos = Number(total) === 0;
  const datos = puntos.map((p) => ({ etiqueta: p.etiqueta, total: Number(p.total) }));

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CardHeader className="mb-0">
          <CardTitle>Resumen de gastos</CardTitle>
        </CardHeader>
        <DateRangePicker value={{ desde, hasta }} onChange={onCambioRango} />
      </div>

      <p className="mb-1 text-headline-sm font-bold text-on-surface">{formatearMonto(total)}</p>
      {sinGastos && (
        <p className="mb-2 text-sm text-muted">No hay gastos registrados en el período elegido.</p>
      )}

      <div className="h-[180px] sm:h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
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
              domain={sinGastos ? [0, 100] : [0, "auto"]}
            />

            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "var(--color-outline)", strokeWidth: 1 }}
            />

            <Area
              type="linear"
              dataKey="total"
              stroke="transparent"
              fill={`url(#${gradientId})`}
              strokeWidth={0}
              dot={false}
              activeDot={false}
            />
            <Line
              type="linear"
              dataKey="total"
              stroke="var(--color-error)"
              strokeWidth={2}
              dot={{
                fill: "var(--color-surface-container-lowest)",
                stroke: "var(--color-error)",
                strokeWidth: 2,
                r: 5,
              }}
              activeDot={{
                r: 6,
                fill: "var(--color-surface-container-lowest)",
                stroke: "var(--color-error)",
                strokeWidth: 2,
              }}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
