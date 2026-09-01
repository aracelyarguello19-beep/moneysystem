"use client";

import { useCallback, useEffect, useState } from "react";
import type { Gasto, Moneda, TipoGasto } from "@repo/domain";
import { registrarGasto } from "@/actions/gastos/registrar-gasto";
import { listarGastos } from "@/actions/gastos/listar-gastos";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";

const FORMAS_PAGO: Gasto["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA"];

type GastoListado = Gasto & { tipoGastoNombre: string; clasificacion: TipoGasto["clasificacion"] };

// AC1/AC3: el formulario no pide clasificación — se muestra ya resuelta
// (Operativo/Financiero) en el listado, heredada del tipo de gasto elegido.
export function GastoForm({ negocioId }: { negocioId: string }) {
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
      listarTiposGasto(negocioId),
      listarMonedas(negocioId),
      listarGastos(negocioId),
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
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await registrarGasto(negocioId, {
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
        No hay tipos de gasto en el catálogo de este negocio todavía. Creá uno en la
        configuración antes de registrar un gasto.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="tipo-gasto-gasto" className="block text-sm">
            Tipo de gasto
          </label>
          <select
            id="tipo-gasto-gasto"
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
          <label htmlFor="monto-gasto" className="block text-sm">
            Monto
          </label>
          <input
            id="monto-gasto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="w-28 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-gasto" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-gasto"
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
          <label htmlFor="fecha-gasto" className="block text-sm">
            Fecha
          </label>
          <input
            id="fecha-gasto"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="forma-pago-gasto" className="block text-sm">
            Forma de pago
          </label>
          <select
            id="forma-pago-gasto"
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
          id="cuenta-financiera-gasto"
          negocioId={negocioId}
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

      <ul className="flex flex-col gap-2">
        {gastos.map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded border px-4 py-2 text-sm">
            <span>
              {g.tipoGastoNombre} · {g.fecha.toString().slice(0, 10)}
            </span>
            <span className="text-gray-500">
              {g.monto} · {g.clasificacion}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
