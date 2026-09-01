import Decimal from "decimal.js";

// No hay un tipo `IndicadoresFinancieros` explícito documentado en
// architecture/data-models.md — el AC1 enumera exactamente los campos
// requeridos. Se define acá siguiendo Type Sharing (Coding Standards),
// todo como `string` (Decimal serializado), nunca `number`.
// [Source: architecture/data-models.md#Venta / VentaItem, #Item, #Gasto, #TipoGasto]

export interface VentaItemIndicador {
  itemTipo: "PRODUCTO" | "SERVICIO";
  cantidad: string | null; // null → cuenta como 1, igual que en Story 3.1/3.3
  cantidadDevuelta: string;
  precioUnitario: string;
  costoServicio: string | null; // solo Servicio, ver Story 3.2
  costoCompra: string | null; // solo Producto, resuelto desde Item
}

export interface VentaIndicador {
  estado: "ACTIVA" | "CANCELADA" | "DEVUELTA_PARCIAL";
  impuesto: string;
  items: VentaItemIndicador[];
}

export interface GastoIndicador {
  monto: string;
  clasificacion: "OPERATIVO" | "FINANCIERO" | "FIJO" | "VARIABLE";
}

export interface DatosPeriodoNegocio {
  ventas: VentaIndicador[];
  gastos: GastoIndicador[];
}

// Story 5.2, AC2: desglose de CMV/Ganancia Bruta (Producto) y CSV/Ganancia
// Bruta (Servicio) — las dos `gananciaBruta` suman exacto a la global, sin
// doble conteo ni omisión (ver nota de diseño más abajo).
export interface DesgloseIndicadores {
  producto: { cmv: string; gananciaBruta: string };
  servicio: { csv: string; gananciaBruta: string };
}

export interface IndicadoresFinancieros {
  ingresosBrutos: string;
  ingresosNetos: string;
  cmv: string;
  csv: string;
  gananciaBruta: string;
  gastosOperativos: string;
  resultadoOperativo: string;
  gastosFinancieros: string;
  gananciaLiquida: string;
  margenGanancia: string; // "0" si ingresosNetos es 0 — evita división por cero
  desglose: DesgloseIndicadores;
}

