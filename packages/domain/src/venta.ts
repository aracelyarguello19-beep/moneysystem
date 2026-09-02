import Decimal from "decimal.js";
import type { Item } from "./item";

export type FormaCobro = "EFECTIVO" | "BANCO" | "TARJETA" | "CREDITO_CLIENTE";
export type EstadoVenta = "ACTIVA" | "CANCELADA" | "DEVUELTA_PARCIAL";

// [Source: architecture/data-models.md#Venta / VentaItem]
export interface Venta {
  id: string;
  negocioId: string;
  cliente: string | null;
  fecha: Date;
  formaCobro: FormaCobro;
  impuesto: string; // alimenta Ingresos Netos, ver Epic 5
  estado: EstadoVenta;
  cuentaFinancieraId: string | null; // null si CREDITO_CLIENTE
  monedaId: string;
  tasaCambioId: string | null;
}

export interface VentaItem {
  id: string;
  ventaId: string;
  itemId: string;
  cantidad: string | null; // null para Servicio sin cantidad explícita
  precioUnitario: string;
  costoServicio: string | null; // solo Servicio — null tratado como 0, ver Story 3.2
  costoUnitario: string | null; // solo Producto, congelado al vender — null en filas previas a esta columna
  cantidadDevuelta: string; // acumulador de devoluciones parciales, ver Story 3.3
  // true = "venta libre" (sobre pedido, fuera de inventario): itemId solo
  // identifica el producto/modelo — no descuenta stock, y costoUnitario lo
  // tipea el usuario en el momento en vez de leerse del catálogo.
  esLibre: boolean;
}

// Forma extendida de `Venta`/`VentaItem` para vistas de listado/detalle —
// agrega el nombre y tipo del ítem (no vive en `venta_items`, se resuelve
// vía join con `items`). [Source: Story 3.2 Task 3]
export interface VentaConItems extends Venta {
  items: (VentaItem & { itemNombre: string; itemTipo: Item["tipo"] })[];
}

export class CantidadRequeridaError extends Error {
  constructor() {
    super("La cantidad es obligatoria (y mayor a cero) para ítems tipo Producto.");
    this.name = "CantidadRequeridaError";
  }
}

// AC3: un ítem Producto siempre reduce stock, por lo que necesita una
// cantidad válida; un Servicio puede vender sin cantidad explícita.
export function assertCantidadValidaParaVentaItem(
  item: Pick<Item, "tipo">,
  cantidad: string | null
): void {
  if (item.tipo === "PRODUCTO" && (cantidad === null || Number(cantidad) <= 0)) {
    throw new CantidadRequeridaError();
  }
}

export class CostoServicioInvalidoError extends Error {
  constructor() {
    super("El costo de servicio solo aplica a ítems tipo Servicio.");
    this.name = "CostoServicioInvalidoError";
  }
}

// Story 3.2, AC1: el costo de servicio solo tiene sentido para un ítem
// Servicio — un Producto usa `Item.costoCompra` (Story 2.1/2.2) para su
// costo, nunca `costoServicio`.
export function assertCostoServicioValido(
  item: Pick<Item, "tipo">,
  costoServicio: string | null | undefined
): void {
  if (item.tipo === "PRODUCTO" && costoServicio != null) {
    throw new CostoServicioInvalidoError();
  }
}

export class DevolucionExcedeCantidadError extends Error {
  constructor() {
    super("La cantidad a devolver excede lo que queda pendiente de esa línea.");
    this.name = "DevolucionExcedeCantidadError";
  }
}

// AC1/AC3, Story 3.3: no se puede devolver más de lo que la línea todavía
// tiene pendiente (cantidad original menos lo ya devuelto). Un Servicio sin
// cantidad explícita cuenta como 1 unidad devolvible, igual que en
// `calcularTotalVenta`.
export function assertDevolucionValida(
  ventaItem: Pick<VentaItem, "cantidad" | "cantidadDevuelta">,
  cantidadADevolver: string
): void {
  const original = new Decimal(ventaItem.cantidad ?? "1");
  const pendiente = original.minus(new Decimal(ventaItem.cantidadDevuelta));
  if (new Decimal(cantidadADevolver).greaterThan(pendiente)) {
    throw new DevolucionExcedeCantidadError();
  }
}

// AC1: una venta queda `CANCELADA` cuando todas sus líneas están totalmente
// devueltas, `DEVUELTA_PARCIAL` cuando al menos una tiene alguna devolución
// (sin llegar todas al total), o `ACTIVA` si ninguna tiene devolución. Story
// 3.1 ya deja la venta en `ACTIVA` al crearla; esta función solo se invoca
// tras aplicar una devolución, por lo que el caso `ACTIVA` es defensivo.
export function calcularEstadoVenta(
  items: Pick<VentaItem, "cantidad" | "cantidadDevuelta">[]
): EstadoVenta {
  const totalmenteDevueltos = items.every((item) => {
    const original = new Decimal(item.cantidad ?? "1");
    return new Decimal(item.cantidadDevuelta).greaterThanOrEqualTo(original);
  });
  if (totalmenteDevueltos) return "CANCELADA";

  const algunaDevolucion = items.some((item) => new Decimal(item.cantidadDevuelta).greaterThan(0));
  return algunaDevolucion ? "DEVUELTA_PARCIAL" : "ACTIVA";
}

// Total de la venta = suma de precioUnitario × cantidad por ítem. Un
// Servicio sin cantidad explícita cuenta como 1 unidad (no es divisible por
// cantidad de la misma forma que un Producto). Función pura con `decimal.js`
// (nunca aritmética de punto flotante de JS) para poder testearla sin
// infraestructura y reutilizarla tanto en el servidor como, a futuro, en una
// vista previa del formulario.
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export function calcularTotalVenta(
  items: { precioUnitario: string; cantidad: string | null }[]
): string {
  const total = items.reduce((acc, item) => {
    const cantidad = new Decimal(item.cantidad ?? "1");
    return acc.plus(new Decimal(item.precioUnitario).times(cantidad));
  }, new Decimal(0));

  return total.toString();
}
