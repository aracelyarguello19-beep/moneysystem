"use client";

import { useEffect, useState } from "react";
import type { CuentaFinanciera } from "@repo/domain";
import { listarCuentasFinancieras } from "@/actions/cuentas-financieras/listar-cuentas-financieras";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

// Selector reutilizable de cuenta financiera para los formularios de
// compra/venta/gasto: si `esTarjeta` es true, ofrece las tarjetas del
// negocio; si no, ofrece efectivo/banco (nunca tarjeta ni "Otro" — ninguna
// forma de pago del sistema liquida contra esos dos tipos).
export function CuentaFinancieraSelect({
  negocioId,
  esTarjeta,
  value,
  onChange,
  label,
  id,
}: {
  negocioId: string;
  esTarjeta: boolean;
  value: string;
  onChange: (id: string) => void;
  label: string;
  id: string;
}) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);

  useEffect(() => {
    listarCuentasFinancieras(negocioId).then((result) => {
      if (!result.ok) return;
      const filtradas = result.data.filter((c) =>
        esTarjeta ? c.tipo === "TARJETA" : c.tipo === "CAJA" || c.tipo === "BANCO"
      );
      setCuentas(filtradas);
      if (!value && filtradas[0]) onChange(filtradas[0].id);
    });
    // Solo se recarga cuando cambia el negocio o si se pasa de tarjeta a no-tarjeta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId, esTarjeta]);

  if (cuentas.length === 0) {
    return (
      <p className="text-xs text-warning-text">
        No hay {esTarjeta ? "tarjetas" : "cuentas de caja/banco"} creadas todavía.
      </p>
    );
  }

  return (
    <FormField htmlFor={id} label={label}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {cuentas.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nombre}
          </option>
        ))}
      </Select>
    </FormField>
  );
}
