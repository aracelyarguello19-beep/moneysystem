"use client";

import { useCallback, useEffect, useState } from "react";
import type { VentaConItems } from "@repo/domain";
import { esCostoServicioIncompleto } from "@repo/domain";
import { listarVentas } from "@/actions/ventas/listar-ventas";
import { cancelarVenta } from "@/actions/ventas/cancelar-venta";

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
    return <p className="text-sm text-gray-500">Todavía no hay ventas registradas.</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {ventas.map((venta) => (
        <li key={venta.id} className="rounded border px-4 py-2">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">
              {venta.fecha.toString().slice(0, 10)} · {venta.formaCobro}
              {venta.cliente && ` · ${venta.cliente}`} · {venta.estado}
            </p>
            {venta.estado !== "CANCELADA" && (
              <button
                type="button"
                onClick={() => onCancelarTodo(venta.id)}
                className="text-sm text-red-600 underline"
              >
                Cancelar venta
              </button>
            )}
          </div>
          <ul className="mt-1 flex flex-col gap-1">
            {venta.items.map((item) => (
              <li key={item.id} className="flex items-center gap-2 text-sm">
                <span>{item.itemNombre}</span>
                <span className="text-gray-500">{item.precioUnitario}</span>
                {item.itemTipo === "PRODUCTO" && (
                  <span className="text-xs text-gray-400">
                    devuelto: {item.cantidadDevuelta}/{item.cantidad}
                  </span>
                )}
                {esCostoServicioIncompleto({
                  tipo: item.itemTipo,
                  costoServicio: item.costoServicio,
                }) && (
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                    dato incompleto
                  </span>
                )}
                {venta.estado !== "CANCELADA" && (
                  <span className="flex items-center gap-1">
                    <input
                      aria-label={`Cantidad a devolver de ${item.itemNombre}`}
                      value={devoluciones[item.id] ?? ""}
                      onChange={(e) =>
                        setDevoluciones((prev) => ({ ...prev, [item.id]: e.target.value }))
                      }
                      placeholder="cant."
                      className="w-16 rounded border px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => onDevolverLinea(venta.id, item.id)}
                      className="text-xs underline"
                    >
                      Devolver
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
          {mensajes[venta.id] && (
            <p role="alert" className="mt-1 text-xs text-red-600">
              {mensajes[venta.id]}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
