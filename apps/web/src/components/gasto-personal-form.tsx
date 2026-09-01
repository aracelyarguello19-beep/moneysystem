"use client";

import { useCallback, useEffect, useState } from "react";
import type { Gasto, Moneda, TipoGasto } from "@repo/domain";
import { registrarGastoPersonal } from "@/actions/personal/registrar-gasto-personal";
import { listarGastos } from "@/actions/gastos/listar-gastos";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";

const FORMAS_PAGO: Gasto["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA"];

type GastoListado = Gasto & { tipoGastoNombre: string; clasificacion: TipoGasto["clasificacion"] };

// AC1/AC2/AC3: un único formulario (mismo modelo `Gasto` que Laboral,
// Story 4.1) — el tipo de gasto elegido ya trae su clasificación
// Fijo/Variable/Financiero del catálogo Personal (Story 1.7), nunca se
// vuelve a pedir acá. Task 4: el listado separa visualmente Fijo de
// Variable.
export function GastoPersonalForm() {
  const [tiposGasto, setTiposGasto] = useState<TipoGasto[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [gastos, setGastos] = useState<GastoListado[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [tipoGastoId, setTipoGastoId] = useState("");
  const [monto, setMonto] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPago, setFormaPago] = useState<Gasto["formaPago"]>("EFECTIVO");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");

  const cargar = useCallback(async () => {
    const [tiposResult, monedasResult, gastosResult] = await Promise.all([
      listarTiposGasto(null),
      listarMonedas(null),
      listarGastos(null),
    ]);
    if (tiposResult.ok) {
      setTiposGasto(tiposResult.data);
      setTipoGastoId((actual) => actual || tiposResult.data[0]?.id || "");
    }
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
    if (gastosResult.ok) setGastos(gastosResult.data);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await registrarGastoPersonal({
      tipoGastoId,
      monto,
      monedaId,
      fecha,
      formaPago,
      cuentaFinancieraId,
    });

    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setMonto("");
    await cargar();
  }

  if (tiposGasto.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No hay tipos de gasto en el catálogo Personal todavía. Creá uno (Fijo, Variable o
        Financiero) en la configuración antes de registrar un gasto.
      </p>
    );
  }

  const gastosFijos = gastos.filter((g) => g.clasificacion === "FIJO");
  const gastosVariables = gastos.filter((g) => g.clasificacion === "VARIABLE");
  const gastosFinancieros = gastos.filter((g) => g.clasificacion === "FINANCIERO");

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="tipo-gasto-personal" className="block text-sm">
            Tipo de gasto
          </label>
          <select
            id="tipo-gasto-personal"
            value={tipoGastoId}
            onChange={(e) => setTipoGastoId(e.target.value)}
            className="rounded border px-2 py-2"
          >
            {tiposGasto.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} ({t.clasificacion})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="monto-gasto-personal" className="block text-sm">
            Monto
          </label>
          <input
            id="monto-gasto-personal"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="w-28 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-gasto-personal" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-gasto-personal"
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
          <label htmlFor="fecha-gasto-personal" className="block text-sm">
            Fecha
          </label>
          <input
            id="fecha-gasto-personal"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="forma-pago-gasto-personal" className="block text-sm">
            Forma de pago
          </label>
          <select
            id="forma-pago-gasto-personal"
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value as Gasto["formaPago"])}
            className="rounded border px-2 py-2"
          >
            {FORMAS_PAGO.map((fp) => (
              <option key={fp} value={fp}>
                {fp}
              </option>
            ))}
          </select>
        </div>
        <CuentaFinancieraSelect
          id="cuenta-financiera-gasto-personal"
          negocioId={null}
          esTarjeta={formaPago === "TARJETA"}
          value={cuentaFinancieraId}
          onChange={setCuentaFinancieraId}
          label="Cuenta financiera"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Registrar gasto
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-500">Gastos fijos</h2>
          <ul className="flex flex-col gap-2">
            {gastosFijos.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded border px-4 py-2 text-sm"
              >
                <span>
                  {g.tipoGastoNombre} · {g.fecha.toString().slice(0, 10)}
                </span>
                <span className="text-gray-500">{g.monto}</span>
              </li>
            ))}
            {gastosFijos.length === 0 && (
              <p className="text-sm text-gray-500">Sin gastos fijos registrados.</p>
            )}
          </ul>
        </div>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-500">Gastos variables</h2>
          <ul className="flex flex-col gap-2">
            {gastosVariables.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded border px-4 py-2 text-sm"
              >
                <span>
                  {g.tipoGastoNombre} · {g.fecha.toString().slice(0, 10)}
                </span>
                <span className="text-gray-500">{g.monto}</span>
              </li>
            ))}
            {gastosVariables.length === 0 && (
              <p className="text-sm text-gray-500">Sin gastos variables registrados.</p>
            )}
          </ul>
        </div>
      </div>

      {gastosFinancieros.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-gray-500">
            Gastos financieros (intereses de tarjeta personal — Story 6.4)
          </h2>
          <ul className="flex flex-col gap-2">
            {gastosFinancieros.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between rounded border px-4 py-2 text-sm"
              >
                <span>
                  {g.tipoGastoNombre} · {g.fecha.toString().slice(0, 10)}
                </span>
                <span className="text-gray-500">{g.monto}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
