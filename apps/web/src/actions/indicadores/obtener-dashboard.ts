"use server";

import Decimal from "decimal.js";
import type {
  CuentaPorCobrar,
  GastoFijo,
  IndicadoresFinancieros,
  Item,
  Moneda,
  MovimientoCuenta,
  TipoGasto,
  Venta,
} from "@repo/domain";
import {
  calcularIndicadores,
  calcularMetaMinimaDiaria,
  calcularTotalGastosFijos,
  calcularTotalVenta,
} from "@repo/domain";
import { periodoFiltroSchema } from "@repo/domain/schemas";
import { calcularValorInventario, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

const NOMBRES_MES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

// Por encima de este umbral de días la tendencia se agrupa por mes (si no,
// un rango de "Este año" tendría un punto por día y el gráfico sería
// ilegible); igual o por debajo, un punto por día — necesario para que
// atajos como "Hoy", "Esta semana" o "Últimos 7 días" (Story: gráfico
// filtrado junto con el resto del dashboard) sigan mostrando barras.
const UMBRAL_DIAS_AGRUPACION_MENSUAL = 31;

export interface PuntoTendencia {
  clave: string; // "2026-08-05" (día) o "2026-08" (mes) — identifica el punto
  etiqueta: string; // texto ya formateado para el eje ("05/08" o "Ago")
  ventas: string;
  gastos: string;
}

export interface MovimientoCajaListado extends MovimientoCuenta {
  cuentaNombre: string;
  monedaCodigo: string;
}

export interface DashboardData {
  indicadores: IndicadoresFinancieros;
  valorInventario: string;
  totalGastosFijos: string | null;
  metaMinimaDiaria: string | null;
  saldosPorMoneda: { codigo: string; total: string }[];
  // Suma de todas las cuentas Efectivo/Banco convertidas a Guaraníes con la
  // última cotización cargada de cada moneda (Story rediseño Caja
  // multimoneda) — las monedas sin ninguna cotización todavía se listan en
  // `monedasSinCotizacion` y no se suman al total, para no computar con un
  // 0 implícito.
  valorTotalCajaGs: string;
  // "Valor total del negocio" = plata disponible (`valorTotalCajaGs`) +
  // mercadería en stock (`valorInventario`) — la tarjeta principal del
  // dashboard, a pedido: antes solo mostraba el efectivo/banco, sin contar
  // el inventario como parte del patrimonio del negocio.
  valorTotalNegocio: string;
  monedasSinCotizacion: string[];
  tendencia: PuntoTendencia[];
  items: Item[];
  cuentasPorCobrar: (CuentaPorCobrar & { fechaOrigen: Date })[];
  movimientosRecientes: MovimientoCajaListado[];
}

// Consolida en UNA sola transacción todo lo que el Dashboard necesitaba en
// 9 Server Actions independientes (obtenerIndicadores, obtenerValorInventario,
// listarGastosFijos, listarCuentasFinancieras, listarMonedas,
// obtenerTendenciaMensual, listarItems, listarCuentasPorCobrar,
// listarMovimientosCaja) — cada una pagaba su propio handshake de RLS
// (BEGIN + 2× set_config + COMMIT) contra Supabase, que es remoto. Acá se
// paga ese handshake una sola vez y las 9 queries corren sobre la misma
// transacción. Reutiliza exactamente las mismas funciones puras de dominio
// que las acciones originales — no duplica lógica de cálculo, solo el
// acceso a datos. [Optimización de rendimiento, ver feedback de sesión]
export const obtenerDashboard = withErrorHandling(
  async (negocioId: string, periodo: unknown): Promise<DashboardData> => {
    const parsed = periodoFiltroSchema.parse(periodo);
    const cuenta = await getCurrentAccount();
    if (!cuenta) throw new Error("No hay sesión activa");

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const [
        ventasPeriodo,
        gastosPeriodo,
        itemsRaw,
        gastosFijosRaw,
        cuentasFinancierasRaw,
        monedasRaw,
        cuentasPorCobrarRaw,
        movimientosRaw,
      ] = await Promise.all([
        tx.venta.findMany({
          where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta } },
          include: { ventaItems: { include: { item: true } } },
        }),
        tx.gasto.findMany({
          where: { negocioId, fecha: { gte: parsed.desde, lte: parsed.hasta } },
          include: { tipoGasto: true },
        }),
        tx.item.findMany({ where: { cuentaId: cuenta.id, negocioId }, orderBy: { createdAt: "asc" } }),
        tx.gastoFijo.findMany({ where: { cuentaId: cuenta.id, negocioId }, orderBy: { createdAt: "asc" } }),
        tx.cuentaFinanciera.findMany({ where: { cuentaId: cuenta.id, negocioId }, orderBy: { createdAt: "asc" } }),
        tx.moneda.findMany({ where: { cuentaId: cuenta.id, negocioId }, orderBy: { createdAt: "asc" } }),
        tx.cuentaPorCobrar.findMany({
          where: { negocioId },
          include: { venta: true },
          orderBy: { createdAt: "desc" },
        }),
        tx.movimientoCuenta.findMany({
          where: { cuentaFinanciera: { negocioId } },
          include: { cuentaFinanciera: { include: { moneda: true } } },
          orderBy: { createdAt: "desc" },
          take: 15,
        }),
      ]);

      const indicadores = calcularIndicadores({
        ventas: ventasPeriodo.map((v) => ({
          estado: v.estado as Venta["estado"],
          impuesto: v.impuesto.toString(),
          items: v.ventaItems.map((vi) => ({
            // Venta libre de un producto fuera de catálogo: `vi.item` es
            // null (nunca se crea un Item para eso) — se asume PRODUCTO,
            // único tipo que puede venderse "libre".
            itemTipo: (vi.item?.tipo as Item["tipo"] | undefined) ?? "PRODUCTO",
            cantidad: vi.cantidad?.toString() ?? null,
            cantidadDevuelta: vi.cantidadDevuelta.toString(),
            precioUnitario: vi.precioUnitario.toString(),
            costoServicio: vi.costoServicio?.toString() ?? null,
            costoCompra: vi.costoUnitario?.toString() ?? vi.item?.costoCompra?.toString() ?? null,
          })),
        })),
        gastos: gastosPeriodo.map((g) => ({
          monto: g.monto.toString(),
          clasificacion: g.tipoGasto.clasificacion as TipoGasto["clasificacion"],
        })),
      });

      const valorInventario = calcularValorInventario(itemsRaw).total;

      const items: Item[] = itemsRaw.map((item) => ({
        id: item.id,
        negocioId: item.negocioId,
        tipo: item.tipo as Item["tipo"],
        nombre: item.nombre,
        precioVenta: item.precioVenta.toString(),
        monedaId: item.monedaId,
        costoCompra: item.costoCompra?.toString() ?? null,
        stockActual: item.stockActual.toString(),
        tieneMovimientos: item.tieneMovimientos,
        imagenUrl: item.imagenUrl,
        nroCalce: item.nroCalce,
        proveedor: item.proveedor,
      }));

      const gastosFijos: GastoFijo[] = gastosFijosRaw.map((g) => ({
        id: g.id,
        cuentaId: g.cuentaId,
        negocioId: g.negocioId,
        nombre: g.nombre,
        monto: g.monto.toString(),
        monedaId: g.monedaId,
        activo: g.activo,
      }));
      const totalGastosFijos = calcularTotalGastosFijos(gastosFijos);
      const metaMinimaDiaria = calcularMetaMinimaDiaria(gastosFijos);

      const monedas: Moneda[] = monedasRaw.map((m) => ({
        id: m.id,
        cuentaId: m.cuentaId,
        negocioId: m.negocioId,
        ambito: m.ambito as Moneda["ambito"],
        codigo: m.codigo,
        nombre: m.nombre,
        esBase: m.esBase,
        activa: m.activa,
      }));

      const cuentasCajaBanco = cuentasFinancierasRaw.filter((c) => c.tipo === "CAJA" || c.tipo === "BANCO");
      const totalesPorMoneda = new Map<string, Decimal>();
      for (const c of cuentasCajaBanco) {
        totalesPorMoneda.set(c.monedaId, (totalesPorMoneda.get(c.monedaId) ?? new Decimal(0)).plus(c.saldoActual));
      }
      const saldosPorMoneda = Array.from(totalesPorMoneda.entries()).map(([monedaId, total]) => ({
        codigo: monedas.find((m) => m.id === monedaId)?.codigo ?? monedaId,
        total: total.toString(),
      }));

      // Última cotización cargada por moneda no base — una sola consulta
      // para todas (no una por moneda) porque recién acá se conocen los
      // ids de las monedas no base del negocio.
      const monedaIdsNoBase = monedas.filter((m) => !m.esBase).map((m) => m.id);
      const tasasRaw =
        monedaIdsNoBase.length > 0
          ? await tx.tasaCambio.findMany({
              where: { monedaId: { in: monedaIdsNoBase } },
              orderBy: { vigenteDesde: "desc" },
            })
          : [];
      const tasaVigentePorMoneda = new Map<string, Decimal>();
      for (const t of tasasRaw) {
        if (!tasaVigentePorMoneda.has(t.monedaId)) tasaVigentePorMoneda.set(t.monedaId, t.tasa);
      }

      let valorTotalCajaGs = new Decimal(0);
      const monedasSinCotizacion: string[] = [];
      for (const [monedaId, total] of totalesPorMoneda.entries()) {
        const m = monedas.find((mm) => mm.id === monedaId);
        if (m?.esBase) {
          valorTotalCajaGs = valorTotalCajaGs.plus(total);
          continue;
        }
        const tasa = tasaVigentePorMoneda.get(monedaId);
        if (tasa) {
          valorTotalCajaGs = valorTotalCajaGs.plus(total.times(tasa));
        } else if (m) {
          monedasSinCotizacion.push(m.codigo);
        }
      }

      // Mismas ventas/gastos ya traídos para `indicadores` (acotados a
      // parsed.desde/parsed.hasta) — antes esto se recalculaba con una
      // consulta aparte anclada a "hoy", por lo que el gráfico mostraba
      // siempre los últimos 6 meses ignorando el filtro de fecha elegido.
      const ventasParaTendencia = ventasPeriodo.filter((v) => v.estado !== "CANCELADA");

      const diasEnRango = Math.round((parsed.hasta.getTime() - parsed.desde.getTime()) / 86_400_000);
      const agruparPorMes = diasEnRango > UMBRAL_DIAS_AGRUPACION_MENSUAL;

      const tendencia: PuntoTendencia[] = [];
      if (agruparPorMes) {
        // `parsed.desde`/`parsed.hasta` y `venta.fecha`/`gasto.fecha` (columna
        // `@db.Date` en Postgres) son fechas puras que Prisma/zod representan
        // como medianoche UTC — hay que leerlas con los getters UTC. Usar
        // getters en hora local acá corría el balde un día (y a veces un mes
        // entero, ej. el 1° de enero) para cualquier huso detrás de UTC.
        const inicio = new Date(Date.UTC(parsed.desde.getUTCFullYear(), parsed.desde.getUTCMonth(), 1));
        const fin = new Date(Date.UTC(parsed.hasta.getUTCFullYear(), parsed.hasta.getUTCMonth(), 1));
        for (const fecha = new Date(inicio); fecha <= fin; fecha.setUTCMonth(fecha.getUTCMonth() + 1)) {
          const totalVentas = ventasParaTendencia
            .filter(
              (v) => v.fecha.getUTCFullYear() === fecha.getUTCFullYear() && v.fecha.getUTCMonth() === fecha.getUTCMonth()
            )
            .reduce((acc, v) => {
              const total = calcularTotalVenta(
                v.ventaItems.map((vi) => ({
                  precioUnitario: vi.precioUnitario.toString(),
                  cantidad: vi.cantidad?.toString() ?? null,
                }))
              );
              return acc + Number(total);
            }, 0);

          const totalGastos = gastosPeriodo
            .filter(
              (g) => g.fecha.getUTCFullYear() === fecha.getUTCFullYear() && g.fecha.getUTCMonth() === fecha.getUTCMonth()
            )
            .reduce((acc, g) => acc + Number(g.monto), 0);

          tendencia.push({
            clave: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`,
            etiqueta: NOMBRES_MES[fecha.getUTCMonth()],
            ventas: totalVentas.toString(),
            gastos: totalGastos.toString(),
          });
        }
      } else {
        const inicio = new Date(
          Date.UTC(parsed.desde.getUTCFullYear(), parsed.desde.getUTCMonth(), parsed.desde.getUTCDate())
        );
        const fin = new Date(Date.UTC(parsed.hasta.getUTCFullYear(), parsed.hasta.getUTCMonth(), parsed.hasta.getUTCDate()));
        for (const fecha = new Date(inicio); fecha <= fin; fecha.setUTCDate(fecha.getUTCDate() + 1)) {
          const totalVentas = ventasParaTendencia
            .filter(
              (v) =>
                v.fecha.getUTCFullYear() === fecha.getUTCFullYear() &&
                v.fecha.getUTCMonth() === fecha.getUTCMonth() &&
                v.fecha.getUTCDate() === fecha.getUTCDate()
            )
            .reduce((acc, v) => {
              const total = calcularTotalVenta(
                v.ventaItems.map((vi) => ({
                  precioUnitario: vi.precioUnitario.toString(),
                  cantidad: vi.cantidad?.toString() ?? null,
                }))
              );
              return acc + Number(total);
            }, 0);

          const totalGastos = gastosPeriodo
            .filter(
              (g) =>
                g.fecha.getUTCFullYear() === fecha.getUTCFullYear() &&
                g.fecha.getUTCMonth() === fecha.getUTCMonth() &&
                g.fecha.getUTCDate() === fecha.getUTCDate()
            )
            .reduce((acc, g) => acc + Number(g.monto), 0);

          tendencia.push({
            clave: `${fecha.getUTCFullYear()}-${String(fecha.getUTCMonth() + 1).padStart(2, "0")}-${String(fecha.getUTCDate()).padStart(2, "0")}`,
            etiqueta: `${String(fecha.getUTCDate()).padStart(2, "0")}/${String(fecha.getUTCMonth() + 1).padStart(2, "0")}`,
            ventas: totalVentas.toString(),
            gastos: totalGastos.toString(),
          });
        }
      }

      const cuentasPorCobrar = cuentasPorCobrarRaw.map((c) => ({
        id: c.id,
        negocioId: c.negocioId,
        ventaId: c.ventaId,
        cliente: c.cliente,
        montoOriginal: c.montoOriginal.toString(),
        montoPagado: c.montoPagado.toString(),
        estado: c.estado as CuentaPorCobrar["estado"],
        fechaOrigen: c.venta.fecha,
      }));

      const movimientosRecientes: MovimientoCajaListado[] = movimientosRaw.map((m) => ({
        id: m.id,
        cuentaFinancieraId: m.cuentaFinancieraId,
        tipo: m.tipo as MovimientoCuenta["tipo"],
        monto: m.monto.toString(),
        fecha: m.fecha,
        referenciaTipo: m.referenciaTipo as MovimientoCuenta["referenciaTipo"],
        referenciaId: m.referenciaId,
        cuentaNombre: m.cuentaFinanciera.nombre,
        monedaCodigo: m.cuentaFinanciera.moneda.codigo,
      }));

      return {
        indicadores,
        valorInventario,
        totalGastosFijos,
        metaMinimaDiaria,
        saldosPorMoneda,
        valorTotalCajaGs: valorTotalCajaGs.toString(),
        valorTotalNegocio: valorTotalCajaGs.plus(valorInventario).toString(),
        monedasSinCotizacion,
        tendencia,
        items,
        cuentasPorCobrar,
        movimientosRecientes,
      };
    });
  }
);
