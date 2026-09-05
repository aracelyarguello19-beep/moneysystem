-- ============================================================================
-- Realinear 5 policies con el fix de doble nullif (Story 1.5 / drift post-rediseño)
-- ============================================================================
--
-- `20260901220000_rediseno_ventas_inventario_caja` reescribió las policies de
-- `gastos`, `gastos_fijos`, `cuentas_financieras`, `movimientos_cuenta` y
-- `movimientos_tarjeta` usando el cast simple `NULLIF(current_setting(...), '')::uuid`,
-- reintroduciendo el bug que `20260901190000_rls_fix_bypass_consolidado` ya había
-- corregido en las otras 11 tablas: con `app.active_negocio_id = '*'` (lectura
-- consolidada) el cast explota con `22P02 invalid input syntax for type uuid: "*"`.
--
-- Esta migración solo reemplaza esa expresión de cast por
-- `NULLIF(NULLIF(current_setting(...), ''), '*')::uuid` en las 5 tablas, sin tocar
-- ninguna otra condición de las policies (verificado 1:1 contra `pg_policies` en
-- producción antes de escribir esto). No cambia el aislamiento por cuenta ni por
-- negocio para ningún caso hoy en uso — solo el camino `'*'`, que no tiene
-- consumidor en el código actual (no existe `actions/consolidado/`).
--
-- Ver rollback.sql para revertir a la forma actual (post-rediseño).
-- ============================================================================

-- ---------------------------------------------------------------- gastos ----
DROP POLICY IF EXISTS "gastos_isolation" ON "gastos";
CREATE POLICY "gastos_isolation" ON "gastos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ---------------------------------------------------------- gastos_fijos ----
DROP POLICY IF EXISTS "gastos_fijos_isolation" ON "gastos_fijos";
CREATE POLICY "gastos_fijos_isolation" ON "gastos_fijos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ---------------------------------------------------- cuentas_financieras ---
DROP POLICY IF EXISTS "cuentas_financieras_isolation" ON "cuentas_financieras";
CREATE POLICY "cuentas_financieras_isolation" ON "cuentas_financieras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ----------------------------------------------------- movimientos_cuenta ---
DROP POLICY IF EXISTS "movimientos_cuenta_isolation" ON "movimientos_cuenta";
CREATE POLICY "movimientos_cuenta_isolation" ON "movimientos_cuenta"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_financieras" cf
            WHERE cf."id" = "movimientos_cuenta"."cuenta_financiera_id"
            AND cf."cuenta_id" = auth.uid()
            AND (
                cf."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- ---------------------------------------------------- movimientos_tarjeta ---
DROP POLICY IF EXISTS "movimientos_tarjeta_isolation" ON "movimientos_tarjeta";
CREATE POLICY "movimientos_tarjeta_isolation" ON "movimientos_tarjeta"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_financieras" cf
            WHERE cf."id" = "movimientos_tarjeta"."cuenta_financiera_id"
            AND cf."cuenta_id" = auth.uid()
            AND (
                cf."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );
