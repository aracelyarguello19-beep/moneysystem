"use client";

import { useCallback, useEffect, useState } from "react";
import type { Item, Moneda } from "@repo/domain";
import { calcularGananciaProducto } from "@repo/domain";
import { crearItem } from "@/actions/inventario/crear-item";
import { editarItem } from "@/actions/inventario/editar-item";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import dynamic from "next/dynamic";

// Carga diferida: `ImagenItemUpload` trae el cliente completo de
// `@supabase/supabase-js` (~110kB) solo para subir una foto — sin esto, ese
// peso viaja en el bundle inicial de /laboral/inventario aunque el usuario
// nunca abra "Nuevo producto" ni edite un ítem.
const ImagenItemUpload = dynamic(
  () => import("@/components/imagen-item-upload").then((m) => m.ImagenItemUpload),
  { ssr: false }
);
import { emitirInventarioCambiado, useInventarioCambiado } from "@/lib/inventario-events";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";

const UMBRAL_STOCK_BAJO = 5;

function estadoStock(stockActual: string): { label: string; variant: "success" | "warning" | "danger" } {
  const stock = Number(stockActual);
  if (stock <= 0) return { label: "Sin stock", variant: "danger" };
  if (stock <= UMBRAL_STOCK_BAJO) return { label: "Stock bajo", variant: "warning" };
  return { label: "En stock", variant: "success" };
}

