"use client";

import { useEffect, useState } from "react";
import type { Gasto, Moneda, TipoGasto } from "@repo/domain";
import { registrarGasto } from "@/actions/gastos/registrar-gasto";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { emitirGastoCambiado } from "@/lib/gasto-events";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

const FORMAS_PAGO: Gasto["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA"];

// Solo el formulario de alta — la lista vive en `GastosLista` (componente
// hermano), y "Tipos de gasto" en su propio popup (`TipoGastoCatalogo`).
// `tiposGasto`/`monedas` llegan por prop desde `GastosPanel` (una sola
// llamada consolidada para toda la página) en vez de que este componente
// pida su propio catálogo.
export function GastoForm({
  negocioId,
  tiposGasto,
  monedas,
}: {
  negocioId: string;
  tiposGasto: TipoGasto[];
  monedas: Moneda[];
}) {
  const monedasActivas = monedas.filter((m) => m.activa);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [ambito, setAmbito] = useState<Gasto["ambito"]>("NEGOCIO");
  const [tipoGastoId, setTipoGastoId] = useState(() => tiposGasto[0]?.id ?? "");
  const [monto, setMonto] = useState("");
  const [monedaId, setMonedaId] = useState(() => monedasActivas.find((m) => m.esBase)?.id ?? "");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [formaPago, setFormaPago] = useState<Gasto["formaPago"]>("EFECTIVO");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");

  // Si el catálogo cambia (ej. se crea un tipo de gasto nuevo mientras el
  // formulario estaba vacío, o el tipo/moneda seleccionado deja de existir),
  // recalcula el default en vez de dejar una selección inválida.
  useEffect(() => {
    setTipoGastoId((actual) => (actual && tiposGasto.some((t) => t.id === actual) ? actual : tiposGasto[0]?.id ?? ""));
  }, [tiposGasto]);

  useEffect(() => {
    setMonedaId((actual) =>
      actual && monedasActivas.some((m) => m.id === actual)
        ? actual
        : monedasActivas.find((m) => m.esBase)?.id ?? monedasActivas[0]?.id ?? ""
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monedas]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await registrarGasto(negocioId, {
      ambito,
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
    emitirGastoCambiado();
  }

  if (tiposGasto.length === 0) {
    return (
      <p className="text-sm text-muted">
        No hay tipos de gasto en el catálogo de este negocio todavía. Creá uno con el botón
        &quot;Tipos de gasto&quot; antes de registrar un gasto.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <FormField htmlFor="ambito-gasto" label="Ámbito">
          <Select
            id="ambito-gasto"
            value={ambito}
            onChange={(e) => setAmbito(e.target.value as Gasto["ambito"])}
          >
            <option value="NEGOCIO">Negocio</option>
            <option value="PERSONAL">Personal</option>
          </Select>
        </FormField>
        <FormField htmlFor="tipo-gasto-gasto" label="Tipo de gasto">
          <Select
            id="tipo-gasto-gasto"
            value={tipoGastoId}
            onChange={(e) => setTipoGastoId(e.target.value)}
          >
            {tiposGasto.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} ({t.clasificacion})
              </option>
            ))}
          </Select>
        </FormField>
        <FormField htmlFor="monto-gasto" label="Monto">
          <Input
            id="monto-gasto"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            className="w-28"
          />
        </FormField>
        <FormField htmlFor="moneda-gasto" label="Moneda">
          <Select
            id="moneda-gasto"
            value={monedaId}
            onChange={(e) => setMonedaId(e.target.value)}
          >
            {monedasActivas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField htmlFor="fecha-gasto" label="Fecha">
          <Input
            id="fecha-gasto"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </FormField>
        <FormField htmlFor="forma-pago-gasto" label="Forma de pago">
          <Select
            id="forma-pago-gasto"
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value as Gasto["formaPago"])}
          >
            {FORMAS_PAGO.map((fp) => (
              <option key={fp} value={fp}>
                {fp}
              </option>
            ))}
          </Select>
        </FormField>
        <CuentaFinancieraSelect
          id="cuenta-financiera-gasto"
          negocioId={negocioId}
          tipo={formaPago === "TARJETA" ? "TARJETA" : formaPago === "BANCO" ? "BANCO" : "CAJA"}
          value={cuentaFinancieraId}
          onChange={setCuentaFinancieraId}
          label="Cuenta financiera"
        />
        <Button type="submit" disabled={isSubmitting}>
          Registrar gasto
        </Button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}
    </div>
  );
}
