-- CreateTable
CREATE TABLE "cuentas_financieras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_id" UUID NOT NULL,
    "negocio_id" UUID,
    "ambito" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "moneda_id" UUID NOT NULL,
    "saldo_actual" DECIMAL(18,4) NOT NULL DEFAULT 0,
    "limite_credito" DECIMAL(18,4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cuentas_financieras_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "cuentas_financieras_ambito_check" CHECK ("ambito" IN ('LABORAL', 'PERSONAL')),
    CONSTRAINT "cuentas_financieras_tipo_check" CHECK ("tipo" IN ('CAJA', 'BANCO', 'TARJETA')),
    CONSTRAINT "chk_cta_fin_ambito" CHECK (
        ("ambito" = 'PERSONAL' AND "negocio_id" IS NULL) OR
        ("ambito" = 'LABORAL' AND "negocio_id" IS NOT NULL)
    )
);

-- movimientos_cuenta y movimientos_tarjeta: mismo patrón de RLS que
-- venta_items (exists contra cuentas_financieras), sin cuenta_id/negocio_id
-- propio.
CREATE TABLE "movimientos_cuenta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_financiera_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_cuenta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimientos_cuenta_tipo_check" CHECK ("tipo" IN ('INGRESO', 'EGRESO')),
    CONSTRAINT "movimientos_cuenta_monto_check" CHECK ("monto" > 0)
);

CREATE TABLE "movimientos_tarjeta" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cuenta_financiera_id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "monto" DECIMAL(18,4) NOT NULL,
    "fecha" DATE NOT NULL DEFAULT CURRENT_DATE,
    "referencia_tipo" TEXT,
    "referencia_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "movimientos_tarjeta_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "movimientos_tarjeta_tipo_check" CHECK ("tipo" IN ('CONSUMO', 'PAGO_RESUMEN', 'INTERES')),
    CONSTRAINT "movimientos_tarjeta_monto_check" CHECK ("monto" > 0)
);

-- AddForeignKey
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_cuenta_id_fkey"
    FOREIGN KEY ("cuenta_id") REFERENCES "cuentas"("id") ON DELETE CASCADE;
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_negocio_id_fkey"
    FOREIGN KEY ("negocio_id") REFERENCES "negocios"("id") ON DELETE CASCADE;
ALTER TABLE "cuentas_financieras" ADD CONSTRAINT "cuentas_financieras_moneda_id_fkey"
    FOREIGN KEY ("moneda_id") REFERENCES "monedas"("id");

ALTER TABLE "movimientos_cuenta" ADD CONSTRAINT "movimientos_cuenta_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE CASCADE;
ALTER TABLE "movimientos_tarjeta" ADD CONSTRAINT "movimientos_tarjeta_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id") ON DELETE CASCADE;

-- RowLevelSecurity
ALTER TABLE "cuentas_financieras" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cuentas_financieras_isolation" ON "cuentas_financieras"
    USING (
        "cuenta_id" = auth.uid()
        AND (
            "negocio_id" IS NULL
            OR "negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
            OR current_setting('app.active_negocio_id', true) = '*'
        )
    );

ALTER TABLE "movimientos_cuenta" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movimientos_cuenta_isolation" ON "movimientos_cuenta"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_financieras" cf
            WHERE cf."id" = "movimientos_cuenta"."cuenta_financiera_id"
            AND cf."cuenta_id" = auth.uid()
            AND (
                cf."negocio_id" IS NULL
                OR cf."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

ALTER TABLE "movimientos_tarjeta" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "movimientos_tarjeta_isolation" ON "movimientos_tarjeta"
    USING (
        EXISTS (
            SELECT 1 FROM "cuentas_financieras" cf
            WHERE cf."id" = "movimientos_tarjeta"."cuenta_financiera_id"
            AND cf."cuenta_id" = auth.uid()
            AND (
                cf."negocio_id" IS NULL
                OR cf."negocio_id" = nullif(current_setting('app.active_negocio_id', true), '')::uuid
                OR current_setting('app.active_negocio_id', true) = '*'
            )
        )
    );

-- GRANT explícito e idempotente para app_user
GRANT SELECT, INSERT, UPDATE, DELETE ON "cuentas_financieras" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "movimientos_cuenta" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "movimientos_tarjeta" TO app_user;

-- Deuda técnica saldada: ahora que cuentas_financieras existe, se agregan
-- las FKs que Story 2.2/3.1/3.4 habían dejado documentadas como pendientes.
ALTER TABLE "compras" ADD CONSTRAINT "compras_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id");
ALTER TABLE "ventas" ADD CONSTRAINT "ventas_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id");
ALTER TABLE "gastos" ADD CONSTRAINT "gastos_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id");
ALTER TABLE "pagos_cxc" ADD CONSTRAINT "pagos_cxc_cuenta_financiera_id_fkey"
    FOREIGN KEY ("cuenta_financiera_id") REFERENCES "cuentas_financieras"("id");
