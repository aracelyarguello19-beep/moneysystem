-- CreateTable
CREATE TABLE "negocios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'ACTIVO',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archived_at" TIMESTAMPTZ,

    CONSTRAINT "negocios_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "negocios_estado_check" CHECK ("estado" IN ('ACTIVO', 'ARCHIVADO'))
);

-- AddForeignKey
ALTER TABLE "negocios" ADD CONSTRAINT "negocios_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "idx_negocios_cuenta" ON "negocios"("cuenta_id");

-- RowLevelSecurity: un negocio solo es visible/editable por la cuenta dueña
-- (FR3/FR5, NFR1). [Source: architecture/database-schema.md]
ALTER TABLE "negocios" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "negocios_isolation" ON "negocios"
    USING ("cuenta_id" = auth.uid());

-- GRANT explícito e idempotente para app_user. Ya debería estar cubierto por
-- el ALTER DEFAULT PRIVILEGES configurado en Story 1.1 para tablas nuevas del
-- schema public, pero se deja explícito acá para no depender silenciosamente
-- de esa configuración si cambia en el futuro.
GRANT SELECT, INSERT, UPDATE, DELETE ON "negocios" TO app_user;
