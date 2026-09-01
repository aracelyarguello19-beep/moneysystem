"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaFinanciera, Moneda } from "@repo/domain";
import type { CrearCuentaFinancieraInput } from "@repo/domain/schemas";
import { obtenerSaldos } from "@/actions/cuentas-financieras/obtener-saldos";
import { crearCuentaFinanciera } from "@/actions/cuentas-financieras/crear-cuenta-financiera";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";

type Tipo = CrearCuentaFinancieraInput["tipo"];

// Personal necesita al menos una cuenta CAJA/BANCO para poder registrar
// gastos (Story 6.3, Task 2) — versión mínima del formulario de creación
// de `SaldosPanel` (Story 4.3), sin gestión de tasas de cambio (esa parte
// es específica del negocio Laboral con moneda extranjera, fuera de
// alcance de esta story).
export function CuentaFinancieraPersonal() {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const [tipo, setTipo] = useState<Tipo>("CAJA");
  const [nombre, setNombre] = useState("");
  const [monedaId, setMonedaId] = useState("");

  const cargar = useCallback(async () => {
    const [cuentasResult, monedasResult] = await Promise.all([
      obtenerSaldos(null),
      listarMonedas(null),
    ]);
    if (cuentasResult.ok) setCuentas(cuentasResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMensaje(null);
    const result = await crearCuentaFinanciera(null, { tipo, nombre, monedaId });
    if (!result.ok) {
      setMensaje(result.error.message);
      return;
    }
    setNombre("");
    await cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="tipo-cuenta-personal" className="block text-sm">
            Tipo
          </label>
          <select
            id="tipo-cuenta-personal"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as Tipo)}
            className="rounded border px-2 py-2"
          >
            <option value="CAJA">Caja</option>
            <option value="BANCO">Banco</option>
          </select>
        </div>
        <div>
          <label htmlFor="nombre-cuenta-personal" className="block text-sm">
            Nombre
          </label>
          <input
            id="nombre-cuenta-personal"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-cuenta-personal" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-cuenta-personal"
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

      <ul className="flex flex-col gap-1">
        {cuentas.map((c) => (
          <li key={c.id} className="flex justify-between rounded border px-4 py-2 text-sm">
            <span>
              {c.nombre} ({c.tipo})
            </span>
            <span>{c.saldoActual}</span>
          </li>
        ))}
        {cuentas.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no hay cuentas de caja/banco personales.</p>
        )}
      </ul>
    </div>
  );
}
