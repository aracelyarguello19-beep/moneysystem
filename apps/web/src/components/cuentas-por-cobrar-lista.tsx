"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaPorCobrar } from "@repo/domain";
import { calcularTotalAdeudado } from "@repo/domain";
import { listarCuentasPorCobrar } from "@/actions/cuentas-por-cobrar/listar-cuentas-por-cobrar";
import { registrarPagoCxC } from "@/actions/cuentas-por-cobrar/registrar-pago-cxc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/ui/stat-card";
import { formatearMonto } from "@/lib/moneda";

type CxCConFecha = CuentaPorCobrar & { fechaOrigen: Date };

const ESTADO_BADGE: Record<CxCConFecha["estado"], { label: string; variant: "success" | "warning" }> = {
  PAGADO: { label: "Pagado", variant: "success" },
  PENDIENTE: { label: "Pendiente", variant: "warning" },
  PARCIAL: { label: "Parcial", variant: "warning" },
};

// AC1/AC3/AC4: listado por cliente con monto adeudado, fecha de origen y
// estado, más el total agregado. AC2: registrar un pago (total o parcial).
export function CuentasPorCobrarLista({ negocioId }: { negocioId: string }) {
  const [cuentas, setCuentas] = useState<CxCConFecha[] | null>(null);
  const [pagos, setPagos] = useState<Record<string, { monto: string; cuentaFinancieraId: string }>>(
    {}
  );
  const [mensajes, setMensajes] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const result = await listarCuentasPorCobrar(negocioId);
    if (result.ok) setCuentas(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onPagar(cxcId: string) {
    const pago = pagos[cxcId];
    if (!pago?.monto || !pago?.cuentaFinancieraId) return;

    const result = await registrarPagoCxC(negocioId, cxcId, {
      monto: pago.monto,
      cuentaFinancieraId: pago.cuentaFinancieraId,
    });

    setMensajes((prev) => ({ ...prev, [cxcId]: result.ok ? "" : result.error.message }));
    if (result.ok) {
      setPagos((prev) => ({ ...prev, [cxcId]: { monto: "", cuentaFinancieraId: "" } }));
      await cargar();
    }
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
        {cuentas.map((c) => (
          <li key={c.id} className="rounded border border-default px-4 py-2">
            <p className="flex items-center gap-2 text-sm">
              <span className="font-medium">{c.cliente}</span>
              <Badge variant={ESTADO_BADGE[c.estado].variant}>{ESTADO_BADGE[c.estado].label}</Badge>
              <span className="text-muted">{c.fechaOrigen.toString().slice(0, 10)}</span>
            </p>
            <p className="text-xs text-muted">
              Debe {formatearMonto(c.montoOriginal)}, pagó {formatearMonto(c.montoPagado)}
            </p>
            {c.estado !== "PAGADO" && (
              <div className="mt-2 flex items-end gap-2">
                <Input
                  aria-label={`Monto a pagar de ${c.cliente}`}
                  value={pagos[c.id]?.monto ?? ""}
                  onChange={(e) =>
                    setPagos((prev) => ({
                      ...prev,
                      [c.id]: { ...prev[c.id], monto: e.target.value, cuentaFinancieraId: prev[c.id]?.cuentaFinancieraId ?? "" },
                    }))
                  }
                  placeholder="Monto"
                  className="w-24"
                />
                <Input
                  aria-label={`Cuenta financiera para el pago de ${c.cliente}`}
                  value={pagos[c.id]?.cuentaFinancieraId ?? ""}
                  onChange={(e) =>
                    setPagos((prev) => ({
                      ...prev,
                      [c.id]: { ...prev[c.id], cuentaFinancieraId: e.target.value, monto: prev[c.id]?.monto ?? "" },
                    }))
                  }
                  placeholder="Cuenta financiera (id, pendiente Story 4.3)"
                  className="w-56"
                />
                <Button type="button" size="sm" onClick={() => onPagar(c.id)}>
                  Registrar pago
                </Button>
              </div>
            )}
            {mensajes[c.id] && (
              <p role="alert" className="mt-1 text-xs text-danger">
                {mensajes[c.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
