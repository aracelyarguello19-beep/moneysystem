-- CreateTable
CREATE TABLE "reserva_financiera" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "objetivo_monto" DECIMAL(18,4) NOT NULL,
    "aporte_por_periodo" DECIMAL(18,4) NOT NULL,
    "periodo" TEXT NOT NULL DEFAULT 'MENSUAL',
    "progreso_acumulado" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "ultimo_periodo_aplicado" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reserva_financiera_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "reserva_financiera_cuenta_id_key" UNIQUE ("cuenta_id"),
    CONSTRAINT "reserva_financiera_objetivo_monto_check" CHECK ("objetivo_monto" >= 0),
    CONSTRAINT "reserva_financiera_aporte_por_periodo_check" CHECK ("aporte_por_periodo" >= 0),
    CONSTRAINT "reserva_financiera_periodo_check" CHECK ("periodo" IN ('MENSUAL'))
);

-- AddForeignKey
ALTER TABLE "reserva_financiera" ADD CONSTRAINT "reserva_financiera_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;

-- RowLevelSecurity
ALTER TABLE "reserva_financiera" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reserva_financiera_isolation" ON "reserva_financiera"
    USING ("cuenta_id" = auth.uid());

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "reserva_financiera" TO app_user;
