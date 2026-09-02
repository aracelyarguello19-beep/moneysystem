"use client";

import { useCallback, useEffect, useState } from "react";
import type { Compra, Item, Moneda } from "@repo/domain";
import { registrarCompra } from "@/actions/inventario/registrar-compra";
import { crearItem } from "@/actions/inventario/crear-item";
import { listarItems } from "@/actions/inventario/listar-items";
import { listarMonedas } from "@/actions/catalogos/listar-monedas";
import { CuentaFinancieraSelect } from "@/components/cuenta-financiera-select";
import { emitirInventarioCambiado, useInventarioCambiado } from "@/lib/inventario-events";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";

const FORMAS_PAGO: Compra["formaPago"][] = ["EFECTIVO", "BANCO", "TARJETA", "CREDITO_PROVEEDOR"];

// AC2: solo ítems tipo Producto aparecen como opción — un Servicio nunca se
// ofrece en este formulario (defensa en profundidad; la Server Action lo
// rechaza igual si llegara). Permite crear el producto sin salir de esta
// pantalla (mismo patrón que Ventas): se crea con stock 0 y es la propia
// compra la que lo carga al inventario, para no contar el stock dos veces.
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

  const [creandoProducto, setCreandoProducto] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState("");
  const [nuevoPrecio, setNuevoPrecio] = useState("");
  const [nuevoMensaje, setNuevoMensaje] = useState<string | null>(null);
  const [creandoEnProgreso, setCreandoEnProgreso] = useState(false);

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

  useInventarioCambiado(cargar);

  async function onCrearProducto() {
    setNuevoMensaje(null);
    setCreandoEnProgreso(true);
    const result = await crearItem(negocioId, {
      tipo: "PRODUCTO",
      nombre: nuevoNombre,
      precioVenta: nuevoPrecio || "0",
      monedaId,
      // Stock arranca en 0: es "Registrar compra" quien lo carga al
      // confirmar, para no contar esta primera compra dos veces.
      costoCompra: costoUnitario || "0",
      stockActual: "0",
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
    setNuevoPrecio("");
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
    setCompras((prev) => [result.data, ...prev]);
    await cargar();
    emitirInventarioCambiado();
  }

  return (
    <div className="flex flex-col gap-4">
      {productos.length === 0 && !creandoProducto && (
        <p className="text-sm text-muted">
          Todavía no tenés productos en el catálogo de este negocio. Creá el primero para
          registrar tu primera compra.
        </p>
      )}

      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-2" noValidate>
        {productos.length > 0 && (
          <FormField htmlFor="item-compra" label="Producto">
            <Select id="item-compra" value={itemId} onChange={(e) => setItemId(e.target.value)}>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
          </FormField>
        )}
        <Button
          type="button"
          variant="link"
          onClick={() => {
            setCreandoProducto(true);
            setNuevoMensaje(null);
          }}
        >
          + Nuevo producto
        </Button>
        <FormField htmlFor="costo-unitario" label="Costo unitario">
          <Input
            id="costo-unitario"
            value={costoUnitario}
            onChange={(e) => setCostoUnitario(e.target.value)}
            required
            className="w-28"
          />
        </FormField>
        <FormField htmlFor="cantidad-compra" label="Cantidad">
          <Input
            id="cantidad-compra"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            required
            className="w-24"
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
            esTarjeta={formaPago === "TARJETA"}
            value={cuentaFinancieraId}
            onChange={setCuentaFinancieraId}
            label="Cuenta financiera"
          />
        )}
        <Button type="submit" disabled={isSubmitting || productos.length === 0}>
          Registrar compra
        </Button>
      </form>

      {creandoProducto && (
        <div className="flex flex-wrap items-end gap-2 rounded border border-dashed p-2">
          <FormField htmlFor="nuevo-nombre-compra" label="Nombre del producto">
            <Input
              id="nuevo-nombre-compra"
              value={nuevoNombre}
              onChange={(e) => setNuevoNombre(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="nuevo-precio-compra" label="Precio de venta">
            <Input
              id="nuevo-precio-compra"
              value={nuevoPrecio}
              onChange={(e) => setNuevoPrecio(e.target.value)}
              className="w-24"
            />
          </FormField>
          <p className="text-xs text-muted">
            El costo unitario cargado arriba ({costoUnitario || "0"}) queda como su costo inicial.
          </p>
          <Button
            type="button"
            size="sm"
            disabled={!nuevoNombre.trim() || creandoEnProgreso}
            onClick={onCrearProducto}
          >
            Crear y usar
          </Button>
          <Button type="button" variant="link" onClick={() => setCreandoProducto(false)}>
            Cancelar
          </Button>
          {nuevoMensaje && (
            <p role="alert" className="w-full text-xs text-danger">
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

      {compras.length > 0 && (
        <div className="flex flex-col gap-2">
          {compras.map((c) => (
            <Card key={c.id} className="text-sm">
              {c.cantidad} × {c.costoUnitario} — {c.formaPago}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
