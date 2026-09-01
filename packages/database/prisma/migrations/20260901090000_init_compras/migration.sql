-- CreateTable
-- NOTA (deuda técnica documentada): "cuenta_financiera_id" y "tasa_cambio_id"
-- son UUID simples, SIN foreign key todavía. Sus tablas de destino
-- (cuentas_financieras, Story 4.3; tasas_cambio, Story 5.3) no existen aún.
-- Cuando esas stories las creen, agregar ahí mismo:
--   ALTER TABLE "compras" ADD CONSTRAINT "compras_cuenta_financiera_id_fkey"
--     FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id");
--   ALTER TABLE "compras" ADD CONSTRAINT "compras_tasa_cambio_id_fkey"
--     FOREIGN KEY ("tasa_cambio_id") REFERENCES "tasas_cambio"("id");
CREATE TABLE "compras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "costo_unitario" DECIMAL(18,4) NOT NULL,
    "cantidad" DECIMAL(18,4) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "proveedor" TEXT,
    "forma_pago" TEXT NOT NULL,
    "cuenta_financiera_id" UUID,
    "moneda_id" UUID NOT NULL,
    "tasa_cambio_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compras_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "compras_costo_unitario_check" CHECK ("costo_unitario" >= 0),
    CONSTRAINT "compras_cantidad_check" CHECK ("cantidad" > 0),
    CONSTRAINT "compras_forma_pago_check" CHECK ("forma_pago" IN ('EFECTIVO', 'BANCO', 'TARJETA', 'CREDITO_PROVEEDOR')),
    CONSTRAINT "chk_compra_medio_pago" CHECK (
        ("forma_pago" = 'CREDITO_PROVEEDOR' AND "cuenta_financiera_id" IS NULL) OR
        ("forma_pago" <> 'CREDITO_PROVEEDOR' AND "cuenta_financiera_id" IS NOT NULL)
    )
);

-- AddForeignKey (solo a tablas que ya existen)
ALTER TABLE "compras" ADD CONSTRAINT "compras_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "compras" ADD CONSTRAINT "compras_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "compras" ADD CONSTRAINT "compras_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id");
ALTER TABLE "compras" ADD CONSTRAINT "compras_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id");

-- CreateIndex
CREATE INDEX "idx_compras_negocio_fecha" ON "compras"("negocio_id", "fecha" DESC);

-- RowLevelSecurity
ALTER TABLE "compras" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compras_isolation" ON "compras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "compras" TO app_user;
