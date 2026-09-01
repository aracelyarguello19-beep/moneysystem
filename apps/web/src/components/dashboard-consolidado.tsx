"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardConsolidado } from "@repo/domain";
import { obtenerDashboardConsolidado } from "@/actions/consolidado/obtener-dashboard-consolidado";

function primerDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

// AC1/AC2/AC3: dashboard consolidado entre todos los negocios de la cuenta,
// con toggle explícito para incluir negocios archivados (excluidos por
// defecto).
export function DashboardConsolidadoView() {
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [incluirArchivados, setIncluirArchivados] = useState(false);
  const [dashboard, setDashboard] = useState<DashboardConsolidado | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerDashboardConsolidado({ desde, hasta }, incluirArchivados);
    if (result.ok) {
      setDashboard(result.data);
      setMensaje(null);
    } else {
      setMensaje(result.error.message);
    }
  }, [desde, hasta, incluirArchivados]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="desde-consolidado" className="block text-sm">
            Desde
          </label>
          <input
            id="desde-consolidado"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="hasta-consolidado" className="block text-sm">
            Hasta
          </label>
          <input
            id="hasta-consolidado"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={incluirArchivados}
            onChange={(e) => setIncluirArchivados(e.target.checked)}
          />
          Incluir negocios archivados
        </label>
        <button type="button" onClick={cargar} className="rounded bg-emerald-600 px-4 py-2 text-white">
          Actualizar
        </button>
      </div>

      {mensaje && (
        <p role="alert" className="text-sm text-red-600">
          {mensaje}
        </p>
      )}

      {dashboard && (
        <>
          <section>
            <h2 className="mb-2 text-sm font-medium text-gray-500">
              Indicadores consolidados (Guaraníes)
            </h2>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
              <div>
                <dt className="text-xs text-gray-500">Ingresos Netos</dt>
                <dd className="text-lg font-medium">
                  {dashboard.indicadoresConsolidados.ingresosNetos}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Ganancia Líquida</dt>
                <dd className="text-lg font-medium">
                  {dashboard.indicadoresConsolidados.gananciaLiquida}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Margen</dt>
                <dd className="text-lg font-medium">
                  {dashboard.indicadoresConsolidados.margenGanancia}
                </dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-gray-500">
              Saldos y deudas consolidados (Guaraníes)
            </h2>
            <dl className="grid grid-cols-3 gap-x-8 gap-y-2">
              <div>
                <dt className="text-xs text-gray-500">Caja + Bancos</dt>
                <dd className="text-lg font-medium">{dashboard.saldos.totalCajaBanco}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Deuda en Tarjetas</dt>
                <dd className="text-lg font-medium">{dashboard.saldos.totalDeudaTarjetas}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Cuentas por Cobrar</dt>
                <dd className="text-lg font-medium">{dashboard.saldos.totalCuentasPorCobrar}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-gray-500">Detalle por negocio</h2>
            <ul className="flex flex-col gap-2">
              {dashboard.porNegocio.map((n) => (
                <li key={n.negocioId} className="rounded border px-4 py-2 text-sm">
                  <p className="font-medium">{n.nombre}</p>
                  <p className="text-xs text-gray-500">
                    Ingresos Netos: {n.indicadoresEnGuaranies.ingresosNetos} · Ganancia Líquida:{" "}
                    {n.indicadoresEnGuaranies.gananciaLiquida} · Margen:{" "}
                    {n.indicadoresEnGuaranies.margenGanancia}
                  </p>
                </li>
              ))}
              {dashboard.porNegocio.length === 0 && (
                <p className="text-sm text-gray-500">No hay negocios para mostrar.</p>
              )}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
