-- CreateTable
CREATE TABLE "tasas_cambio" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "moneda_id" UUID NOT NULL,
    "tasa" DECIMAL(18,6) NOT NULL,
    "vigente_desde" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrada_por" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tasas_cambio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tasas_cambio_tasa_check" CHECK ("tasa" > 0)
);

-- AddForeignKey
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id") ON DELETE CASCADE;
ALTER TABLE "tasas_cambio" ADD CONSTRAINT "tasas_cambio_registrada_por_fkey"
    FOREIGN KEY ("registrada_por") REFERENCES "cuentas"("id") ON DELETE CASCADE;

-- CreateIndex
CREATE INDEX "idx_tasas_moneda_vigencia" ON "tasas_cambio"("moneda_id", "vigente_desde" DESC);

-- RowLevelSecurity: la moneda ya está aislada aguas arriba (Story 1.6); se
-- refuerza acá por dueño directo.
ALTER TABLE "tasas_cambio" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasas_cambio_isolation" ON "tasas_cambio"
    USING ("registrada_por" = auth.uid());

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "tasas_cambio" TO app_user;

-- Deuda técnica saldada: ahora que tasas_cambio existe, se agregan las FKs
-- que Story 2.2/3.1 habían dejado documentadas como pendientes.
ALTER TABLE "compras" ADD CONSTRAINT "compras_tasa_cambio_id_fkey"
    FOREIGN KEY ("tasa_cambio_id") REFERENCES "tasas_cambio"("id");
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_tasa_cambio_id_fkey"
    FOREIGN KEY ("tasa_cambio_id") REFERENCES "tasas_cambio"("id");
