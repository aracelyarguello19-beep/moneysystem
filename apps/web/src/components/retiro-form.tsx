"use client";

import { useCallback, useEffect, useState } from "react";
import type { RetiroUtilidad } from "@repo/domain";
import { registrarRetiro } from "@/actions/personal/registrar-retiro";
import { listarRetiros } from "@/actions/personal/listar-retiros";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";

// AC1/AC2/AC4: formulario de retiro desde el negocio de origen (negocio
// activo) + historial de retiros de ese negocio.
export function RetiroForm({ negocioId }: { negocioId: string }) {
  const [retiros, setRetiros] = useState<RetiroUtilidad[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");

  const cargar = useCallback(async () => {
    const result = await listarRetiros(negocioId);
    if (result.ok) setRetiros(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await registrarRetiro(negocioId, { monto, cuentaFinancieraId, fecha });

    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setMonto("");
    await cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="monto-retiro" className="block text-sm">
            Monto a retirar
          </label>
          <input
            id="monto-retiro"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="w-32 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="fecha-retiro" className="block text-sm">
            Fecha
          </label>
          <input
            id="fecha-retiro"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <CuentaFinancieraSelect
          id="cuenta-financiera-retiro"
          negocioId={negocioId}
          esTarjeta={false}
          value={cuentaFinancieraId}
          onChange={setCuentaFinancieraId}
          label="Cuenta de origen"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Retirar
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {retiros.map((r) => (
          <li key={r.id} className="flex items-center justify-between rounded border px-4 py-2 text-sm">
            <span>{r.fecha.toString().slice(0, 10)}</span>
            <span className="text-gray-500">{r.monto}</span>
          </li>
        ))}
        {retiros.length === 0 && (
          <p className="text-sm text-gray-500">Todavía no hay retiros registrados de este negocio.</p>
        )}
      </ul>
    </div>
  );
}
