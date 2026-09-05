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
import { formatearMonto } from "@/lib/moneda";

// CSV (Costo de Servicios Vendidos) y el desglose Producto/Servicio se
// quitaron junto con la sesión de Servicios — el sistema es exclusivo de
// productos. `cmv` y el resto de las métricas siguen intactas.
type ClaveTotal = Exclude<keyof IndicadoresFinancieros, "desglose" | "csv">;

// `gananciaLiquida` va primero a propósito: es la única métrica con
// `spotlight` (fondo destacado, ver StatCard más abajo) porque es el número
// que más le importa al dueño — antes quedaba 8va de 9, perdida a mitad de
// grilla.
// Sin ingresosBrutos, gastosOperativos ni margenGanancia acá — esos tres ya
// se muestran arriba, en el bento principal ("Ventas del período", "Gastos
// operativos", "Margen de ganancia"), con el mismo valor de `indicadores`;
// repetirlos en esta segunda grilla era mostrar la misma tarjeta dos veces.
type ClaveResultado = Exclude<ClaveTotal, "ingresosBrutos" | "gastosOperativos" | "margenGanancia">;

const METRICAS: Record<ClaveResultado, { label: string; icon: string; tone: "primary" | "danger" | "warning" | "neutral" }> = {
  gananciaLiquida: { label: "Ganancia Líquida", icon: "emoji_events", tone: "primary" },
  ingresosNetos: { label: "Ingresos Netos", icon: "account_balance_wallet", tone: "primary" },
  cmv: { label: "CMV", icon: "inventory_2", tone: "neutral" },
  gananciaBruta: { label: "Ganancia Bruta", icon: "trending_up", tone: "primary" },
  resultadoOperativo: { label: "Resultado Operativo", icon: "balance", tone: "primary" },
  gastosFinancieros: { label: "Gastos Financieros", icon: "account_balance", tone: "danger" },
};

function primerDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

function formatearFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-");
  return `${d}/${m}/${y}`;
}

const VALOR_OCULTO = "••••••";

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
  // Enmascara montos/porcentajes con "••••••" — mismo patrón "Mostrar/Ocultar"
  // del dashboard de Ticto (design system de referencia), útil acá para no
  // exponer cifras del negocio al compartir pantalla.
  const [valoresVisibles, setValoresVisibles] = useState(true);
  const v = (valor: string) => (valoresVisibles ? valor : VALOR_OCULTO);

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

  const claves = Object.keys(METRICAS) as ClaveResultado[];
  const indicadores = data?.indicadores ?? null;

  const periodo = `Del ${formatearFecha(desde)} al ${formatearFecha(hasta)}`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-headline-lg font-light leading-tight text-on-surface">Dashboard</h1>
        <button
          type="button"
          onClick={() => setValoresVisibles((val) => !val)}
          className="flex items-center gap-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2 text-label-lg font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-high hover:text-on-surface"
        >
          <Icon name={valoresVisibles ? "visibility_off" : "visibility"} className="text-[18px]" />
          {valoresVisibles ? "Ocultar" : "Mostrar"}
        </button>
      </div>

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

      {/* Caja va primero: cuánto dinero hay disponible ahora mismo es el
          primer dato que el dueño busca al abrir el dashboard, antes que
          cualquier indicador de resultado del período. */}
      {data && (data.saldosPorMoneda.length > 0 || data.metaMinimaDiaria || data.totalGastosFijos) && (
        <section className="flex flex-col gap-3">
          <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">Caja</h2>
          {data.saldosPorMoneda.length > 0 && (
            <StatCard
              spotlight
              tone="primary"
              icon={<Icon name="account_balance_wallet" fill />}
              label="Valor total del negocio"
              value={v(formatearMonto(data.valorTotalCajaGs))}
            />
          )}
          {data.monedasSinCotizacion.length > 0 && (
            <p className="text-label-md text-warning-text">
              Falta cargar la cotización de {data.monedasSinCotizacion.join(", ")} en Caja — esas cuentas no están
              sumadas en el valor total.
            </p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {data.saldosPorMoneda.map((s) => (
              <StatCard
                key={s.codigo}
                icon={<Icon name="account_balance_wallet" />}
                tone="primary"
                label={`Caja (${s.codigo})`}
                value={v(formatearMonto(s.total, s.codigo))}
              />
            ))}
            {data.totalGastosFijos && (
              <StatCard
                icon={<Icon name="receipt" />}
                tone="neutral"
                label="Total gastos fijos"
                value={v(formatearMonto(data.totalGastosFijos))}
              />
            )}
            {data.metaMinimaDiaria && (
              <StatCard
                icon={<Icon name="track_changes" />}
                tone="warning"
                label="Meta mínima diaria"
                value={v(formatearMonto(data.metaMinimaDiaria))}
              />
            )}
          </div>
        </section>
      )}

      {/* Bento principal — mismo layout 8/4 que Stitch */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="flex flex-col gap-4 lg:col-span-8">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <StatCard
              icon={<Icon name="payments" />}
              tone="primary"
              label="Ventas del período"
              value={v(formatearMonto(indicadores?.ingresosBrutos ?? "0"))}
              caption={periodo}
            />
            <StatCard
              icon={<Icon name="pie_chart" />}
              tone="warning"
              label="Margen de ganancia"
              value={v(indicadores ? `${Number(indicadores.margenGanancia).toFixed(1)}%` : "0%")}
              caption={periodo}
            />
            <StatCard
              icon={<Icon name="inventory_2" />}
              tone="neutral"
              label="Valor de inventario"
              value={v(formatearMonto(data?.valorInventario ?? "0"))}
              caption="Stock actual"
            />
            <StatCard
              icon={<Icon name="receipt" />}
              tone="danger"
              label="Gastos operativos"
              value={v(formatearMonto(indicadores?.gastosOperativos ?? "0"))}
              caption={periodo}
            />
          </div>

          {indicadores && (
            <section className="flex flex-col gap-3">
              <h2 className="text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
                Resultado del período
              </h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {claves.map((clave) => (
                  <StatCard
                    key={clave}
                    spotlight={clave === "gananciaLiquida"}
                    className={clave === "gananciaLiquida" ? "bg-success" : undefined}
                    icon={<Icon name={METRICAS[clave].icon} />}
                    tone={METRICAS[clave].tone}
                    label={METRICAS[clave].label}
                    value={v(formatearMonto(indicadores[clave]))}
                  />
                ))}
              </div>
            </section>
          )}

          <VentasVsGastosChart puntos={data?.tendencia ?? []} />
        </div>

        <div className="flex flex-col gap-4 lg:col-span-4">
          <AlertasCriticas items={data?.items ?? []} cuentasPorCobrar={data?.cuentasPorCobrar ?? []} />
          <ActividadReciente movimientos={data?.movimientosRecientes ?? []} />
        </div>
      </div>
    </div>
  );
}
