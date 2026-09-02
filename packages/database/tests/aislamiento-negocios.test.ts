import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
// `withRlsContextConsolidado` se importa acá — y solo acá, fuera de
// `actions/consolidado/*` — porque el AC1 de esta story exige demostrar que el
// bypass `'*'` hace exactamente lo que dice hacer (y nada más que eso). La
// regla de Coding Standards restringe su uso en código de aplicación; un test
// que verifica su comportamiento es lo contrario de un uso indebido.
import { withRlsContextConsolidado } from "../src/rls-context";
import {
  asegurarCuenta,
  borrarNegocioCompleto,
  bypassConsolidadoOperativo,
  capturarError,
  crearNegocioCompleto,
  prisma,
  resolverCuentasDePrueba,
  withRlsContext,
  type NegocioFixture,
} from "./helpers/rls-fixtures";

// ============================================================================
// Story 1.5 — AC1 / AC2 / AC3: aislamiento entre negocios de una misma cuenta.
// ============================================================================
// Mismo enfoque "no mockeado" que Story 1.3: el mecanismo verificado (RLS con
// `app.active_negocio_id`) vive en Postgres.
// [Source: architecture/testing-strategy.md#Test Organization]

const cuentas = await resolverCuentasDePrueba();
const hayCuentas = "cuentaA" in cuentas;
const bypassOperativo = hayCuentas ? await bypassConsolidadoOperativo() : false;

