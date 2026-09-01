-- CreateTable
CREATE TABLE "tipos_gasto" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "negocio_id" UUID,
    "ambito" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clasificacion" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipos_gasto_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tipos_gasto_ambito_check" CHECK ("ambito" IN ('LABORAL', 'PERSONAL')),
    CONSTRAINT "chk_tipo_gasto_ambito" CHECK (
        ("ambito" = 'PERSONAL' AND "negocio_id" IS NULL AND "clasificacion" IN ('FIJO', 'VARIABLE', 'FINANCIERO')) OR
        ("ambito" = 'LABORAL' AND "negocio_id" IS NOT NULL AND "clasificacion" IN ('OPERATIVO', 'FINANCIERO'))
    )
);

-- AddForeignKey
ALTER TABLE "tipos_gasto" ADD CONSTRAINT "tipos_gasto_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "tipos_gasto" ADD CONSTRAINT "tipos_gasto_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "idx_tipos_gasto_negocio" ON "tipos_gasto"("negocio_id");
CREATE INDEX "idx_tipos_gasto_cuenta_ambito" ON "tipos_gasto"("cuenta_id", "ambito");

-- RowLevelSecurity: mismo patrón compuesto cuenta + negocio activo que
-- `monedas` (Story 1.6). [Source: architecture/database-schema.md]
ALTER TABLE "tipos_gasto" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tipos_gasto_isolation" ON "tipos_gasto"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "tipos_gasto" TO app_user;
