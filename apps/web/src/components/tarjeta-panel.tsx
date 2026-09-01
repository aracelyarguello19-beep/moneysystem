"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaFinanciera, Moneda, TipoGasto } from "@repo/domain";
import { listarTarjetas } from "@/actions/gastos/listar-tarjetas";
import { crearTarjeta } from "@/actions/gastos/crear-tarjeta";
import { registrarPagoResumenTarjeta } from "@/actions/gastos/registrar-pago-resumen-tarjeta";
import { registrarInteresTarjeta } from "@/actions/gastos/registrar-interes-tarjeta";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";

// AC1/AC3 (Story 4.2): saldo de cada tarjeta (negativo = deuda) y total
// adeudado agregado, separado de CuentaPorCobrar (activo, Story 3.4).
// `negocioId: null` (Story 6.4, AC1/AC3) reutiliza este mismo panel para la
// tarjeta personal — todas las Server Actions que llama ya aceptan
// `negocioId: string | null`.
export function TarjetaPanel({ negocioId }: { negocioId: string | null }) {
  const [tarjetas, setTarjetas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tiposGastoFinanciero, setTiposGastoFinanciero] = useState<TipoGasto[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [nombreTarjeta, setNombreTarjeta] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [limiteCredito, setLimiteCredito] = useState("");

  const [pagos, setPagos] = useState<Record<string, { monto: string; cuentaFinancieraId: string }>>(
    {}
  );
  const [intereses, setIntereses] = useState<Record<string, { monto: string; tipoGastoId: string }>>(
    {}
  );

  const cargar = useCallback(async () => {
    const [tarjetasResult, monedasResult, tiposResult] = await Promise.all([
      listarTarjetas(negocioId),
      listarMonedas(negocioId),
      listarTiposGasto(negocioId),
    ]);
    if (tarjetasResult.ok) setTarjetas(tarjetasResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
    if (tiposResult.ok) {
      setTiposGastoFinanciero(tiposResult.data.filter((t) => t.clasificacion === "FINANCIERO"));
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onCrearTarjeta(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const result = await crearTarjeta(negocioId, {
      nombre: nombreTarjeta,
      monedaId,
      limiteCredito: limiteCredito || null,
    });
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setNombreTarjeta("");
    setLimiteCredito("");
    await cargar();
  }

  async function onPagarResumen(tarjetaId: string) {
    const pago = pagos[tarjetaId];
    if (!pago?.monto || !pago?.cuentaFinancieraId) return;
    const result = await registrarPagoResumenTarjeta(negocioId, tarjetaId, pago);
    setMensaje(result.ok ? null : result.error.message);
    if (result.ok) await cargar();
  }

  async function onRegistrarInteres(tarjetaId: string) {
    const interes = intereses[tarjetaId];
    if (!interes?.monto || !interes?.tipoGastoId) return;
    const result = await registrarInteresTarjeta(negocioId, tarjetaId, interes);
    setMensaje(result.ok ? null : result.error.message);
    if (result.ok) await cargar();
  }

  const totalAdeudado = tarjetas.reduce((acc, t) => acc + Number(t.saldoActual), 0);

  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium">Total adeudado en tarjetas: {Math.abs(totalAdeudado)}</p>

      <form onSubmit={onCrearTarjeta} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="nombre-tarjeta" className="block text-sm">
            Nueva tarjeta
          </label>
          <input
            id="nombre-tarjeta"
            value={nombreTarjeta}
            onChange={(e) => setNombreTarjeta(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-tarjeta" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-tarjeta"
            value={monedaId}
            onChange={(e) => setMonedaId(e.target.value)}
            className="rounded border px-2 py-2"
          >
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="limite-tarjeta" className="block text-sm">
            Límite (opcional)
          </label>
          <input
            id="limite-tarjeta"
            value={limiteCredito}
            onChange={(e) => setLimiteCredito(e.target.value)}
            className="w-28 rounded border px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded bg-emerald-600 px-4 py-2 text-white">
          Crear tarjeta
        </button>
      </form>

      {mensaje && (
        <p role="alert" className="text-sm text-red-600">
          {mensaje}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {tarjetas.map((t) => (
          <li key={t.id} className="rounded border px-4 py-2">
            <p className="text-sm font-medium">
              {t.nombre} — deuda: {Math.abs(Number(t.saldoActual))}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input
                aria-label={`Monto de pago de resumen de ${t.nombre}`}
                placeholder="Monto pago"
                value={pagos[t.id]?.monto ?? ""}
                onChange={(e) =>
                  setPagos((prev) => ({
                    ...prev,
                    [t.id]: { ...prev[t.id], monto: e.target.value, cuentaFinancieraId: prev[t.id]?.cuentaFinancieraId ?? "" },
                  }))
                }
                className="w-24 rounded border px-2 py-1 text-sm"
              />
              <input
                aria-label={`Cuenta de origen para el pago de ${t.nombre}`}
                placeholder="Cuenta origen (id)"
                value={pagos[t.id]?.cuentaFinancieraId ?? ""}
                onChange={(e) =>
                  setPagos((prev) => ({
                    ...prev,
                    [t.id]: { ...prev[t.id], cuentaFinancieraId: e.target.value, monto: prev[t.id]?.monto ?? "" },
                  }))
                }
                className="w-48 rounded border px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => onPagarResumen(t.id)}
                className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
              >
                Pagar resumen
              </button>
            </div>
            {tiposGastoFinanciero.length > 0 && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <input
                  aria-label={`Monto de interés de ${t.nombre}`}
                  placeholder="Monto interés"
                  value={intereses[t.id]?.monto ?? ""}
                  onChange={(e) =>
                    setIntereses((prev) => ({
                      ...prev,
                      [t.id]: { ...prev[t.id], monto: e.target.value, tipoGastoId: prev[t.id]?.tipoGastoId ?? tiposGastoFinanciero[0].id },
                    }))
                  }
                  className="w-24 rounded border px-2 py-1 text-sm"
                />
                <select
                  aria-label={`Tipo de gasto financiero para el interés de ${t.nombre}`}
                  value={intereses[t.id]?.tipoGastoId ?? tiposGastoFinanciero[0].id}
                  onChange={(e) =>
                    setIntereses((prev) => ({
                      ...prev,
                      [t.id]: { ...prev[t.id], tipoGastoId: e.target.value, monto: prev[t.id]?.monto ?? "" },
                    }))
                  }
                  className="rounded border px-2 py-1 text-sm"
                >
                  {tiposGastoFinanciero.map((tg) => (
                    <option key={tg.id} value={tg.id}>
                      {tg.nombre}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => onRegistrarInteres(t.id)}
                  className="rounded bg-amber-600 px-3 py-1 text-sm text-white"
                >
                  Registrar interés
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
