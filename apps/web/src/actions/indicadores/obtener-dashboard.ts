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
import { calcularIndicadores, calcularMetaMinimaDiaria, calcularTotalVenta } from "@repo/domain";
import { periodoFiltroSchema } from "@repo/domain/schemas";
import { calcularValorInventario, withRlsContext } from "@repo/database";
import { getCurrentAccount } from "@/lib/auth";
import { withErrorHandling } from "@/lib/server-action-wrapper";

const MESES_HACIA_ATRAS = 6;

export interface PuntoTendenciaMensual {
  mes: string; // "2026-08"
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
  metaMinimaDiaria: string | null;
  saldosPorMoneda: { codigo: string; total: string }[];
  tendenciaMensual: PuntoTendenciaMensual[];
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

    const hoy = new Date();
    const desdeTendencia = new Date(hoy.getFullYear(), hoy.getMonth() - (MESES_HACIA_ATRAS - 1), 1);

    return withRlsContext(cuenta.id, negocioId, async (tx) => {
      const [
        ventasPeriodo,
        gastosPeriodo,
        itemsRaw,
        gastosFijosRaw,
        cuentasFinancierasRaw,
        monedasRaw,
        ventasTendencia,
        gastosTendencia,
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
        tx.venta.findMany({
          where: { negocioId, fecha: { gte: desdeTendencia }, estado: { not: "CANCELADA" } },
          include: { ventaItems: true },
        }),
        tx.gasto.findMany({ where: { negocioId, fecha: { gte: desdeTendencia } } }),
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
            itemTipo: vi.item.tipo as Item["tipo"],
            cantidad: vi.cantidad?.toString() ?? null,
            cantidadDevuelta: vi.cantidadDevuelta.toString(),
            precioUnitario: vi.precioUnitario.toString(),
            costoServicio: vi.costoServicio?.toString() ?? null,
            costoCompra: vi.costoUnitario?.toString() ?? vi.item.costoCompra?.toString() ?? null,
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

      const tendenciaMensual: PuntoTendenciaMensual[] = [];
      for (let i = MESES_HACIA_ATRAS - 1; i >= 0; i--) {
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
        const mes = `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;

        const ventasDelMes = ventasTendencia.filter(
          (v) => v.fecha.getFullYear() === fecha.getFullYear() && v.fecha.getMonth() === fecha.getMonth()
        );
        const totalVentas = ventasDelMes.reduce((acc, v) => {
          const total = calcularTotalVenta(
            v.ventaItems.map((vi) => ({
              precioUnitario: vi.precioUnitario.toString(),
              cantidad: vi.cantidad?.toString() ?? null,
            }))
          );
          return acc + Number(total);
        }, 0);

        const totalGastos = gastosTendencia
          .filter((g) => g.fecha.getFullYear() === fecha.getFullYear() && g.fecha.getMonth() === fecha.getMonth())
          .reduce((acc, g) => acc + Number(g.monto), 0);

        tendenciaMensual.push({ mes, ventas: totalVentas.toString(), gastos: totalGastos.toString() });
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
        metaMinimaDiaria,
        saldosPorMoneda,
        tendenciaMensual,
        items,
        cuentasPorCobrar,
        movimientosRecientes,
      };
    });
  }
);
