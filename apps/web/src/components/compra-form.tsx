"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Decimal from "decimal.js";
import type { Compra, Item, Moneda } from "@repo/domain";
import { convertirAGuaranies } from "@repo/domain";
import { registrarCompra } from "@/actions/inventario/registrar-compra";
import { crearItem } from "@/actions/inventario/crear-item";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarCompras } from "@/actions/inventario/listar-compras";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { listarTasasCambio, type MonedaConTasa } from "@/actions/catalogos/listar-tasas-cambio";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { ProductoBuscador, etiquetaProducto } from "@/components/producto-buscador";
import { emitirInventarioCambiado, useInventarioCambiado } from "@/lib/inventario-events";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { claseIconoMoneda, formatearMonto } from "@/lib/moneda";

const FORMAS_PAGO: Compra["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"];

// Orden fijo de los botones de moneda — mismos 3 códigos que ya reconoce
// `apps/web/src/lib/moneda.ts` (PYG/BRL/USD → Gs/R$/USD). Solo se muestra el
// botón de una moneda si el negocio la tiene cargada en su catálogo.
const CODIGOS_MONEDA_BOTON = ["PYG", "BRL", "USD"] as const;

interface VarianteCompraForm {
  nroCalce: string;
}

function nuevaVarianteCompraVacia(): VarianteCompraForm {
  return { nroCalce: "" };
}

interface LineaCompraForm {
  id: string;
  itemId: string;
  costoUnitario: string;
  cantidad: string;
  monedaId: string;
  cotizacion: string; // "" cuando `monedaId` es la moneda oficial
}

// Carga diferida: `ImagenItemUpload` trae el cliente completo de
// Supabase Storage, que no hace falta hasta que se abre el formulario de
// nuevo producto (mismo patrón que item-catalogo.tsx).
const ImagenItemUpload = dynamic(
  () => import("@/components/imagen-item-upload").then((m) => m.ImagenItemUpload),
  { ssr: false }
);

type CompraListada = Compra & { itemNombre: string; itemNroCalce: string | null };

