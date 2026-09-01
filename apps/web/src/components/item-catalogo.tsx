"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item, Moneda } from "@repo/domain";
import { crearItem } from "@/actions/inventario/crear-item";
import { editarItem } from "@/actions/inventario/editar-item";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";

// Formulario condicional: los campos de costo/stock solo se muestran para
// tipo Producto (AC1/AC2, Task 3). La validación de fondo la hace el schema
// Zod discriminado por `tipo` en la Server Action — acá solo se arma el
// payload correspondiente al tipo elegido.
// [Source: architecture/frontend-architecture.md#Component Organization]
export function ItemCatalogo({ negocioId }: { negocioId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);

  const [tipo, setTipo] = useState<"PRODUCTO" | "SERVICIO">("PRODUCTO");
  const [nombre, setNombre] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [costoCompra, setCostoCompra] = useState("");
  const [stockActual, setStockActual] = useState("");
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const input =
      tipo === "PRODUCTO"
        ? { tipo, nombre, precioVenta, monedaId, costoCompra, stockActual }
        : { tipo, nombre, precioVenta, monedaId };

    const result = await crearItem(negocioId, input);
    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setNombre("");
    setPrecioVenta("");
    setCostoCompra("");
    setStockActual("");
    await cargar();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        <div>
          <label htmlFor="tipo-item" className="block text-sm">
            Tipo
          </label>
          <select
            id="tipo-item"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as "PRODUCTO" | "SERVICIO")}
            className="rounded border px-2 py-2"
          >
            <option value="PRODUCTO">Producto</option>
            <option value="SERVICIO">Servicio</option>
          </select>
        </div>
        <div>
          <label htmlFor="nombre-item" className="block text-sm">
            Nombre
          </label>
          <input
            id="nombre-item"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            required
            className="rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="precio-venta" className="block text-sm">
            Precio de venta
          </label>
          <input
            id="precio-venta"
            value={precioVenta}
            onChange={(e) => setPrecioVenta(e.target.value)}
            required
            className="w-28 rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="moneda-item" className="block text-sm">
            Moneda
          </label>
          <select
            id="moneda-item"
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
        {tipo === "PRODUCTO" && (
          <>
            <div>
              <label htmlFor="costo-compra" className="block text-sm">
                Costo de compra
              </label>
              <input
                id="costo-compra"
                value={costoCompra}
                onChange={(e) => setCostoCompra(e.target.value)}
                required
                className="w-28 rounded border px-3 py-2"
              />
            </div>
            <div>
              <label htmlFor="stock-actual" className="block text-sm">
                Stock inicial
              </label>
              <input
                id="stock-actual"
                value={stockActual}
                onChange={(e) => setStockActual(e.target.value)}
                required
                className="w-24 rounded border px-3 py-2"
              />
            </div>
          </>
        )}
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-50"
        >
          Agregar ítem
        </button>
      </form>

      {serverMessage && (
        <p role="alert" className="text-sm text-red-600">
          {serverMessage}
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items?.map((item) =>
          editandoId === item.id ? (
            <ItemEditarForm
              key={item.id}
              item={item}
              negocioId={negocioId}
              onCancelar={() => setEditandoId(null)}
              onGuardado={() => {
                setEditandoId(null);
                cargar();
              }}
            />
          ) : (
            <li key={item.id} className="flex items-center justify-between rounded border px-4 py-2">
              <div>
                <p className="font-medium">
                  {item.nombre} <span className="text-xs text-gray-500">({item.tipo})</span>
                </p>
                <p className="text-xs text-gray-500">
                  Precio: {item.precioVenta}
                  {item.tipo === "PRODUCTO" && ` · Stock: ${item.stockActual}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditandoId(item.id)}
                className="text-sm underline"
              >
                Editar
              </button>
            </li>
          )
        )}
      </ul>
    </div>
  );
}

function ItemEditarForm({
  item,
  negocioId,
  onCancelar,
  onGuardado,
}: {
  item: Item;
  negocioId: string;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  const [nombre, setNombre] = useState(item.nombre);
  const [precioVenta, setPrecioVenta] = useState(item.precioVenta);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await editarItem(item.id, negocioId, { nombre, precioVenta });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onGuardado();
  }

  return (
    <li className="flex flex-col gap-2 rounded border px-4 py-2">
      <form onSubmit={onSubmit} className="flex items-end gap-2" noValidate>
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="rounded border px-3 py-2"
        />
        <input
          value={precioVenta}
          onChange={(e) => setPrecioVenta(e.target.value)}
          className="w-28 rounded border px-3 py-2"
        />
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded bg-emerald-600 px-3 py-2 text-sm text-white disabled:opacity-50"
        >
          Guardar
        </button>
        <button type="button" onClick={onCancelar} className="text-sm underline">
          Cancelar
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </li>
  );
}
