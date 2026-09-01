-- ============================================================================
-- ROLLBACK de 20260901190000_rls_fix_bypass_consolidado
-- ============================================================================
--
-- Restaura las policies exactamente como estaban antes de la corrección
-- (cast directo del setting a uuid). Prisma Migrate no ejecuta este archivo:
-- se aplica a mano con el rol dueño del schema si hiciera falta revertir.
--
--     psql "$DIRECT_URL" -f rollback.sql
--
-- ADVERTENCIA: revertir reintroduce el defecto original — `withRlsContextConsolidado`
-- vuelve a abortar con `22P02 invalid input syntax for type uuid: "*"` en las 13
-- tablas por negocio, y el dashboard consolidado (Epic 5) deja de funcionar.
-- El aislamiento por cuenta y por negocio NO cambia en ninguno de los dos
-- sentidos: esta migración no relaja ni endurece qué filas ve cada cuenta.
-- ============================================================================

DROP POLICY IF EXISTS "monedas_isolation" ON "monedas";
CREATE POLICY "monedas_isolation" ON "monedas"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "tipos_gasto_isolation" ON "tipos_gasto";
CREATE POLICY "tipos_gasto_isolation" ON "tipos_gasto"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "items_isolation" ON "items";
CREATE POLICY "items_isolation" ON "items"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "cuentas_financieras_isolation" ON "cuentas_financieras";
CREATE POLICY "cuentas_financieras_isolation" ON "cuentas_financieras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "compras_isolation" ON "compras";
CREATE POLICY "compras_isolation" ON "compras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "ventas_isolation" ON "ventas";
CREATE POLICY "ventas_isolation" ON "ventas"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "venta_items_isolation" ON "venta_items";
CREATE POLICY "venta_items_isolation" ON "venta_items"
    USING (
        EXISTS (
            SELECT 1 FROM "ventas" v
            WHERE v."id" = "venta_items"."venta_id"
            AND v."cuenta_id" = auth.uid()
            AND (
                v."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

DROP POLICY IF EXISTS "cxc_isolation" ON "cuentas_por_cobrar";
CREATE POLICY "cxc_isolation" ON "cuentas_por_cobrar"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "pagos_cxc_isolation" ON "pagos_cxc";
CREATE POLICY "pagos_cxc_isolation" ON "pagos_cxc"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_por_cobrar" c
            WHERE c."id" = "pagos_cxc"."cuenta_por_cobrar_id"
            AND c."cuenta_id" = auth.uid()
            AND (
                c."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

DROP POLICY IF EXISTS "gastos_isolation" ON "gastos";
CREATE POLICY "gastos_isolation" ON "gastos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "movimientos_cuenta_isolation" ON "movimientos_cuenta";
CREATE POLICY "movimientos_cuenta_isolation" ON "movimientos_cuenta"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_financieras" cf
            WHERE cf."id" = "movimientos_cuenta"."cuenta_financiera_id"
            AND cf."cuenta_id" = auth.uid()
            AND (
                cf."negocio_id" IS NULL
                OR cf."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

DROP POLICY IF EXISTS "movimientos_tarjeta_isolation" ON "movimientos_tarjeta";
CREATE POLICY "movimientos_tarjeta_isolation" ON "movimientos_tarjeta"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_financieras" cf
            WHERE cf."id" = "movimientos_tarjeta"."cuenta_financiera_id"
            AND cf."cuenta_id" = auth.uid()
            AND (
                cf."negocio_id" IS NULL
                OR cf."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

DROP POLICY IF EXISTS "regla_retiro_isolation" ON "regla_retiro";
CREATE POLICY "regla_retiro_isolation" ON "regla_retiro"
    USING (
        EXISTS (
            SELECT 1 FROM "negocios" n
            WHERE n."id" = "regla_retiro"."negocio_id"
            AND n."cuenta_id" = auth.uid()
            AND (
                n."id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );
