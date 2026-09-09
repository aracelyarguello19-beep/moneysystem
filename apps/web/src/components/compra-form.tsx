"use client";

import { useCallback, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import type { Compra, Item, Moneda } from "@repo/domain";
import { registrarCompra } from "@/actions/inventario/registrar-compra";
import { crearItem } from "@/actions/inventario/crear-item";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarCompras } from "@/actions/inventario/listar-compras";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { ProductoBuscador } from "@/components/producto-buscador";
import { emitirInventarioCambiado, useInventarioCambiado } from "@/lib/inventario-events";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatearMonto } from "@/lib/moneda";

const FORMAS_PAGO: Compra["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"];

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
export function CompraForm({ negocioId }: { negocioId: string }) {
  const [productos, setProductos] = useState<Item[]>([]);
  const [monedas, setMonedas] = useState<Moneda[]>([]);
  const [historial, setHistorial] = useState<CompraListada[]>([]);
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

  const [creandoProducto, setCreandoProducto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoNroCalce, setNuevoNroCalce] = useState("");
  const [nuevaImagenUrl, setNuevaImagenUrl] = useState<string | null>(null);
  const [nuevoMensaje, setNuevoMensaje] = useState<string | null>(null);
  const [creandoEnProgreso, setCreandoEnProgreso] = useState(false);

  const cargar = useCallback(async () => {
    const [itemsResult, monedasResult, historialResult] = await Promise.all([
      listarItems(negocioId),
      listarMonedas(negocioId),
      listarCompras(negocioId),
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
    if (historialResult.ok) setHistorial(historialResult.data);
  }, [negocioId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useInventarioCambiado(cargar);

  async function onCrearProducto() {
    setNuevoMensaje(null);
    setCreandoEnProgreso(true);
    const result = await crearItem(negocioId, {
      tipo: "PRODUCTO",
      nombre: nuevoNombre,
      precioVenta: "0",
      monedaId,
      // Stock arranca en 0: es "Registrar compra" quien lo carga al
      // confirmar, para no contar esta primera compra dos veces.
      costoCompra: costoUnitario || "0",
      stockActual: "0",
      nroCalce: nuevoNroCalce.trim() || undefined,
      imagenUrl: nuevaImagenUrl ?? undefined,
    });
    setCreandoEnProgreso(false);
    if (!result.ok) {
      setNuevoMensaje(result.error.message);
      return;
    }
    await cargar();
    emitirInventarioCambiado();
    setItemId(result.data.id);
    setCreandoProducto(false);
    setNuevoNombre("");
    setNuevoNroCalce("");
    setNuevaImagenUrl(null);
  }

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
    await cargar();
    emitirInventarioCambiado();
  }

  const codigoMoneda = (monedaId: string) => monedas.find((m) => m.id === monedaId)?.codigo;

  return (
    <div className="flex flex-col gap-4">
      {productos.length === 0 && !creandoProducto && (
        <p className="text-sm text-muted">
          Todavía no tenés productos en el catálogo de este negocio. Creá el primero para
          registrar tu primera compra.
        </p>
      )}

      {/* Grid en vez de `flex flex-wrap`: 8 campos dimensionados por contenido
          (buscador de producto, selects de moneda/forma de pago/cuenta)
          desbordan la fila en mobile. Una columna hasta `sm`. */}
      <form
        onSubmit={onSubmit}
        className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-3"
        noValidate
      >
        <Button
          type="button"
          variant="link"
          className="justify-self-start sm:col-span-2 lg:col-span-3"
          onClick={() => {
            setCreandoProducto(true);
            setNuevoMensaje(null);
          }}
        >
          + Nuevo producto
        </Button>
        {productos.length > 0 && (
          <FormField htmlFor="item-compra" label="Producto">
            <ProductoBuscador id="item-compra" productos={productos} value={itemId} onChange={setItemId} />
          </FormField>
        )}
        <FormField htmlFor="costo-unitario" label="Costo unitario">
          <Input
            id="costo-unitario"
            value={costoUnitario}
            onChange={(e) => setCostoUnitario(e.target.value)}
            required
            inputMode="decimal"
          />
        </FormField>
        <FormField htmlFor="cantidad-compra" label="Cantidad">
          <Input
            id="cantidad-compra"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
            inputMode="numeric"
          />
        </FormField>
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
        <FormField htmlFor="moneda-compra" label="Moneda">
          <Select
            id="moneda-compra"
            value={monedaId}
            onChange={(e) => setMonedaId(e.target.value)}
            required
          >
            {monedas.map((m) => (
              <option key={m.id} value={m.id}>
                {m.codigo}
              </option>
            ))}
          </Select>
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
        <Button
          type="submit"
          disabled={isSubmitting || productos.length === 0}
          className="sm:col-span-2 sm:justify-self-start lg:col-span-3"
        >
          Registrar compra
        </Button>
      </form>

      {creandoProducto && (
        <div className="grid grid-cols-1 items-end gap-3 rounded border border-dashed p-3 sm:grid-cols-2">
          <FormField htmlFor="nuevo-nombre-compra" label="Nombre del producto">
            <Input
              id="nuevo-nombre-compra"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="nuevo-nro-calce-compra" label="Nro de calce (opcional)">
            <Input
              id="nuevo-nro-calce-compra"
              value={nuevoNroCalce}
              onChange={(e) => setNuevoNroCalce(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="nueva-imagen-compra" label="Foto del producto (opcional)">
            <ImagenItemUpload value={nuevaImagenUrl} onChange={setNuevaImagenUrl} />
          </FormField>
          <p className="text-xs text-muted sm:col-span-2">
            El costo unitario cargado arriba ({costoUnitario || "0"}) queda como su costo inicial.
          </p>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button
              type="button"
              size="sm"
              disabled={!nuevoNombre.trim() || creandoEnProgreso}
              onClick={onCrearProducto}
            >
              Crear y usar
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

      {serverMessage && (
        <p role="alert" className="text-sm text-danger">
          {serverMessage}
        </p>
      )}

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
                    {formatearMonto(c.costoUnitario, codigoMoneda(c.monedaId))}
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
