"use client";

import { useCallback, useEffect, useState } from "react";
import Decimal from "decimal.js";
import type { VentaConItems } from "@repo/domain";
import { calcularTotalVenta, esCostoServicioIncompleto } from "@repo/domain";
import { listarVentas } from "@/actions/ventas/listar-ventas";
import { cancelarVenta } from "@/actions/ventas/cancelar-venta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { formatearMonto } from "@/lib/moneda";

// AC3 (Story 3.2): marca visualmente las líneas de Servicio sin
// `costoServicio` registrado como "dato incompleto" — nunca las rechaza, el
// costo cero es un valor válido (tratado explícitamente, no un error).
// AC1 (Story 3.3): permite cancelar la venta completa o devolver una línea
// puntual con una cantidad específica.
export function VentasLista({ negocioId }: { negocioId: string }) {
  const [ventas, setVentas] = useState<VentaConItems[] | null>(null);
  const [devoluciones, setDevoluciones] = useState<Record<string, string>>({});
  const [mensajes, setMensajes] = useState<Record<string, string>>({});

  const cargar = useCallback(async () => {
    const result = await listarVentas(negocioId);
    if (result.ok) setVentas(result.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onCancelarTodo(ventaId: string) {
    const result = await cancelarVenta(negocioId, ventaId, {});
    setMensajes((prev) => ({
      ...prev,
      [ventaId]: result.ok ? "" : result.error.message,
    }));
    if (result.ok) await cargar();
  }

  async function onDevolverLinea(ventaId: string, ventaItemId: string) {
    const cantidad = devoluciones[ventaItemId];
    if (!cantidad) return;
    const result = await cancelarVenta(negocioId, ventaId, {
      itemsDevueltos: [{ ventaItemId, cantidad }],
    });
    setMensajes((prev) => ({
      ...prev,
      [ventaId]: result.ok ? "" : result.error.message,
    }));
    if (result.ok) {
      setDevoluciones((prev) => ({ ...prev, [ventaItemId]: "" }));
      await cargar();
    }
  }

  if (!ventas || ventas.length === 0) {
    return <p className="text-sm text-muted">Todavía no hay ventas registradas.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {ventas.map((venta) => (
        <Card key={venta.id}>
          {/* Cabecera de la venta apilada en mobile: fecha + forma de cobro +
              cliente + badge no entran en una línea junto al total a 375px. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              {venta.fecha.toISOString().slice(0, 10)} · {venta.formaCobro}
              {venta.cliente && ` · ${venta.cliente}`}
              <Badge
                variant={
                  venta.estado === "CANCELADA"
                    ? "danger"
                    : venta.estado === "DEVUELTA_PARCIAL"
                      ? "warning"
                      : "success"
                }
              >
                {venta.estado}
              </Badge>
              {/* `estado` de arriba es solo devoluciones (ACTIVA/CANCELADA/
                  DEVUELTA_PARCIAL) — nunca dice si el cliente ya pagó. Sin
                  este badge, una venta a crédito con un pago parcial se veía
                  igual que una recién vendida y sin cobrar nada todavía.
                  Se oculta si la venta está CANCELADA: ahí `cxc.estado`
                  vuelve "PAGADO" en cuanto la devolución deja `montoOriginal`
                  en 0 (calcularEstadoCxC), aunque nunca se haya cobrado un
                  guaraní — mostrar "Cobrado" junto a "CANCELADA" es
                  contradictorio, y una vez cancelada la venta no queda
                  ninguna deuda que informar. */}
              {venta.formaCobro === "CREDITO_CLIENTE" && venta.cxc && venta.estado !== "CANCELADA" && (
                <Badge
                  variant={
                    venta.cxc.estado === "PAGADO"
                      ? "success"
                      : venta.cxc.estado === "PARCIAL"
                        ? "warning"
                        : "danger"
                  }
                >
                  {venta.cxc.estado === "PAGADO"
                    ? "Cobrado"
                    : venta.cxc.estado === "PARCIAL"
                      ? "Cobro parcial"
                      : "Sin cobrar"}
                </Badge>
              )}
            </p>
            <div className="flex flex-wrap items-center gap-3 sm:shrink-0">
              <span className="text-sm font-semibold text-success">
                +
                {formatearMonto(
                  calcularTotalVenta(
                    venta.items.map((item) => ({
                      precioUnitario: item.precioUnitario,
                      cantidad: item.cantidad,
                    }))
                  )
                )}
              </span>
              {venta.estado !== "CANCELADA" && (
                <Button type="button" variant="link" className="text-danger" onClick={() => onCancelarTodo(venta.id)}>
                  Cancelar venta
                </Button>
              )}
            </div>
          </div>
          {venta.formaCobro === "CREDITO_CLIENTE" && venta.cxc && venta.cxc.estado !== "PAGADO" && (
            <p className="text-xs text-muted">
              Debe {formatearMonto(venta.cxc.montoOriginal)}, pagó {formatearMonto(venta.cxc.montoPagado)} — saldo{" "}
              {formatearMonto(
                new Decimal(venta.cxc.montoOriginal).minus(venta.cxc.montoPagado).toString()
              )}
            </p>
          )}
          <ul className="mt-1 flex flex-col gap-1">
            {venta.items.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                <span className="break-words">{item.itemNombre}</span>
                <span className="text-muted">{formatearMonto(item.precioUnitario)}</span>
                {item.itemTipo === "PRODUCTO" && (
                  <span className="text-xs text-subtle">
                    devuelto: {item.cantidadDevuelta}/{item.cantidad}
                  </span>
                )}
                {esCostoServicioIncompleto({
                  tipo: item.itemTipo,
                  costoServicio: item.costoServicio,
                }) && <Badge variant="warning">dato incompleto</Badge>}
                {venta.estado !== "CANCELADA" && (
                  <span className="flex items-center gap-1">
                    <Input
                      aria-label={`Cantidad a devolver de ${item.itemNombre}`}
                      value={devoluciones[item.id] ?? ""}
                      onChange={(e) =>
                        setDevoluciones((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="cant."
                      className="w-16 text-xs"
                    />
                    <Button
                      type="button"
                      variant="link"
                      className="text-xs"
                      onClick={() => onDevolverLinea(venta.id, item.id)}
                    >
                      Devolver
                    </Button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {mensajes[venta.id] && (
            <p role="alert" className="mt-1 text-xs text-danger">
              {mensajes[venta.id]}
            </p>
          )}
        </Card>
      ))}
    </div>
  );
}
