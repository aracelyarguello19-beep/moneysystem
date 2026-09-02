-- Rediseño Ventas/Inventario/Caja/Gastos.
-- Base de datos sin datos reales relevantes en las tablas tocadas (verificado
-- antes de escribir esta migración: 0 filas en cuentas_financieras, gastos,
-- items, compras, ventas, retiros_utilidad, regla_retiro), así que los
-- cambios estructurales (columnas NOT NULL, drop de tablas) son seguros.

-- === Items: foto de producto ===
ALTER TABLE "items" ADD COLUMN "imagen_url" TEXT;

-- === Compras: compra "sin stock" (venta libre) ===
ALTER TABLE "compras" ADD COLUMN "afecta_inventario" BOOLEAN NOT NULL DEFAULT true;

-- === Venta items: línea de "venta libre" (sobre pedido, fuera de inventario) ===
ALTER TABLE "venta_items" ADD COLUMN "es_libre" BOOLEAN NOT NULL DEFAULT false;

-- === Gastos: ambito pasa de LABORAL/PERSONAL(negocio null) a
-- NEGOCIO/PERSONAL, ambos siempre dentro de un negocio (reemplaza Retiro) ===
ALTER TABLE "gastos" DROP CONSTRAINT "chk_gasto_ambito";
ALTER TABLE "gastos" DROP CONSTRAINT "gastos_ambito_check";
ALTER TABLE "gastos" ALTER COLUMN "negocio_id" SET NOT NULL;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_ambito_check" CHECK ("ambito" IN ('NEGOCIO', 'PERSONAL'));

DROP POLICY "gastos_isolation" ON "gastos";
CREATE POLICY "gastos_isolation" ON "gastos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- === Gastos fijos (nuevo) ===
CREATE TABLE "gastos_fijos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "moneda_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_fijos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gastos_fijos_monto_check" CHECK ("monto" > 0)
);

ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "gastos_fijos" ADD CONSTRAINT "gastos_fijos_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id");

CREATE INDEX "idx_gastos_fijos_negocio" ON "gastos_fijos"("negocio_id");

ALTER TABLE "gastos_fijos" ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gastos_fijos_isolation" ON "gastos_fijos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON "gastos_fijos" TO app_user;

-- === Cuentas financieras: rediseño para "Caja" unificada ===
-- Personal ya no existe como ámbito global: negocio_id siempre presente,
-- columna `ambito` (LABORAL/PERSONAL) redundante, se elimina.
ALTER TABLE "cuentas_financieras" DROP CONSTRAINT "chk_cta_fin_ambito";
ALTER TABLE "cuentas_financieras" DROP CONSTRAINT "cuentas_financieras_ambito_check";
ALTER TABLE "cuentas_financieras" ALTER COLUMN "negocio_id" SET NOT NULL;
ALTER TABLE "cuentas_financieras" DROP COLUMN "ambito";

ALTER TABLE "cuentas_financieras" DROP CONSTRAINT "cuentas_financieras_tipo_check";
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_tipo_check"
    CHECK ("tipo" IN ('CAJA', 'BANCO', 'TARJETA', 'OTRO'));

ALTER TABLE "cuentas_financieras" ADD COLUMN "banco" TEXT;
ALTER TABLE "cuentas_financieras" ADD COLUMN "alias" TEXT;
ALTER TABLE "cuentas_financieras" ADD COLUMN "detalle_otro" TEXT;

DROP POLICY "cuentas_financieras_isolation" ON "cuentas_financieras";
CREATE POLICY "cuentas_financieras_isolation" ON "cuentas_financieras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

DROP POLICY "movimientos_cuenta_isolation" ON "movimientos_cuenta";
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

DROP POLICY "movimientos_tarjeta_isolation" ON "movimientos_tarjeta";
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

-- === Retiro (sesión eliminada, reemplazada por Gasto ambito=PERSONAL) ===
DROP TABLE "retiros_utilidad";
DROP TABLE "regla_retiro";
