"use client";

import { useState } from "react";
import type { Gasto, Moneda, TipoGasto } from "@repo/domain";
import { editarGasto } from "@/actions/gastos/editar-gasto";
import { eliminarGasto } from "@/actions/gastos/eliminar-gasto";
import type { GastoListado } from "@/actions/gastos/obtener-gastos-page-data";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { emitirGastoCambiado } from "@/lib/gasto-events";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatearMonto } from "@/lib/moneda";

const FORMAS_PAGO: Gasto["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA"];

// Lista de gastos registrados, con edición inline — componente hermano de
// `GastoForm` (sincronizado vía `gasto-events`, ver ese archivo). `gastos`,
// `tiposGasto` y `monedas` llegan por prop desde `GastosPanel` (una sola
// llamada consolidada) en vez de que este componente pida su propio listado.
export function GastosLista({
  negocioId,
  gastos,
  tiposGasto,
  monedas,
}: {
  negocioId: string;
  gastos: GastoListado[];
  tiposGasto: TipoGasto[];
  monedas: Moneda[];
}) {
  const monedasActivas = monedas.filter((m) => m.activa);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [eliminandoId, setEliminandoId] = useState<string | null>(null);
  const [mensajes, setMensajes] = useState<Record<string, string>>({});

  const codigoMoneda = (monedaId: string) => monedas.find((m) => m.id === monedaId)?.codigo;

  async function onEliminar(g: GastoListado) {
    if (
      !window.confirm(
        `¿Eliminar el gasto "${g.tipoGastoNombre}" de ${formatearMonto(g.monto, codigoMoneda(g.monedaId))}? Esto también revierte el movimiento de caja que generó. Esta acción no se puede deshacer.`
      )
    ) {
      return;
    }
    setEliminandoId(g.id);
    const result = await eliminarGasto(g.id, negocioId);
    setEliminandoId(null);
    if (!result.ok) {
      setMensajes((prev) => ({ ...prev, [g.id]: result.error.message }));
      return;
    }
    emitirGastoCambiado();
  }

  if (gastos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Gastos registrados</CardTitle>
        </CardHeader>
        <p className="text-sm text-muted">Todavía no hay gastos registrados.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gastos registrados</CardTitle>
      </CardHeader>
      <ul className="flex flex-col gap-2">
        {gastos.map((g) =>
          editandoId === g.id ? (
            <GastoEditarFila
              key={g.id}
              gasto={g}
              negocioId={negocioId}
              tiposGasto={tiposGasto}
              monedas={monedasActivas}
              onCancelar={() => setEditandoId(null)}
              onGuardado={() => {
                setEditandoId(null);
                emitirGastoCambiado();
              }}
            />
          ) : (
            <li key={g.id} className="rounded border border-default px-3 py-2 text-sm sm:px-4">
              {/* En mobile la fila se apila (descripción arriba, monto y
                  acciones abajo): en una sola línea el monto y los dos botones
                  no entran en 375px y empujaban scroll horizontal. */}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="min-w-0 break-words">
                  {g.tipoGastoNombre} · {g.fecha.toISOString().slice(0, 10)}{" "}
                  <span className="text-xs text-muted">({g.ambito === "PERSONAL" ? "Personal" : "Negocio"})</span>
                </span>
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted sm:shrink-0">
                  <span className="break-words">
                    {formatearMonto(g.monto, codigoMoneda(g.monedaId))} · {g.clasificacion}
                  </span>
                  <Button type="button" variant="link" onClick={() => setEditandoId(g.id)}>
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    onClick={() => onEliminar(g)}
                    disabled={eliminandoId === g.id}
                  >
                    Eliminar
                  </Button>
                </span>
              </div>
              {mensajes[g.id] && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {mensajes[g.id]}
                </p>
              )}
            </li>
          )
        )}
      </ul>
    </Card>
  );
}

// Edición completa: revierte el movimiento de saldo del gasto original y
// aplica uno nuevo con los valores actualizados (ver editar-gasto.ts) — por
// eso el formulario pide los mismos campos que registrar, no solo los
// "seguros" (fecha/proveedor).
function GastoEditarFila({
  gasto,
  negocioId,
  tiposGasto,
  monedas,
  onCancelar,
  onGuardado,
}: {
  gasto: GastoListado;
  negocioId: string;
  tiposGasto: TipoGasto[];
  monedas: Moneda[];
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const [ambito, setAmbito] = useState<Gasto["ambito"]>(gasto.ambito);
  const [tipoGastoId, setTipoGastoId] = useState(gasto.tipoGastoId);
  const [monto, setMonto] = useState(gasto.monto);
  const [monedaId, setMonedaId] = useState(gasto.monedaId);
  const [fecha, setFecha] = useState(gasto.fecha.toISOString().slice(0, 10));
  const [formaPago, setFormaPago] = useState<Gasto["formaPago"]>(gasto.formaPago);
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState(gasto.cuentaFinancieraId);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await editarGasto(gasto.id, negocioId, {
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
      setError(result.error.message);
      return;
    }
    onGuardado();
  }

  return (
    <li className="rounded border border-default bg-surface-container-low p-3">
      {/* Grid en vez de `flex flex-wrap`: los selects de tipo de gasto y cuenta
          financiera tienen texto largo y en flex-wrap se dimensionan por
          contenido, desbordando la fila en mobile. En grid la columna manda. */}
      <form onSubmit={onSubmit} className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3" noValidate>
        <FormField htmlFor={`ambito-${gasto.id}`} label="Ámbito">
          <Select
            id={`ambito-${gasto.id}`}
            value={ambito}
            onChange={(e) => setAmbito(e.target.value as Gasto["ambito"])}
          >
            <option value="NEGOCIO">Negocio</option>
            <option value="PERSONAL">Personal</option>
          </Select>
        </FormField>
        <FormField htmlFor={`tipo-gasto-${gasto.id}`} label="Tipo de gasto">
          <Select
            id={`tipo-gasto-${gasto.id}`}
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
        <FormField htmlFor={`monto-${gasto.id}`} label="Monto">
          <Input
            id={`monto-${gasto.id}`}
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            required
            inputMode="decimal"
          />
        </FormField>
        <FormField htmlFor={`moneda-${gasto.id}`} label="Moneda">
          <Select id={`moneda-${gasto.id}`} value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField htmlFor={`fecha-${gasto.id}`} label="Fecha">
          <Input
            id={`fecha-${gasto.id}`}
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
          />
        </FormField>
        <FormField htmlFor={`forma-pago-${gasto.id}`} label="Forma de pago">
          <Select
            id={`forma-pago-${gasto.id}`}
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
          id={`cuenta-financiera-${gasto.id}`}
          negocioId={negocioId}
          tipo={formaPago === "TARJETA" ? "TARJETA" : formaPago === "BANCO" ? "BANCO" : "CAJA"}
          value={cuentaFinancieraId}
          onChange={setCuentaFinancieraId}
          label="Cuenta financiera"
        />
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
          <Button type="submit" size="sm" disabled={isSubmitting}>
            Guardar
          </Button>
          <Button type="button" variant="link" onClick={onCancelar}>
            Cancelar
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-danger sm:col-span-2 lg:col-span-3">
            {error}
          </p>
        )}
      </form>
    </li>
  );
}