// AC2 (Story 5.1): orden estricto Ingresos Brutos → Ingresos Netos →
// Ganancia Bruta → Resultado Operativo → Ganancia Líquida. Función pura con
// `decimal.js` (nunca aritmética de punto flotante de JS).
//
// Nota de diseño (AC1 de Story 5.1 vs. su Task 1): el AC1 dice literalmente
// "Ingresos Netos (restando impuesto... cancelaciones y devoluciones)", lo
// que exige que Ingresos Brutos sea el monto ORIGINAL de cada venta (sin
// netear devoluciones) para no restar dos veces el mismo efecto. El texto
// de la Task 1 ("Ingresos Brutos... proporcional a la porción no devuelta")
// describe el mismo resultado final por otro camino (bruto − devuelto =
// neto de lo no devuelto), así que ambas lecturas llegan al mismo
// `ingresosNetos`; se implementó la versión de dos pasos (bruto, luego
// restar impuesto y el efecto de devoluciones por separado) porque expone
// cada cifra intermedia de forma inspeccionable, más útil para el usuario
// que un único número fusionado, y es la que el AC1 pide explícitamente.
//
// CMV/CSV se calculan sobre la cantidad neta de lo devuelto (proporcional
// para Servicio, ya que su costo no está atado a una "cantidad" discreta
// como Producto) — un ítem devuelto no debería seguir contando su costo
// contra la ganancia del período, igual que su ingreso ya no cuenta.
//
// Desglose (Story 5.2, AC2): para que `gananciaBrutaProducto +
// gananciaBrutaServicio === gananciaBruta` exactamente (sin doble conteo ni
// omisión), el impuesto de cada venta se prorratea entre sus líneas según
// la participación de cada línea en el bruto de esa venta (no existe un
// campo de impuesto por línea en el data model, solo por venta) — cada
// término de la suma global queda particionado entre Producto y Servicio,
// así que la suma de las partes es aritméticamente idéntica al total.
export function calcularIndicadores(datos: DatosPeriodoNegocio): IndicadoresFinancieros {
  const ventasIncluidas = datos.ventas.filter((v) => v.estado !== "CANCELADA");

  let ingresosBrutos = new Decimal(0);
  let efectoDevoluciones = new Decimal(0);
  let impuestoTotal = new Decimal(0);
  let cmv = new Decimal(0);
  let csv = new Decimal(0);
  let ingresosNetosProducto = new Decimal(0);
  let ingresosNetosServicio = new Decimal(0);

  for (const venta of ventasIncluidas) {
    impuestoTotal = impuestoTotal.plus(venta.impuesto);

    const brutoPorItem = venta.items.map((item) =>
      new Decimal(item.cantidad ?? "1").times(item.precioUnitario)
    );
    const ventaBrutoTotal = brutoPorItem.reduce((acc, b) => acc.plus(b), new Decimal(0));

    venta.items.forEach((item, index) => {
      const cantidadOriginal = new Decimal(item.cantidad ?? "1");
      const cantidadDevuelta = new Decimal(item.cantidadDevuelta);
      const cantidadNeta = cantidadOriginal.minus(cantidadDevuelta);
      const bruto = brutoPorItem[index];
      const devuelto = cantidadDevuelta.times(item.precioUnitario);

      ingresosBrutos = ingresosBrutos.plus(bruto);
      efectoDevoluciones = efectoDevoluciones.plus(devuelto);

      const impuestoAsignado = ventaBrutoTotal.isZero()
        ? new Decimal(0)
        : new Decimal(venta.impuesto).times(bruto).dividedBy(ventaBrutoTotal);
      const netoItem = bruto.minus(devuelto).minus(impuestoAsignado);

      if (item.itemTipo === "PRODUCTO") {
        cmv = cmv.plus(cantidadNeta.times(item.costoCompra ?? "0"));
        ingresosNetosProducto = ingresosNetosProducto.plus(netoItem);
      } else {
        const proporcionVigente = cantidadOriginal.isZero()
          ? new Decimal(0)
          : cantidadNeta.dividedBy(cantidadOriginal);
        csv = csv.plus(proporcionVigente.times(item.costoServicio ?? "0"));
        ingresosNetosServicio = ingresosNetosServicio.plus(netoItem);
      }
    });
  }

  const ingresosNetos = ingresosBrutos.minus(impuestoTotal).minus(efectoDevoluciones);

  let gastosOperativos = new Decimal(0);
  let gastosFinancieros = new Decimal(0);
  for (const gasto of datos.gastos) {
    if (gasto.clasificacion === "OPERATIVO") gastosOperativos = gastosOperativos.plus(gasto.monto);
    if (gasto.clasificacion === "FINANCIERO") gastosFinancieros = gastosFinancieros.plus(gasto.monto);
  }

  const gananciaBruta = ingresosNetos.minus(cmv).minus(csv);
  const resultadoOperativo = gananciaBruta.minus(gastosOperativos);
  const gananciaLiquida = resultadoOperativo.minus(gastosFinancieros);
  const margenGanancia = ingresosNetos.isZero()
    ? new Decimal(0)
    : gananciaLiquida.dividedBy(ingresosNetos);

  const gananciaBrutaProducto = ingresosNetosProducto.minus(cmv);
  const gananciaBrutaServicio = ingresosNetosServicio.minus(csv);

  return {
    ingresosBrutos: ingresosBrutos.toString(),
    ingresosNetos: ingresosNetos.toString(),
    cmv: cmv.toString(),
    csv: csv.toString(),
    gananciaBruta: gananciaBruta.toString(),
    gastosOperativos: gastosOperativos.toString(),
    resultadoOperativo: resultadoOperativo.toString(),
    gastosFinancieros: gastosFinancieros.toString(),
    gananciaLiquida: gananciaLiquida.toString(),
    margenGanancia: margenGanancia.toString(),
    desglose: {
      producto: { cmv: cmv.toString(), gananciaBruta: gananciaBrutaProducto.toString() },
      servicio: { csv: csv.toString(), gananciaBruta: gananciaBrutaServicio.toString() },
    },
  };
}
