-- CreateTable
CREATE TABLE "retiros_utilidad" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "negocio_id" UUID NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "origen" TEXT NOT NULL,
    "regla_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retiros_utilidad_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "retiros_utilidad_origen_check" CHECK ("origen" IN ('MANUAL', 'REGLA')),
    CONSTRAINT "retiros_utilidad_monto_check" CHECK ("monto" > 0)
);

-- AddForeignKey
ALTER TABLE "retiros_utilidad" ADD CONSTRAINT "retiros_utilidad_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "retiros_utilidad" ADD CONSTRAINT "retiros_utilidad_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;

-- RowLevelSecurity
-- Caso especial (Story 6.1, Dev Notes): a diferencia de toda otra tabla
-- Laboral, esta policy NO exige coincidencia de negocio_id — Personal
-- necesita leer retiros de TODOS los negocios de la cuenta (FR25:
-- "identificado con su negocio de origen"). No es un descuido: es la
-- condición que permite a `listarRetiros(null)` funcionar sin el bypass '*'
-- restringido de Story 5.4.
ALTER TABLE "retiros_utilidad" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "retiros_utilidad_isolation" ON "retiros_utilidad"
    USING ("cuenta_id" = auth.uid());

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "retiros_utilidad" TO app_user;
