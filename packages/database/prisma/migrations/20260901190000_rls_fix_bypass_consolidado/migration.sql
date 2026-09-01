-- ============================================================================
-- Story 1.5 — corrección del bypass consolidado `app.active_negocio_id = '*'`
-- ============================================================================
--
-- PROBLEMA (detectado por packages/database/tests/aislamiento-negocios.test.ts
-- corriendo contra el Postgres real, no mockeado):
--
--   Las policies por negocio castean el setting a uuid ANTES de comparar:
--
--       negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
--       or current_setting('app.active_negocio_id', true) = '*'
--
--   PostgreSQL no garantiza el orden de evaluación de los operandos de un `OR`
--   ni la evaluación en cortocircuito: el planner es libre de evaluar el cast
--   primero. Cuando el setting vale `'*'` (lectura consolidada de Story 5.4),
--   ese cast se ejecuta sobre la cadena `'*'` y la query entera aborta con
--   `22P02 invalid input syntax for type uuid: "*"`.
--
--   Verificado contra el proyecto real: 13 de 16 tablas fallan con un simple
--   `select count(*)` bajo el bypass — monedas, tipos_gasto, items,
--   cuentas_financieras, compras, ventas, cuentas_por_cobrar, gastos,
--   venta_items, movimientos_cuenta, movimientos_tarjeta, pagos_cxc y
--   regla_retiro. Es decir: `withRlsContextConsolidado` —y con él el dashboard
--   consolidado de Epic 5— no puede leer NADA. No es un problema de
--   aislamiento (el aislamiento por cuenta y por negocio funciona
--   correctamente): es el camino consolidado el que está inutilizable.
--
-- SOLUCIÓN:
--
--   Sacar el `'*'` del operando que se castea, en vez de confiar en el orden
--   de evaluación:
--
--       nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
--
--   Con el setting en `'*'`, el `nullif` interno lo convierte en NULL, el cast
--   de NULL es válido, la comparación da NULL (falso) y la rama
--   `current_setting(...) = '*'` es la que habilita la fila. El cast nunca
--   recibe una cadena que no sea un uuid o NULL, sin importar cómo el planner
--   reordene el `OR`.
--
-- SEMÁNTICA: idéntica a la anterior en todos los casos que hoy funcionan
--   (setting vacío, sin setear, o con un uuid). Lo único que cambia es que el
--   caso `'*'` pasa de "error 22P02" a "ver todos los negocios de la cuenta",
--   que es lo que architecture/database-schema.md siempre dijo que debía pasar.
--
-- WITH CHECK: se mantiene omitido, igual que en las migraciones originales.
--   En una policy `FOR ALL` sin `WITH CHECK`, PostgreSQL usa la expresión de
--   `USING` también como check de las filas nuevas/modificadas — así que
--   INSERT y UPDATE quedan cubiertos por la misma condición, sin posibilidad
--   de que las dos expresiones diverjan. Verificado explícitamente en
--   `aislamiento-cuentas.test.ts` ("no se puede crear una fila a nombre de otra
--   cuenta" / "no se puede reasignar una fila propia a otra cuenta").
--
-- [Source: architecture/database-schema.md, Story 1.5 AC1/Task 1, Story 5.4]
-- ============================================================================

-- ---------------------------------------------------------------- monedas ---
DROP POLICY IF EXISTS "monedas_isolation" ON "monedas";
CREATE POLICY "monedas_isolation" ON "monedas"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ------------------------------------------------------------ tipos_gasto ---
DROP POLICY IF EXISTS "tipos_gasto_isolation" ON "tipos_gasto";
CREATE POLICY "tipos_gasto_isolation" ON "tipos_gasto"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ------------------------------------------------------------------ items ---
DROP POLICY IF EXISTS "items_isolation" ON "items";
CREATE POLICY "items_isolation" ON "items"
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
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ---------------------------------------------------------------- compras ---
DROP POLICY IF EXISTS "compras_isolation" ON "compras";
CREATE POLICY "compras_isolation" ON "compras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ----------------------------------------------------------------- ventas ---
DROP POLICY IF EXISTS "ventas_isolation" ON "ventas";
CREATE POLICY "ventas_isolation" ON "ventas"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- ------------------------------------------------------------ venta_items ---
DROP POLICY IF EXISTS "venta_items_isolation" ON "venta_items";
CREATE POLICY "venta_items_isolation" ON "venta_items"
    USING (
        EXISTS (
            SELECT 1 FROM "ventas" v
            WHERE v."id" = "venta_items"."venta_id"
            AND v."cuenta_id" = auth.uid()
            AND (
                v."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- ----------------------------------------------------- cuentas_por_cobrar ---
DROP POLICY IF EXISTS "cxc_isolation" ON "cuentas_por_cobrar";
CREATE POLICY "cxc_isolation" ON "cuentas_por_cobrar"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- -------------------------------------------------------------- pagos_cxc ---
DROP POLICY IF EXISTS "pagos_cxc_isolation" ON "pagos_cxc";
CREATE POLICY "pagos_cxc_isolation" ON "pagos_cxc"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_por_cobrar" c
            WHERE c."id" = "pagos_cxc"."cuenta_por_cobrar_id"
            AND c."cuenta_id" = auth.uid()
            AND (
                c."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- ----------------------------------------------------------------- gastos ---
DROP POLICY IF EXISTS "gastos_isolation" ON "gastos";
CREATE POLICY "gastos_isolation" ON "gastos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
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
                cf."negocio_id" IS NULL
                OR cf."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
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
                cf."negocio_id" IS NULL
                OR cf."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- ----------------------------------------------------------- regla_retiro ---
DROP POLICY IF EXISTS "regla_retiro_isolation" ON "regla_retiro";
CREATE POLICY "regla_retiro_isolation" ON "regla_retiro"
    USING (
        EXISTS (
            SELECT 1 FROM "negocios" n
            WHERE n."id" = "regla_retiro"."negocio_id"
            AND n."cuenta_id" = auth.uid()
            AND (
                n."id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- NO SE TOCAN, a propósito:
--   `cuentas`, `negocios`, `reserva_financiera` y `retiros_utilidad` no leen
--   `app.active_negocio_id` en su policy, así que nunca ejecutan el cast.
--   `retiros_utilidad` es el caso especial documentado de Story 1.5 Task 2:
--   Personal necesita leer los retiros de TODOS los negocios de la cuenta
--   (FR25), por eso su policy es solo `cuenta_id = auth.uid()`.
