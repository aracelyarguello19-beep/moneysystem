"use client";

import { useEffect, useState } from "react";
import Decimal from "decimal.js";
import type { CuentaFinanciera, Moneda } from "@repo/domain";
import { listarCuentasFinancieras } from "@/actions/cuentas-financieras/listar-cuentas-financieras";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useInventarioCambiado } from "@/lib/inventario-events";
import { formatearMonto } from "@/lib/moneda";

// Bento de saldo total por moneda (Efectivo + Banco, nunca Tarjeta — es
// deuda, no liquidez) — mismo patrón que "Resumen de Saldos" de Stitch
// (tarjetas PYG/USD/BRL).
export function CajaResumenMonedas({ negocioId }: { negocioId: string }) {
  const [cuentas, setCuentas] = useState<CuentaFinanciera[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);

  async function cargar() {
    const [cuentasResult, monedasResult] = await Promise.all([
      listarCuentasFinancieras(negocioId),
      listarMonedas(negocioId),
    ]);
    if (cuentasResult.ok) setCuentas(cuentasResult.data);
    if (monedasResult.ok) setMonedas(monedasResult.data);
  }

  useEffect(() => {
    cargar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocioId]);

  useInventarioCambiado(cargar);

  const liquidas = cuentas.filter((c) => c.tipo === "CAJA" || c.tipo === "BANCO");
  const totales = new Map<string, Decimal>();
  for (const c of liquidas) {
    totales.set(c.monedaId, (totales.get(c.monedaId) ?? new Decimal(0)).plus(c.saldoActual));
  }

  if (totales.size === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {Array.from(totales.entries()).map(([monedaId, total]) => {
        const moneda = monedas.find((m) => m.id === monedaId);
        const cantidadCuentas = liquidas.filter((c) => c.monedaId === monedaId).length;
        return (
          <Card key={monedaId} className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="text-label-lg font-semibold">{moneda?.nombre ?? moneda?.codigo}</span>
              <Icon name="account_balance_wallet" className="text-secondary" />
            </div>
            <div
              className={`mt-2 text-right text-headline-lg font-bold ${
                total.isNegative() ? "text-error" : "text-success"
              }`}
            >
              {formatearMonto(total.toString(), moneda?.codigo)}
            </div>
            <div className="mt-2 text-right text-label-md text-on-surface-variant">
              {cantidadCuentas} cuenta{cantidadCuentas === 1 ? "" : "s"}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
