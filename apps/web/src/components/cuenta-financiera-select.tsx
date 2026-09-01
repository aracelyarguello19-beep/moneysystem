"use client";

import { useEffect, useState } from "react";
import type { CuentaFinanciera } from "@repo/domain";
import { obtenerSaldos } from "@/actions/cuentas-financieras/obtener-saldos";
import { listarTarjetas } from "@/actions/gastos/listar-tarjetas";

// Selector reutilizable de cuenta financiera para los formularios de
// compra/venta/gasto: si `esTarjeta` es true, ofrece las tarjetas del
// negocio (Story 4.2); si no, ofrece caja/banco (Story 4.3, `obtenerSaldos`
// ya excluye TARJETA). Evita que el usuario tenga que tipear un UUID a mano.
export function CuentaFinancieraSelect({
  negocioId,
  esTarjeta,
  value,
  onChange,
  label,
  id,
}: {
  negocioId: string | null;
  esTarjeta: boolean;
  value: string;
  onChange: (id: string) => void;
  label: string;
  id: string;
}) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);

  useEffect(() => {
    const fetcher = esTarjeta ? listarTarjetas : obtenerSaldos;
    fetcher(negocioId).then((result) => {
      if (result.ok) {
        setCuentas(result.data);
        if (!value && result.data[0]) onChange(result.data[0].id);
      }
    });
    // Solo se recarga cuando cambia el negocio o si se pasa de tarjeta a no-tarjeta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId, esTarjeta]);

  if (cuentas.length === 0) {
    return (
      <p className="text-xs text-amber-700">
        No hay {esTarjeta ? "tarjetas" : "cuentas de caja/banco"} creadas todavía.
      </p>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded border px-2 py-2"
      >
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </select>
    </div>
  );
}
