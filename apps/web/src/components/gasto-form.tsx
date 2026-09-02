"use client";

import { useCallback, useEffect, useState } from "react";
import type { Gasto, Moneda, TipoGasto } from "@repo/domain";
import { registrarGasto } from "@/actions/gastos/registrar-gasto";
import { listarGastos } from "@/actions/gastos/listar-gastos";
import { listarTiposGasto } from "@/actions/catalogos/listar-tipos-gasto";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { emitirInventarioCambiado } from "@/lib/inventario-events";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

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

  const [ambito, setAmbito] = useState<Gasto["ambito"]>("NEGOCIO");
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
    await cargar();
    emitirInventarioCambiado();
  }

  if (tiposGasto.length === 0) {
    return (
      <p className="text-sm text-muted">
        No hay tipos de gasto en el catálogo de este negocio todavía. Creá uno en la
        configuración antes de registrar un gasto.
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
            {monedas.map((m) => (
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
          esTarjeta={formaPago === "TARJETA"}
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

      <ul className="flex flex-col gap-2">
        {gastos.map((g) => (
          <li key={g.id} className="flex items-center justify-between rounded border border-default px-4 py-2 text-sm">
            <span>
              {g.tipoGastoNombre} · {g.fecha.toString().slice(0, 10)}{" "}
              <span className="text-xs text-muted">({g.ambito === "PERSONAL" ? "Personal" : "Negocio"})</span>
            </span>
            <span className="text-muted">
              {g.monto} · {g.clasificacion}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
