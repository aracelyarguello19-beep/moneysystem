"use client";

import { useCallback, useEffect, useState } from "react";
import type { Compra, Item, Moneda } from "@repo/domain";
import { registrarCompra } from "@/actions/inventario/registrar-compra";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";

const FORMAS_PAGO: Compra["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"];

// AC2: solo ítems tipo Producto aparecen como opción — un Servicio nunca se
// ofrece en este formulario (defensa en profundidad; la Server Action lo
// rechaza igual si llegara).
// [Source: architecture/frontend-architecture.md#Component Organization]
export function CompraForm({ negocioId }: { negocioId: string }) {
  const [productos, setProductos] = useState<Item[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [compras, setCompras] = useState<Compra[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [itemId, setItemId] = useState("");
  const [costoUnitario, setCostoUnitario] = useState("");
  const [cantidad, setCantidad] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [proveedor, setProveedor] = useState("");
  const [formaPago, setFormaPago] = useState<Compra["formaPago"]>("EFECTIVO");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");
  const [monedaId, setMonedaId] = useState("");

  const cargar = useCallback(async () => {
    const [itemsResult, monedasResult] = await Promise.all([
      listarItems(negocioId),
      listarMonedas(negocioId),
    ]);
    if (itemsResult.ok) {
      const soloProductos = itemsResult.data.filter((i) => i.tipo === "PRODUCTO");
      setProductos(soloProductos);
      setItemId((actual) => actual || soloProductos[0]?.id || "");
    }
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await registrarCompra(negocioId, {
      itemId,
      costoUnitario,
      cantidad,
      fecha,
      proveedor: proveedor || undefined,
      formaPago,
      cuentaFinancieraId: formaPago === "CREDITO_PROVEEDOR" ? null : cuentaFinancieraId,
      monedaId,
    });

    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setCostoUnitario("");
    setCantidad("");
    setProveedor("");
    setCompras((prev) => [result.data, ...prev]);
    await cargar();
  }

  if (productos.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        No hay ítems tipo Producto en el catálogo de este negocio todavía. Creá uno en el catálogo
        antes de registrar una compra.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="item-compra" className="block text-sm">
            Producto
          </label>
          <select
            id="item-compra"
            value={itemId}
            onChange={(e) => setItemId(e.target.value)}
            className="rounded border px-2 py-2"
          >
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="costo-unitario" className="block text-sm">
            Costo unitario
          </label>
          <input
            id="costo-unitario"
            value={costoUnitario}
            onChange={(e) => setCostoUnitario(e.target.value)}
            required
            className="w-28 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="cantidad-compra" className="block text-sm">
            Cantidad
          </label>
          <input
            id="cantidad-compra"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
            className="w-24 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="fecha-compra" className="block text-sm">
            Fecha
          </label>
          <input
            id="fecha-compra"
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="proveedor-compra" className="block text-sm">
            Proveedor (opcional)
          </label>
          <input
            id="proveedor-compra"
            value={proveedor}
            onChange={(e) => setProveedor(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-compra" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-compra"
            value={monedaId}
            onChange={(e) => setMonedaId(e.target.value)}
            required
            className="rounded border px-2 py-2"
          >
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="forma-pago" className="block text-sm">
            Forma de pago
          </label>
          <select
            id="forma-pago"
            value={formaPago}
            onChange={(e) => setFormaPago(e.target.value as Compra["formaPago"])}
            className="rounded border px-2 py-2"
          >
            {FORMAS_PAGO.map((fp) => (
              <option key={fp} value={fp}>
                {fp}
              </option>
            ))}
          </select>
        </div>
        {formaPago !== "CREDITO_PROVEEDOR" && (
          <CuentaFinancieraSelect
            id="cuenta-financiera"
            negocioId={negocioId}
            esTarjeta={formaPago === "TARJETA"}
            value={cuentaFinancieraId}
            onChange={setCuentaFinancieraId}
            label="Cuenta financiera"
          />
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Registrar compra
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      {compras.length > 0 && (
        <ul className="flex flex-col gap-2">
          {compras.map((c) => (
            <li key={c.id} className="rounded border px-4 py-2 text-sm">
              {c.cantidad} × {c.costoUnitario} — {c.formaPago}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
