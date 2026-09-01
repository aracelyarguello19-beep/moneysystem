"use client";

import { useCallback, useEffect, useState } from "react";
import { configurarReserva } from "@/actions/personal/configurar-reserva";
import { obtenerReservaFinanciera } from "@/actions/personal/obtener-reserva-financiera";

// AC1: objetivo de reserva, aporte por período, y progreso acumulado (que
// solo actualiza el job de cierre de período, ADR-001 — nunca esta
// pantalla). Pausar el aporte automático es simplemente guardar
// `aportePorPeriodo: "0"`.
export function ReservaFinancieraConfig() {
  const [objetivoMonto, setObjetivoMonto] = useState("");
  const [aportePorPeriodo, setAportePorPeriodo] = useState("");
  const [progresoAcumulado, setProgresoAcumulado] = useState<string | null>(null);
  const [ultimoPeriodoAplicado, setUltimoPeriodoAplicado] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargar = useCallback(async () => {
    const result = await obtenerReservaFinanciera();
    if (result.ok && result.data) {
      setObjetivoMonto(result.data.objetivoMonto);
      setAportePorPeriodo(result.data.aportePorPeriodo);
      setProgresoAcumulado(result.data.progresoAcumulado);
      setUltimoPeriodoAplicado(result.data.ultimoPeriodoAplicado);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await configurarReserva({ objetivoMonto, aportePorPeriodo });

    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setProgresoAcumulado(result.data.progresoAcumulado);
    setUltimoPeriodoAplicado(result.data.ultimoPeriodoAplicado);
  }

  const objetivoNum = Number(objetivoMonto);
  const progresoPct =
    progresoAcumulado !== null && objetivoNum > 0
      ? Math.min(100, (Number(progresoAcumulado) / objetivoNum) * 100)
      : null;

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="objetivo-reserva" className="block text-sm">
            Objetivo de reserva
          </label>
          <input
            id="objetivo-reserva"
            value={objetivoMonto}
            onChange={(e) => setObjetivoMonto(e.target.value)}
            required
            className="w-32 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="aporte-reserva" className="block text-sm">
            Aporte por período (0 = pausado)
          </label>
          <input
            id="aporte-reserva"
            value={aportePorPeriodo}
            onChange={(e) => setAportePorPeriodo(e.target.value)}
            required
            className="w-32 rounded border px-3 py-2"
          />
        </div>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Guardar
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      {progresoAcumulado !== null && (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            Progreso acumulado: {progresoAcumulado}
            {progresoPct !== null && ` / ${objetivoMonto} (${progresoPct.toFixed(0)}%)`}
          </p>
          {ultimoPeriodoAplicado && (
            <p className="text-xs text-gray-500">
              Último aporte automático aplicado: {ultimoPeriodoAplicado}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
