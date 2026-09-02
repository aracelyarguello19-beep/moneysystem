import Decimal from "decimal.js";

// "Producto estrella" y detalle de vendidos: agrupa por ítem, neto de
// devoluciones, ordenado de mayor a menor cantidad vendida — el primero de
// la lista es el producto estrella del período.
export interface ProductoVendidoResumen {
  itemId: string;
  nombre: string;
  cantidadVendida: string;
  ingresos: string;
}

export function calcularProductosVendidos(
  ventaItems: {
    itemId: string;
    itemNombre: string;
    cantidad: string | null;
    precioUnitario: string;
    cantidadDevuelta: string;
  }[]
): ProductoVendidoResumen[] {
  const acumulado = new Map<string, { nombre: string; cantidad: Decimal; ingresos: Decimal }>();

  for (const vi of ventaItems) {
    const cantidadNeta = new Decimal(vi.cantidad ?? "1").minus(vi.cantidadDevuelta);
    if (cantidadNeta.lessThanOrEqualTo(0)) continue;

    const ingresos = cantidadNeta.times(vi.precioUnitario);
    const actual = acumulado.get(vi.itemId) ?? {
      nombre: vi.itemNombre,
      cantidad: new Decimal(0),
      ingresos: new Decimal(0),
    };
    actual.cantidad = actual.cantidad.plus(cantidadNeta);
    actual.ingresos = actual.ingresos.plus(ingresos);
    acumulado.set(vi.itemId, actual);
  }

  return Array.from(acumulado.entries())
    .map(([itemId, v]) => ({
      itemId,
      nombre: v.nombre,
      cantidadVendida: v.cantidad.toString(),
      ingresos: v.ingresos.toString(),
    }))
    .sort((a, b) => Number(b.cantidadVendida) - Number(a.cantidadVendida));
}

// Desglose de gastos por tipo + ámbito (Negocio/Personal) — ordenado de
// mayor a menor total.
export interface GastoResumenTipo {
  tipoGastoId: string;
  nombre: string;
  clasificacion: string;
  ambito: string;
  total: string;
}

export function calcularResumenGastos(
  gastos: {
    tipoGastoId: string;
    tipoGastoNombre: string;
    clasificacion: string;
    ambito: string;
    monto: string;
  }[]
): GastoResumenTipo[] {
  const acumulado = new Map<
    string,
    { nombre: string; clasificacion: string; ambito: string; total: Decimal }
  >();

  for (const g of gastos) {
    const clave = `${g.tipoGastoId}:${g.ambito}`;
    const actual = acumulado.get(clave) ?? {
      nombre: g.tipoGastoNombre,
      clasificacion: g.clasificacion,
      ambito: g.ambito,
      total: new Decimal(0),
    };
    actual.total = actual.total.plus(g.monto);
    acumulado.set(clave, actual);
  }

  return Array.from(acumulado.entries())
    .map(([clave, v]) => ({
      tipoGastoId: clave,
      nombre: v.nombre,
      clasificacion: v.clasificacion,
      ambito: v.ambito,
      total: v.total.toString(),
    }))
    .sort((a, b) => Number(b.total) - Number(a.total));
}
