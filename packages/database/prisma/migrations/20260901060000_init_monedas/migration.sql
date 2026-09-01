-- CreateTable
CREATE TABLE "monedas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "negocio_id" UUID,
    "ambito" TEXT NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_base" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monedas_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "monedas_ambito_check" CHECK ("ambito" IN ('LABORAL', 'PERSONAL')),
    CONSTRAINT "chk_moneda_ambito" CHECK (
        ("ambito" = 'PERSONAL' AND "negocio_id" IS NULL) OR
        ("ambito" = 'LABORAL' AND "negocio_id" IS NOT NULL)
    )
);

-- AddForeignKey
ALTER TABLE "monedas" ADD CONSTRAINT "monedas_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "monedas" ADD CONSTRAINT "monedas_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;

-- CreateIndex (parciales — no modelados en schema.prisma, ver comentario ahí)
CREATE UNIQUE INDEX "uq_moneda_laboral" ON "monedas"("negocio_id", "codigo") WHERE "ambito" = 'LABORAL';
CREATE UNIQUE INDEX "uq_moneda_personal" ON "monedas"("cuenta_id", "codigo") WHERE "ambito" = 'PERSONAL';

-- RowLevelSecurity: aislamiento compuesto cuenta + negocio activo (FR7/FR8,
-- NFR1/NFR2). El caso Personal (negocio_id is null) solo exige coincidencia
-- de cuenta. El bypass `'*'` es para lectura consolidada (Epic 5) — ver
-- Story 1.5, Coding Standards "Bypass Consolidado Restringido".
-- [Source: architecture/database-schema.md]
ALTER TABLE "monedas" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "monedas_isolation" ON "monedas"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "monedas" TO app_user;
