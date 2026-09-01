-- CreateTable
CREATE TABLE "regla_retiro" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "negocio_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "valor" DECIMAL(18,4) NOT NULL,
    "periodo" TEXT NOT NULL DEFAULT 'MENSUAL',
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "ultimo_periodo_aplicado" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regla_retiro_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "regla_retiro_negocio_id_key" UNIQUE ("negocio_id"),
    CONSTRAINT "regla_retiro_tipo_check" CHECK ("tipo" IN ('PORCENTAJE', 'MONTO_FIJO')),
    CONSTRAINT "regla_retiro_valor_check" CHECK ("valor" > 0),
    CONSTRAINT "regla_retiro_periodo_check" CHECK ("periodo" IN ('MENSUAL'))
);

-- AddForeignKey
ALTER TABLE "regla_retiro" ADD CONSTRAINT "regla_retiro_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;

-- RowLevelSecurity
ALTER TABLE "regla_retiro" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "regla_retiro_isolation" ON "regla_retiro"
    USING (
        EXISTS (
            SELECT 1 FROM "negocios" n
            WHERE n."id" = "regla_retiro"."negocio_id"
            AND n."cuenta_id" = auth.uid()
            AND (
                n."id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "regla_retiro" TO app_user;
