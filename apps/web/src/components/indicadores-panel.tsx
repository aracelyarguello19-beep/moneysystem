"use client";

import { useCallback, useEffect, useState } from "react";
import type { IndicadoresFinancieros } from "@repo/domain";
import { obtenerIndicadores } from "@/actions/indicadores/obtener-indicadores";

type ClaveTotal = Exclude<keyof IndicadoresFinancieros, "desglose">;

const ETIQUETAS: Record<ClaveTotal, string> = {
  ingresosBrutos: "Ingresos Brutos",
  ingresosNetos: "Ingresos Netos",
  cmv: "CMV",
  csv: "CSV",
  gananciaBruta: "Ganancia Bruta",
  gastosOperativos: "Gastos Operativos",
  resultadoOperativo: "Resultado Operativo",
  gastosFinancieros: "Gastos Financieros",
  gananciaLiquida: "Ganancia Líquida",
  margenGanancia: "Margen de Ganancia",
};

function primerDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

// AC1/AC2/AC4 (Story 5.1) + AC1/AC2/AC3 (Story 5.2): cadena de indicadores
// del negocio activo para un período filtrable, con desglose Producto vs.
// Servicio, recalculada bajo demanda (sin React Query, no está en el stack)
// al cambiar el período o al presionar "Actualizar".
export function IndicadoresPanel({ negocioId }: { negocioId: string }) {
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [indicadores, setIndicadores] = useState<IndicadoresFinancieros | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await obtenerIndicadores(negocioId, { desde, hasta });
    if (result.ok) {
      setIndicadores(result.data);
      setMensaje(null);
    } else {
      setMensaje(result.error.message);
    }
  }, [negocioId, desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end gap-2">
        <div>
          <label htmlFor="desde" className="block text-sm">
            Desde
          </label>
          <input
            id="desde"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="hasta" className="block text-sm">
            Hasta
          </label>
          <input
            id="hasta"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={cargar}
          className="rounded bg-emerald-600 px-4 py-2 text-white"
        >
          Actualizar
        </button>
      </div>

      {mensaje && (
        <p role="alert" className="text-sm text-red-600">
          {mensaje}
        </p>
      )}

      {indicadores && (
        <>
          <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-3">
            {(Object.keys(ETIQUETAS) as ClaveTotal[]).map((clave) => (
              <div key={clave}>
                <dt className="text-xs text-gray-500">{ETIQUETAS[clave]}</dt>
                <dd className="text-lg font-medium">{indicadores[clave]}</dd>
              </div>
            ))}
          </dl>

          <div>
            <h2 className="mb-2 text-sm font-medium text-gray-500">
              Desglose Producto vs. Servicio
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded border p-3">
                <p className="text-xs text-gray-500">Producto</p>
                <p className="text-sm">CMV: {indicadores.desglose.producto.cmv}</p>
                <p className="text-sm">Ganancia Bruta: {indicadores.desglose.producto.gananciaBruta}</p>
              </div>
              <div className="rounded border p-3">
                <p className="text-xs text-gray-500">Servicio</p>
                <p className="text-sm">CSV: {indicadores.desglose.servicio.csv}</p>
                <p className="text-sm">Ganancia Bruta: {indicadores.desglose.servicio.gananciaBruta}</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