describe.skipIf(!hayCuentas)("Story 1.5 — aislamiento entre negocios (Postgres real)", () => {
  const cuentaA = hayCuentas ? cuentas.cuentaA : "";
  const cuentaB = hayCuentas ? cuentas.cuentaB : "";

  let n1: NegocioFixture;
  let n2: NegocioFixture;

  beforeAll(async () => {
    await asegurarCuenta(cuentaA);
    await asegurarCuenta(cuentaB);
    n1 = await crearNegocioCompleto(cuentaA, "Negocio 1 de la Cuenta A");
    n2 = await crearNegocioCompleto(cuentaA, "Negocio 2 de la Cuenta A");
  });

  afterAll(async () => {
    if (n1) await borrarNegocioCompleto(cuentaA, n1.negocioId);
    if (n2) await borrarNegocioCompleto(cuentaA, n2.negocioId);
    await prisma.$disconnect();
  });

  it("Task 1: las policies por negocio dependen efectivamente de app.active_negocio_id", async () => {
    const conFiltroDeNegocio = [
      "monedas",
      "tipos_gasto",
      "items",
      "cuentas_financieras",
      "compras",
      "ventas",
      "cuentas_por_cobrar",
      "gastos",
      "venta_items",
      "movimientos_cuenta",
    ];

    const policies = await prisma.$queryRawUnsafe<{ tabla: string; expresion: string }[]>(
      `select c.relname as tabla, pg_get_expr(p.polqual, p.polrelid) as expresion
         from pg_policy p
         join pg_class c on c.oid = p.polrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'`
    );
    const porTabla = new Map(policies.map((p) => [p.tabla, p.expresion]));

    for (const tabla of conFiltroDeNegocio) {
      const expresion = porTabla.get(tabla);
      expect(expresion, `${tabla} no tiene policy`).toBeDefined();
      expect(
        expresion,
        `la policy de ${tabla} no consulta app.active_negocio_id: no aísla por negocio`
      ).toContain("app.active_negocio_id");
    }
  });

  // --------------------------------------------------------------------------
  // AC1 — el negocio activo filtra en la capa de datos. Ninguna de estas
  // queries lleva `where: { negocioId }`.
  // --------------------------------------------------------------------------
  it("AC1: con el Negocio 1 activo, ninguna tabla por negocio devuelve filas del Negocio 2", async () => {
    const visto = await withRlsContext(cuentaA, n1.negocioId, async (tx) => ({
      monedas: (await tx.moneda.findMany({})).map((x) => x.id),
      tiposGasto: (await tx.tipoGasto.findMany({})).map((x) => x.id),
      items: (await tx.item.findMany({})).map((x) => x.id),
      cuentasFinancieras: (await tx.cuentaFinanciera.findMany({})).map((x) => x.id),
      compras: (await tx.compra.findMany({})).map((x) => x.id),
      ventas: (await tx.venta.findMany({})).map((x) => x.id),
      cuentasPorCobrar: (await tx.cuentaPorCobrar.findMany({})).map((x) => x.id),
      gastos: (await tx.gasto.findMany({})).map((x) => x.id),
    }));

    const propias: [string, string[], string][] = [
      ["monedas", visto.monedas, n1.monedaId],
      ["tiposGasto", visto.tiposGasto, n1.tipoGastoId],
      ["items", visto.items, n1.itemId],
      ["cuentasFinancieras", visto.cuentasFinancieras, n1.cuentaFinancieraId],
      ["compras", visto.compras, n1.compraId],
      ["ventas", visto.ventas, n1.ventaId],
      ["cuentasPorCobrar", visto.cuentasPorCobrar, n1.cuentaPorCobrarId],
      ["gastos", visto.gastos, n1.gastoId],
    ];
    const ajenas: [string, string[], string][] = [
      ["monedas", visto.monedas, n2.monedaId],
      ["tiposGasto", visto.tiposGasto, n2.tipoGastoId],
      ["items", visto.items, n2.itemId],
      ["cuentasFinancieras", visto.cuentasFinancieras, n2.cuentaFinancieraId],
      ["compras", visto.compras, n2.compraId],
      ["ventas", visto.ventas, n2.ventaId],
      ["cuentasPorCobrar", visto.cuentasPorCobrar, n2.cuentaPorCobrarId],
      ["gastos", visto.gastos, n2.gastoId],
    ];

    for (const [tabla, ids, propio] of propias) {
      expect(ids, `${tabla}: no se ve la fila del propio negocio activo`).toContain(propio);
    }
    for (const [tabla, ids, ajeno] of ajenas) {
      expect(ids, `${tabla}: se filtró una fila del Negocio 2`).not.toContain(ajeno);
    }
  });

  it("AC1: las tablas sin negocio_id propio siguen al negocio activo vía exists(...)", async () => {
    const visto = await withRlsContext(cuentaA, n1.negocioId, async (tx) => ({
      ventaItems: (await tx.ventaItem.findMany({})).map((x) => x.id),
      movimientos: (await tx.movimientoCuenta.findMany({})).map((x) => x.id),
      ventaItemAjenoPorId: await tx.ventaItem.findUnique({ where: { id: n2.ventaItemId } }),
      movimientoAjenoPorId: await tx.movimientoCuenta.findUnique({
        where: { id: n2.movimientoCuentaId },
      }),
    }));

    expect(visto.ventaItems).toContain(n1.ventaItemId);
    expect(visto.ventaItems).not.toContain(n2.ventaItemId);
    expect(visto.movimientos).toContain(n1.movimientoCuentaId);
    expect(visto.movimientos).not.toContain(n2.movimientoCuentaId);
    expect(visto.ventaItemAjenoPorId).toBeNull();
    expect(visto.movimientoAjenoPorId).toBeNull();
  });

  // --------------------------------------------------------------------------
  // AC2 — escritura.
  // --------------------------------------------------------------------------
  it("AC2: no se puede leer ni escribir una fila del Negocio 2 por id directo", async () => {
    const lectura = await withRlsContext(cuentaA, n1.negocioId, (tx) =>
      tx.item.findUnique({ where: { id: n2.itemId } })
    );
    expect(lectura, "con el Negocio 1 activo se leyó un ítem del Negocio 2").toBeNull();

    const errorUpdate = await capturarError(() =>
      withRlsContext(cuentaA, n1.negocioId, (tx) =>
        tx.item.update({ where: { id: n2.itemId }, data: { nombre: "TOMADO POR N1" } })
      )
    );
    expect(errorUpdate, "se pudo actualizar un ítem del Negocio 2").not.toBeNull();
    expect(errorUpdate!.code).toBe("P2025");

    const errorDelete = await capturarError(() =>
      withRlsContext(cuentaA, n1.negocioId, (tx) =>
        tx.gasto.delete({ where: { id: n2.gastoId } })
      )
    );
    expect(errorDelete, "se pudo borrar un gasto del Negocio 2").not.toBeNull();
    expect(errorDelete!.code).toBe("P2025");

    const itemIntacto = await withRlsContext(cuentaA, n2.negocioId, (tx) =>
      tx.item.findUnique({ where: { id: n2.itemId } })
    );
    expect(itemIntacto?.nombre).toBe("Producto Negocio 2 de la Cuenta A");
  });

  it("AC2: no se puede crear una fila a nombre de otro negocio de la misma cuenta", async () => {
    const error = await capturarError(() =>
      withRlsContext(cuentaA, n1.negocioId, (tx) =>
        tx.item.create({
          data: {
            cuentaId: cuentaA,
            negocioId: n2.negocioId,
            tipo: "PRODUCTO",
            nombre: "Ítem plantado desde el Negocio 1",
            precioVenta: "1",
            stockActual: "0",
            monedaId: n1.monedaId,
          },
        })
      )
    );

    expect(error, "con el Negocio 1 activo se creó un ítem en el Negocio 2").not.toBeNull();
    expect(error!.message).toMatch(/row-level security|violates|policy/i);
  });

  it("AC2: una escritura masiva sin `where` solo alcanza el negocio activo", async () => {
    const marca = `marcado-${randomUUID().slice(0, 8)}`;

    const afectadas = await withRlsContext(cuentaA, n1.negocioId, (tx) =>
      tx.venta.updateMany({ data: { cliente: marca } })
    );
    expect(afectadas.count).toBeGreaterThan(0);

    const ventasN2 = await withRlsContext(cuentaA, n2.negocioId, (tx) => tx.venta.findMany({}));
    expect(ventasN2.length).toBeGreaterThan(0);
    for (const venta of ventasN2) {
      expect(venta.cliente, "un updateMany con N1 activo alcanzó una venta de N2").not.toBe(marca);
    }
  });

  // --------------------------------------------------------------------------
  // AC3 / Task 4 — el negocio activo es la única fuente del filtro, y el bypass
  // consolidado no puede colarse por la puerta de `withRlsContext`.
  // --------------------------------------------------------------------------
  it("Task 4: `withRlsContext` rechaza `'*'` como negocioId", async () => {
    const error = await capturarError(() =>
      withRlsContext(cuentaA, "*", (tx) => tx.venta.findMany({}))
    );

    expect(error, "`withRlsContext` aceptó '*' y habilitó una lectura consolidada").not.toBeNull();
    expect(error!.message).toMatch(/withRlsContextConsolidado/);
  });

  it("Task 4: `withRlsContext` rechaza un negocioId que no sea un UUID", async () => {
    const error = await capturarError(() =>
      withRlsContext(cuentaA, "negocio-1", (tx) => tx.venta.findMany({}))
    );
    expect(error).not.toBeNull();
    expect(error!.message).toMatch(/negocioId inválido/);
  });

  // --------------------------------------------------------------------------
  // El bypass consolidado, hoy, está ROTO en la base real: las policies castean
  // `app.active_negocio_id` a uuid antes de comparar y PostgreSQL no garantiza
  // cortocircuito en el `OR`, así que con el setting en `'*'` el cast revienta
  // (22P02). La corrección está escrita en la migración
  // `20260901190000_rls_fix_bypass_consolidado` pero todavía no se pudo aplicar
  // (hace falta el rol dueño del schema; ver Completion Notes de Story 1.5).
  //
  // Exactamente uno de los dos tests de abajo corre siempre: el segundo mientras
  // el defecto siga vivo, el primero apenas se aplique la migración. Nunca hay
  // un verde que tape el estado real.
  // --------------------------------------------------------------------------
  it.skipIf(!bypassOperativo)(
    "AC3: el bypass consolidado ve todos los negocios de la cuenta y ninguno de otra",
    async () => {
      const consolidado = await withRlsContextConsolidado(cuentaA, async (tx) => ({
        ventas: (await tx.venta.findMany({})).map((v) => v.id),
        items: (await tx.item.findMany({})).map((i) => i.id),
      }));

      expect(consolidado.ventas).toContain(n1.ventaId);
      expect(consolidado.ventas).toContain(n2.ventaId);
      expect(consolidado.items).toContain(n1.itemId);
      expect(consolidado.items).toContain(n2.itemId);

      const desdeCuentaB = await withRlsContextConsolidado(cuentaB, async (tx) =>
        (await tx.venta.findMany({})).map((v) => v.id)
      );
      expect(desdeCuentaB, "el bypass consolidado cruzó el límite de cuenta").not.toContain(
        n1.ventaId
      );
      expect(desdeCuentaB).not.toContain(n2.ventaId);
    }
  );

  it.skipIf(bypassOperativo)(
    "AC3 [DEFECTO ABIERTO]: el bypass consolidado aborta con 22P02 — falta aplicar 20260901190000_rls_fix_bypass_consolidado",
    async () => {
      const error = await capturarError(() =>
        withRlsContextConsolidado(cuentaA, (tx) => tx.venta.findMany({}))
      );

      expect(
        error,
        "el bypass consolidado ya funciona: aplicá el otro test borrando este"
      ).not.toBeNull();
      expect(error!.message).toMatch(/22P02|invalid input syntax for type uuid/);

      // El defecto es de disponibilidad, no de aislamiento: nada se filtra.
      // Lo que sí queda comprobado es que el dashboard consolidado de Epic 5
      // no puede leer nada hasta que se aplique la migración.
      console.warn(
        "[Story 1.5] DEFECTO ABIERTO: withRlsContextConsolidado aborta con 22P02 en las " +
          "13 tablas por negocio. Migración correctiva lista y sin aplicar: " +
          "packages/database/prisma/migrations/20260901190000_rls_fix_bypass_consolidado/"
      );
    }
  );
});

describe.skipIf(hayCuentas)("Story 1.5 — aislamiento entre negocios", () => {
  it("SKIP: falta infraestructura de test", () => {
    console.warn(
      `[aislamiento-negocios] tests salteados — ${
        "motivoSkip" in cuentas ? cuentas.motivoSkip : ""
      }`
    );
    expect(true).toBe(true);
  });
});
