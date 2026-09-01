"use client";

import { useCallback, useEffect, useState } from "react";
import type { BalancePersonal } from "@repo/domain";
import { obtenerBalancePersonal } from "@/actions/personal/obtener-balance-personal";
import { listarNegocios } from "@/actions/negocios/listar-negocios";

function primerDiaDelMes(): string {
  const hoy = new Date();
  return new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString().slice(0, 10);
}

// AC5: una sola pantalla con disponible, desglose de retiros por negocio,
// gastos fijos/varios, aporte a reserva, y deuda de tarjeta personal
// aparte (AC4) — sin navegar a otra pantalla para responder "cuánto puedo
// gastar/reservar".
export function BalancePersonalView() {
  const [desde, setDesde] = useState(primerDiaDelMes);
  const [hasta, setHasta] = useState(() => new Date().toISOString().slice(0, 10));
  const [balance, setBalance] = useState<BalancePersonal | null>(null);
  const [nombresPorNegocio, setNombresPorNegocio] = useState<Record<string, string>>({});
  const [mensaje, setMensaje] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [balanceResult, negociosResult] = await Promise.all([
      obtenerBalancePersonal({ desde, hasta }),
      listarNegocios(),
    ]);
    if (balanceResult.ok) {
      setBalance(balanceResult.data);
      setMensaje(null);
    } else {
      setMensaje(balanceResult.error.message);
    }
    if (negociosResult.ok) {
      setNombresPorNegocio(Object.fromEntries(negociosResult.data.map((n) => [n.id, n.nombre])));
    }
  }, [desde, hasta]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="desde-balance" className="block text-sm">
            Desde
          </label>
          <input
            id="desde-balance"
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="hasta-balance" className="block text-sm">
            Hasta
          </label>
          <input
            id="hasta-balance"
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <button type="button" onClick={cargar} className="rounded bg-emerald-600 px-4 py-2 text-white">
          Actualizar
        </button>
      </div>

      {mensaje && (
        <p role="alert" className="text-sm text-red-600">
          {mensaje}
        </p>
      )}

      {balance && (
        <>
          <section>
            <p className="text-sm text-gray-500">Disponible (AC2)</p>
            <p className="text-3xl font-semibold">{balance.disponible}</p>
          </section>

          <section>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
              <div>
                <dt className="text-xs text-gray-500">Retiros recibidos</dt>
                <dd className="text-lg font-medium">{balance.totalRetiros}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Gastos fijos</dt>
                <dd className="text-lg font-medium">{balance.gastosFijos}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Gastos variables</dt>
                <dd className="text-lg font-medium">{balance.gastosVariables}</dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Aporte a reserva</dt>
                <dd className="text-lg font-medium">{balance.aporteReserva}</dd>
              </div>
            </dl>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-gray-500">
              Retiros por negocio de origen (AC3)
            </h2>
            <ul className="flex flex-col gap-2">
              {balance.retirosPorNegocio.map((r) => (
                <li
                  key={r.negocioId}
                  className="flex items-center justify-between rounded border px-4 py-2 text-sm"
                >
                  <span>{nombresPorNegocio[r.negocioId] ?? r.negocioId}</span>
                  <span className="text-gray-500">{r.total}</span>
                </li>
              ))}
              {balance.retirosPorNegocio.length === 0 && (
                <p className="text-sm text-gray-500">No hay retiros en este período.</p>
              )}
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-gray-500">
              Deuda de tarjeta personal (pasivo — no se resta del disponible, AC4)
            </h2>
            <p className="text-lg font-medium">{balance.deudaTarjetaPersonal}</p>
          </section>
        </>
      )}
    </div>
  );
}
