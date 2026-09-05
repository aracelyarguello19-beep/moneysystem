-- Revierte 20260905121500_tasas_cambio_negocio_scope: vuelve al filtro
-- exclusivamente por cuenta (sin negocio) para `tasas_cambio`.

DROP POLICY IF EXISTS "tasas_cambio_isolation" ON "tasas_cambio";
CREATE POLICY "tasas_cambio_isolation" ON "tasas_cambio"
    USING ("registrada_por" = auth.uid());
