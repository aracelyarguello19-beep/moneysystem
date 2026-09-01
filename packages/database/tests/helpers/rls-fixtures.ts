import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma, withRlsContext } from "../../src/rls-context";

// ============================================================================
// Fixtures compartidos por aislamiento-cuentas.test.ts (Story 1.3) y
// aislamiento-negocios.test.ts (Story 1.5).
// ============================================================================
// Todo lo que se crea acá se crea PASANDO POR RLS, con el mismo
// `withRlsContext` que usa la aplicación — nunca con un rol privilegiado ni
// con el cliente Prisma "pelado". Si una policy estuviera mal escrita, el
// propio setup fallaría, que es exactamente la señal que queremos.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type NegocioFixture = {
  negocioId: string;
  monedaId: string;
  tipoGastoId: string;
  itemId: string;
  cuentaFinancieraId: string;
  ventaId: string;
  ventaItemId: string;
  ventaCreditoId: string;
  cuentaPorCobrarId: string;
  compraId: string;
  movimientoCuentaId: string;
  gastoId: string;
  retiroId: string;
  tasaCambioId: string;
};

/**
 * Resuelve las dos cuentas de prueba (Cuenta A y Cuenta B).
 *
 * `cuentas.id` tiene FK a `auth.users(id)`, así que no se pueden inventar
 * UUIDs: hacen falta dos usuarios reales de Supabase Auth.
 *
 * 1. `RLS_TEST_CUENTA_A` / `RLS_TEST_CUENTA_B`: ids de dos usuarios ya
 *    aprovisionados. Es el camino contra el proyecto Supabase real, donde
 *    `app_user` no tiene permisos sobre el schema `auth`.
 * 2. Si no están, se intenta insertar directamente en `auth.users` — funciona
 *    contra el servicio Postgres de CI, donde el schema `auth` es un shim
 *    creado por el bootstrap del job y el rol del test es su dueño.
 * 3. Si ninguna de las dos funciona, los tests se saltan con un mensaje
 *    explícito en lugar de dar un falso verde.
 */
export async function resolverCuentasDePrueba(): Promise<
  { cuentaA: string; cuentaB: string } | { motivoSkip: string }
> {
  if (!process.env.DATABASE_URL) {
    return { motivoSkip: "DATABASE_URL no está definida." };
  }

  const desdeEnv = [process.env.RLS_TEST_CUENTA_A, process.env.RLS_TEST_CUENTA_B];
  if (desdeEnv.every((v) => v && UUID_RE.test(v))) {
    return { cuentaA: desdeEnv[0]!, cuentaB: desdeEnv[1]! };
  }

  const candidatas = [randomUUID(), randomUUID()];
  try {
    for (const id of candidatas) {
      await prisma.$executeRawUnsafe(
        `insert into auth.users (id, email) values ($1::uuid, $2) on conflict (id) do nothing`,
        id,
        `rls-${id}@aislamiento.test`
      );
    }
    return { cuentaA: candidatas[0], cuentaB: candidatas[1] };
  } catch (error) {
    return {
      motivoSkip:
        "No hay dos cuentas de prueba disponibles. Definí RLS_TEST_CUENTA_A y " +
        "RLS_TEST_CUENTA_B con los ids de dos usuarios de Supabase Auth, o corré " +
        "contra un Postgres donde el rol del test pueda escribir en auth.users. " +
        `Detalle: ${(error as Error).message.split("\n").filter(Boolean).slice(-1)[0]}`,
    };
  }
}

/** Crea la fila espejo en `cuentas` si todavía no existe (idempotente). */
export async function asegurarCuenta(cuentaId: string): Promise<void> {
  await withRlsContext(cuentaId, null, async (tx) => {
    const existente = await tx.cuenta.findUnique({ where: { id: cuentaId } });
    if (!existente) {
      await tx.cuenta.create({
        data: { id: cuentaId, email: `rls-${cuentaId}@aislamiento.test` },
      });
    }
  });
}

