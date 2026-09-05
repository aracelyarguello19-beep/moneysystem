"use client";

import { useCallback, useEffect, useState } from "react";
import Decimal from "decimal.js";
import type { Item, Moneda, Venta } from "@repo/domain";
import { calcularGananciaProducto, calcularTotalVenta } from "@repo/domain";
import type { CuentaFinanciera } from "@repo/domain";
import { registrarVenta } from "@/actions/ventas/registrar-venta";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { listarTasasCambio, type MonedaConTasa } from "@/actions/catalogos/listar-tasas-cambio";
import { listarCuentasFinancieras } from "@/actions/cuentas-financieras/listar-cuentas-financieras";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import { formatearMonto } from "@/lib/moneda";
import { ProductoLibreBuscador } from "@/components/producto-libre-buscador";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";

type FormaPagoProveedor = "EFECTIVO" | "BANCO" | "TARJETA" | "CREDITO_PROVEEDOR";
const FORMAS_PAGO_PROVEEDOR: { value: FormaPagoProveedor; label: string }[] = [
  { value: "EFECTIVO", label: "Efectivo" },
  { value: "BANCO", label: "Transferencia" },
  { value: "TARJETA", label: "Tarjeta" },
  { value: "CREDITO_PROVEEDOR", label: "Crédito con el proveedor" },
];

// Color distinto por método al seleccionarlo — Efectivo en verde (pedido
// explícito), el resto elegido para que cada botón se distinga del vecino
// de un vistazo: Tarjeta en celeste (tertiary), Transferencia en el azul
// grisáceo del sistema (secondary) y Crédito en ámbar (warning, evoca "pago
// pendiente").
const COLOR_SELECCION: Record<Venta["formaCobro"], string> = {
  EFECTIVO: "border-success bg-success text-white",
  TARJETA: "border-tertiary bg-tertiary text-white",
  BANCO: "border-secondary bg-secondary text-white",
  CREDITO_CLIENTE: "border-warning bg-warning text-white",
};

const FORMAS_COBRO: { value: Venta["formaCobro"]; label: string; icon: string }[] = [
  { value: "EFECTIVO", label: "Efectivo", icon: "payments" },
  { value: "TARJETA", label: "Tarjeta", icon: "credit_card" },
  { value: "BANCO", label: "Transferencia", icon: "account_balance" },
  { value: "CREDITO_CLIENTE", label: "Crédito", icon: "receipt" },
];

interface Linea {
  id: string;
  itemId: string | null; // null solo en venta libre de un producto fuera de catálogo
  nombreLibre: string | null; // solo cuando itemId es null
  cantidad: string;
  precioUnitario: string;
  costoServicio: string;
  esLibre: boolean;
  costoUnitario: string; // solo aplica cuando esLibre
  formaPagoProveedor?: FormaPagoProveedor; // solo aplica cuando esLibre
  cuentaFinancieraProveedorId?: string; // solo aplica cuando esLibre
}

function formatearMargen(margen: string): string {
  const numero = Number(margen);
  return Number.isFinite(numero) ? numero.toFixed(1) : "0";
}

