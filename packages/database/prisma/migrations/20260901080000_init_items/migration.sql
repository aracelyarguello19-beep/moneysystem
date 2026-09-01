-- CreateTable
CREATE TABLE "items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "precio_venta" DECIMAL(18,4) NOT NULL,
    "moneda_id" UUID NOT NULL,
    "costo_compra" DECIMAL(18,4),
    "stock_actual" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "tiene_movimientos" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "items_tipo_check" CHECK ("tipo" IN ('PRODUCTO', 'SERVICIO')),
    CONSTRAINT "items_precio_venta_check" CHECK ("precio_venta" >= 0),
    CONSTRAINT "items_costo_compra_check" CHECK ("costo_compra" IS NULL OR "costo_compra" >= 0),
    CONSTRAINT "chk_item_servicio_sin_stock" CHECK ("tipo" = 'PRODUCTO' OR "stock_actual" = 0)
);

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "items" ADD CONSTRAINT "items_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id");

-- CreateIndex
CREATE INDEX "idx_items_negocio" ON "items"("negocio_id");

-- RowLevelSecurity: Item es exclusivamente Laboral, siempre requiere
-- coincidencia de negocio activo (a diferencia de Moneda/TipoGasto, no
-- admite negocio_id null para un caso "Personal").
-- [Source: architecture/database-schema.md]
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "items_isolation" ON "items"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "items" TO app_user;