/**
 * Crea un negocio completo (catálogo + transaccional + ledger) para `cuentaId`.
 * Cubre todas las tablas listadas en el Task 1 de las Stories 1.3 y 1.5,
 * incluidas las dos que no tienen `cuenta_id`/`negocio_id` propios y resuelven
 * su policy vía `exists(...)`: `venta_items` y `movimientos_cuenta`.
 */
export async function crearNegocioCompleto(
  cuentaId: string,
  nombre: string
): Promise<NegocioFixture> {
  const negocioId = await withRlsContext(cuentaId, null, async (tx) => {
    const negocio = await tx.negocio.create({ data: { cuentaId, nombre } });
    return negocio.id;
  });

  const catalogo = await withRlsContext(cuentaId, negocioId, async (tx) => {
    const moneda = await tx.moneda.create({
      data: {
        cuentaId,
        negocioId,
        ambito: "LABORAL",
        codigo: "PYG",
        nombre: "Guaraní",
        esBase: true,
      },
    });
    const tipoGasto = await tx.tipoGasto.create({
      data: {
        cuentaId,
        negocioId,
        ambito: "LABORAL",
        nombre: `Alquiler ${nombre}`,
        clasificacion: "OPERATIVO",
      },
    });
    const item = await tx.item.create({
      data: {
        cuentaId,
        negocioId,
        tipo: "PRODUCTO",
        nombre: `Producto ${nombre}`,
        precioVenta: "1000",
        costoCompra: "600",
        stockActual: "10",
        monedaId: moneda.id,
      },
    });
    const cuentaFinanciera = await tx.cuentaFinanciera.create({
      data: {
        cuentaId,
        negocioId,
        ambito: "LABORAL",
        tipo: "CAJA",
        nombre: `Caja ${nombre}`,
        monedaId: moneda.id,
        saldoActual: "0",
      },
    });
    return {
      monedaId: moneda.id,
      tipoGastoId: tipoGasto.id,
      itemId: item.id,
      cuentaFinancieraId: cuentaFinanciera.id,
    };
  });

  const transaccional = await withRlsContext(cuentaId, negocioId, async (tx) => {
    const venta = await tx.venta.create({
      data: {
        cuentaId,
        negocioId,
        cliente: `Cliente contado ${nombre}`,
        formaCobro: "EFECTIVO",
        monedaId: catalogo.monedaId,
        cuentaFinancieraId: catalogo.cuentaFinancieraId,
      },
    });
    const ventaItem = await tx.ventaItem.create({
      data: { ventaId: venta.id, itemId: catalogo.itemId, cantidad: "1", precioUnitario: "1000" },
    });
    const ventaCredito = await tx.venta.create({
      data: {
        cuentaId,
        negocioId,
        cliente: `Cliente crédito ${nombre}`,
        formaCobro: "CREDITO_CLIENTE",
        monedaId: catalogo.monedaId,
      },
    });
    const cuentaPorCobrar = await tx.cuentaPorCobrar.create({
      data: {
        cuentaId,
        negocioId,
        ventaId: ventaCredito.id,
        cliente: `Cliente crédito ${nombre}`,
        montoOriginal: "1000",
      },
    });
    return {
      ventaId: venta.id,
      ventaItemId: ventaItem.id,
      ventaCreditoId: ventaCredito.id,
      cuentaPorCobrarId: cuentaPorCobrar.id,
    };
  });

  const resto = await withRlsContext(cuentaId, negocioId, async (tx) => {
    const compra = await tx.compra.create({
      data: {
        cuentaId,
        negocioId,
        itemId: catalogo.itemId,
        costoUnitario: "600",
        cantidad: "5",
        formaPago: "EFECTIVO",
        cuentaFinancieraId: catalogo.cuentaFinancieraId,
        monedaId: catalogo.monedaId,
      },
    });
    const movimiento = await tx.movimientoCuenta.create({
      data: {
        cuentaFinancieraId: catalogo.cuentaFinancieraId,
        tipo: "INGRESO",
        monto: "1000",
      },
    });
    const gasto = await tx.gasto.create({
      data: {
        cuentaId,
        negocioId,
        ambito: "LABORAL",
        tipoGastoId: catalogo.tipoGastoId,
        monto: "100",
        monedaId: catalogo.monedaId,
        formaPago: "EFECTIVO",
        cuentaFinancieraId: catalogo.cuentaFinancieraId,
      },
    });
    const retiro = await tx.retiroUtilidad.create({
      data: { cuentaId, negocioId, monto: "50", origen: "MANUAL" },
    });
    const tasa = await tx.tasaCambio.create({
      data: { monedaId: catalogo.monedaId, tasa: "1", registradaPor: cuentaId },
    });
    return {
      compraId: compra.id,
      movimientoCuentaId: movimiento.id,
      gastoId: gasto.id,
      retiroId: retiro.id,
      tasaCambioId: tasa.id,
    };
  });

  return { negocioId, ...catalogo, ...transaccional, ...resto };
}

