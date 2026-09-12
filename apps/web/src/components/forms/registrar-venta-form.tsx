"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
export function RegistrarVentaForm({
  negocioId,
  historial,
}: {
  negocioId: string;
  /** Historial de ventas — a pedido, se muestra debajo del resumen (columna
      derecha en desktop) en vez de en una sección aparte debajo de todo. */
  historial?: ReactNode;
}) {
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

  // Resumen como hoja inferior en mobile/tablet (< lg): en desktop este
  // mismo bloque ya se ve siempre en la columna derecha, así que el estado
  // solo importa por debajo de `lg` — una barra fija abajo (carrito) lo
  // abre, tocar el fondo o su botón de cerrar lo cierra.
  const [resumenAbierto, setResumenAbierto] = useState(false);

  // Bloquea el scroll de la página de fondo mientras la hoja está abierta.
  // Sin esto, un swipe sobre la hoja (o su fondo oscuro) terminaba
  // scrolleando el catálogo detrás en vez del contenido de la hoja. Solo
  // `overflow: hidden` en el body NO alcanza en iOS Safari — es un problema
  // conocido: Safari sigue dejando "rebotar" (scroll elástico) la página de
  // fondo igual. La técnica que sí funciona ahí es fijar el body en su
  // lugar (`position: fixed` con `top` negativo = el scroll actual) para
  // que no tenga ningún scroll propio que hacer, y restaurar la posición
  // exacta al cerrar.
  useEffect(() => {
    if (!resumenAbierto) return;
    const scrollY = window.scrollY;
    const { style } = document.body;
    const previous = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    };
    style.position = "fixed";
    style.top = `-${scrollY}px`;
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    style.overflow = "hidden";
    return () => {
      style.position = previous.position;
      style.top = previous.top;
      style.left = previous.left;
      style.right = previous.right;
      style.width = previous.width;
      style.overflow = previous.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [resumenAbierto]);

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
  // usar Tarjeta, por eso ese selector filtra aparte (ver más abajo). Efectivo
  // entra a una caja física (tipo CAJA); Transferencia y Tarjeta entran a una
  // cuenta bancaria (tipo BANCO) — nunca se mezclan entre sí en el selector.
  const tipoCuentaDestino = formaCobro === "EFECTIVO" ? "CAJA" : "BANCO";
  const cuentasCajaYBanco = cuentasFinancieras.filter((c) => c.tipo === "CAJA" || c.tipo === "BANCO");

  // La cuenta que recibe el pago tiene que ser de la MISMA moneda en la que
  // pagó el cliente — nunca se convierte silenciosamente. Se preselecciona la
  // primera cuenta del tipo correcto (caja o banco, según la forma de cobro)
  // que matchee esa moneda, y se recalcula cada vez que cambia la moneda o la
  // forma de cobro elegida.
  useEffect(() => {
    const candidatas = cuentasCajaYBanco.filter((c) => c.tipo === tipoCuentaDestino && c.monedaId === monedaId);
    setCuentaFinancieraId((actual) => (candidatas.some((c) => c.id === actual) ? actual : candidatas[0]?.id ?? ""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monedaId, cuentasFinancieras, tipoCuentaDestino]);

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

  // Cuánto de este ítem ya está pedido en el carrito — suma todas las
  // líneas que lo referencian (nunca debería haber más de una por ítem
  // desde que agregarDesdeInventario acumula en vez de duplicar, pero suma
  // por las dudas). `excluirLineaId` sirve para "cuánto piden las OTRAS
  // líneas", al validar el tope de esta línea puntual (el stepper +).
  function cantidadEnCarrito(itemId: string, excluirLineaId?: string): number {
    return lineas
      .filter((l) => l.itemId === itemId && !l.esLibre && l.id !== excluirLineaId)
      .reduce((acc, l) => acc + Number(l.cantidad || "0"), 0);
  }

  // A pedido: clickear un producto que YA está en el carrito suma 1 a esa
  // misma línea en vez de agregar una línea duplicada — solo productos
  // DISTINTOS van en líneas separadas. Además nunca deja pedir más de lo
  // que hay en stock (antes no había ningún tope: clickear varias veces un
  // ítem con 1 sola unidad igual sumaba líneas, y la venta se registraba
  // dejando el stock en negativo).
  function agregarDesdeInventario(item: Item) {
    if (item.tipo === "PRODUCTO" && cantidadEnCarrito(item.id) >= Number(item.stockActual)) {
      return;
    }

    setLineas((prev) => {
      const existente = item.tipo === "PRODUCTO" ? prev.find((l) => l.itemId === item.id && !l.esLibre) : undefined;
      if (existente) {
        return prev.map((l) =>
          l.id === existente.id ? { ...l, cantidad: new Decimal(l.cantidad || "0").plus(1).toString() } : l
        );
      }
      return [
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
      ];
    });
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
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-4 pb-16 lg:flex-row lg:items-start lg:pb-0"
      noValidate
    >
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

        {/* Scroll propio solo en desktop (`lg:`): el catálogo puede tener
            muchos más productos que lo que entra en pantalla, y antes
            empujaba todo lo de abajo (resumen, historial) cada vez más
            lejos. En mobile se deja scrollear la página entera como
            siempre — un scroll anidado ahí se siente raro al tacto. */}
        <div className="flex flex-col gap-3 lg:max-h-[70vh] lg:overflow-y-auto lg:pr-1">
          {productosFiltrados.length === 0 ? (
            <p className="text-body-md text-on-surface-variant">
              {busqueda ? "Ningún producto coincide con la búsqueda." : "Todavía no hay productos en el inventario."}
            </p>
          ) : (
            /* Cantidad de columnas fija por breakpoint (no `auto-fill`: en
               monitores muy anchos terminaba metiendo 12+ tarjetas por
               fila, más de lo que se pidió). De `md` en adelante el sidebar
               fijo (230px) le come ancho real al catálogo, y de `lg` en
               adelante también compite con la columna del resumen (380px) —
               por eso la cantidad de columnas no crece de forma lineal con
               el breakpoint: baja en md/lg (menos ancho real disponible) y
               vuelve a subir en xl/2xl (una vez que sobra ancho de nuevo). */
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-3 lg:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-6">
              {productosFiltrados.map((item) => {
                const stock = Number(item.stockActual);
                // Cuánto queda para agregar, descontando lo que ya pedimos
                // de este mismo ítem en el carrito — no lo que hay en el
                // depósito a secas. Con 1 en stock y ya 1 en el carrito, acá
                // da 0: la tarjeta se deshabilita y avisa "Sin stock", en
                // vez de dejar seguir clickeando y sumar de más.
                const disponible = stock - cantidadEnCarrito(item.id);
                const sinStockDisponible = item.tipo === "PRODUCTO" && disponible <= 0;
                const stockVariant = disponible <= 0 ? "danger" : disponible <= 5 ? "warning" : "success";
                // Persistente mientras el producto siga en la lista de la
                // venta — antes era un flash de 900ms que se apagaba solo,
                // y a pedido tiene que quedar marcado hasta que se saque del
                // carrito (o se registre/reinicie la venta).
                const enCarrito = lineas.some((l) => l.itemId === item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    disabled={sinStockDisponible}
                    onClick={() => agregarDesdeInventario(item)}
                    className={`relative overflow-hidden rounded-xl border bg-surface-container-lowest text-left shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm ${
                      sinStockDisponible ? "" : "hover:-translate-y-0.5 hover:border-tertiary hover:shadow-md"
                    } ${enCarrito ? "border-success ring-2 ring-success" : "border-outline-variant"}`}
                  >
                    {enCarrito && (
                      <span className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-success text-white shadow">
                        <Icon name="check" className="text-[16px]" />
                      </span>
                    )}
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
                        {sinStockDisponible ? "Sin stock" : `${disponible} disponible${disponible === 1 ? "" : "s"}`}
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
      </div>

      {/* Barra fija de carrito — solo mobile/tablet (`lg:hidden`): toca para
          abrir el resumen como hoja inferior. En desktop el resumen ya está
          siempre visible al costado, así que la barra no hace falta ahí.
          `md:left-sidebar-width-expanded md:w-[calc(100%-230px)]`: en una
          tablet el menú lateral completo ya se ve desde `md` (`app-sidebar`)
          — sin este ajuste la barra usaba `inset-x-0` (todo el viewport) y
          quedaba tapada a medias por el menú, que tiene más z-index. */}
      <button
        type="button"
        onClick={() => setResumenAbierto(true)}
        className={`fixed inset-x-0 bottom-0 z-20 flex items-center justify-center gap-2 border-t border-outline-variant bg-primary px-4 py-3 text-on-primary shadow-lg md:left-sidebar-width-expanded md:w-[calc(100%-230px)] lg:hidden ${
          resumenAbierto ? "hidden" : ""
        }`}
      >
        <Icon name="shopping_cart" fill className="text-[20px]" />
        <span className="font-semibold">
          {lineas.length} {lineas.length === 1 ? "ítem" : "ítems"} · {formatearMonto(total, codigoMonedaBase)}
        </span>
        <Icon name="keyboard_arrow_up" className="text-[20px]" />
      </button>

      {/* Fondo oscuro al abrir el resumen en mobile/tablet — clickear lo
          cierra. `lg:hidden` para que nunca aparezca en desktop, donde
          `resumenAbierto` no tiene ningún efecto visual. */}
      {resumenAbierto && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setResumenAbierto(false)}
          aria-hidden="true"
        />
      )}

      {/* Columna derecha: resumen de orden + métodos de cobro. En desktop
          (`lg:`) es la columna fija de siempre; por debajo de `lg` es la
          misma información pero como hoja que sube desde abajo (mismo
          nodo del DOM en los dos casos, solo cambian las clases —
          evita duplicar todo este bloque con ids repetidos). */}
      <div
        className={`z-40 flex w-full flex-col gap-4 bg-surface-container-lowest transition-transform duration-300 ease-out md:left-sidebar-width-expanded md:w-[calc(100%-230px)] lg:static lg:z-auto lg:left-auto lg:w-[380px] lg:translate-y-0 lg:bg-transparent lg:transition-none ${
          resumenAbierto
            ? "fixed inset-x-0 bottom-0 max-h-[85dvh] translate-y-0 overflow-y-auto overscroll-contain rounded-t-2xl border-t border-outline-variant p-4 shadow-lg"
            : "fixed inset-x-0 bottom-0 max-h-[85dvh] translate-y-full overflow-y-auto overscroll-contain rounded-t-2xl border-t border-outline-variant p-4 shadow-lg lg:max-h-none lg:overflow-visible lg:rounded-none lg:border-0 lg:p-0 lg:shadow-none"
        }`}
        style={{ touchAction: "pan-y" }}
      >
        {/* Agarradera + cerrar — solo tienen sentido en la hoja mobile. */}
        <div className="flex items-center justify-between lg:hidden">
          <div className="mx-auto h-1.5 w-12 rounded-full bg-outline-variant" />
          <button
            type="button"
            onClick={() => setResumenAbierto(false)}
            className="absolute right-4 top-4 text-on-surface-variant"
            aria-label="Cerrar resumen"
          >
            <Icon name="close" />
          </button>
        </div>
        <Card className="flex shrink-0 flex-col gap-0 overflow-hidden p-0">
          <CardHeader className="px-4 pt-4 sm:px-5 sm:pt-5">
            <CardTitle>Resumen de venta</CardTitle>
          </CardHeader>

          {/* Lista de productos agregados — antes vivía separada en la
              columna izquierda (lejos del resumen/total); a pedido se movió
              acá para tener cantidad/precio/total del carrito junto al
              subtotal, en el mismo bloque donde se registra la venta.
              Siempre apilada (nunca la grilla de 12 columnas que usaba en la
              columna ancha): este resumen es angosto tanto en mobile como en
              desktop (~380px fijos), así que un layout en grilla pensado
              para una columna ancha quedaba con las celdas encimadas. */}
          {/* Zona de scroll propia (con su propio tope de altura) tanto en
              mobile como en desktop — a pedido, tiene que poder deslizarse
              ella sola para ver todos los productos agregados sin depender
              de scrollear toda la hoja. `touch-action:pan-y` + `overscroll-
              contain` de forma explícita para que el gesto de arrastre
              quede atrapado acá (no se filtre al catálogo de fondo). */}
          <div
            className="flex max-h-[38vh] shrink-0 flex-col divide-y divide-outline-variant overflow-y-auto overscroll-contain border-y border-outline-variant lg:max-h-72"
            style={{ touchAction: "pan-y" }}
          >
            {lineas.length === 0 && (
              <p className="px-4 py-6 text-center text-body-md text-on-surface-variant">
                Todavía no agregaste ningún ítem.
              </p>
            )}
            {lineas.map((linea) => {
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
                <div key={linea.id} className="flex flex-col gap-2 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 flex-1 text-label-lg font-medium text-on-surface">
                      {item?.nombre ?? linea.nombreLibre}
                      {linea.esLibre && (
                        <Badge variant="warning" className="ml-1 align-middle">
                          Sobre pedido
                        </Badge>
                      )}
                      {linea.esLibre && !linea.itemId && (
                        <span className="ml-1 text-label-md font-normal text-on-surface-variant">
                          (fuera de catálogo)
                        </span>
                      )}
                    </p>
                    <button
                      type="button"
                      className="shrink-0 text-error"
                      onClick={() => quitarLinea(linea.id)}
                      aria-label="Quitar"
                    >
                      <Icon name="delete" className="text-[18px]" />
                    </button>
                  </div>
                  {linea.esLibre && (
                    <Input
                      aria-label="Costo de compra"
                      value={linea.costoUnitario}
                      onChange={(e) => actualizarLinea(linea.id, { costoUnitario: e.target.value })}
                      placeholder="Costo de compra"
                      className="h-7 w-32 text-label-md"
                    />
                  )}
                  {item?.tipo === "SERVICIO" && (
                    <Input
                      aria-label="Costo del servicio"
                      value={linea.costoServicio}
                      onChange={(e) => actualizarLinea(linea.id, { costoServicio: e.target.value })}
                      placeholder="Costo del servicio"
                      className="h-7 w-36 text-label-md"
                    />
                  )}
                  {ganancia && (
                    <p className="text-label-md text-on-surface-variant">
                      Ganancia: {ganancia.ganancia} ({formatearMargen(ganancia.margen)}%)
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
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
                          className="p-1 text-on-surface-variant transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-40"
                          disabled={
                            !linea.esLibre &&
                            item?.tipo === "PRODUCTO" &&
                            new Decimal(linea.cantidad || "0").greaterThanOrEqualTo(item.stockActual)
                          }
                          onClick={() => {
                            // Mismo tope que al agregar desde el catálogo: no
                            // deja subir la cantidad de esta línea más allá
                            // del stock real del ítem.
                            if (
                              !linea.esLibre &&
                              item?.tipo === "PRODUCTO" &&
                              new Decimal(linea.cantidad || "0").greaterThanOrEqualTo(item.stockActual)
                            ) {
                              return;
                            }
                            actualizarLinea(linea.id, {
                              cantidad: new Decimal(linea.cantidad || "0").plus(1).toString(),
                            });
                          }}
                        >
                          <Icon name="add" className="text-[16px]" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-body-md text-on-surface-variant">1 unidad</span>
                    )}
                    <Input
                      aria-label="Precio unitario"
                      value={linea.precioUnitario}
                      inputMode="decimal"
                      className="h-8 w-24 text-right text-body-md"
                      onChange={(e) => actualizarLinea(linea.id, { precioUnitario: e.target.value })}
                    />
                  </div>
                  <div className="flex items-center justify-between text-label-lg font-medium text-on-surface">
                    <span className="text-label-md font-normal text-on-surface-variant">Total</span>
                    {formatearMonto(lineaTotal, codigoMonedaBase)}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="flex flex-col gap-3 p-4 sm:p-5">
            <div className="flex justify-between border-b border-outline-variant pb-3 text-body-md">
              <span className="text-on-surface-variant">Subtotal ({lineas.length} ítems)</span>
              <span className="text-on-surface">{formatearMonto(subtotal, codigoMonedaBase)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-headline-sm font-semibold text-on-surface">Total</span>
              <span className="text-headline-md font-bold text-success">{formatearMonto(total, codigoMonedaBase)}</span>
            </div>

            {(formaCobro === "CREDITO_CLIENTE" || formaCobro === "EFECTIVO") && (
              <div className="mt-2 flex flex-col gap-3 border-t border-outline-variant pt-3">
                {formaCobro === "CREDITO_CLIENTE" && (
                  <FormField htmlFor="cliente-venta" label="Cliente (requerido)" error={clienteError ?? undefined}>
                    <Input id="cliente-venta" value={cliente} onChange={(e) => setCliente(e.target.value)} />
                  </FormField>
                )}

                {formaCobro === "EFECTIVO" && (
                  <>
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
                          Se calcula solo: {formatearMonto(total, codigoMonedaBase)} ÷ cotización — ajustalo si el
                          cliente redondeó. Se acredita en la cuenta de {monedaSeleccionada?.codigo}, nunca en la de{" "}
                          {codigoMonedaBase}.
                        </p>
                      </Card>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        </Card>

        {/* Métodos de cobro — mismo bento 2x2 que Stitch, mapeado 1:1 a
            nuestro dominio `formaCobro` (EFECTIVO/TARJETA/BANCO/CREDITO_CLIENTE).
            Transferencia y Tarjeta preguntan a qué cuenta entra el dinero
            (puede haber más de una cuenta bancaria receptora). Efectivo no
            pregunta cuenta — a pedido, ya eligió la moneda arriba y esa
            decide la caja (se preselecciona sola); Crédito tampoco pregunta
            porque no entra dinero todavía. */}
        <div className="flex flex-col gap-2">
          {/* Botones más chicos y horizontales en mobile/tablet (a pedido) —
              apilado grande (ícono arriba, texto abajo) recién desde `lg`,
              donde hay más lugar; por debajo, ícono + texto en una fila
              compacta ocupan menos alto dentro de la hoja del resumen. */}
          <div className="grid grid-cols-4 gap-1.5 lg:gap-2">
            {FORMAS_COBRO.map((fc) => (
              <button
                key={fc.value}
                type="button"
                onClick={() => setFormaCobro(fc.value)}
                className={`flex flex-col items-center justify-center gap-1 rounded border p-1.5 text-[10px] transition-colors lg:gap-1 lg:p-3 lg:text-label-md ${
                  formaCobro === fc.value
                    ? COLOR_SELECCION[fc.value]
                    : "border-outline-variant bg-surface text-on-surface hover:border-tertiary"
                }`}
              >
                <Icon name={fc.icon} className="text-[16px] lg:text-[20px]" />
                <span className="text-center leading-tight">{fc.label}</span>
              </button>
            ))}
          </div>

          {(formaCobro === "BANCO" || formaCobro === "TARJETA") && (
            <Card className="flex flex-col gap-2 border-secondary/40 bg-secondary-container/20 p-3">
              {(() => {
                const candidatas = cuentasCajaYBanco.filter(
                  (c) => c.tipo === tipoCuentaDestino && c.monedaId === monedaId
                );
                const label =
                  formaCobro === "BANCO"
                    ? "¿A qué cuenta entra la transferencia?"
                    : "¿A qué cuenta entra el pago con tarjeta?";
                return candidatas.length === 0 ? (
                  <p className="text-label-md text-warning-text">
                    No hay cuentas en {monedaSeleccionada?.codigo ?? "esa moneda"} — creá una en Caja.
                  </p>
                ) : (
                  <FormField htmlFor="cuenta-financiera-venta" label={label}>
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

        <Button
          type="submit"
          disabled={isSubmitting}
          className="flex w-full items-center justify-center gap-2 py-4 text-headline-sm"
        >
          <Icon name="point_of_sale" className="text-[22px]" />
          <span>Registrar venta</span>
          <span className="ml-auto">{formatearMonto(total, codigoMonedaBase)}</span>
        </Button>

        {serverMessage && (
          <p role="alert" className="text-sm text-danger">
            {serverMessage}
          </p>
        )}

        {/* Historial solo en desktop — a pedido, en mobile no debe estar (ni
            siquiera dentro de la hoja del resumen): `hidden` lo saca del
            flujo por completo ahí, `lg:contents` en desktop hace que sus
            hijos se comporten como si no hubiera wrapper (no rompe el
            `gap` del flex de la columna). */}
        <div className="hidden lg:contents">{historial}</div>
      </div>
    </form>
  );
}