// Catálogo de productos — mismo patrón de tabla que "Control de Inventario
// y Stock" (Stitch): toolbar con búsqueda + tabla con foto, precio, costo,
// stock y estado. Único consumidor: /laboral/inventario (Servicios ya no
// existe como sesión), por eso queda enfocado en tipo Producto.
// [Source: architecture/frontend-architecture.md#Component Organization]
export function ItemCatalogo({ negocioId }: { negocioId: string }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [creandoAbierto, setCreandoAbierto] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "bajo_stock">("todos");

  const [nombre, setNombre] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [monedaId, setMonedaId] = useState("");
  const [costoCompra, setCostoCompra] = useState("");
  const [stockActual, setStockActual] = useState("");
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const cargar = useCallback(async () => {
    const [itemsResult, monedasResult] = await Promise.all([
      listarItems(negocioId),
      listarMonedas(negocioId),
    ]);
    if (itemsResult.ok) setItems(itemsResult.data.filter((i) => i.tipo === "PRODUCTO"));
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioCambiado(cargar);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const result = await crearItem(negocioId, {
      tipo: "PRODUCTO",
      nombre,
      precioVenta,
      monedaId,
      costoCompra,
      stockActual,
      imagenUrl: imagenUrl ?? undefined,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setNombre("");
    setPrecioVenta("");
    setCostoCompra("");
    setStockActual("");
    setImagenUrl(null);
    setCreandoAbierto(false);
    await cargar();
    emitirInventarioCambiado();
  }

  const bajoStock = (items ?? []).filter((item) => Number(item.stockActual) <= UMBRAL_STOCK_BAJO);

  const filtrados = (filtro === "bajo_stock" ? bajoStock : items ?? []).filter((item) =>
    item.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-low/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={`flex items-center gap-1 rounded px-3 py-1.5 text-label-md font-medium transition-colors ${
              filtro === "todos" ? "bg-on-surface text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            Todos
            <span className="rounded-full bg-surface-tint/30 px-1.5 text-[10px]">{(items ?? []).length}</span>
          </button>
          <button
            type="button"
            onClick={() => setFiltro("bajo_stock")}
            className={`flex items-center gap-1 rounded px-3 py-1.5 text-label-md font-medium transition-colors ${
              filtro === "bajo_stock" ? "bg-on-surface text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            Bajo stock
            <span className="rounded-full bg-error-container px-1.5 text-[10px] text-on-error-container">
              {bajoStock.length}
            </span>
          </button>
        </div>
        <div className="flex w-full items-center gap-3 sm:w-auto">
          <div className="relative w-full sm:w-64">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
            />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por nombre..."
              className="pl-10"
              aria-label="Buscar producto"
            />
          </div>
          <Button type="button" onClick={() => setCreandoAbierto((v) => !v)} className="gap-2">
            <Icon name="add" fill className="text-[18px]" />
            Nuevo producto
          </Button>
        </div>
      </div>

      {creandoAbierto && (
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2 border-b border-outline-variant p-4" noValidate>
          <FormField htmlFor="nombre-item" label="Nombre">
            <Input id="nombre-item" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </FormField>
          <FormField htmlFor="precio-venta" label="Precio de venta">
            <Input
              id="precio-venta"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              required
              className="w-28"
            />
          </FormField>
          <FormField htmlFor="moneda-item" label="Moneda">
            <Select id="moneda-item" value={monedaId} onChange={(e) => setMonedaId(e.target.value)} required>
              {monedas.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.codigo}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField htmlFor="costo-compra" label="Costo de compra">
            <Input
              id="costo-compra"
              value={costoCompra}
              onChange={(e) => setCostoCompra(e.target.value)}
              required
              className="w-28"
            />
          </FormField>
          <FormField htmlFor="stock-actual" label="Stock inicial">
            <Input
              id="stock-actual"
              value={stockActual}
              onChange={(e) => setStockActual(e.target.value)}
              required
              className="w-24"
            />
          </FormField>
          <ImagenItemUpload value={imagenUrl} onChange={setImagenUrl} />
          <Button type="submit" disabled={isSubmitting}>
            Guardar
          </Button>
          <Button type="button" variant="link" onClick={() => setCreandoAbierto(false)}>
            Cancelar
          </Button>
        </form>
      )}

      {serverMessage && (
        <p role="alert" className="px-4 pt-4 text-sm text-danger">
          {serverMessage}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-left">
          <thead className="bg-surface-container">
            <tr>
              <th className="border-b border-outline-variant px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Producto
              </th>
              <th className="w-32 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Precio
              </th>
              <th className="w-32 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Costo
              </th>
              <th className="w-24 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Stock
              </th>
              <th className="w-32 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Ganancia
              </th>
              <th className="w-24 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                % Margen
              </th>
              <th className="w-36 border-b border-outline-variant px-4 py-3 text-center text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Estado
              </th>
              <th className="w-20 border-b border-outline-variant px-4 py-3 text-center text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {filtrados.map((item) =>
              editandoId === item.id ? (
                <ItemEditarFila
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
                <tr key={item.id} className="group transition-colors hover:bg-surface-container-low">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {item.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL pública externa de Supabase Storage
                        <img src={item.imagenUrl} alt="" className="h-10 w-10 rounded object-cover" />
                      ) : (
                        <div className="flex h-10 w-10 items-center justify-center rounded bg-surface-container-high text-on-surface-variant">
                          <Icon name="inventory_2" className="text-[18px]" />
                        </div>
                      )}
                      <span className="font-medium text-on-surface">{item.nombre}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface">{item.precioVenta}</td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface-variant">{item.costoCompra}</td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface">{item.stockActual}</td>
                  <td className="px-4 py-3 text-right text-body-md font-medium text-success">
                    {item.costoCompra
                      ? `+${calcularGananciaProducto(item.precioVenta, item.costoCompra).ganancia}`
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {item.costoCompra ? (
                      <span className="inline-flex w-16 items-center justify-end rounded bg-surface-container px-1.5 py-0.5 text-body-md text-on-surface">
                        {Number(calcularGananciaProducto(item.precioVenta, item.costoCompra).margen).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-body-md text-on-surface-variant">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Badge variant={estadoStock(item.stockActual).variant}>
                      {estadoStock(item.stockActual).label}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditandoId(item.id)}
                      className="opacity-0 group-hover:opacity-100"
                    >
                      <Icon name="edit" className="text-[18px]" />
                    </Button>
                  </td>
                </tr>
              )
            )}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-body-md text-on-surface-variant">
                  {items?.length === 0
                    ? "Todavía no tenés productos en el catálogo."
                    : "Ningún producto coincide con la búsqueda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ItemEditarFila({
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
  const [imagenUrl, setImagenUrl] = useState<string | null>(item.imagenUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await editarItem(item.id, negocioId, { nombre, precioVenta, imagenUrl });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onGuardado();
  }

  return (
    <tr className="bg-surface-container-low">
      <td colSpan={8} className="p-3">
        <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          <Input value={precioVenta} onChange={(e) => setPrecioVenta(e.target.value)} className="w-28" />
          <ImagenItemUpload value={imagenUrl} onChange={setImagenUrl} />
          <Button type="submit" size="sm" disabled={isSubmitting}>
            Guardar
          </Button>
          <Button type="button" variant="link" onClick={onCancelar}>
            Cancelar
          </Button>
          {error && (
            <p role="alert" className="w-full text-sm text-danger">
              {error}
            </p>
          )}
        </form>
      </td>
    </tr>
  );
}
