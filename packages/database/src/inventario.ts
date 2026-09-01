import { Prisma } from "@prisma/client";
import type { ValorInventario } from "@repo/domain";

// Dinero como Decimal, nunca `number`: la multiplicación stock × costo se
// hace con `Prisma.Decimal` (decimal.js por debajo), nunca con aritmética de
// punto flotante de JS. Función pura — recibe filas ya resueltas bajo
// `withRlsContext`, no hace I/O — para poder testearla sin infraestructura.
// Filtra `tipo === "PRODUCTO"` internamente (AC4): aunque la query que arma
// esta lista ya debería filtrar por tipo, esta función no confía en eso — un
// Servicio nunca debe aportar valor de inventario, ni por descuido de quien
// arma la query de origen.
// [Source: architecture/coding-standards.md#Critical Fullstack Rules]
export function calcularValorInventario(
  items: {
    id: string;
    nombre: string;
    tipo: string;
    stockActual: Prisma.Decimal;
    costoCompra: Prisma.Decimal | null;
  }[]
): ValorInventario {
  let total = new Prisma.Decimal(0);

  const detalle = items
    .filter((item) => item.tipo === "PRODUCTO")
    .map((item) => {
      const costoCompra = item.costoCompra ?? new Prisma.Decimal(0);
      const valor = item.stockActual.times(costoCompra);
      total = total.plus(valor);

      return {
        itemId: item.id,
        nombre: item.nombre,
        stockActual: item.stockActual.toString(),
        costoCompra: costoCompra.toString(),
        valor: valor.toString(),
      };
    });

  return { items: detalle, total: total.toString() };
}
