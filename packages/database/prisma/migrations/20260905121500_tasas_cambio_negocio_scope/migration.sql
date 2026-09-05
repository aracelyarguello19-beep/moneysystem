-- ============================================================================
-- Agregar aislamiento por negocio a tasas_cambio (Hallazgo 2 de la auditoría RLS)
-- ============================================================================
--
-- `tasas_cambio_isolation` solo filtraba por `registrada_por = auth.uid()`
-- (aislamiento por cuenta), sin filtro por negocio en la propia policy — a
-- diferencia de todas las demás tablas con negocio. Hoy no se materializa
-- porque el código de la app ya filtra por `monedaId` antes de consultar, pero
-- la policy por sí sola no impedía ver tasas de cambio de otro negocio de la
-- misma cuenta.
--
-- Se agrega el mismo aislamiento por negocio que ya tiene `monedas`, vía un
-- EXISTS contra la moneda relacionada (mismo patrón que usan
-- `movimientos_cuenta`/`movimientos_tarjeta` contra `cuentas_financieras`).
-- No cambia el aislamiento por cuenta, que sigue intacto.
-- ============================================================================

DROP POLICY IF EXISTS "tasas_cambio_isolation" ON "tasas_cambio";
CREATE POLICY "tasas_cambio_isolation" ON "tasas_cambio"
    USING (
        "registrada_por" = auth.uid()
        AND EXISTS (
            SELECT 1 FROM "monedas" m
            WHERE m."id" = "tasas_cambio"."moneda_id"
            AND m."cuenta_id" = auth.uid()
            AND (
                m."negocio_id" IS NULL
                OR m."negocio_id" = nullif(nullif(current_setting('app.active_negocio_id', true), ''), '*')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );
