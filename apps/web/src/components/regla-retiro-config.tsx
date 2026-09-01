"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReglaRetiro } from "@repo/domain";
import { configurarReglaRetiro } from "@/actions/personal/configurar-regla-retiro";
import { obtenerReglaRetiro } from "@/actions/personal/obtener-regla-retiro";

const TIPOS: { value: ReglaRetiro["tipo"]; label: string }[] = [
  { value: "PORCENTAJE", label: "Porcentaje de la ganancia líquida" },
  { value: "MONTO_FIJO", label: "Monto fijo por período" },
];

// AC1/AC3: configuración de la regla de retiro predeterminado del negocio
// activo — independiente de la de cualquier otro negocio (Task 1).
export function ReglaRetiroConfig({ negocioId }: { negocioId: string }) {
  const [tipo, setTipo] = useState<ReglaRetiro["tipo"]>("PORCENTAJE");
  const [valor, setValor] = useState("");
  const [activa, setActiva] = useState(true);
  const [ultimoPeriodoAplicado, setUltimoPeriodoAplicado] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargar = useCallback(async () => {
    const result = await obtenerReglaRetiro(negocioId);
    if (result.ok && result.data) {
      setTipo(result.data.tipo);
      setValor(result.data.valor);
      setActiva(result.data.activa);
      setUltimoPeriodoAplicado(result.data.ultimoPeriodoAplicado);
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await configurarReglaRetiro(negocioId, { tipo, valor, activa });

    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setUltimoPeriodoAplicado(result.data.ultimoPeriodoAplicado);
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="tipo-regla-retiro" className="block text-sm">
            Tipo de regla
          </label>
          <select
            id="tipo-regla-retiro"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as ReglaRetiro["tipo"])}
            className="rounded border px-2 py-2"
          >
            {TIPOS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="valor-regla-retiro" className="block text-sm">
            {tipo === "PORCENTAJE" ? "Porcentaje (%)" : "Monto"}
          </label>
          <input
            id="valor-regla-retiro"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
            required
            className="w-28 rounded border px-3 py-2"
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={activa}
            onChange={(e) => setActiva(e.target.checked)}
          />
          Regla activa
        </label>
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Guardar regla
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      {ultimoPeriodoAplicado && (
        <p className="text-xs text-gray-500">
          Último período aplicado automáticamente: {ultimoPeriodoAplicado}
        </p>
      )}
    </div>
  );
}
