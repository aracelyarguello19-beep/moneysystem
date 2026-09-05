-- Revierte 20260905120000_rls_realinear_double_nullif: vuelve a la forma
-- post-rediseño (cast simple, sin el doble nullif) para las mismas 5 tablas.

DROP POLICY IF EXISTS "gastos_isolation" ON "gastos";
CREATE POLICY "gastos_isolation" ON "gastos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY IF EXISTS "gastos_fijos_isolation" ON "gastos_fijos";
CREATE POLICY "gastos_fijos_isolation" ON "gastos_fijos"
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
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
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
                cf."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
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
                cf."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );
