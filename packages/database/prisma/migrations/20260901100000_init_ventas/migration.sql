-- CreateTable
-- NOTA (deuda técnica documentada, mismo criterio que Story 2.2/compras):
-- "cuenta_financiera_id" y "tasa_cambio_id" son UUID simples, SIN foreign
-- key todavía (Story 4.3/5.3 no existen). Agregar las FKs ahí mismo cuando
-- esas tablas existan.
CREATE TABLE "ventas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "cliente" TEXT,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "forma_cobro" TEXT NOT NULL,
    "impuesto" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVA',
    "cuenta_financiera_id" UUID,
    "moneda_id" UUID NOT NULL,
    "tasa_cambio_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ventas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ventas_forma_cobro_check" CHECK ("forma_cobro" IN ('EFECTIVO', 'BANCO', 'TARJETA', 'CREDITO_CLIENTE')),
    CONSTRAINT "ventas_estado_check" CHECK ("estado" IN ('ACTIVA', 'CANCELADA', 'DEVUELTA_PARCIAL'))
);

CREATE TABLE "venta_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "venta_id" UUID NOT NULL,
    "item_id" UUID NOT NULL,
    "cantidad" DECIMAL(18,4),
    "precio_unitario" DECIMAL(18,4) NOT NULL,
    "costo_servicio" DECIMAL(18,4),
    "cantidad_devuelta" DECIMAL(18,4) NOT NULL DEFAULT 0,

    CONSTRAINT "venta_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venta_items_precio_unitario_check" CHECK ("precio_unitario" >= 0)
);

-- AddForeignKey
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id");

ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_venta_id_fkey"
    FOREIGN KEY ("venta_id") REFERENCES "ventas"("id") ON DELETE CASCADE;
ALTER TABLE "venta_items" ADD CONSTRAINT "venta_items_item_id_fkey"
    FOREIGN KEY ("item_id") REFERENCES "items"("id");

-- CreateIndex
CREATE INDEX "idx_ventas_negocio_fecha" ON "ventas"("negocio_id", "fecha" DESC);

-- RowLevelSecurity
ALTER TABLE "ventas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ventas_isolation" ON "ventas"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- venta_items no tiene cuenta_id/negocio_id propios: la policy se resuelve
-- vía exists(...) contra ventas.
ALTER TABLE "venta_items" ENABLE ROW LEVEL SECURITY;

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

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "ventas" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "venta_items" TO app_user;
