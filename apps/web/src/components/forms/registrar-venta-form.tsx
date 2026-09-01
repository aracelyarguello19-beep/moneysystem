"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item, Moneda, Venta } from "@repo/domain";
import { registrarVenta } from "@/actions/ventas/registrar-venta";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";

const FORMAS_COBRO: Venta["formaCobro"][] = ["EFECTIVO", "BANCO", "TARJETA", "CREDITO_CLIENTE"];

interface Linea {
  itemId: string;
  cantidad: string;
  precioUnitario: string;
  costoServicio: string;
}

// AC1: admite múltiples ítems mezclados producto/servicio del catálogo del
// negocio activo. AC2/Task 5: valida en cliente (mismo criterio que el
// schema Zod del servidor) que "cliente" es requerido cuando
// `formaCobro === 'CREDITO_CLIENTE'` — sin llamar al servidor si falta.
// [Source: architecture/testing-strategy.md#Test Examples]
export function RegistrarVentaForm({ negocioId }: { negocioId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([
    { itemId: "", cantidad: "", precioUnitario: "", costoServicio: "" },
  ]);
  const [cliente, setCliente] = useState("");
  const [formaCobro, setFormaCobro] = useState<Venta["formaCobro"]>("EFECTIVO");
  const [impuesto, setImpuesto] = useState("0");
  const [monedaId, setMonedaId] = useState("");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");
  const [clienteError, setClienteError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargar = useCallback(async () => {
    const [itemsResult, monedasResult] = await Promise.all([
      listarItems(negocioId),
      listarMonedas(negocioId),
    ]);
    if (itemsResult.ok) setItems(itemsResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  function actualizarLinea(index: number, cambios: Partial<Linea>) {
    setLineas((prev) => prev.map((l, i) => (i === index ? { ...l, ...cambios } : l)));
  }

  function agregarLinea() {
    setLineas((prev) => [
      ...prev,
      { itemId: "", cantidad: "", precioUnitario: "", costoServicio: "" },
    ]);
  }

  function quitarLinea(index: number) {
    setLineas((prev) => prev.filter((_, i) => i !== index));
  }

  function itemPorId(itemId: string): Item | undefined {
    return items.find((i) => i.id === itemId);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setClienteError(null);

    if (formaCobro === "CREDITO_CLIENTE" && !cliente.trim()) {
      setClienteError("El cliente es requerido cuando la forma de cobro es a crédito.");
      return;
    }

    setIsSubmitting(true);
    const result = await registrarVenta(negocioId, {
      cliente: cliente.trim() || undefined,
      formaCobro,
      impuesto,
      monedaId,
      cuentaFinancieraId: formaCobro === "CREDITO_CLIENTE" ? null : cuentaFinancieraId,
      items: lineas
        .filter((l) => l.itemId)
        .map((l) => ({
          itemId: l.itemId,
          cantidad: itemPorId(l.itemId)?.tipo === "SERVICIO" ? null : l.cantidad,
          precioUnitario: l.precioUnitario,
          costoServicio:
            itemPorId(l.itemId)?.tipo === "SERVICIO" ? l.costoServicio || null : null,
        })),
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setLineas([{ itemId: "", cantidad: "", precioUnitario: "", costoServicio: "" }]);
    setCliente("");
    setImpuesto("0");
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-2">
        {lineas.map((linea, index) => {
          const item = itemPorId(linea.itemId);
          return (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <select
                aria-label="Ítem"
                value={linea.itemId}
                onChange={(e) => {
                  const nuevoItem = itemPorId(e.target.value);
                  actualizarLinea(index, {
                    itemId: e.target.value,
                    precioUnitario: nuevoItem?.precioVenta ?? "",
                  });
                }}
                className="rounded border px-2 py-2"
              >
                <option value="">Elegí un ítem</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.nombre} ({i.tipo})
                  </option>
                ))}
              </select>
              {item?.tipo === "PRODUCTO" && (
                <input
                  aria-label="Cantidad"
                  value={linea.cantidad}
                  onChange={(e) => actualizarLinea(index, { cantidad: e.target.value })}
                  placeholder="Cantidad"
                  className="w-20 rounded border px-3 py-2"
                />
              )}
              <input
                aria-label="Precio unitario"
                value={linea.precioUnitario}
                onChange={(e) => actualizarLinea(index, { precioUnitario: e.target.value })}
                placeholder="Precio"
                className="w-24 rounded border px-3 py-2"
              />
              {item?.tipo === "SERVICIO" && (
                <input
                  aria-label="Costo del servicio"
                  value={linea.costoServicio}
                  onChange={(e) => actualizarLinea(index, { costoServicio: e.target.value })}
                  placeholder="Costo del servicio"
                  className="w-32 rounded border px-3 py-2"
                />
              )}
              {lineas.length > 1 && (
                <button type="button" onClick={() => quitarLinea(index)} className="text-sm underline">
                  Quitar
                </button>
              )}
            </div>
          );
        })}
        <button type="button" onClick={agregarLinea} className="self-start text-sm underline">
          + Agregar ítem
        </button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor="forma-cobro" className="block text-sm">
            Forma de cobro
          </label>
          <select
            id="forma-cobro"
            value={formaCobro}
            onChange={(e) => setFormaCobro(e.target.value as Venta["formaCobro"])}
            className="rounded border px-2 py-2"
          >
            {FORMAS_COBRO.map((fc) => (
              <option key={fc} value={fc}>
                {fc}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="cliente-venta" className="block text-sm">
            Cliente {formaCobro === "CREDITO_CLIENTE" && "(requerido)"}
          </label>
          <input
            id="cliente-venta"
            value={cliente}
            onChange={(e) => setCliente(e.target.value)}
            className="rounded border px-3 py-2"
          />
          {clienteError && (
            <p role="alert" className="text-sm text-red-600">
              {clienteError}
            </p>
          )}
        </div>
        <div>
          <label htmlFor="impuesto-venta" className="block text-sm">
            Impuesto
          </label>
          <input
            id="impuesto-venta"
            value={impuesto}
            onChange={(e) => setImpuesto(e.target.value)}
            className="w-24 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-venta" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-venta"
            value={monedaId}
            onChange={(e) => setMonedaId(e.target.value)}
            className="rounded border px-2 py-2"
          >
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </select>
        </div>
        {formaCobro !== "CREDITO_CLIENTE" && (
          // "TARJETA" acá significa que el cliente pagó con tarjeta (la
          // plata entra al negocio) — nunca la tarjeta de crédito propia,
          // por eso siempre ofrece cuentas de caja/banco (esTarjeta=false).
          <CuentaFinancieraSelect
            id="cuenta-financiera-venta"
            negocioId={negocioId}
            esTarjeta={false}
            value={cuentaFinancieraId}
            onChange={setCuentaFinancieraId}
            label="Cuenta financiera"
          />
        )}
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="self-start rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
      >
        Registrar venta
      </button>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}
    </form>
  );
}
