"use client";

import { useState } from "react";
import type { Item, Moneda } from "@repo/domain";
import { calcularGananciaProducto } from "@repo/domain";
import { crearItem } from "@/actions/inventario/crear-item";
import { editarItem } from "@/actions/inventario/editar-item";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import dynamic from "next/dynamic";

// Carga diferida: `ImagenItemUpload` trae el cliente completo de
// `@supabase/supabase-js` (~110kB) solo para subir una foto — sin esto, ese
// peso viaja en el bundle inicial de /laboral/inventario aunque el usuario
// nunca abra "Agregar producto" ni edite un ítem.
const ImagenItemUpload = dynamic(
  () => import("@/components/imagen-item-upload").then((m) => m.ImagenItemUpload),
  { ssr: false }
);
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatearMonto } from "@/lib/moneda";

const UMBRAL_STOCK_BAJO = 5;

function estadoStock(stockActual: string): { label: string; variant: "success" | "warning" | "danger" } {
  const stock = Number(stockActual);
  if (stock <= 0) return { label: "Sin stock", variant: "danger" };
  if (stock <= UMBRAL_STOCK_BAJO) return { label: "Stock bajo", variant: "warning" };
  return { label: "En stock", variant: "success" };
}

function valorTotal(item: Pick<Item, "stockActual" | "costoCompra">): string {
  return (Number(item.stockActual) * Number(item.costoCompra ?? 0)).toString();
}

// Catálogo de Inventario — sesión "Productos" › Inventario: stock y
// valorización combinados por producto (cada compra registrada en la sesión
// "Compras" actualiza el stock y el costo promedio ponderado de acá, ver
// registrar-compra.ts). "Agregar producto" solo pide identidad de catálogo
// (nombre/proveedor/nro de calce/foto) — precio, costo y stock inicial
// arrancan en 0 a propósito: se cargan comprando, nunca acá, para no
// contarlos dos veces (mismo criterio que "+ Nuevo producto" en Compras).
// [Source: architecture/frontend-architecture.md#Component Organization]
// `items`/`monedas` vienen ya cargados de InventarioPage (una sola
// transacción para toda la página, ver obtener-inventario.ts) — este
// componente ya no pide sus propios datos, solo dispara `onCambio` después
// de crear/editar para que la página vuelva a pedirlos.
export function ItemCatalogo({
  negocioId,
  items,
  monedas: monedasTodas,
  onCambio,
}: {
  negocioId: string;
  items: Item[];
  monedas: Moneda[];
  onCambio: () => void;
}) {
  const monedas = monedasTodas.filter((m) => m.activa);
  const codigoMoneda = (monedaId: string) => monedasTodas.find((m) => m.id === monedaId)?.codigo;
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [creandoAbierto, setCreandoAbierto] = useState(false);
  const [filtro, setFiltro] = useState<"todos" | "bajo_stock">("todos");

  const [nombre, setNombre] = useState("");
  const [proveedor, setProveedor] = useState("");
  const [nroCalce, setNroCalce] = useState("");
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const monedaId = monedas.find((m) => m.esBase)?.id ?? monedas[0]?.id ?? "";
    const result = await crearItem(negocioId, {
      tipo: "PRODUCTO",
      nombre,
      precioVenta: "0",
      monedaId,
      // Arranca sin costo ni stock: los carga "Registrar compra" en la
      // sesión Compras, nunca el alta de catálogo.
      costoCompra: "0",
      stockActual: "0",
      imagenUrl: imagenUrl ?? undefined,
      proveedor: proveedor.trim() || undefined,
      nroCalce: nroCalce.trim() || undefined,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setNombre("");
    setProveedor("");
    setNroCalce("");
    setImagenUrl(null);
    setCreandoAbierto(false);
    onCambio();
  }

  const bajoStock = items.filter((item) => Number(item.stockActual) <= UMBRAL_STOCK_BAJO);

  const filtrados = (filtro === "bajo_stock" ? bajoStock : items).filter((item) =>
    item.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  return (
    <Card className="flex flex-col overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-outline-variant bg-surface-container-low/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setFiltro("todos")}
            className={`flex items-center gap-1 rounded px-3 py-1.5 text-label-md font-medium transition-colors ${
              filtro === "todos" ? "bg-on-surface text-on-primary" : "text-on-surface-variant hover:bg-surface-container"
            }`}
          >
            Todos
            <span className="rounded-full bg-surface-tint/30 px-1.5 text-[10px]">{items.length}</span>
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
        {/* El buscador y el botón se apilan hasta `sm`: juntos en una fila de
            375px el input queda por debajo de un ancho usable. */}
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
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
          <Button type="button" onClick={() => setCreandoAbierto((v) => !v)} className="shrink-0 gap-2">
            <Icon name="add" fill className="text-[18px]" />
            Agregar producto
          </Button>
        </div>
      </div>

      {creandoAbierto && (
        <form
          onSubmit={onSubmit}
          className="grid grid-cols-1 items-end gap-3 border-b border-outline-variant p-4 sm:grid-cols-2 lg:grid-cols-3"
          noValidate
        >
          <FormField htmlFor="nombre-item" label="Nombre">
            <Input id="nombre-item" value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </FormField>
          <FormField htmlFor="proveedor-item" label="Proveedor (opcional)">
            <Input id="proveedor-item" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
          </FormField>
          <FormField htmlFor="nro-calce-item" label="Nro de calce (opcional)">
            <Input id="nro-calce-item" value={nroCalce} onChange={(e) => setNroCalce(e.target.value)} />
          </FormField>
          <ImagenItemUpload value={imagenUrl} onChange={setImagenUrl} />
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={isSubmitting}>
              Guardar
            </Button>
            <Button type="button" variant="link" onClick={() => setCreandoAbierto(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {serverMessage && (
        <p role="alert" className="px-4 pt-4 text-sm text-danger">
          {serverMessage}
        </p>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead className="bg-surface-container">
            <tr>
              <th className="border-b border-outline-variant px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Producto
              </th>
              <th className="border-b border-outline-variant px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Nro de calce
              </th>
              <th className="w-32 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Precio
              </th>
              <th className="w-32 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Costo prom.
              </th>
              <th className="w-24 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Stock
              </th>
              <th className="w-36 border-b border-outline-variant px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">
                Valor total
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
                    onCambio();
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
                  <td className="px-4 py-3 text-body-md text-on-surface-variant">{item.nroCalce ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface">
                    {formatearMonto(item.precioVenta, codigoMoneda(item.monedaId))}
                  </td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface-variant">
                    {item.costoCompra ? formatearMonto(item.costoCompra, codigoMoneda(item.monedaId)) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface">{item.stockActual}</td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface-variant">
                    {formatearMonto(valorTotal(item), codigoMoneda(item.monedaId))}
                  </td>
                  <td className="px-4 py-3 text-right text-body-md font-medium text-success">
                    {item.costoCompra
                      ? `+${formatearMonto(calcularGananciaProducto(item.precioVenta, item.costoCompra).ganancia, codigoMoneda(item.monedaId))}`
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
                <td colSpan={10} className="px-4 py-8 text-center text-body-md text-on-surface-variant">
                  {items.length === 0
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
      <td colSpan={10} className="p-3">
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
