"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaFinanciera, Moneda } from "@repo/domain";
import { agruparSaldosPorMoneda, convertirAGuaranies } from "@repo/domain";
import type { CrearCuentaFinancieraInput } from "@repo/domain/schemas";
import { obtenerSaldos } from "@/actions/cuentas-financieras/obtener-saldos";
import { crearCuentaFinanciera } from "@/actions/cuentas-financieras/crear-cuenta-financiera";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import {
  listarTasasCambio,
  type MonedaConTasa,
} from "@/actions/catalogos/listar-tasas-cambio";
import { registrarTasaCambio } from "@/actions/catalogos/registrar-tasa-cambio";

type Tipo = CrearCuentaFinancieraInput["tipo"];

// AC1/AC3 (Story 4.3) + AC1/AC2/AC5 (Story 5.3): saldo de caja y banco
// agrupado por moneda, total consolidado en Guaraníes usando la última tasa
// cargada por moneda, y gestión de esas tasas (carga + qué tasa/fecha se
// usa por moneda no base).
export function SaldosPanel({ negocioId }: { negocioId: string }) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tasas, setTasas] = useState<MonedaConTasa[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [tipo, setTipo] = useState<Tipo>("CAJA");
  const [nombre, setNombre] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [nuevasTasas, setNuevasTasas] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const [cuentasResult, monedasResult, tasasResult] = await Promise.all([
      obtenerSaldos(negocioId),
      listarMonedas(negocioId),
      listarTasasCambio(negocioId),
    ]);
    if (cuentasResult.ok) setCuentas(cuentasResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
    if (tasasResult.ok) setTasas(tasasResult.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const result = await crearCuentaFinanciera(negocioId, { tipo, nombre, monedaId });
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setNombre("");
    await cargar();
  }

  async function onRegistrarTasa(monedaTasaId: string) {
    const tasa = nuevasTasas[monedaTasaId];
    if (!tasa) return;
    const result = await registrarTasaCambio(negocioId, monedaTasaId, { tasa });
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setNuevasTasas((prev) => ({ ...prev, [monedaTasaId]: "" }));
    await cargar();
  }

  const grupos = agruparSaldosPorMoneda(cuentas);
  const monedaBaseId = monedas.find((m) => m.esBase)?.id;
  const codigoPorMoneda = (id: string) => monedas.find((m) => m.id === id)?.codigo ?? id;
  const tasaPorMoneda = (id: string) => tasas.find((t) => t.moneda.id === id)?.tasaVigente ?? null;

  const totalConsolidado = Object.entries(grupos).reduce((acc, [monedaIdGrupo, cuentasDeLaMoneda]) => {
    const subtotal = cuentasDeLaMoneda.reduce((s, c) => s + Number(c.saldoActual), 0);
    const convertido = convertirAGuaranies({
      monto: subtotal.toString(),
      esMonedaBase: monedaIdGrupo === monedaBaseId,
      tasa: tasaPorMoneda(monedaIdGrupo)?.tasa ?? null,
    });
    return acc + Number(convertido);
  }, 0);

  return (
    <div className="flex flex-col gap-6">
      <p className="font-medium">Total consolidado (Guaraníes): {totalConsolidado}</p>

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="tipo-cuenta" className="block text-sm">
            Tipo
          </label>
          <select
            id="tipo-cuenta"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo)}
            className="rounded border px-2 py-2"
          >
            <option value="CAJA">Caja</option>
            <option value="BANCO">Banco</option>
          </select>
        </div>
        <div>
          <label htmlFor="nombre-cuenta" className="block text-sm">
            Nombre
          </label>
          <input
            id="nombre-cuenta"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-cuenta" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-cuenta"
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
        <button type="submit" className="rounded bg-emerald-600 px-4 py-2 text-white">
          Crear cuenta
        </button>
      </form>

      {mensaje && (
        <p role="alert" className="text-sm text-red-600">
          {mensaje}
        </p>
      )}

      {Object.entries(grupos).map(([monedaIdGrupo, cuentasDeLaMoneda]) => (
        <div key={monedaIdGrupo} className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">{codigoPorMoneda(monedaIdGrupo)}</h3>
          <ul className="flex flex-col gap-1">
            {cuentasDeLaMoneda.map((c) => (
              <li key={c.id} className="flex justify-between rounded border px-4 py-2 text-sm">
                <span>
                  {c.nombre} ({c.tipo})
                </span>
                <span>{c.saldoActual}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      <div>
        <h2 className="mb-2 text-sm font-medium text-gray-500">Tasas de cambio (monedas no base)</h2>
        <ul className="flex flex-col gap-2">
          {tasas.map(({ moneda, tasaVigente }) => (
            <li key={moneda.id} className="rounded border px-4 py-2 text-sm">
              <p>
                {moneda.codigo} —{" "}
                {tasaVigente
                  ? `1 ${moneda.codigo} = ${tasaVigente.tasa} PYG (desde ${tasaVigente.vigenteDesde.toString().slice(0, 10)})`
                  : "sin tasa cargada todavía"}
              </p>
              <div className="mt-1 flex items-end gap-2">
                <input
                  aria-label={`Nueva tasa para ${moneda.codigo}`}
                  value={nuevasTasas[moneda.id] ?? ""}
                  onChange={(e) =>
                    setNuevasTasas((prev) => ({ ...prev, [moneda.id]: e.target.value }))
                  }
                  placeholder="Nueva tasa"
                  className="w-28 rounded border px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() => onRegistrarTasa(moneda.id)}
                  className="rounded bg-emerald-600 px-3 py-1 text-xs text-white"
                >
                  Cargar tasa
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