// Layout "Punto de Venta" de dos columnas — mismo patrón que
// "Ventas y Facturación" de Stitch (barra de búsqueda + carrito a la
// izquierda, resumen de orden + métodos de cobro a la derecha), adaptado a
// las dos formas de agregar una línea que ya existían:
// 1) Click en un producto del catálogo (con foto) → vende del inventario
//    propio, descuenta stock (mismo comportamiento de siempre).
// 2) "Venta libre" → identifica el producto/modelo eligiéndolo del mismo
//    catálogo (para el reporte), pero el costo/precio se tipean a mano y no
//    se descuenta stock: sirve para vender sobre pedido (una variante —
//    talla, color — que el modelo elegido no tiene en existencia ahora
//    mismo). El costo de esa línea se registra como Compra sin stock (ver
//    `registrarVenta`), y no muestra el % de ganancia en pantalla.
export function RegistrarVentaForm({ negocioId }: { negocioId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tasas, setTasas] = useState<MonedaConTasa[]>([]);
  const [cuentasFinancieras, setCuentasFinancieras] = useState<CuentaFinanciera[]>([]);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [cliente, setCliente] = useState("");
  const [formaCobro, setFormaCobro] = useState<Venta["formaCobro"]>("EFECTIVO");
  const [impuesto, setImpuesto] = useState("0");
  const [monedaId, setMonedaId] = useState("");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");
  const [cotizacion, setCotizacion] = useState("");
  const [montoRecibido, setMontoRecibido] = useState("");
  const [clienteError, setClienteError] = useState<string | null>(null);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [libreAbierta, setLibreAbierta] = useState(false);
  const [libreTexto, setLibreTexto] = useState("");
  const [libreItemId, setLibreItemId] = useState<string | null>(null);
  const [libreCosto, setLibreCosto] = useState("");
  const [librePrecio, setLibrePrecio] = useState("");
  const [libreCantidad, setLibreCantidad] = useState("1");
  const [libreFormaPago, setLibreFormaPago] = useState<FormaPagoProveedor>("EFECTIVO");
  const [libreCuentaProveedorId, setLibreCuentaProveedorId] = useState("");

  const cargar = useCallback(async () => {
    // Las 4 en paralelo (no importa el orden en que terminen) — esta
    // página venía siendo lenta en gran parte por la distancia real a
    // Supabase (remoto), no por pedidos redundantes: acá no había
    // duplicación como en Inventario, pero sumar `cuentasFinancieras`/
    // `tasas` al mismo Promise.all evita pedidos aparte.
    const [itemsResult, monedasResult, tasasResult, cuentasResult] = await Promise.all([
      listarItems(negocioId),
      listarMonedas(negocioId),
      listarTasasCambio(negocioId),
      listarCuentasFinancieras(negocioId),
    ]);
    if (itemsResult.ok) setItems(itemsResult.data);
    if (monedasResult.ok) {
      setMonedas(monedasResult.data.filter((m) => m.activa));
      setMonedaId((actual) => actual || monedasResult.data.find((m) => m.esBase)?.id || "");
    }
    if (tasasResult.ok) setTasas(tasasResult.data);
    if (cuentasResult.ok) setCuentasFinancieras(cuentasResult.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const monedaBase = monedas.find((m) => m.esBase);
  const codigoMonedaBase = monedaBase?.codigo;
  const monedaSeleccionada = monedas.find((m) => m.id === monedaId);
  const esMonedaForanea = !!monedaSeleccionada && !monedaSeleccionada.esBase;
  // Cuentas de venta (cobro del cliente): nunca Tarjeta propia (es un
  // pasivo, no liquidez) — el pago a proveedor de "venta libre" sí puede
  // usar Tarjeta, por eso ese selector filtra aparte (ver más abajo).
  const cuentasCajaYBanco = cuentasFinancieras.filter((c) => c.tipo === "CAJA" || c.tipo === "BANCO");

  // La cuenta que recibe el pago tiene que ser de la MISMA moneda en la que
  // pagó el cliente — nunca se convierte silenciosamente. Efectivo/Tarjeta
  // no muestran selector (ver más abajo) pero igual necesitan una cuenta
  // real: se preselecciona la primera que matchee esa moneda, y se
  // recalcula cada vez que cambia la moneda elegida.
  useEffect(() => {
    const candidatas = cuentasCajaYBanco.filter((c) => c.monedaId === monedaId);
    setCuentaFinancieraId((actual) => (candidatas.some((c) => c.id === actual) ? actual : candidatas[0]?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monedaId, cuentasFinancieras]);

  // Al elegir una moneda distinta a la oficial, precarga la cotización
  // vigente (Story 5.3, TasaCambio) y el monto recibido sugerido — ambos
  // quedan editables antes de registrar la venta. `subtotal`/`impuesto` se
  // leen del cierre de este render (declarados más abajo): el efecto recién
  // corre después del render completo, así que ya están inicializados.
  useEffect(() => {
    if (!esMonedaForanea) {
      setCotizacion("");
      setMontoRecibido("");
      return;
    }
    const vigente = tasas.find((t) => t.moneda.id === monedaId)?.tasaVigente?.tasa ?? "";
    setCotizacion(vigente);
    const num = Number(vigente);
    if (num > 0) {
      setMontoRecibido(new Decimal(subtotal).plus(impuesto || "0").dividedBy(num).toFixed(2));
    } else {
      setMontoRecibido("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monedaId, esMonedaForanea]);

  function onCotizacionChange(valor: string) {
    setCotizacion(valor);
    const num = Number(valor.replace(",", "."));
    if (num > 0) {
      const totalActual = new Decimal(subtotal).plus(impuesto || "0");
      setMontoRecibido(totalActual.dividedBy(num).toFixed(2));
    }
  }

  function actualizarLinea(id: string, cambios: Partial<Linea>) {
    setLineas((prev) => prev.map((l) => (l.id === id ? { ...l, ...cambios } : l)));
  }

  function quitarLinea(id: string) {
    setLineas((prev) => prev.filter((l) => l.id !== id));
  }

  function itemPorId(itemId: string | null): Item | undefined {
    return itemId ? items.find((i) => i.id === itemId) : undefined;
  }

  function agregarDesdeInventario(item: Item) {
    setLineas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: item.id,
        nombreLibre: null,
        cantidad: item.tipo === "PRODUCTO" ? "1" : "",
        precioUnitario: item.precioVenta,
        costoServicio: "",
        esLibre: false,
        costoUnitario: "",
      },
    ]);
  }

  const libreListoParaAgregar =
    libreTexto.trim() &&
    libreCantidad &&
    libreCosto &&
    librePrecio &&
    (libreFormaPago === "CREDITO_PROVEEDOR" || !!libreCuentaProveedorId);

  function agregarVentaLibre() {
    if (!libreListoParaAgregar) return;
    setLineas((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        itemId: libreItemId,
        nombreLibre: libreItemId ? null : libreTexto.trim(),
        cantidad: libreCantidad || "1",
        precioUnitario: librePrecio || "0",
        costoServicio: "",
        esLibre: true,
        costoUnitario: libreCosto || "0",
        formaPagoProveedor: libreFormaPago,
        cuentaFinancieraProveedorId:
          libreFormaPago === "CREDITO_PROVEEDOR" ? undefined : libreCuentaProveedorId,
      },
    ]);
    setLibreAbierta(false);
    setLibreTexto("");
    setLibreItemId(null);
    setLibreCosto("");
    setLibrePrecio("");
    setLibreCantidad("1");
    setLibreFormaPago("EFECTIVO");
    setLibreCuentaProveedorId("");
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);
    setClienteError(null);

    if (formaCobro === "CREDITO_CLIENTE" && !cliente.trim()) {
      setClienteError("El cliente es requerido cuando la forma de cobro es a crédito.");
      return;
    }

    if (lineas.length === 0) {
      setServerMessage("Agregá al menos un ítem a la venta.");
      return;
    }

    if (esMonedaForanea && (!cotizacion || Number(cotizacion) <= 0)) {
      setServerMessage("Cargá la cotización de hoy antes de registrar la venta.");
      return;
    }

    setIsSubmitting(true);
    const result = await registrarVenta(negocioId, {
      cliente: cliente.trim() || undefined,
      formaCobro,
      impuesto,
      monedaId,
      cotizacion: esMonedaForanea ? cotizacion : undefined,
      montoRecibido: esMonedaForanea ? montoRecibido : undefined,
      cuentaFinancieraId: formaCobro === "CREDITO_CLIENTE" ? null : cuentaFinancieraId,
      items: lineas.map((l) => ({
        itemId: l.itemId,
        nombreLibre: l.nombreLibre ?? undefined,
        cantidad: itemPorId(l.itemId)?.tipo === "SERVICIO" ? null : l.cantidad,
        precioUnitario: l.precioUnitario,
        costoServicio: itemPorId(l.itemId)?.tipo === "SERVICIO" ? l.costoServicio || null : null,
        esLibre: l.esLibre,
        costoUnitario: l.esLibre ? l.costoUnitario : undefined,
        formaPagoProveedor: l.esLibre ? l.formaPagoProveedor : undefined,
        cuentaFinancieraProveedorId: l.esLibre ? l.cuentaFinancieraProveedorId ?? null : undefined,
      })),
    });
    setIsSubmitting(false);

    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setLineas([]);
    setCliente("");
    setImpuesto("0");
  }

  const productos = items.filter((i) => i.tipo === "PRODUCTO");
  const servicios = items.filter((i) => i.tipo === "SERVICIO");
  const productosFiltrados = busqueda
    ? productos.filter((p) => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productos;

  const subtotal = calcularTotalVenta(
    lineas.map((l) => ({ precioUnitario: l.precioUnitario, cantidad: l.cantidad || null }))
  );
  const total = new Decimal(subtotal).plus(impuesto || "0").toString();

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4 lg:flex-row lg:items-start" noValidate>
      {/* Columna izquierda: búsqueda + catálogo + carrito */}
      <div className="flex flex-1 flex-col gap-4">
        <Card className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-[220px] flex-1">
            <Icon
              name="search"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant"
            />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto por nombre..."
              className="pl-10"
              aria-label="Buscar producto"
            />
          </div>
          <Button type="button" variant="outline" onClick={() => setLibreAbierta((v) => !v)}>
            <Icon name="add" className="text-[18px]" />
            Venta libre
          </Button>
        </Card>

        {libreAbierta && (
          <Card className="flex flex-col gap-3 border-dashed">
            <p className="text-label-md text-on-surface-variant">
              Sobre pedido: un producto que le vas a comprar a un proveedor para esta venta puntual, sin
              sumarlo a tu inventario propio.
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <FormField htmlFor="libre-item" label="Producto" className="min-w-[200px]">
                <ProductoLibreBuscador
                  id="libre-item"
                  productos={productos}
                  texto={libreTexto}
                  itemId={libreItemId}
                  onChangeTexto={setLibreTexto}
                  onSeleccionar={(item) => setLibreItemId(item?.id ?? null)}
                />
              </FormField>
              <FormField htmlFor="libre-cantidad" label="Cantidad">
                <Input
                  id="libre-cantidad"
                  value={libreCantidad}
                  onChange={(e) => setLibreCantidad(e.target.value)}
                  className="w-20"
                />
              </FormField>
              <FormField htmlFor="libre-costo" label="Costo de compra">
                <Input
                  id="libre-costo"
                  value={libreCosto}
                  onChange={(e) => setLibreCosto(e.target.value)}
                  className="w-28"
                />
              </FormField>
              <FormField htmlFor="libre-precio" label="Precio de venta">
                <Input
                  id="libre-precio"
                  value={librePrecio}
                  onChange={(e) => setLibrePrecio(e.target.value)}
                  className="w-28"
                />
              </FormField>
            </div>
            <div className="flex flex-wrap items-end gap-2 border-t border-outline-variant pt-3">
              <FormField htmlFor="libre-forma-pago" label="¿Cómo le pagaste al proveedor?">
                <Select
                  id="libre-forma-pago"
                  value={libreFormaPago}
                  onChange={(e) => {
                    setLibreFormaPago(e.target.value as FormaPagoProveedor);
                    setLibreCuentaProveedorId("");
                  }}
                >
                  {FORMAS_PAGO_PROVEEDOR.map((fp) => (
                    <option key={fp.value} value={fp.value}>
                      {fp.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              {libreFormaPago !== "CREDITO_PROVEEDOR" && (
                <CuentaFinancieraSelect
                  id="libre-cuenta-proveedor"
                  negocioId={negocioId}
                  tipo={
                    libreFormaPago === "TARJETA" ? "TARJETA" : libreFormaPago === "BANCO" ? "BANCO" : "CAJA"
                  }
                  value={libreCuentaProveedorId}
                  onChange={setLibreCuentaProveedorId}
                  label="¿Con qué cuenta?"
                />
              )}
              <Button type="button" size="sm" disabled={!libreListoParaAgregar} onClick={agregarVentaLibre}>
                Agregar a la venta
              </Button>
            </div>
            <p className="text-label-md text-on-surface-variant">
              Esa plata sale de la cuenta elegida en el momento — cuando registrés la venta, vuelve a entrar
              con el cobro al cliente.
            </p>
          </Card>
        )}

        <div className="flex flex-col gap-3">
          {productosFiltrados.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              {busqueda ? "Ningún producto coincide con la búsqueda." : "Todavía no hay productos en el inventario."}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {productosFiltrados.map((item) => {
                const stock = Number(item.stockActual);
                const stockVariant = stock <= 0 ? "danger" : stock <= 5 ? "warning" : "success";
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => agregarDesdeInventario(item)}
                    className="w-[118px] overflow-hidden rounded-xl border border-outline-variant bg-surface-container-lowest text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-tertiary hover:shadow-md"
                  >
                    <div className="flex aspect-square items-center justify-center bg-surface-container-high text-on-surface-variant">
                      {item.imagenUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- URL pública externa de Supabase Storage
                        <img src={item.imagenUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Icon name="inventory_2" className="text-[28px]" />
                      )}
                    </div>
                    <div className="flex flex-col gap-1 p-2">
                      <p className="truncate text-label-lg font-semibold text-on-surface">{item.nombre}</p>
                      <p className="text-label-lg font-bold text-on-surface">
                        {formatearMonto(item.precioVenta, codigoMonedaBase)}
                      </p>
                      <Badge variant={stockVariant} className="self-start normal-case">
                        {item.stockActual} en stock
                      </Badge>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {servicios.length > 0 && (
            <FormField htmlFor="agregar-servicio" label="Agregar servicio">
              <Select
                id="agregar-servicio"
                value=""
                onChange={(e) => {
                  const servicio = itemPorId(e.target.value);
                  if (servicio) agregarDesdeInventario(servicio);
                }}
                className="max-w-xs"
              >
                <option value="">Elegí un servicio</option>
                {servicios.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </Select>
            </FormField>
          )}
        </div>

        {/* Carrito activo — misma grilla de columnas que Stitch: #, Producto, Cant, Precio, Total */}
        <Card className="flex flex-1 flex-col overflow-hidden p-0">
          <div className="grid grid-cols-12 gap-2 border-b border-outline-variant bg-surface-container-low px-4 py-3 text-label-md font-semibold uppercase tracking-wide text-on-surface-variant">
            <div className="col-span-1">#</div>
            <div className="col-span-5">Producto</div>
            <div className="col-span-2 text-right">Cant.</div>
            <div className="col-span-2 text-right">Precio</div>
            <div className="col-span-2 text-right">Total</div>
          </div>
          <div className="flex flex-col divide-y divide-outline-variant">
            {lineas.length === 0 && (
              <p className="px-4 py-8 text-center text-body-md text-on-surface-variant">
                Todavía no agregaste ningún ítem.
              </p>
            )}
            {lineas.map((linea, i) => {
              const item = itemPorId(linea.itemId);
              const esProducto = linea.esLibre || item?.tipo === "PRODUCTO";
              const ganancia =
                !linea.esLibre && esProducto && linea.precioUnitario
                  ? calcularGananciaProducto(linea.precioUnitario, item?.costoCompra ?? "0")
                  : null;
              const lineaTotal = new Decimal(linea.precioUnitario || "0")
                .times(linea.cantidad || "1")
                .toString();

              return (
                <div
                  key={linea.id}
                  className="group grid grid-cols-12 items-center gap-2 px-4 py-3 transition-colors hover:bg-surface-container-low"
                >
                  <div className="col-span-1 text-body-md text-on-surface-variant">{i + 1}</div>
                  <div className="col-span-5">
                    <p className="flex items-center gap-2 truncate text-label-lg font-medium text-on-surface">
                      {item?.nombre ?? linea.nombreLibre}
                      {linea.esLibre && <Badge variant="warning">Sobre pedido</Badge>}
                      {linea.esLibre && !linea.itemId && (
                        <span className="text-label-md font-normal text-on-surface-variant">
                          (fuera de catálogo)
                        </span>
                      )}
                    </p>
                    {linea.esLibre && (
                      <Input
                        aria-label="Costo de compra"
                        value={linea.costoUnitario}
                        onChange={(e) => actualizarLinea(linea.id, { costoUnitario: e.target.value })}
                        placeholder="Costo de compra"
                        className="mt-1 h-7 w-32 text-label-md"
                      />
                    )}
                    {item?.tipo === "SERVICIO" && (
                      <Input
                        aria-label="Costo del servicio"
                        value={linea.costoServicio}
                        onChange={(e) => actualizarLinea(linea.id, { costoServicio: e.target.value })}
                        placeholder="Costo del servicio"
                        className="mt-1 h-7 w-36 text-label-md"
                      />
                    )}
                    {ganancia && (
                      <p className="text-label-md text-on-surface-variant">
                        Ganancia: {ganancia.ganancia} ({formatearMargen(ganancia.margen)}%)
                      </p>
                    )}
                  </div>
                  <div className="col-span-2 flex justify-end">
                    {esProducto ? (
                      <div className="flex items-center rounded border border-outline-variant bg-surface">
                        <button
                          type="button"
                          className="p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                          onClick={() =>
                            actualizarLinea(linea.id, {
                              cantidad: new Decimal(linea.cantidad || "1")
                                .minus(1)
                                .clamp(1, Infinity)
                                .toString(),
                            })
                          }
                        >
                          <Icon name="remove" className="text-[16px]" />
                        </button>
                        <input
                          aria-label="Cantidad"
                          value={linea.cantidad}
                          onChange={(e) => actualizarLinea(linea.id, { cantidad: e.target.value })}
                          className="h-full w-10 border-none bg-transparent p-0 text-center text-body-md focus:outline-none focus:ring-0"
                        />
                        <button
                          type="button"
                          className="p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high"
                          onClick={() =>
                            actualizarLinea(linea.id, {
                              cantidad: new Decimal(linea.cantidad || "0").plus(1).toString(),
                            })
                          }
                        >
                          <Icon name="add" className="text-[16px]" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-body-md text-on-surface-variant">1</span>
                    )}
                  </div>
                  <div className="col-span-2 text-right">
                    <Input
                      aria-label="Precio unitario"
                      value={linea.precioUnitario}
                      onChange={(e) => actualizarLinea(linea.id, { precioUnitario: e.target.value })}
                      className="h-8 w-full text-right text-body-md"
                    />
                  </div>
                  <div className="col-span-2 flex items-center justify-end gap-2 text-label-lg font-medium text-on-surface">
                    {formatearMonto(lineaTotal, codigoMonedaBase)}
                    <button
                      type="button"
                      className="text-error opacity-0 transition-opacity group-hover:opacity-100"
                      onClick={() => quitarLinea(linea.id)}
                      aria-label="Quitar"
                    >
                      <Icon name="delete" className="text-[18px]" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Columna derecha: resumen de orden + métodos de cobro */}
      <div className="flex w-full flex-col gap-4 lg:w-[380px]">
        <Card className="flex flex-col gap-3">
          <CardHeader>
            <CardTitle>Resumen de venta</CardTitle>
          </CardHeader>
          <div className="flex justify-between text-body-md">
            <span className="text-on-surface-variant">Subtotal ({lineas.length} ítems)</span>
            <span className="text-on-surface">{formatearMonto(subtotal, codigoMonedaBase)}</span>
          </div>
          <div className="flex items-center justify-between border-b border-outline-variant pb-3 text-body-md">
            <span className="text-on-surface-variant">Impuesto</span>
            <Input
              aria-label="Impuesto"
              value={impuesto}
              onChange={(e) => setImpuesto(e.target.value)}
              className="h-8 w-24 text-right"
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-headline-sm font-semibold text-on-surface">Total</span>
            <span className="text-headline-md font-bold text-success">{formatearMonto(total, codigoMonedaBase)}</span>
          </div>

          <div className="mt-2 flex flex-col gap-3 border-t border-outline-variant pt-3">
            <FormField
              htmlFor="cliente-venta"
              label={`Cliente ${formaCobro === "CREDITO_CLIENTE" ? "(requerido)" : "(opcional)"}`}
              error={clienteError ?? undefined}
            >
              <Input id="cliente-venta" value={cliente} onChange={(e) => setCliente(e.target.value)} />
            </FormField>
            <FormField htmlFor="moneda-venta" label="¿En qué moneda pagó?">
              <Select id="moneda-venta" value={monedaId} onChange={(e) => setMonedaId(e.target.value)}>
                {monedas.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.esBase ? `${m.codigo} (oficial)` : m.codigo}
                  </option>
                ))}
              </Select>
            </FormField>

            {/* El carrito/subtotal/total de arriba SIEMPRE quedan en la
                moneda oficial — elegir otra acá no los cambia, solo abre
                este panel para anotar cuánto entró en esa moneda (Story
                rediseño Caja multimoneda). La cotización se precarga con la
                última cargada (TasaCambio) pero es editable porque varía
                día a día; al registrar, esa cotización pasa a ser la nueva
                "vigente" en la tarjeta de esa moneda en Caja. */}
            {esMonedaForanea && (
              <Card className="flex flex-col gap-2 border-tertiary/40 bg-tertiary-container/10 p-3">
                <FormField
                  htmlFor="cotizacion-venta"
                  label={`Cotización de hoy (1 ${monedaSeleccionada?.codigo} en ${codigoMonedaBase})`}
                >
                  <Input
                    id="cotizacion-venta"
                    value={cotizacion}
                    onChange={(e) => onCotizacionChange(e.target.value)}
                    className="w-28"
                  />
                </FormField>
                <FormField htmlFor="monto-recibido-venta" label={`Recibiste en ${monedaSeleccionada?.codigo}`}>
                  <Input
                    id="monto-recibido-venta"
                    value={montoRecibido}
                    onChange={(e) => setMontoRecibido(e.target.value)}
                    className="w-28"
                  />
                </FormField>
                <p className="text-label-md text-on-surface-variant">
                  Se calcula solo: {formatearMonto(total, codigoMonedaBase)} ÷ cotización — ajustalo si el cliente
                  redondeó. Se acredita en la cuenta de {monedaSeleccionada?.codigo}, nunca en la de{" "}
                  {codigoMonedaBase}.
                </p>
              </Card>
            )}
          </div>
        </Card>

        {/* Métodos de cobro — mismo bento 2x2 que Stitch, mapeado 1:1 a
            nuestro dominio `formaCobro` (EFECTIVO/TARJETA/BANCO/CREDITO_CLIENTE).
            Solo Transferencia despliega el selector de cuenta: Efectivo y
            Tarjeta ya tienen una cuenta preasignada (ver `cargar`) sin
            pedirle al usuario que la elija — nunca hubo más de una caja
            registradora ni más de una cuenta receptora de tarjeta en la
            práctica, así que preguntar ahí era ruido. Transferencia sí
            puede ir a bancos distintos, por eso es la única que pregunta. */}
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            {FORMAS_COBRO.map((fc) => (
              <button
                key={fc.value}
                type="button"
                onClick={() => setFormaCobro(fc.value)}
                className={`flex flex-col items-center justify-center gap-1 rounded border p-3 transition-colors ${
                  formaCobro === fc.value
                    ? COLOR_SELECCION[fc.value]
                    : "border-outline-variant bg-surface text-on-surface hover:border-tertiary"
                }`}
              >
                <Icon name={fc.icon} />
                <span className="text-label-md">{fc.label}</span>
              </button>
            ))}
          </div>

          {formaCobro === "BANCO" && (
            <Card className="flex flex-col gap-2 border-secondary/40 bg-secondary-container/20 p-3">
              {(() => {
                const candidatas = cuentasCajaYBanco.filter((c) => c.monedaId === monedaId);
                return candidatas.length === 0 ? (
                  <p className="text-label-md text-warning-text">
                    No hay cuentas de banco en {monedaSeleccionada?.codigo ?? "esa moneda"} — creá una en Caja.
                  </p>
                ) : (
                  <FormField htmlFor="cuenta-financiera-venta" label="¿A qué cuenta entra la transferencia?">
                    <Select
                      id="cuenta-financiera-venta"
                      value={cuentaFinancieraId}
                      onChange={(e) => setCuentaFinancieraId(e.target.value)}
                    >
                      {candidatas.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.nombre}
                          {c.banco ? ` — ${c.banco}${c.alias ? ` (${c.alias})` : ""}` : ""}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                );
              })()}
            </Card>
          )}
        </div>

        <Button type="submit" disabled={isSubmitting} className="w-full py-4 text-headline-sm">
          Registrar venta
        </Button>

        {serverMessage && (
          <p role="alert" className="text-sm text-danger">
            {serverMessage}
          </p>
        )}
      </div>
    </form>
  );
}
