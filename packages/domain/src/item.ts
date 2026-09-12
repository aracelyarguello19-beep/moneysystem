import Decimal from "decimal.js";

// [Source: architecture/data-models.md#Item]
export interface Item {
  id: string;
  negocioId: string;
  tipo: "PRODUCTO" | "SERVICIO";
  nombre: string;
  precioVenta: string; // Decimal serializado — nunca `number`
  monedaId: string;
  costoCompra: string | null;
  stockActual: string; // "0" para Servicio, siempre
  tieneMovimientos: boolean;
  imagenUrl: string | null;
  // Solo Producto: identidad de variante (ej. dos números de calce del mismo
  // modelo son dos Item distintos, cada uno con su propio stock/costo) y
  // proveedor habitual — metadata de catálogo, nunca se lee del historial de
  // compras (cada Compra tiene su propio `proveedor` puntual).
  nroCalce: string | null;
  proveedor: string | null;
}

export class TipoItemBloqueadoError extends Error {
  constructor() {
    super("No se puede cambiar el tipo de un ítem que ya tiene movimientos asociados.");
    this.name = "TipoItemBloqueadoError";
  }
}

export class ItemConMovimientosError extends Error {
  constructor() {
    super("Este producto ya tiene compras o ventas registradas — no se puede eliminar.");
    this.name = "ItemConMovimientosError";
  }
}

// Borrar un ítem con movimientos asociados corrompería el histórico: a
// diferencia de CuentaFinanciera (Compra/Venta → item_id es `onDelete:
// Cascade` en el schema, ver database-schema.md), no hay FK que lo bloquee
// solo — el borrado se ejecutaría igual y se llevaría puesta cada Compra y
// VentaItem que lo referencia, rompiendo CMV/CSV histórico. Este guard es la
// única barrera, así que se aplica siempre antes de borrar.
export function assertItemEliminable(item: Pick<Item, "tieneMovimientos">): void {
  if (item.tieneMovimientos) {
    throw new ItemConMovimientosError();
  }
}

// AC3: el tipo no puede cambiarse después de tener movimientos (compras o
// ventas) asociados, para no corromper el histórico de CMV/CSV. Función pura
// para poder testearla sin infraestructura — resolver el ítem actual bajo
// `withRlsContext` es responsabilidad de quien la invoca.
export function assertCambioDeTipoPermitido(
  itemActual: Pick<Item, "tipo" | "tieneMovimientos">,
  nuevoTipo: Item["tipo"] | undefined
): void {
  if (nuevoTipo && nuevoTipo !== itemActual.tipo && itemActual.tieneMovimientos) {
    throw new TipoItemBloqueadoError();
  }
}

export class StockInsuficienteError extends Error {
  constructor(nombre: string, disponible: string) {
    super(`No hay stock suficiente de "${nombre}" (disponible: ${disponible}).`);
    this.name = "StockInsuficienteError";
  }
}

// A pedido: sin esto, el cliente podía agregar el mismo producto varias
// veces al carrito (una línea por click, en vez de acumular cantidad en
// una sola) y la venta se registraba igual aunque la suma pedida superara
// el stock real — dejando el ítem en stock negativo. Se valida acá, sumando
// TODA la cantidad pedida de un mismo ítem en la venta (no línea por línea:
// dos líneas de 1 unidad cada una contra un stock de 1 también deben
// rechazarse).
export function assertStockSuficiente(
  item: Pick<Item, "nombre" | "stockActual">,
  cantidadSolicitada: string
): void {
  if (new Decimal(cantidadSolicitada).greaterThan(item.stockActual)) {
    throw new StockInsuficienteError(item.nombre, item.stockActual);
  }
}

export interface GananciaProducto {
  ganancia: string;
  margen: string; // porcentaje sobre el precio de venta — mismo criterio que `margenGanancia` en Indicadores (Story 5.1), nunca sobre el costo
}

// Vista previa en vivo al cargar una venta (no participa del cálculo
// oficial de indicadores — ese usa `costoUnitario` congelado en la venta,
// ver Story de "Costo por venta"). "0" en cualquier valor vacío/no numérico
// para no romper el formulario mientras el usuario está tipeando.
export function calcularGananciaProducto(
  precioVenta: string,
  costoCompra: string
): GananciaProducto {
  const precio = new Decimal(precioVenta || "0");
  const costo = new Decimal(costoCompra || "0");
  const ganancia = precio.minus(costo);
  const margen = precio.isZero() ? new Decimal(0) : ganancia.dividedBy(precio).times(100);
  return { ganancia: ganancia.toString(), margen: margen.toString() };
}

// Costo promedio ponderado: cada compra nueva del mismo ítem recalcula el
// costo pesando por cantidad, en vez de pisarlo con el costo de la última
// compra sola — así dos compras a precios distintos del mismo producto
// (mismo id) quedan reflejadas en un único costo de referencia coherente.
// Se llama siempre con el stock/costo *previos* a aplicar la compra nueva.
// Dos variantes del mismo nombre (ej. dos números de calce) son ítems
// distintos con su propio id, así que esta función nunca los mezcla entre
// sí — cada uno tiene su propia línea de promedio.
export function calcularCostoPromedioPonderado(
  stockPrevio: string,
  costoPrevio: string | null,
  cantidadNueva: string,
  costoNuevo: string
): string {
  const stockPrevioDec = new Decimal(stockPrevio || "0");
  const costoPrevioDec = new Decimal(costoPrevio || "0");
  const cantidadDec = new Decimal(cantidadNueva || "0");
  const costoNuevoDec = new Decimal(costoNuevo || "0");

  const stockTotal = stockPrevioDec.plus(cantidadDec);
  if (stockTotal.lessThanOrEqualTo(0)) return costoNuevoDec.toString();

  const valorTotal = stockPrevioDec.times(costoPrevioDec).plus(cantidadDec.times(costoNuevoDec));
  return valorTotal.dividedBy(stockTotal).toString();
}