// AC2: solo ítems tipo Producto aparecen como opción — un Servicio nunca se
// ofrece en este formulario (defensa en profundidad; la Server Action lo
// rechaza igual si llegara). Permite crear el producto sin salir de esta
// pantalla (mismo patrón que Ventas): se crea con stock 0 y es la propia
// compra la que lo carga al inventario, para no contar el stock dos veces.
// El historial es el registro tal cual se compró — el promedio ponderado
// que combina compras del mismo ítem vive en Inventario, no acá.
//
// La compra es una lista/carrito (mismo patrón que RegistrarVentaForm): se
// agregan una o más líneas (producto + costo + cantidad) y se registran
// todas juntas con un mismo proveedor/fecha/forma de pago/cuenta — cubre el
// caso de comprarle varios productos distintos al mismo proveedor de una
// sola vez (ver registrar-compra.ts, que crea una fila de Compra por línea).
//
// Cada línea tiene SU PROPIA moneda (botones Gs/R$/USD): un producto puede
// venir de un proveedor que cobra en dólares y otro en guaraníes dentro de
// la misma compra. El subtotal de cada línea se muestra en su propia
// moneda; el total de la compra siempre se muestra convertido a Guaraníes
// (con la cotización cargada en cada línea extranjera). Esa cotización
// pasa a ser la vigente del sistema para esa moneda (ver registrar-compra.ts).
export function CompraForm({ negocioId }: { negocioId: string }) {
  const [productos, setProductos] = useState<Item[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [tasas, setTasas] = useState<MonedaConTasa[]>([]);
  const [historial, setHistorial] = useState<CompraListada[]>([]);
  const [serverMessage, setServerMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [lineas, setLineas] = useState<LineaCompraForm[]>([]);
  const [stagingItemId, setStagingItemId] = useState("");
  const [stagingMonedaId, setStagingMonedaId] = useState("");
  const [stagingCosto, setStagingCosto] = useState("");
  const [stagingCantidad, setStagingCantidad] = useState("1");
  const [stagingCotizacion, setStagingCotizacion] = useState("");

  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [proveedor, setProveedor] = useState("");
  const [formaPago, setFormaPago] = useState<Compra["formaPago"]>("EFECTIVO");
  const [cuentaFinancieraId, setCuentaFinancieraId] = useState("");

  const [creandoProducto, setCreandoProducto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoCostoUnitario, setNuevoCostoUnitario] = useState("");
  const [variantes, setVariantes] = useState<VarianteCompraForm[]>([nuevaVarianteCompraVacia()]);
  const [nuevaImagenUrl, setNuevaImagenUrl] = useState<string | null>(null);
  const [nuevoMensaje, setNuevoMensaje] = useState<string | null>(null);
  const [creandoEnProgreso, setCreandoEnProgreso] = useState(false);

  function actualizarVariante(index: number, valor: string) {
    setVariantes((actuales) => actuales.map((v, i) => (i === index ? { nroCalce: valor } : v)));
  }

  function agregarVariante() {
    setVariantes((actuales) => [...actuales, nuevaVarianteCompraVacia()]);
  }

  function quitarVariante(index: number) {
    setVariantes((actuales) => (actuales.length > 1 ? actuales.filter((_, i) => i !== index) : actuales));
  }

  const monedaPorId = (id: string) => monedas.find((m) => m.id === id);
  const monedaBase = monedas.find((m) => m.esBase);
  const monedasBoton = CODIGOS_MONEDA_BOTON.map((codigo) => monedas.find((m) => m.codigo === codigo)).filter(
    (m): m is Moneda => !!m
  );

  function vigenteDe(monedaId: string): string {
    return tasas.find((t) => t.moneda.id === monedaId)?.tasaVigente?.tasa ?? "";
  }

  function onSeleccionarMonedaStaging(m: Moneda) {
    setStagingMonedaId(m.id);
    setStagingCotizacion(m.esBase ? "" : vigenteDe(m.id));
  }

  function onSeleccionarStagingProducto(itemId: string) {
    setStagingItemId(itemId);
    const item = productos.find((p) => p.id === itemId);
    const esBase = monedaPorId(stagingMonedaId)?.esBase ?? true;
    if (item?.costoCompra && !stagingCosto && esBase) {
      setStagingCosto(item.costoCompra);
    }
  }

  const stagingEsBase = monedaPorId(stagingMonedaId)?.esBase ?? true;
  const listoParaAgregar =
    !!stagingItemId &&
    !!stagingCosto &&
    Number(stagingCantidad) > 0 &&
    (stagingEsBase || (!!stagingCotizacion && Number(stagingCotizacion) > 0));

  function agregarLinea() {
    if (!listoParaAgregar) return;
    setLineas((actuales) => [
      ...actuales,
      {
        id: crypto.randomUUID(),
        itemId: stagingItemId,
        costoUnitario: stagingCosto,
        cantidad: stagingCantidad,
        monedaId: stagingMonedaId,
        cotizacion: stagingEsBase ? "" : stagingCotizacion,
      },
    ]);
    setStagingItemId("");
    setStagingCosto("");
    setStagingCantidad("1");
    // La moneda/cotización quedan tal cual: agregar varias líneas seguidas
    // del mismo proveedor (misma moneda, misma cotización) es el caso común.
  }

  function actualizarLinea(id: string, cambios: Partial<LineaCompraForm>) {
    setLineas((actuales) => actuales.map((l) => (l.id === id ? { ...l, ...cambios } : l)));
  }

  function quitarLinea(id: string) {
    setLineas((actuales) => actuales.filter((l) => l.id !== id));
  }

  function itemPorId(itemId: string): Item | undefined {
    return productos.find((p) => p.id === itemId);
  }

  function subtotalLinea(l: Pick<LineaCompraForm, "costoUnitario" | "cantidad">): Decimal {
    return new Decimal(l.costoUnitario || "0").times(l.cantidad || "0");
  }

  function subtotalLineaEnGs(l: LineaCompraForm): Decimal {
    const moneda = monedaPorId(l.monedaId);
    const esBase = moneda?.esBase ?? true;
    return new Decimal(
      convertirAGuaranies({
        monto: subtotalLinea(l).toString(),
        esMonedaBase: esBase,
        tasa: esBase ? null : l.cotizacion || "0",
      })
    );
  }

  const cargar = useCallback(async () => {
    const [itemsResult, monedasResult, historialResult, tasasResult] = await Promise.all([
      listarItems(negocioId),
      listarMonedas(negocioId),
      listarCompras(negocioId),
      listarTasasCambio(negocioId),
    ]);
    if (itemsResult.ok) {
      const soloProductos = itemsResult.data.filter((i) => i.tipo === "PRODUCTO");
      setProductos(soloProductos);
    }
    if (monedasResult.ok) {
      const activas = monedasResult.data.filter((m) => m.activa);
      setMonedas(activas);
      setStagingMonedaId((actual) => actual || activas.find((m) => m.esBase)?.id || "");
    }
    if (historialResult.ok) setHistorial(historialResult.data);
    if (tasasResult.ok) setTasas(tasasResult.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioCambiado(cargar);

  // Cada variante (nro de calce) declarada crea su propio Item, igual que en
  // Inventario (ver item-catalogo.tsx) — todas arrancan con stock 0 y en la
  // moneda oficial. En vez de pedir acá la cantidad de cada variante, cada
  // una queda agregada a la lista de la compra con su cantidad vacía: se
  // completa como cualquier otra línea (un solo lugar para cargar cantidades).
  async function onCrearProducto() {
    if (!monedaBase) return;
    setNuevoMensaje(null);
    setCreandoEnProgreso(true);
    const nuevasLineas: LineaCompraForm[] = [];
    for (const variante of variantes) {
      const result = await crearItem(negocioId, {
        tipo: "PRODUCTO",
        nombre: nuevoNombre,
        precioVenta: "0",
        monedaId: monedaBase.id,
        costoCompra: nuevoCostoUnitario || "0",
        stockActual: "0",
        nroCalce: variante.nroCalce.trim() || undefined,
        imagenUrl: nuevaImagenUrl ?? undefined,
      });
      if (!result.ok) {
        setNuevoMensaje(result.error.message);
        setCreandoEnProgreso(false);
        if (nuevasLineas.length > 0) {
          setLineas((actuales) => [...actuales, ...nuevasLineas]);
          await cargar();
          emitirInventarioCambiado();
        }
        return;
      }
      nuevasLineas.push({
        id: crypto.randomUUID(),
        itemId: result.data.id,
        costoUnitario: nuevoCostoUnitario || "0",
        cantidad: "",
        monedaId: monedaBase.id,
        cotizacion: "",
      });
    }
    setCreandoEnProgreso(false);
    await cargar();
    emitirInventarioCambiado();
    setLineas((actuales) => [...actuales, ...nuevasLineas]);
    setCreandoProducto(false);
    setNuevoNombre("");
    setNuevoCostoUnitario("");
    setVariantes([nuevaVarianteCompraVacia()]);
    setNuevaImagenUrl(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setServerMessage(null);

    if (lineas.length === 0) {
      setServerMessage("Agregá al menos un producto a la lista.");
      return;
    }
    if (lineas.some((l) => !l.costoUnitario || !l.cantidad || Number(l.cantidad) <= 0)) {
      setServerMessage("Completá el costo y la cantidad de todos los productos de la lista.");
      return;
    }
    if (lineas.some((l) => !(monedaPorId(l.monedaId)?.esBase ?? true) && Number(l.cotizacion) <= 0)) {
      setServerMessage("Cargá la cotización de hoy de todos los productos en moneda extranjera.");
      return;
    }

    setIsSubmitting(true);
    const result = await registrarCompra(negocioId, {
      items: lineas.map((l) => ({
        itemId: l.itemId,
        costoUnitario: l.costoUnitario,
        cantidad: l.cantidad,
        monedaId: l.monedaId,
        cotizacion: l.cotizacion || undefined,
      })),
      fecha,
      proveedor: proveedor || undefined,
      formaPago,
      cuentaFinancieraId: formaPago === "CREDITO_PROVEEDOR" ? null : cuentaFinancieraId,
    });

    setIsSubmitting(false);
    if (!result.ok) {
      setServerMessage(result.error.message);
      return;
    }
    setLineas([]);
    setProveedor("");
    await cargar();
    emitirInventarioCambiado();
  }

  const total = lineas.reduce((acumulado, l) => acumulado.plus(subtotalLineaEnGs(l)), new Decimal(0));

  // Un subtotal por cada moneda distinta usada en la lista (agrupa las
  // líneas que comparten moneda) — se muestra arriba del total en
  // Guaraníes, en la moneda en la que se cargó el costo de esas líneas, con
  // la cantidad total de unidades de ese grupo.
  const subtotalesPorMoneda = Array.from(
    lineas.reduce((grupos, l) => {
      const actual = grupos.get(l.monedaId) ?? { subtotal: new Decimal(0), cantidad: new Decimal(0) };
      grupos.set(l.monedaId, {
        subtotal: actual.subtotal.plus(subtotalLinea(l)),
        cantidad: actual.cantidad.plus(l.cantidad || "0"),
      });
      return grupos;
    }, new Map<string, { subtotal: Decimal; cantidad: Decimal }>())
  ).map(([monedaId, valores]) => ({ moneda: monedaPorId(monedaId), ...valores }));

  return (
    <div className="flex flex-col gap-4">
      {productos.length === 0 && !creandoProducto && (
        <p className="text-sm text-muted">
          Todavía no tenés productos en el catálogo de este negocio. Creá el primero para
          registrar tu primera compra.
        </p>
      )}

      <Button
        type="button"
        variant="link"
        className="justify-self-start"
        onClick={() => {
          setCreandoProducto(true);
          setNuevoMensaje(null);
        }}
      >
        + Nuevo producto
      </Button>

      {creandoProducto && (
        <div className="grid grid-cols-1 items-end gap-3 rounded border border-dashed p-3 sm:grid-cols-2">
          <FormField htmlFor="nuevo-nombre-compra" label="Nombre del producto">
            <Input
              id="nuevo-nombre-compra"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="nuevo-costo-compra" label={`Costo unitario (${monedaBase?.codigo ?? ""})`}>
            <Input
              id="nuevo-costo-compra"
              value={nuevoCostoUnitario}
              onChange={(e) => setNuevoCostoUnitario(e.target.value)}
              inputMode="decimal"
              placeholder="0"
            />
          </FormField>
          <FormField htmlFor="nueva-imagen-compra" label="Foto del producto (opcional)">
            <ImagenItemUpload value={nuevaImagenUrl} onChange={setNuevaImagenUrl} />
          </FormField>

          <div className="flex flex-col gap-2 sm:col-span-2">
            <p className="text-label-md font-semibold text-on-surface-variant">
              Variantes (nro de calce)
            </p>
            {variantes.map((variante, index) => (
              <div key={index} className="flex flex-wrap items-end gap-2">
                <FormField
                  htmlFor={`nuevo-nro-calce-compra-${index}`}
                  label="Nro de calce (opcional)"
                  className="w-40"
                >
                  <Input
                    id={`nuevo-nro-calce-compra-${index}`}
                    value={variante.nroCalce}
                    onChange={(e) => actualizarVariante(index, e.target.value)}
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

          <p className="text-xs text-muted sm:col-span-2">
            El costo unitario cargado arriba ({nuevoCostoUnitario || "0"}) queda como su costo inicial.
            {variantes.length > 1 &&
              " Se va a crear un producto por cada variante y se agregan todas a la lista de esta compra — completá la cantidad de cada una ahí abajo."}
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={!nuevoNombre.trim() || creandoEnProgreso}
              onClick={onCrearProducto}
            >
              Crear y agregar a la lista
            </Button>
            <Button
              type="button"
              variant="link"
              onClick={() => {
                setCreandoProducto(false);
                setNuevaImagenUrl(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          {nuevoMensaje && (
            <p role="alert" className="text-xs text-danger sm:col-span-2">
              {nuevoMensaje}
            </p>
          )}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {/* Agregar producto a la lista — mismo criterio que "venta libre" en
            RegistrarVentaForm: se completan los campos de la línea y un
            botón "Agregar" la suma al carrito, en vez de un <select> con
            submit directo. Los botones de moneda eligen en qué moneda está
            el costo unitario de ESTE producto — no toda la compra. */}
        <div className="flex flex-col gap-3 rounded border border-outline-variant p-3">
          <FormField htmlFor="item-compra" label="Producto">
            <ProductoBuscador
              id="item-compra"
              productos={productos}
              value={stagingItemId}
              onChange={onSeleccionarStagingProducto}
            />
          </FormField>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-label-md text-on-surface-variant">Moneda del costo:</span>
            {monedasBoton.map((m) => (
              <Button
                key={m.id}
                type="button"
                size="sm"
                variant={stagingMonedaId === m.id ? "primary" : "outline"}
                onClick={() => onSeleccionarMonedaStaging(m)}
              >
                {m.codigo === "PYG" ? "Gs" : m.codigo === "BRL" ? "R$" : "U$S"}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <FormField
              htmlFor="costo-unitario-staging"
              label={`Costo unitario${monedaPorId(stagingMonedaId) ? ` (${monedaPorId(stagingMonedaId)!.codigo})` : ""}`}
            >
              <Input
                id="costo-unitario-staging"
                value={stagingCosto}
                onChange={(e) => setStagingCosto(e.target.value)}
                inputMode="decimal"
                placeholder="0"
              />
            </FormField>
            {!stagingEsBase && (
              <FormField
                htmlFor="cotizacion-staging"
                label={`Cotización de hoy (1 ${monedaPorId(stagingMonedaId)?.codigo} en ${monedaBase?.codigo ?? "Gs"})`}
              >
                <Input
                  id="cotizacion-staging"
                  value={stagingCotizacion}
                  onChange={(e) => setStagingCotizacion(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                />
              </FormField>
            )}
            <FormField htmlFor="cantidad-staging" label="Cantidad">
              <Input
                id="cantidad-staging"
                value={stagingCantidad}
                onChange={(e) => setStagingCantidad(e.target.value)}
                inputMode="numeric"
              />
            </FormField>
            <Button
              type="button"
              variant="outline"
              disabled={!listoParaAgregar}
              onClick={agregarLinea}
              className="w-fit gap-1"
            >
              <Icon name="add" className="text-[18px]" />
              Agregar a la lista
            </Button>
          </div>
        </div>

        {/* Lista/carrito de la compra — una o más líneas, todas registradas
            juntas con el mismo proveedor/fecha/forma de pago/cuenta. Cada
            línea conserva la moneda con la que se agregó; el subtotal se
            muestra en esa moneda y el total de abajo, convertido a Gs. */}
        <div className="overflow-hidden rounded border border-outline-variant">
          {lineas.length === 0 ? (
            <p className="px-4 py-6 text-center text-body-md text-on-surface-variant">
              Todavía no agregaste ningún producto a esta compra.
            </p>
          ) : (
            <div className="flex flex-col divide-y divide-outline-variant">
              {lineas.map((linea) => {
                const item = itemPorId(linea.itemId);
                const moneda = monedaPorId(linea.monedaId);
                const subtotal = subtotalLinea(linea);
                return (
                  <div
                    key={linea.id}
                    className="flex flex-wrap items-end gap-2 bg-surface-container-lowest px-3 py-2"
                  >
                    <div className="min-w-[140px] flex-1">
                      <p className="text-label-lg font-medium text-on-surface">
                        {item ? etiquetaProducto(item) : "Producto"}
                      </p>
                      <p className="text-label-md text-on-surface-variant">{moneda?.codigo ?? "—"}</p>
                    </div>
                    <FormField
                      htmlFor={`linea-costo-${linea.id}`}
                      label={`Costo unitario${moneda ? ` (${moneda.codigo})` : ""}`}
                      className="w-28"
                    >
                      <Input
                        id={`linea-costo-${linea.id}`}
                        value={linea.costoUnitario}
                        onChange={(e) => actualizarLinea(linea.id, { costoUnitario: e.target.value })}
                        inputMode="decimal"
                      />
                    </FormField>
                    <FormField htmlFor={`linea-cantidad-${linea.id}`} label="Cantidad" className="w-24">
                      <Input
                        id={`linea-cantidad-${linea.id}`}
                        value={linea.cantidad}
                        onChange={(e) => actualizarLinea(linea.id, { cantidad: e.target.value })}
                        inputMode="numeric"
                        placeholder="0"
                      />
                    </FormField>
                    <div className="w-28 text-right text-label-lg font-medium text-on-surface">
                      {formatearMonto(subtotal.toString(), moneda?.codigo)}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => quitarLinea(linea.id)}
                      aria-label="Quitar de la lista"
                    >
                      <Icon name="delete" className="text-[18px]" />
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-col gap-1 bg-surface-container-low px-4 py-3">
                {subtotalesPorMoneda.map(({ moneda, subtotal, cantidad }, indice) => (
                  <div
                    key={moneda?.id ?? "sin-moneda"}
                    className={`flex items-center justify-between text-body-md font-medium ${claseIconoMoneda(moneda?.codigo, indice)}`}
                  >
                    <span>
                      Subtotal {moneda?.codigo} ({cantidad.toString()} {cantidad.equals(1) ? "unidad" : "unidades"})
                    </span>
                    <span>{formatearMonto(subtotal.toString(), moneda?.codigo)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between">
                  <span className="text-label-lg font-semibold text-on-surface">
                    Total ({lineas.length} {lineas.length === 1 ? "producto" : "productos"})
                  </span>
                  <span className="text-headline-sm font-bold text-on-surface">
                    {formatearMonto(total.toString(), monedaBase?.codigo)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Datos compartidos por toda la compra (proveedor/fecha/forma de
            pago/cuenta) — se aplican a todas las líneas de la lista. */}
        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField htmlFor="fecha-compra" label="Fecha">
            <Input
              id="fecha-compra"
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              required
            />
          </FormField>
          <FormField htmlFor="proveedor-compra" label="Proveedor (opcional)">
            <Input
              id="proveedor-compra"
              value={proveedor}
              onChange={(e) => setProveedor(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="forma-pago" label="Forma de pago">
            <Select
              id="forma-pago"
              value={formaPago}
              onChange={(e) => setFormaPago(e.target.value as Compra["formaPago"])}
            >
              {FORMAS_PAGO.map((fp) => (
                <option key={fp} value={fp}>
                  {fp}
                </option>
              ))}
            </Select>
          </FormField>
          {formaPago !== "CREDITO_PROVEEDOR" && (
            <CuentaFinancieraSelect
              id="cuenta-financiera"
              negocioId={negocioId}
              tipo={formaPago === "TARJETA" ? "TARJETA" : formaPago === "BANCO" ? "BANCO" : "CAJA"}
              value={cuentaFinancieraId}
              onChange={setCuentaFinancieraId}
              label="Cuenta financiera"
            />
          )}
        </div>

        <Button type="submit" disabled={isSubmitting || lineas.length === 0} className="w-fit">
          Registrar compra
        </Button>

        {serverMessage && (
          <p role="alert" className="text-sm text-danger">
            {serverMessage}
          </p>
        )}
      </form>

      {historial.length > 0 && (
        <div className="overflow-x-auto rounded border border-default">
          <table className="w-full min-w-[720px] border-collapse text-left">
            <thead className="bg-surface-container">
              <tr>
                <th className="px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Producto</th>
                <th className="px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Nro de calce</th>
                <th className="px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Cantidad</th>
                <th className="px-4 py-3 text-right text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Costo unitario</th>
                <th className="px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Proveedor</th>
                <th className="px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Forma de pago</th>
                <th className="px-4 py-3 text-label-md font-semibold uppercase tracking-wider text-on-surface-variant">Fecha</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {historial.map((c) => (
                <tr key={c.id}>
                  <td className="px-4 py-3 text-body-md text-on-surface">{c.itemNombre}</td>
                  <td className="px-4 py-3 text-body-md text-on-surface-variant">{c.itemNroCalce ?? "—"}</td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface">{c.cantidad}</td>
                  <td className="px-4 py-3 text-right text-body-md text-on-surface-variant">
                    {formatearMonto(c.costoUnitario, monedaPorId(c.monedaId)?.codigo)}
                  </td>
                  <td className="px-4 py-3 text-body-md text-on-surface-variant">{c.proveedor ?? "—"}</td>
                  <td className="px-4 py-3 text-body-md text-on-surface-variant">{c.formaPago}</td>
                  <td className="px-4 py-3 text-body-md text-on-surface-variant">
                    {c.fecha.toISOString().slice(0, 10)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
