"use client";

import { useEffect, useState } from "react";
import type { CuentaFinanciera, Moneda } from "@repo/domain";
import { listarCuentasFinancieras } from "@/actions/cuentas-financieras/listar-cuentas-financieras";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";

const ETIQUETA_TIPO: Record<CuentaFinanciera["tipo"], string> = {
  CAJA: "cuentas de efectivo",
  BANCO: "cuentas de banco",
  TARJETA: "tarjetas",
  OTRO: "cuentas",
};

// Selector reutilizable de cuenta financiera para los formularios de
// compra/venta/gasto: `tipo` filtra por el tipo de cuenta que corresponde a
// la forma de pago ya elegida en el formulario (Efectivo → CAJA, Banco →
// BANCO, Tarjeta → TARJETA) — nunca mezcla tipos entre sí, porque pagar en
// efectivo no puede salir de una cuenta bancaria ni viceversa. Acepta un
// array cuando de verdad hace falta ofrecer más de un tipo junto (ej. "con
// qué cuenta pagás el resumen de la tarjeta", que puede ser Efectivo o
// Banco indistintamente).
export function CuentaFinancieraSelect({
  negocioId,
  tipo,
  value,
  onChange,
  label,
  id,
}: {
  negocioId: string;
  tipo: CuentaFinanciera["tipo"] | CuentaFinanciera["tipo"][];
  value: string;
  onChange: (id: string) => void;
  label: string;
  id: string;
}) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const tipos = Array.isArray(tipo) ? tipo : [tipo];
  const tiposKey = tipos.join(",");

  useEffect(() => {
    Promise.all([listarCuentasFinancieras(negocioId), listarMonedas(negocioId)]).then(
      ([cuentasResult, monedasResult]) => {
        if (monedasResult.ok) setMonedas(monedasResult.data);
        if (!cuentasResult.ok) return;
        const filtradas = cuentasResult.data.filter((c) => tiposKey.split(",").includes(c.tipo));
        setCuentas(filtradas);
        if (!value && filtradas[0]) onChange(filtradas[0].id);
      }
    );
    // Solo se recarga cuando cambia el negocio o el/los tipo(s) pedidos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId, tiposKey]);

  if (cuentas.length === 0) {
    const etiqueta = tipos.length === 1 ? ETIQUETA_TIPO[tipos[0]] : "cuentas";
    return (
      <p className="text-xs text-warning-text">
        No hay {etiqueta} creadas todavía.
      </p>
    );
  }

  // El nombre de una cuenta CAJA por defecto es siempre "Efectivo" (ver
  // crear-cuenta-financiera.ts) — la moneda es lo único que distingue "el
  // efectivo en dólares" de "el efectivo en guaraníes" cuando hay más de una.
  // Para BANCO/TARJETA/OTRO el nombre ya suele ser distintivo (banco, alias),
  // pero mostrar la moneda igual no estorba y evita ambigüedad si dos cuentas
  // comparten nombre en monedas distintas.
  const codigoMoneda = (monedaId: string) => monedas.find((m) => m.id === monedaId)?.codigo;

  return (
    <FormField htmlFor={id} label={label}>
      <Select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {cuentas.map((c) => {
          const codigo = codigoMoneda(c.monedaId);
          return (
            <option key={c.id} value={c.id}>
              {codigo ? `${c.nombre} (${codigo})` : c.nombre}
            </option>
          );
        })}
      </Select>
    </FormField>
  );
}
