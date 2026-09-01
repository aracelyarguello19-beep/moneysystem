-- CreateTable
CREATE TABLE "cuentas_por_cobrar" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "cuenta_id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "cliente" TEXT NOT NULL,
    "monto_original" DECIMAL(18,4) NOT NULL,
    "monto_pagado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "estado" TEXT NOT NULL DEFAULT 'PENDIENTE',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_por_cobrar_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cxc_monto_original_check" CHECK ("monto_original" >= 0),
    CONSTRAINT "cxc_estado_check" CHECK ("estado" IN ('PENDIENTE', 'PARCIAL', 'PAGADO'))
);

-- "cuenta_financiera_id" es UUID simple SIN FK todavía (Story 4.3 no
-- existe) — mismo criterio de deuda técnica de Compra/Venta.
CREATE TABLE "pagos_cxc" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_por_cobrar_id" UUID NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "cuenta_financiera_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagos_cxc_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "pagos_cxc_monto_check" CHECK ("monto" > 0)
);

-- AddForeignKey
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "cuentas_por_cobrar" ADD CONSTRAINT "cuentas_por_cobrar_venta_id_fkey"
    FOREIGN KEY ("venta_id") REFERENCES "ventas"("id");

ALTER TABLE "pagos_cxc" ADD CONSTRAINT "pagos_cxc_cuenta_por_cobrar_id_fkey"
    FOREIGN KEY ("cuenta_por_cobrar_id") REFERENCES "cuentas_por_cobrar"("id") ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "idx_cxc_negocio_estado" ON "cuentas_por_cobrar"("negocio_id", "estado");
-- Una venta genera a lo sumo una cuenta por cobrar (Story 3.1/3.4).
CREATE UNIQUE INDEX "cuentas_por_cobrar_venta_id_key" ON "cuentas_por_cobrar"("venta_id");

-- RowLevelSecurity
ALTER TABLE "cuentas_por_cobrar" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cxc_isolation" ON "cuentas_por_cobrar"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- pagos_cxc no tiene cuenta_id/negocio_id propio: mismo patrón que
-- venta_items, vía exists(...) contra cuentas_por_cobrar.
ALTER TABLE "pagos_cxc" ENABLE ROW LEVEL SECURITY;

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

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "cuentas_por_cobrar" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "pagos_cxc" TO app_user;
