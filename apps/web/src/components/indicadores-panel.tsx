"use client";

import { useCallback, useEffect, useState } from "react";
import type { IndicadoresFinancieros } from "@repo/domain";
import { obtenerDashboard, type DashboardData } from "@/actions/indicadores/obtener-dashboard";
import { DateRangePicker } from "@/components/date-range-picker";
import { StatCard } from "@/components/ui/stat-card";
import { Icon } from "@/components/ui/icon";
import { VentasVsGastosChart } from "@/components/ventas-vs-gastos-chart";
import { AlertasCriticas } from "@/components/alertas-criticas";
import { ActividadReciente } from "@/components/actividad-reciente";
import { useInventarioCambiado } from "@/lib/inventario-events";

// CSV (Costo de Servicios Vendidos) y el desglose Producto/Servicio se
// quitaron junto con la sesión de Servicios — el sistema es exclusivo de
// productos. `cmv` y el resto de las métricas siguen intactas.
type ClaveTotal = Exclude<keyof IndicadoresFinancieros, "desglose" | "csv">;

const METRICAS: Record<ClaveTotal, { label: string; icon: string; tone: "primary" | "danger" | "warning" | "neutral" }> = {
  ingresosBrutos: { label: "Ingresos Brutos", icon: "payments", tone: "primary" },
  ingresosNetos: { label: "Ingresos Netos", icon: "account_balance_wallet", tone: "primary" },
  cmv: { label: "CMV", icon: "inventory_2", tone: "neutral" },
  gananciaBruta: { label: "Ganancia Bruta", icon: "trending_up", tone: "primary" },
  gastosOperativos: { label: "Gastos Operativos", icon: "receipt_long", tone: "danger" },
  resultadoOperativo: { label: "Resultado Operativo", icon: "balance", tone: "primary" },
  gastosFinancieros: { label: "Gastos Financieros", icon: "account_balance", tone: "danger" },
  gananciaLiquida: { label: "Ganancia Líquida", icon: "emoji_events", tone: "primary" },
  margenGanancia: { label: "Margen de Ganancia", icon: "query_stats", tone: "warning" },
};

function primerDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

// Dashboard del negocio activo — mismo bento de "Dashboard Operativo
// Centralizado" (Stitch): 4 KPI principales + gráfico Ventas vs Gastos a la
// izquierda, Alertas Críticas + Actividad Reciente a la derecha, y debajo el
// detalle completo de indicadores + resumen de Caja. Todo se pide en UNA
// sola llamada (`obtenerDashboard`, una transacción) en vez de 9 Server
// Actions independientes — cada una pagaba su propio handshake de RLS
// contra Supabase (remoto), que dominaba el tiempo de carga percibido.
export function IndicadoresPanel({ negocioId }: { negocioId: string }) {
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<DashboardData | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerDashboard(negocioId, { desde, hasta });
    if (result.ok) {
      setData(result.data);
      setMensaje(null);
    } else {
      setMensaje(result.error.message);
    }
  }, [negocioId, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioCambiado(cargar);

  const claves = Object.keys(METRICAS) as ClaveTotal[];
  const indicadores = data?.indicadores ?? null;

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

      {/* Bento principal — mismo layout 8/4 que Stitch */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              icon={<Icon name="payments" />}
              tone="primary"
              label="Ventas del período"
              value={indicadores?.ingresosBrutos ?? "0"}
            />
            <StatCard
              icon={<Icon name="query_stats" />}
              tone="warning"
              label="Margen de ganancia"
              value={indicadores ? `${Number(indicadores.margenGanancia).toFixed(1)}%` : "0%"}
            />
            <StatCard
              icon={<Icon name="inventory_2" />}
              tone="neutral"
              label="Valor de inventario"
              value={data?.valorInventario ?? "0"}
            />
            <StatCard
              icon={<Icon name="receipt_long" />}
              tone="danger"
              label="Gastos operativos"
              value={indicadores?.gastosOperativos ?? "0"}
            />
          </div>

          <VentasVsGastosChart puntos={data?.tendenciaMensual ?? []} />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <AlertasCriticas items={data?.items ?? []} cuentasPorCobrar={data?.cuentasPorCobrar ?? []} />
          <ActividadReciente movimientos={data?.movimientosRecientes ?? []} />
        </div>
      </div>

      {data && (data.saldosPorMoneda.length > 0 || data.metaMinimaDiaria) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">Caja</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.saldosPorMoneda.map((s) => (
              <StatCard
                key={s.codigo}
                icon={<Icon name="account_balance_wallet" />}
                tone="primary"
                label={`Caja (${s.codigo})`}
                value={s.total}
              />
            ))}
            {data.metaMinimaDiaria && (
              <StatCard
                icon={<Icon name="track_changes" />}
                tone="warning"
                label="Meta mínima diaria"
                value={data.metaMinimaDiaria}
              />
            )}
          </div>
        </section>
      )}

      {indicadores && (
        <section className="flex flex-col gap-3">
          <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
            Resultado del período
          </h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {claves.map((clave) => (
              <StatCard
                key={clave}
                spotlight={clave === "gananciaLiquida"}
                className={clave === "gananciaLiquida" ? "bg-success" : undefined}
                icon={<Icon name={METRICAS[clave].icon} />}
                tone={METRICAS[clave].tone}
                label={METRICAS[clave].label}
                value={
                  clave === "margenGanancia"
                    ? `${Number(indicadores[clave]).toFixed(1)}%`
                    : `${indicadores[clave]}`
                }
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
