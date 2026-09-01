-- CreateTable
-- NOTA (deuda técnica documentada, mismo criterio que Compra/Venta):
-- "cuenta_financiera_id" es UUID simple SIN foreign key todavía (Story 4.3
-- no existe). Agregar la FK ahí mismo cuando esa tabla exista.
CREATE TABLE "gastos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "negocio_id" UUID,
    "ambito" TEXT NOT NULL,
    "tipo_gasto_id" UUID NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "moneda_id" UUID NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "forma_pago" TEXT NOT NULL,
    "cuenta_financiera_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gastos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "gastos_ambito_check" CHECK ("ambito" IN ('LABORAL', 'PERSONAL')),
    CONSTRAINT "gastos_monto_check" CHECK ("monto" > 0),
    CONSTRAINT "gastos_forma_pago_check" CHECK ("forma_pago" IN ('EFECTIVO', 'BANCO', 'TARJETA')),
    CONSTRAINT "chk_gasto_ambito" CHECK (
        ("ambito" = 'PERSONAL' AND "negocio_id" IS NULL) OR
        ("ambito" = 'LABORAL' AND "negocio_id" IS NOT NULL)
    )
);

-- AddForeignKey (solo a tablas que ya existen)
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_tipo_gasto_id_fkey"
    FOREIGN KEY ("tipo_gasto_id") REFERENCES "tipos_gasto"("id");
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id");

-- CreateIndex
CREATE INDEX "idx_gastos_negocio_fecha" ON "gastos"("negocio_id", "fecha" DESC);

-- RowLevelSecurity
ALTER TABLE "gastos" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gastos_isolation" ON "gastos"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "gastos" TO app_user;
