"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaPorCobrar } from "@repo/domain";
import { calcularTotalAdeudado } from "@repo/domain";
import { listarCuentasPorCobrar } from "@/actions/cuentas-por-cobrar/listar-cuentas-por-cobrar";
import { registrarPagoCxC } from "@/actions/cuentas-por-cobrar/registrar-pago-cxc";
import { editarCuentaPorCobrar } from "@/actions/cuentas-por-cobrar/editar-cuenta-por-cobrar";
import { eliminarCuentaPorCobrar } from "@/actions/cuentas-por-cobrar/eliminar-cuenta-por-cobrar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { formatearMonto } from "@/lib/moneda";

type CxCConFecha = CuentaPorCobrar & { fechaOrigen: Date };
type EdicionDraft = { cliente: string; montoOriginal: string };

const ESTADO_BADGE: Record<CxCConFecha["estado"], { label: string; variant: "success" | "warning" }> = {
  PAGADO: { label: "Pagado", variant: "success" },
  PENDIENTE: { label: "Pendiente", variant: "warning" },
  PARCIAL: { label: "Parcial", variant: "warning" },
};

// AC1/AC3/AC4: listado por cliente con monto adeudado, fecha de origen y
// estado, más el total agregado. AC2: registrar un pago (total o parcial).
// Editar (cliente/monto) y eliminar (solo si no tiene pagos, ver
// assertCuentaPorCobrarSinPagos) se agregaron después, a pedido — no forman
// parte de un AC numerado de una story existente.
export function CuentasPorCobrarLista({ negocioId }: { negocioId: string }) {
  const [cuentas, setCuentas] = useState<CxCConFecha[] | null>(null);
  const [pagos, setPagos] = useState<Record<string, { monto: string; cuentaFinancieraId: string }>>(
    {}
  );
  const [mensajes, setMensajes] = useState<Record<string, string>>({});
  const [edicion, setEdicion] = useState<Record<string, EdicionDraft | undefined>>({});
  const [guardandoEdicion, setGuardandoEdicion] = useState<string | null>(null);
  const [pagando, setPagando] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const result = await listarCuentasPorCobrar(negocioId);
    if (result.ok) setCuentas(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onPagar(cxcId: string) {
    // Guarda contra doble click/doble submit: sin esto, un segundo click
    // antes de que la lista se refresque manda el mismo monto dos veces — el
    // primero cobra bien, el segundo choca contra un saldo que ya quedó en
    // cero y tira "el pago excede el saldo pendiente" (confuso: el pago SÍ
    // se había registrado, solo que el segundo intento sobraba).
    if (pagando === cxcId) return;

    const pago = pagos[cxcId];
    if (!pago?.monto || !pago?.cuentaFinancieraId) return;

    setPagando(cxcId);
    const result = await registrarPagoCxC(negocioId, cxcId, {
      monto: pago.monto,
      cuentaFinancieraId: pago.cuentaFinancieraId,
    });
    setPagando(null);

    setMensajes((prev) => ({ ...prev, [cxcId]: result.ok ? "" : result.error.message }));
    if (result.ok) {
      setPagos((prev) => ({ ...prev, [cxcId]: { monto: "", cuentaFinancieraId: "" } }));
      await cargar();
    }
  }

  function onEmpezarEdicion(c: CxCConFecha) {
    setEdicion((prev) => ({ ...prev, [c.id]: { cliente: c.cliente, montoOriginal: c.montoOriginal } }));
    setMensajes((prev) => ({ ...prev, [c.id]: "" }));
  }

  function onCancelarEdicion(cxcId: string) {
    setEdicion((prev) => ({ ...prev, [cxcId]: undefined }));
  }

  async function onGuardarEdicion(cxcId: string) {
    const draft = edicion[cxcId];
    if (!draft) return;

    setGuardandoEdicion(cxcId);
    const result = await editarCuentaPorCobrar(cxcId, negocioId, draft);
    setGuardandoEdicion(null);

    if (!result.ok) {
      setMensajes((prev) => ({ ...prev, [cxcId]: result.error.message }));
      return;
    }
    setEdicion((prev) => ({ ...prev, [cxcId]: undefined }));
    await cargar();
  }

  async function onEliminar(c: CxCConFecha) {
    if (!window.confirm(`¿Eliminar la cuenta por cobrar de "${c.cliente}"? Esta acción no se puede deshacer.`)) {
      return;
    }
    const result = await eliminarCuentaPorCobrar(c.id, negocioId);
    if (!result.ok) {
      setMensajes((prev) => ({ ...prev, [c.id]: result.error.message }));
      return;
    }
    await cargar();
  }

  if (!cuentas) return null;

  if (cuentas.length === 0) {
    return <p className="text-sm text-muted">No hay cuentas por cobrar en este negocio.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <StatCard
        spotlight
        tone="primary"
        label="Total adeudado"
        value={formatearMonto(calcularTotalAdeudado(cuentas))}
        className="w-full sm:w-64"
      />
      <ul className="flex flex-col gap-3">
        {cuentas.map((c) => {
          const draft = edicion[c.id];

          if (draft) {
            return (
              <li key={c.id} className="rounded border border-default px-3 py-2 sm:px-4">
                <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
                  <FormField htmlFor={`cliente-${c.id}`} label="Deudor">
                    <Input
                      id={`cliente-${c.id}`}
                      value={draft.cliente}
                      onChange={(e) =>
                        setEdicion((prev) => ({
                          ...prev,
                          [c.id]: { ...draft, cliente: e.target.value },
                        }))
                      }
                    />
                  </FormField>
                  <FormField htmlFor={`monto-${c.id}`} label="Monto original">
                    <Input
                      id={`monto-${c.id}`}
                      value={draft.montoOriginal}
                      onChange={(e) =>
                        setEdicion((prev) => ({
                          ...prev,
                          [c.id]: { ...draft, montoOriginal: e.target.value },
                        }))
                      }
                      inputMode="decimal"
                    />
                  </FormField>
                  <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => onGuardarEdicion(c.id)}
                      disabled={guardandoEdicion === c.id}
                    >
                      Guardar
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => onCancelarEdicion(c.id)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
                {mensajes[c.id] && (
                  <p role="alert" className="mt-1 text-xs text-danger">
                    {mensajes[c.id]}
                  </p>
                )}
              </li>
            );
          }

          return (
            <li key={c.id} className="rounded border border-default px-3 py-2 sm:px-4">
              <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-2">
                <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="break-words font-medium">{c.cliente}</span>
                  <Badge variant={ESTADO_BADGE[c.estado].variant}>{ESTADO_BADGE[c.estado].label}</Badge>
                  <span className="text-muted">{c.fechaOrigen.toISOString().slice(0, 10)}</span>
                </p>
                <span className="flex flex-wrap items-center gap-3 sm:shrink-0">
                  <Button type="button" size="sm" variant="link" onClick={() => onEmpezarEdicion(c)}>
                    Editar
                  </Button>
                  <Button type="button" size="sm" variant="link" onClick={() => onEliminar(c)}>
                    Eliminar
                  </Button>
                </span>
              </div>
              <p className="text-xs text-muted">
                Debe {formatearMonto(c.montoOriginal)}, pagó {formatearMonto(c.montoPagado)}
              </p>
              {c.estado !== "PAGADO" && (
                // Cobro en grilla: el select de cuenta destino trae nombres
                // largos ("Efectivo (PYG)") que en flex-wrap desbordan.
                <div className="mt-2 grid grid-cols-1 items-end gap-3 sm:grid-cols-3">
                  <Input
                    aria-label={`Monto a cobrar de ${c.cliente}`}
                    value={pagos[c.id]?.monto ?? ""}
                    onChange={(e) =>
                      setPagos((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], monto: e.target.value, cuentaFinancieraId: prev[c.id]?.cuentaFinancieraId ?? "" },
                      }))
                    }
                    placeholder="Monto"
                    inputMode="decimal"
                  />
                  <CuentaFinancieraSelect
                    id={`cuenta-financiera-cobro-${c.id}`}
                    negocioId={negocioId}
                    tipo={["CAJA", "BANCO", "OTRO"]}
                    label="Cuenta destino"
                    value={pagos[c.id]?.cuentaFinancieraId ?? ""}
                    onChange={(id) =>
                      setPagos((prev) => ({
                        ...prev,
                        [c.id]: { ...prev[c.id], cuentaFinancieraId: id, monto: prev[c.id]?.monto ?? "" },
                      }))
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => onPagar(c.id)}
                    disabled={pagando === c.id}
                    className="w-full sm:w-auto"
                  >
                    Cobrar
                  </Button>
                </div>
              )}
              {mensajes[c.id] && (
                <p role="alert" className="mt-1 text-xs text-danger">
                  {mensajes[c.id]}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
