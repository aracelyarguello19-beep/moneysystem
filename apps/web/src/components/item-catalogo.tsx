"use client";

import { useState } from "react";
import type { Item, Moneda } from "@repo/domain";
import { calcularGananciaProducto } from "@repo/domain";
import { crearItem } from "@/actions/inventario/crear-item";
import { editarItem } from "@/actions/inventario/editar-item";
import { eliminarItem } from "@/actions/inventario/eliminar-item";
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

interface VarianteForm {
  nroCalce: string;
  stockActual: string;
}

function nuevaVarianteVacia(): VarianteForm {
  return { nroCalce: "", stockActual: "" };
}

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
// "Compras" también actualiza el stock y el costo promedio ponderado de acá,
// ver registrar-compra.ts). "Agregar producto" pide costo/precio/stock
// inicial directo acá — cada variante (nro de calce) declarada genera su
// propio Item con el mismo nombre/proveedor/costo/precio pero su stock
// propio (ver comentario en Item, packages/domain/src/item.ts). Si después
// se registra una compra sobre alguno de estos ítems, el costo se recalcula
// como promedio ponderado contra el costo cargado acá — no se "cuenta dos
// veces", se combina.
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
  const [costoCompra, setCostoCompra] = useState("");
  const [precioVenta, setPrecioVenta] = useState("");
  const [variantes, setVariantes] = useState<VarianteForm[]>([nuevaVarianteVacia()]);
  const [imagenUrl, setImagenUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function actualizarVariante(index: number, campo: keyof VarianteForm, valor: string) {
    setVariantes((actuales) => actuales.map((v, i) => (i === index ? { ...v, [campo]: valor } : v)));
  }

  function agregarVariante() {
    setVariantes((actuales) => [...actuales, nuevaVarianteVacia()]);
  }

  function quitarVariante(index: number) {
    setVariantes((actuales) => (actuales.length > 1 ? actuales.filter((_, i) => i !== index) : actuales));
  }

  // Cada fila de `variantes` (nro de calce + stock propio) crea un Item
  // aparte con el mismo nombre/proveedor/costo/precio — un producto sin
  // variantes declaradas es, en los datos, un único Item con `nroCalce: null`
  // (fila 0 sin calce cargado).
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setIsSubmitting(true);

    const monedaId = monedas.find((m) => m.esBase)?.id ?? monedas[0]?.id ?? "";
    for (const variante of variantes) {
      const result = await crearItem(negocioId, {
        tipo: "PRODUCTO",
        nombre,
        precioVenta: precioVenta || "0",
        monedaId,
        costoCompra: costoCompra || "0",
        stockActual: variante.stockActual || "0",
        imagenUrl: imagenUrl ?? undefined,
        proveedor: proveedor.trim() || undefined,
        nroCalce: variante.nroCalce.trim() || undefined,
      });
      if (!result.ok) {
        setServerMessage(result.error.message);
        setIsSubmitting(false);
        return;
      }
    }
    setIsSubmitting(false);
    setNombre("");
    setProveedor("");
    setCostoCompra("");
    setPrecioVenta("");
    setVariantes([nuevaVarianteVacia()]);
    setImagenUrl(null);
    setCreandoAbierto(false);
    onCambio();
  }

  async function onEliminar(item: Item) {
    if (!window.confirm(`¿Eliminar "${item.nombre}"? Esta acción no se puede deshacer.`)) return;
    const result = await eliminarItem(item.id, negocioId);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
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
          <FormField htmlFor="costo-item" label="Costo del producto">
            <Input
              id="costo-item"
              value={costoCompra}
              onChange={(e) => setCostoCompra(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </FormField>
          <FormField htmlFor="precio-item" label="Precio de venta">
            <Input
              id="precio-item"
              value={precioVenta}
              onChange={(e) => setPrecioVenta(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </FormField>
          <ImagenItemUpload value={imagenUrl} onChange={setImagenUrl} />

          <div className="flex flex-col gap-2 sm:col-span-2 lg:col-span-3">
            <p className="text-label-md font-semibold text-on-surface-variant">
              Variantes (nro de calce y stock)
            </p>
            {variantes.map((variante, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <FormField htmlFor={`nro-calce-item-${index}`} label="Nro de calce (opcional)" className="w-40">
                  <Input
                    id={`nro-calce-item-${index}`}
                    value={variante.nroCalce}
                    onChange={(e) => actualizarVariante(index, "nroCalce", e.target.value)}
                  />
                </FormField>
                <FormField htmlFor={`stock-item-${index}`} label="Stock" className="w-28">
                  <Input
                    id={`stock-item-${index}`}
                    value={variante.stockActual}
                    onChange={(e) => actualizarVariante(index, "stockActual", e.target.value)}
                    inputMode="decimal"
                    placeholder="0"
                  />
                </FormField>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => quitarVariante(index)}
                  disabled={variantes.length === 1}
                  aria-label="Quitar variante"
                >
                  <Icon name="close" className="text-[16px]" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={agregarVariante} className="w-fit gap-1">
              <Icon name="add" className="text-[16px]" />
              Agregar variante
            </Button>
          </div>

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

      {/* Tarjetas apiladas — solo hasta `sm`: la tabla de acá abajo tiene 10
          columnas con `min-w-[900px]`, así que en mobile "Editar"/"Eliminar"
          (la última columna) quedaban fuera de pantalla, alcanzables solo
          scrolleando horizontal sin ningún indicio de que hiciera falta.
          Mismo criterio que gastos-lista.tsx/gasto-fijo-panel.tsx: en mobile
          la lista se apila en tarjetas con los botones siempre a la vista. */}
      <ul className="flex flex-col divide-y divide-outline-variant sm:hidden">
        {filtrados.map((item) =>
          editandoId === item.id ? (
            <li key={item.id} className="bg-surface-container-low p-3">
              <ItemEditarCampos
                item={item}
                negocioId={negocioId}
                onCancelar={() => setEditandoId(null)}
                onGuardado={() => {
                  setEditandoId(null);
                  onCambio();
                }}
              />
            </li>
          ) : (
            <li key={item.id} className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-3">
                {item.imagenUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- URL pública externa de Supabase Storage
                  <img src={item.imagenUrl} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
                ) : (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-surface-container-high text-on-surface-variant">
                    <Icon name="inventory_2" className="text-[18px]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-on-surface">{item.nombre}</p>
                  {item.nroCalce && (
                    <p className="text-label-md text-on-surface-variant">Nro {item.nroCalce}</p>
                  )}
                </div>
                <Badge variant={estadoStock(item.stockActual).variant}>
                  {estadoStock(item.stockActual).label}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-body-md">
                <span className="text-on-surface-variant">
                  Precio: <span className="text-on-surface">{formatearMonto(item.precioVenta, codigoMoneda(item.monedaId))}</span>
                </span>
                <span className="text-on-surface-variant">
                  Stock: <span className="text-on-surface">{item.stockActual}</span>
                </span>
                <span className="text-on-surface-variant">
                  Costo prom.:{" "}
                  <span className="text-on-surface">
                    {item.costoCompra ? formatearMonto(item.costoCompra, codigoMoneda(item.monedaId)) : "—"}
                  </span>
                </span>
                <span className="text-on-surface-variant">
                  Valor total:{" "}
                  <span className="text-on-surface">
                    {formatearMonto(valorTotal(item), codigoMoneda(item.monedaId))}
                  </span>
                </span>
              </div>
              <div className="flex items-center gap-3">
                <Button type="button" variant="link" onClick={() => setEditandoId(item.id)}>
                  Editar
                </Button>
                <Button
                  type="button"
                  variant="link"
                  onClick={() => onEliminar(item)}
                  className="text-danger"
                >
                  Eliminar
                </Button>
              </div>
            </li>
          )
        )}
        {filtrados.length === 0 && (
          <li className="px-4 py-8 text-center text-body-md text-on-surface-variant">
            {items.length === 0
              ? "Todavía no tenés productos en el catálogo."
              : "Ningún producto coincide con la búsqueda."}
          </li>
        )}
      </ul>

      <div className="hidden overflow-x-auto sm:block">
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
                  <td className="px-4 py-3">
                    {/* Sin `opacity-0` en mobile: en touch no hay hover, así que los
                        botones quedarían permanentemente invisibles (mismo criterio
                        que caja-panel.tsx). */}
                    <div className="flex items-center justify-center gap-1 transition-opacity md:opacity-0 md:group-hover:opacity-100">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditandoId(item.id)}
                        aria-label={`Editar ${item.nombre}`}
                      >
                        <Icon name="edit" className="text-[18px]" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => onEliminar(item)}
                        aria-label={`Eliminar ${item.nombre}`}
                        className="text-danger hover:bg-error-container hover:text-on-error-container"
                      >
                        <Icon name="delete" className="text-[18px]" />
                      </Button>
                    </div>
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

// Fila de edición en la tabla de escritorio — mismos campos que
// `ItemEditarCampos`, envueltos en `<tr>/<td>` para calzar en el `<table>`.
function ItemEditarFila(props: {
  item: Item;
  negocioId: string;
  onCancelar: () => void;
  onGuardado: () => void;
}) {
  return (
    <tr className="bg-surface-container-low">
      <td colSpan={10} className="p-3">
        <ItemEditarCampos {...props} />
      </td>
    </tr>
  );
}

// Campos de edición, compartidos entre la fila de tabla (desktop) y la
// tarjeta apilada (mobile, `sm:hidden` en ItemCatalogo) — mismo formulario,
// dos contenedores distintos.
function ItemEditarCampos({
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
  const [costoCompra, setCostoCompra] = useState(item.costoCompra ?? "");
  const [stockActual, setStockActual] = useState(item.stockActual);
  const [nroCalce, setNroCalce] = useState(item.nroCalce ?? "");
  const [proveedor, setProveedor] = useState(item.proveedor ?? "");
  const [imagenUrl, setImagenUrl] = useState<string | null>(item.imagenUrl);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    const result = await editarItem(item.id, negocioId, {
      nombre,
      precioVenta,
      costoCompra: costoCompra || null,
      stockActual,
      nroCalce: nroCalce.trim() || null,
      proveedor: proveedor.trim() || null,
      imagenUrl,
    });
    setIsSubmitting(false);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    onGuardado();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
      <FormField htmlFor={`editar-nombre-${item.id}`} label="Nombre" className="w-40">
        <Input id={`editar-nombre-${item.id}`} value={nombre} onChange={(e) => setNombre(e.target.value)} />
      </FormField>
      <FormField htmlFor={`editar-proveedor-${item.id}`} label="Proveedor" className="w-32">
        <Input
          id={`editar-proveedor-${item.id}`}
          value={proveedor}
          onChange={(e) => setProveedor(e.target.value)}
        />
      </FormField>
      <FormField htmlFor={`editar-nro-calce-${item.id}`} label="Nro de calce" className="w-24">
        <Input
          id={`editar-nro-calce-${item.id}`}
          value={nroCalce}
          onChange={(e) => setNroCalce(e.target.value)}
        />
      </FormField>
      <FormField htmlFor={`editar-costo-${item.id}`} label="Costo" className="w-24">
        <Input
          id={`editar-costo-${item.id}`}
          value={costoCompra}
          onChange={(e) => setCostoCompra(e.target.value)}
          inputMode="decimal"
        />
      </FormField>
      <FormField htmlFor={`editar-precio-${item.id}`} label="Precio de venta" className="w-24">
        <Input
          id={`editar-precio-${item.id}`}
          value={precioVenta}
          onChange={(e) => setPrecioVenta(e.target.value)}
          inputMode="decimal"
        />
      </FormField>
      <FormField htmlFor={`editar-stock-${item.id}`} label="Stock" className="w-20">
        <Input
          id={`editar-stock-${item.id}`}
          value={stockActual}
          onChange={(e) => setStockActual(e.target.value)}
          inputMode="decimal"
        />
      </FormField>
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
  );
}
