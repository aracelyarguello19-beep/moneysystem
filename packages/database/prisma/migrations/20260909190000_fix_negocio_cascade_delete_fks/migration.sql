-- ============================================================================
-- Corrige 16 FKs sin regla ON DELETE dentro del clúster de datos de un negocio
-- ============================================================================
--
-- Al borrar un negocio (`eliminarNegocio`), varias tablas cascadean en
-- paralelo desde `negocios` (compras, ventas, gastos, ítems, monedas,
-- cuentas_financieras, etc., todas con `ON DELETE CASCADE` directo). El
-- problema son las FKs "de referencia" ENTRE esas tablas hermanas (ej.
-- `compras.moneda_id -> monedas.id`, `ventas.tasa_cambio_id -> tasas_cambio.id`)
-- que quedaron sin regla (`NO ACTION`, default de Postgres) porque cuando se
-- crearon esas tablas relacionadas todavía no existían (deuda técnica
-- documentada en los comentarios de `Compra`/`Venta`/`Gasto` en schema.prisma).
--
-- Postgres no garantiza el orden entre cascadas independientes de un mismo
-- padre: si la cascada hacia `monedas` (o `items`/`ventas`/`tipos_gasto`)
-- corre antes que la cascada hacia la tabla que todavía la referencia con
-- `NO ACTION`, la fila referenciada no se puede borrar y toda la transacción
-- de `eliminarNegocio` falla con un P2003 ("violates foreign key
-- constraint"), sin importar el estado (ACTIVO/ARCHIVADO) del negocio.
--
-- Regla aplicada: CASCADE cuando la columna es NOT NULL (la fila referenciada
-- de todos modos va a desaparecer con el negocio); SET NULL cuando es
-- nullable y el dato es solo histórico/informativo (`tasa_cambio_id`,
-- `cuenta_financiera_id` en compras/ventas, `item_id` en venta_items para
-- ventas libres).
-- ============================================================================

-- items -> monedas
ALTER TABLE "items" DROP CONSTRAINT "items_moneda_id_fkey";
ALTER TABLE "items" ADD CONSTRAINT "items_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;

-- compras -> items, monedas, cuentas_financieras, tasas_cambio
ALTER TABLE "compras" DROP CONSTRAINT "compras_item_id_fkey";
ALTER TABLE "compras" ADD CONSTRAINT "compras_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE CASCADE;

ALTER TABLE "compras" DROP CONSTRAINT "compras_moneda_id_fkey";
ALTER TABLE "compras" ADD CONSTRAINT "compras_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;

ALTER TABLE "compras" DROP CONSTRAINT "compras_cuenta_financiera_id_fkey";
ALTER TABLE "compras" ADD CONSTRAINT "compras_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE SET NULL;

ALTER TABLE "compras" DROP CONSTRAINT "compras_tasa_cambio_id_fkey";
ALTER TABLE "compras" ADD CONSTRAINT "compras_tasa_cambio_id_fkey"
    FOREIGN KEY ("tasa_cambio_id") REFERENCES "tasas_cambio"("id") ON DELETE SET NULL;

-- ventas -> monedas, cuentas_financieras, tasas_cambio
ALTER TABLE "ventas" DROP CONSTRAINT "ventas_moneda_id_fkey";
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;

ALTER TABLE "ventas" DROP CONSTRAINT "ventas_cuenta_financiera_id_fkey";
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE SET NULL;

ALTER TABLE "ventas" DROP CONSTRAINT "ventas_tasa_cambio_id_fkey";
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tasa_cambio_id_fkey"
    FOREIGN KEY ("tasa_cambio_id") REFERENCES "tasas_cambio"("id") ON DELETE SET NULL;

-- venta_items -> items
ALTER TABLE "venta_items" DROP CONSTRAINT "venta_items_item_id_fkey";
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL;

-- cuentas_por_cobrar -> ventas
ALTER TABLE "cuentas_por_cobrar" DROP CONSTRAINT "cuentas_por_cobrar_venta_id_fkey";
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_venta_id_fkey"
    FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE;

-- pagos_cxc -> cuentas_financieras
ALTER TABLE "pagos_cxc" DROP CONSTRAINT "pagos_cxc_cuenta_financiera_id_fkey";
ALTER TABLE "pagos_cxc" ADD CONSTRAINT "pagos_cxc_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE CASCADE;

-- gastos -> tipos_gasto, monedas, cuentas_financieras
ALTER TABLE "gastos" DROP CONSTRAINT "gastos_tipo_gasto_id_fkey";
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipo_gasto_id_fkey"
    FOREIGN KEY ("tipo_gasto_id") REFERENCES "tipos_gasto"("id") ON DELETE CASCADE;

ALTER TABLE "gastos" DROP CONSTRAINT "gastos_moneda_id_fkey";
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;

ALTER TABLE "gastos" DROP CONSTRAINT "gastos_cuenta_financiera_id_fkey";
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE CASCADE;

-- gastos_fijos -> monedas
ALTER TABLE "gastos_fijos" DROP CONSTRAINT "gastos_fijos_moneda_id_fkey";
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;

-- cuentas_financieras -> monedas
ALTER TABLE "cuentas_financieras" DROP CONSTRAINT "cuentas_financieras_moneda_id_fkey";
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;
