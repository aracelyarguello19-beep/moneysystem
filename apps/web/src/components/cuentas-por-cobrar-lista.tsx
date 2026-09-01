"use client";

import { useCallback, useEffect, useState } from "react";
import type { CuentaPorCobrar } from "@repo/domain";
import { calcularTotalAdeudado } from "@repo/domain";
import { listarCuentasPorCobrar } from "@/actions/cuentas-por-cobrar/listar-cuentas-por-cobrar";
import { registrarPagoCxC } from "@/actions/cuentas-por-cobrar/registrar-pago-cxc";

type CxCConFecha = CuentaPorCobrar & { fechaOrigen: Date };

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
    return <p className="text-sm text-gray-500">No hay cuentas por cobrar en este negocio.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="font-medium">Total adeudado: {calcularTotalAdeudado(cuentas)}</p>
      <ul className="flex flex-col gap-3">
        {cuentas.map((c) => (
          <li key={c.id} className="rounded border px-4 py-2">
            <p className="text-sm">
              <span className="font-medium">{c.cliente}</span> · {c.estado} ·{" "}
              {c.fechaOrigen.toString().slice(0, 10)}
            </p>
            <p className="text-xs text-gray-500">
              Debe {c.montoOriginal}, pagó {c.montoPagado}
            </p>
            {c.estado !== "PAGADO" && (
              <div className="mt-2 flex items-end gap-2">
                <input
                  aria-label={`Monto a pagar de ${c.cliente}`}
                  value={pagos[c.id]?.monto ?? ""}
                  onChange={(e) =>
                    setPagos((prev) => ({
                      ...prev,
                      [c.id]: { ...prev[c.id], monto: e.target.value, cuentaFinancieraId: prev[c.id]?.cuentaFinancieraId ?? "" },
                    }))
                  }
                  placeholder="Monto"
                  className="w-24 rounded border px-2 py-1 text-sm"
                />
                <input
                  aria-label={`Cuenta financiera para el pago de ${c.cliente}`}
                  value={pagos[c.id]?.cuentaFinancieraId ?? ""}
                  onChange={(e) =>
                    setPagos((prev) => ({
                      ...prev,
                      [c.id]: { ...prev[c.id], cuentaFinancieraId: e.target.value, monto: prev[c.id]?.monto ?? "" },
                    }))
                  }
                  placeholder="Cuenta financiera (id, pendiente Story 4.3)"
                  className="w-56 rounded border px-2 py-1 text-sm"
                />
                <button
                  type="button"
                  onClick={() => onPagar(c.id)}
                  className="rounded bg-emerald-600 px-3 py-1 text-sm text-white"
                >
                  Registrar pago
                </button>
              </div>
            )}
            {mensajes[c.id] && (
              <p role="alert" className="mt-1 text-xs text-red-600">
                {mensajes[c.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
