import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asegurarCuenta,
  borrarNegocioCompleto,
  capturarError,
  crearNegocioCompleto,
  prisma,
  resolverCuentasDePrueba,
  withRlsContext,
  type NegocioFixture,
} from "./helpers/rls-fixtures";

// ============================================================================
// Story 1.3 — AC2 / AC3: aislamiento de datos multi-tenant entre cuentas.
// ============================================================================
// CONTRA POSTGRES REAL, NUNCA MOCKEADO. El mecanismo que se verifica acá (RLS)
// vive en Postgres, no en el código de la aplicación: un Prisma mockeado
// pasaría trivialmente aunque las policies estuvieran mal escritas o ausentes,
// dando una falsa sensación de seguridad exactamente en el área que el PRD
// marca como crítica.
// [Source: architecture/testing-strategy.md#Test Organization]

const cuentas = await resolverCuentasDePrueba();
const hayCuentas = "cuentaA" in cuentas;

describe.skipIf(!hayCuentas)("Story 1.3 — aislamiento entre cuentas (Postgres real)", () => {
  const cuentaA = hayCuentas ? cuentas.cuentaA : "";
  const cuentaB = hayCuentas ? cuentas.cuentaB : "";

  let negocioA: NegocioFixture;
  let negocioB: NegocioFixture;

  beforeAll(async () => {
    await asegurarCuenta(cuentaA);
    await asegurarCuenta(cuentaB);
    negocioA = await crearNegocioCompleto(cuentaA, "Negocio de la Cuenta A");
    negocioB = await crearNegocioCompleto(cuentaB, "Negocio de la Cuenta B");
  });

  afterAll(async () => {
    if (negocioA) await borrarNegocioCompleto(cuentaA, negocioA.negocioId);
    if (negocioB) await borrarNegocioCompleto(cuentaB, negocioB.negocioId);
    await prisma.$disconnect();
  });

  // --------------------------------------------------------------------------
  // Precondición: sin esto, todos los tests de abajo pasarían por la razón
  // equivocada. Si Prisma se conectara como `postgres` o `service_role` (ambos
  // BYPASSRLS), las policies serían decorativas.
  // --------------------------------------------------------------------------
  it("el rol con el que se conecta la aplicación no puede saltearse RLS", async () => {
    const [{ rol, bypassrls, superuser }] = await prisma.$queryRawUnsafe<
      { rol: string; bypassrls: boolean; superuser: boolean }[]
    >(
      `select current_user as rol,
              rolbypassrls as bypassrls,
              rolsuper as superuser
         from pg_roles where rolname = current_user`
    );

    expect(bypassrls, `el rol "${rol}" tiene BYPASSRLS: las policies no se aplican`).toBe(false);
    expect(superuser, `el rol "${rol}" es superuser: las policies no se aplican`).toBe(false);
  });

  it("todas las tablas financieras tienen RLS habilitada y al menos una policy", async () => {
    const tablas = [
      "cuentas",
      "negocios",
      "monedas",
      "tipos_gasto",
      "items",
      "cuentas_financieras",
      "tasas_cambio",
      "compras",
      "ventas",
      "venta_items",
      "cuentas_por_cobrar",
      "gastos",
      "movimientos_cuenta",
    ];

    const filas = await prisma.$queryRawUnsafe<
      { tabla: string; rls: boolean; policies: bigint }[]
    >(
      `select c.relname as tabla,
              c.relrowsecurity as rls,
              (select count(*) from pg_policy p where p.polrelid = c.oid) as policies
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'`
    );
    const porTabla = new Map(filas.map((f) => [f.tabla, f]));

    for (const tabla of tablas) {
      const fila = porTabla.get(tabla);
      expect(fila, `la tabla ${tabla} no existe`).toBeDefined();
      expect(fila!.rls, `${tabla} no tiene RLS habilitada`).toBe(true);
      expect(Number(fila!.policies), `${tabla} no tiene ninguna policy`).toBeGreaterThan(0);
    }
  });

  // --------------------------------------------------------------------------
  // AC1 — el filtro por cuenta ocurre en la capa de datos, no en la consulta.
  // Ninguna de estas queries lleva un `where` por cuenta: si algo aparece de la
  // otra cuenta, es porque la policy no está filtrando.
  // --------------------------------------------------------------------------
  it("AC1: una lectura sin filtro explícito solo devuelve filas de la cuenta autenticada", async () => {
    const vistoPorA = await withRlsContext(cuentaA, negocioA.negocioId, async (tx) => ({
      cuentas: (await tx.cuenta.findMany({})).map((c) => c.id),
      negocios: (await tx.negocio.findMany({})).map((n) => n.id),
      items: (await tx.item.findMany({})).map((i) => i.id),
      ventas: (await tx.venta.findMany({})).map((v) => v.id),
      gastos: (await tx.gasto.findMany({})).map((g) => g.id),
    }));

    expect(vistoPorA.cuentas).toEqual([cuentaA]);
    expect(vistoPorA.negocios).toContain(negocioA.negocioId);
    expect(vistoPorA.negocios).not.toContain(negocioB.negocioId);
    expect(vistoPorA.items).not.toContain(negocioB.itemId);
    expect(vistoPorA.ventas).not.toContain(negocioB.ventaId);
    expect(vistoPorA.gastos).not.toContain(negocioB.gastoId);
  });

  // --------------------------------------------------------------------------
  // AC3 — acceso por identificador directo (el caso "manipular la URL").
  // --------------------------------------------------------------------------
  it("AC3: leer un recurso de otra cuenta por id directo devuelve vacío, no la fila", async () => {
    const resultado = await withRlsContext(cuentaA, negocioA.negocioId, async (tx) => ({
      negocio: await tx.negocio.findUnique({ where: { id: negocioB.negocioId } }),
      item: await tx.item.findUnique({ where: { id: negocioB.itemId } }),
      venta: await tx.venta.findUnique({ where: { id: negocioB.ventaId } }),
      cuentaFinanciera: await tx.cuentaFinanciera.findUnique({
        where: { id: negocioB.cuentaFinancieraId },
      }),
      cuentaPorCobrar: await tx.cuentaPorCobrar.findUnique({
        where: { id: negocioB.cuentaPorCobrarId },
      }),
      tasa: await tx.tasaCambio.findUnique({ where: { id: negocioB.tasaCambioId } }),
      cuenta: await tx.cuenta.findUnique({ where: { id: cuentaB } }),
    }));

    for (const [entidad, fila] of Object.entries(resultado)) {
      expect(fila, `la Cuenta A pudo leer ${entidad} de la Cuenta B por id directo`).toBeNull();
    }
  });

  it("AC3: escribir sobre un recurso de otra cuenta por id directo es rechazado", async () => {
    const errorUpdate = await capturarError(() =>
      withRlsContext(cuentaA, negocioA.negocioId, (tx) =>
        tx.negocio.update({
          where: { id: negocioB.negocioId },
          data: { nombre: "TOMADO POR LA CUENTA A" },
        })
      )
    );
    expect(errorUpdate, "la Cuenta A pudo actualizar un negocio de la Cuenta B").not.toBeNull();
    expect(errorUpdate!.code).toBe("P2025");

    const errorDelete = await capturarError(() =>
      withRlsContext(cuentaA, negocioA.negocioId, (tx) =>
        tx.venta.delete({ where: { id: negocioB.ventaId } })
      )
    );
    expect(errorDelete, "la Cuenta A pudo borrar una venta de la Cuenta B").not.toBeNull();
    expect(errorDelete!.code).toBe("P2025");

    // La fila de la Cuenta B sigue intacta y con su nombre original.
    const negocioBIntacto = await withRlsContext(cuentaB, negocioB.negocioId, (tx) =>
      tx.negocio.findUnique({ where: { id: negocioB.negocioId } })
    );
    expect(negocioBIntacto?.nombre).toBe("Negocio de la Cuenta B");
  });

  // --------------------------------------------------------------------------
  // AC2 — escritura: ni creando filas a nombre de otra cuenta, ni moviendo las
  // propias hacia otra cuenta.
  // --------------------------------------------------------------------------
  it("AC2: no se puede crear una fila a nombre de otra cuenta", async () => {
    const error = await capturarError(() =>
      withRlsContext(cuentaA, negocioA.negocioId, (tx) =>
        tx.negocio.create({ data: { cuentaId: cuentaB, nombre: "Negocio plantado por A" } })
      )
    );

    expect(error, "la Cuenta A pudo crear un negocio a nombre de la Cuenta B").not.toBeNull();
    expect(error!.message).toMatch(/row-level security|violates|policy/i);

    const negociosDeB = await withRlsContext(cuentaB, null, (tx) => tx.negocio.findMany({}));
    expect(negociosDeB.map((n) => n.nombre)).not.toContain("Negocio plantado por A");
  });

  it("AC2: no se puede reasignar una fila propia a otra cuenta", async () => {
    const error = await capturarError(() =>
      withRlsContext(cuentaA, negocioA.negocioId, (tx) =>
        tx.negocio.update({
          where: { id: negocioA.negocioId },
          data: { cuentaId: cuentaB },
        })
      )
    );

    expect(error, "la Cuenta A pudo transferir su negocio a la Cuenta B").not.toBeNull();
    expect(error!.message).toMatch(/row-level security|violates|policy/i);
  });

  it("AC2: una escritura masiva sin `where` solo alcanza filas de la cuenta autenticada", async () => {
    const marca = `marcado-${randomUUID().slice(0, 8)}`;

    const afectadas = await withRlsContext(cuentaA, negocioA.negocioId, (tx) =>
      tx.venta.updateMany({ data: { cliente: marca } })
    );
    expect(afectadas.count).toBeGreaterThan(0);

    const ventasDeB = await withRlsContext(cuentaB, negocioB.negocioId, (tx) =>
      tx.venta.findMany({})
    );
    expect(ventasDeB.length).toBeGreaterThan(0);
    for (const venta of ventasDeB) {
      expect(venta.cliente, "un updateMany de la Cuenta A alcanzó una venta de la Cuenta B").not.toBe(
        marca
      );
    }
  });

  // --------------------------------------------------------------------------
  // AC1 — tablas sin `cuenta_id` propio: la policy se resuelve vía `exists(...)`
  // contra la tabla padre. Son las más fáciles de dejar sin cubrir por descuido.
  // --------------------------------------------------------------------------
  it("AC1: las tablas sin cuenta_id propio también quedan aisladas (venta_items, movimientos_cuenta)", async () => {
    const vistoPorA = await withRlsContext(cuentaA, negocioA.negocioId, async (tx) => ({
      ventaItemDirecto: await tx.ventaItem.findUnique({ where: { id: negocioB.ventaItemId } }),
      movimientoDirecto: await tx.movimientoCuenta.findUnique({
        where: { id: negocioB.movimientoCuentaId },
      }),
      ventaItems: (await tx.ventaItem.findMany({})).map((v) => v.id),
      movimientos: (await tx.movimientoCuenta.findMany({})).map((m) => m.id),
    }));

    expect(vistoPorA.ventaItemDirecto).toBeNull();
    expect(vistoPorA.movimientoDirecto).toBeNull();
    expect(vistoPorA.ventaItems).not.toContain(negocioB.ventaItemId);
    expect(vistoPorA.movimientos).not.toContain(negocioB.movimientoCuentaId);
    expect(vistoPorA.ventaItems).toContain(negocioA.ventaItemId);
  });

  it("AC1: sin contexto de RLS no se ve absolutamente nada", async () => {
    // Sin `set_config('request.jwt.claims', ...)`, `auth.uid()` es null y toda
    // policy `cuenta_id = auth.uid()` da falso. Es la red de seguridad para el
    // caso en que alguien llame a `prisma` sin pasar por `withRlsContext`.
    const filas = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `select count(*)::bigint as n from negocios`
    );
    expect(Number(filas[0].n)).toBe(0);
  });
});

describe.skipIf(hayCuentas)("Story 1.3 — aislamiento entre cuentas", () => {
  it("SKIP: falta infraestructura de test", () => {
    console.warn(
      `[aislamiento-cuentas] tests salteados — ${
        "motivoSkip" in cuentas ? cuentas.motivoSkip : ""
      }`
    );
    expect(true).toBe(true);
  });
});