/**
 * Borra el fixture en orden de dependencias. Best-effort: si una tabla ya
 * quedó vacía por un cascade, no se interrumpe el resto del teardown.
 */
export async function borrarNegocioCompleto(
  cuentaId: string,
  negocioId: string
): Promise<void> {
  const borrar = async (
    etiqueta: string,
    fn: (tx: Prisma.TransactionClient) => Promise<unknown>
  ) => {
    try {
      await withRlsContext(cuentaId, negocioId, fn);
    } catch (error) {
      console.warn(`[teardown] ${etiqueta}: ${(error as Error).message.split("\n")[0]}`);
    }
  };

  await borrar("movimientos + venta_items + pagos", async (tx) => {
    await tx.movimientoCuenta.deleteMany({});
    await tx.movimientoTarjeta.deleteMany({});
    await tx.ventaItem.deleteMany({});
    await tx.pagoCxC.deleteMany({});
  });
  await borrar("cxc + ventas + compras + gastos", async (tx) => {
    await tx.cuentaPorCobrar.deleteMany({});
    await tx.venta.deleteMany({});
    await tx.compra.deleteMany({});
    await tx.gasto.deleteMany({});
  });
  await borrar("retiros + regla + items + tasas", async (tx) => {
    await tx.retiroUtilidad.deleteMany({ where: { negocioId } });
    await tx.reglaRetiro.deleteMany({});
    await tx.item.deleteMany({});
    await tx.tasaCambio.deleteMany({});
  });
  await borrar("cuentas financieras + tipos de gasto + monedas", async (tx) => {
    await tx.cuentaFinanciera.deleteMany({});
    await tx.tipoGasto.deleteMany({});
    await tx.moneda.deleteMany({});
  });
  await borrar("negocio", async (tx) => {
    await tx.negocio.deleteMany({ where: { id: negocioId } });
  });
}

/**
 * ¿Está aplicada la migración `20260901190000_rls_fix_bypass_consolidado`?
 *
 * Se prueba por comportamiento, no por nombre de migración: se intenta una
 * lectura con `app.active_negocio_id = '*'`. Con las policies viejas el cast
 * `nullif(current_setting(...), '')::uuid` recibe la cadena `'*'` y la query
 * aborta con `22P02`; con las corregidas devuelve filas normalmente.
 */
export async function bypassConsolidadoOperativo(): Promise<boolean> {
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`select set_config('app.active_negocio_id', '*', true)`);
      await tx.$queryRawUnsafe(`select count(*) from ventas`);
    });
    return true;
  } catch (error) {
    if ((error as Error).message.includes("22P02")) return false;
    throw error;
  }
}

/** Devuelve el error lanzado por `fn`, o `null` si no lanzó. */
export async function capturarError(fn: () => Promise<unknown>): Promise<
  (Error & { code?: string }) | null
> {
  try {
    await fn();
    return null;
  } catch (error) {
    return error as Error & { code?: string };
  }
}

export { prisma, withRlsContext };
