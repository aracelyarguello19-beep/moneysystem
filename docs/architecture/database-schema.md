# Database Schema

PostgreSQL 17 (Supabase). Todas las tablas usan `id uuid default gen_random_uuid()` y quedan bajo RLS. Se muestra el esquema completo de las tablas centrales; los mismos patrones de RLS/índices se replican en el resto (omitidas por espacio: `movimiento_tarjeta`, `pagos_cxc` siguen exactamente el mismo patrón que sus pares mostradas). `regla_retiro` y `reserva_financiera` se muestran explícitas más abajo porque ADR-001 les agrega una columna de idempotencia (`ultimo_periodo_aplicado`) que no es parte del patrón genérico.

```sql
-- ============================================================
-- EXTENSIONES Y ROL DE APLICACIÓN
-- ============================================================
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- Rol de runtime SIN bypass de RLS — Prisma se conecta con este rol,
-- nunca con `postgres` (superuser) ni `service_role` (ambos bypasean RLS).
create role app_user with login password '<gestionado por variable de entorno>' nobypassrls;

-- ============================================================
-- CUENTA (extiende auth.users de Supabase — no duplica credenciales)
-- ============================================================
create table cuentas (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  created_at  timestamptz not null default now()
);
alter table cuentas enable row level security;
create policy cuentas_isolation on cuentas
  using (id = auth.uid());

-- ============================================================
-- NEGOCIOS
-- ============================================================
create table negocios (
  id           uuid primary key default gen_random_uuid(),
  cuenta_id    uuid not null references cuentas(id) on delete cascade,
  nombre       text not null,
  estado       text not null default 'ACTIVO' check (estado in ('ACTIVO','ARCHIVADO')),
  created_at   timestamptz not null default now(),
  archived_at  timestamptz
);
create index idx_negocios_cuenta on negocios(cuenta_id);
alter table negocios enable row level security;
create policy negocios_isolation on negocios
  using (cuenta_id = auth.uid());

-- ============================================================
-- MONEDAS (Laboral por negocio / Personal por cuenta)
-- ============================================================
create table monedas (
  id          uuid primary key default gen_random_uuid(),
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  negocio_id  uuid references negocios(id) on delete cascade,
  ambito      text not null check (ambito in ('LABORAL','PERSONAL')),
  codigo      text not null,
  nombre      text not null,
  es_base     boolean not null default false,
  activa      boolean not null default true,
  created_at  timestamptz not null default now(),
  constraint chk_moneda_ambito check (
    (ambito = 'PERSONAL' and negocio_id is null) or
    (ambito = 'LABORAL'  and negocio_id is not null)
  )
);
create unique index uq_moneda_laboral on monedas(negocio_id, codigo) where ambito = 'LABORAL';
create unique index uq_moneda_personal on monedas(cuenta_id, codigo) where ambito = 'PERSONAL';
alter table monedas enable row level security;
create policy monedas_isolation on monedas
  using (
    cuenta_id = auth.uid()
    and (
      negocio_id is null  -- Personal: solo requiere cuenta
      or negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
      or current_setting('app.active_negocio_id', true) = '*'  -- lectura consolidada, ver nota abajo
    )
  );

-- ============================================================
-- TIPOS DE GASTO
-- ============================================================
create table tipos_gasto (
  id             uuid primary key default gen_random_uuid(),
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  negocio_id     uuid references negocios(id) on delete cascade,
  ambito         text not null check (ambito in ('LABORAL','PERSONAL')),
  nombre         text not null,
  clasificacion  text not null,
  created_at     timestamptz not null default now(),
  -- ADR-002: PERSONAL admite FINANCIERO desde 2026-08-31 para poder registrar
  -- intereses/cargos de tarjeta personal como "gasto financiero personal"
  -- (Story 6.4 AC2, FR30). Ver .ai/adr-002-clasificacion-financiero-personal.md.
  constraint chk_tipo_gasto_ambito check (
    (ambito = 'PERSONAL' and negocio_id is null and clasificacion in ('FIJO','VARIABLE','FINANCIERO')) or
    (ambito = 'LABORAL'  and negocio_id is not null and clasificacion in ('OPERATIVO','FINANCIERO'))
  )
);
alter table tipos_gasto enable row level security;
create policy tipos_gasto_isolation on tipos_gasto
  using (
    cuenta_id = auth.uid()
    and (negocio_id is null
         or negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

-- ============================================================
-- ITEMS (Producto / Servicio)
-- ============================================================
create table items (
  id                uuid primary key default gen_random_uuid(),
  negocio_id        uuid not null references negocios(id) on delete cascade,
  cuenta_id         uuid not null references cuentas(id) on delete cascade,  -- denormalizado para RLS directo
  tipo              text not null check (tipo in ('PRODUCTO','SERVICIO')),
  nombre            text not null,
  precio_venta      numeric(18,4) not null check (precio_venta >= 0),
  moneda_id         uuid not null references monedas(id),
  costo_compra      numeric(18,4) check (costo_compra >= 0),
  stock_actual      numeric(18,4) not null default 0,
  tiene_movimientos boolean not null default false,
  created_at        timestamptz not null default now(),
  constraint chk_item_servicio_sin_stock check (tipo = 'PRODUCTO' or stock_actual = 0)
);
create index idx_items_negocio on items(negocio_id);
alter table items enable row level security;
create policy items_isolation on items
  using (
    cuenta_id = auth.uid()
    and (negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

-- ============================================================
-- CUENTAS FINANCIERAS (Caja / Banco / Tarjeta — unificado)
-- ============================================================
create table cuentas_financieras (
  id              uuid primary key default gen_random_uuid(),
  cuenta_id       uuid not null references cuentas(id) on delete cascade,
  negocio_id      uuid references negocios(id) on delete cascade,
  ambito          text not null check (ambito in ('LABORAL','PERSONAL')),
  tipo            text not null check (tipo in ('CAJA','BANCO','TARJETA')),
  nombre          text not null,
  moneda_id       uuid not null references monedas(id),
  saldo_actual    numeric(18,4) not null default 0,
  limite_credito  numeric(18,4),
  created_at      timestamptz not null default now(),
  constraint chk_cta_fin_ambito check (
    (ambito = 'PERSONAL' and negocio_id is null) or
    (ambito = 'LABORAL'  and negocio_id is not null)
  )
);
alter table cuentas_financieras enable row level security;
create policy cuentas_financieras_isolation on cuentas_financieras
  using (
    cuenta_id = auth.uid()
    and (negocio_id is null
         or negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

-- ============================================================
-- TASAS DE CAMBIO (snapshot inmutable — FR35)
-- ============================================================
create table tasas_cambio (
  id              uuid primary key default gen_random_uuid(),
  moneda_id       uuid not null references monedas(id) on delete cascade,
  tasa            numeric(18,6) not null check (tasa > 0),
  vigente_desde   timestamptz not null default now(),
  registrada_por  uuid not null references cuentas(id),
  created_at      timestamptz not null default now()
);
create index idx_tasas_moneda_vigencia on tasas_cambio(moneda_id, vigente_desde desc);
alter table tasas_cambio enable row level security;
create policy tasas_cambio_isolation on tasas_cambio
  using (registrada_por = auth.uid());  -- moneda ya está aislada aguas arriba; se refuerza por dueño

-- ============================================================
-- COMPRAS
-- ============================================================
create table compras (
  id                  uuid primary key default gen_random_uuid(),
  negocio_id          uuid not null references negocios(id) on delete cascade,
  cuenta_id           uuid not null references cuentas(id) on delete cascade,
  item_id             uuid not null references items(id),
  costo_unitario      numeric(18,4) not null check (costo_unitario >= 0),
  cantidad            numeric(18,4) not null check (cantidad > 0),
  fecha               date not null default current_date,
  proveedor           text,
  forma_pago          text not null check (forma_pago in ('EFECTIVO','BANCO','TARJETA','CREDITO_PROVEEDOR')),
  cuenta_financiera_id uuid references cuentas_financieras(id),
  moneda_id           uuid not null references monedas(id),
  tasa_cambio_id      uuid references tasas_cambio(id),
  created_at          timestamptz not null default now(),
  constraint chk_compra_medio_pago check (
    (forma_pago = 'CREDITO_PROVEEDOR' and cuenta_financiera_id is null) or
    (forma_pago <> 'CREDITO_PROVEEDOR' and cuenta_financiera_id is not null)
  )
);
create index idx_compras_negocio_fecha on compras(negocio_id, fecha desc);
alter table compras enable row level security;
create policy compras_isolation on compras
  using (
    cuenta_id = auth.uid()
    and (negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

-- ============================================================
-- VENTAS + VENTA_ITEMS
-- ============================================================
create table ventas (
  id                  uuid primary key default gen_random_uuid(),
  negocio_id          uuid not null references negocios(id) on delete cascade,
  cuenta_id           uuid not null references cuentas(id) on delete cascade,
  cliente             text,
  fecha               date not null default current_date,
  forma_cobro         text not null check (forma_cobro in ('EFECTIVO','BANCO','TARJETA','CREDITO_CLIENTE')),
  impuesto            numeric(18,4) not null default 0,
  estado              text not null default 'ACTIVA' check (estado in ('ACTIVA','CANCELADA','DEVUELTA_PARCIAL')),
  cuenta_financiera_id uuid references cuentas_financieras(id),
  moneda_id           uuid not null references monedas(id),
  tasa_cambio_id      uuid references tasas_cambio(id),
  created_at          timestamptz not null default now()
);
create index idx_ventas_negocio_fecha on ventas(negocio_id, fecha desc);
alter table ventas enable row level security;
create policy ventas_isolation on ventas
  using (
    cuenta_id = auth.uid()
    and (negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

create table venta_items (
  id                 uuid primary key default gen_random_uuid(),
  venta_id           uuid not null references ventas(id) on delete cascade,
  item_id            uuid not null references items(id),
  cantidad           numeric(18,4),
  precio_unitario    numeric(18,4) not null check (precio_unitario >= 0),
  costo_servicio     numeric(18,4),
  cantidad_devuelta  numeric(18,4) not null default 0
);
alter table venta_items enable row level security;
create policy venta_items_isolation on venta_items
  using (exists (
    select 1 from ventas v where v.id = venta_items.venta_id and v.cuenta_id = auth.uid()
    and (v.negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  ));

-- ============================================================
-- CUENTAS POR COBRAR
-- ============================================================
create table cuentas_por_cobrar (
  id             uuid primary key default gen_random_uuid(),
  negocio_id     uuid not null references negocios(id) on delete cascade,
  cuenta_id      uuid not null references cuentas(id) on delete cascade,
  venta_id       uuid not null references ventas(id),
  cliente        text not null,
  monto_original numeric(18,4) not null check (monto_original >= 0),
  monto_pagado   numeric(18,4) not null default 0,
  estado         text not null default 'PENDIENTE' check (estado in ('PENDIENTE','PARCIAL','PAGADO')),
  created_at     timestamptz not null default now()
);
create index idx_cxc_negocio_estado on cuentas_por_cobrar(negocio_id, estado);
alter table cuentas_por_cobrar enable row level security;
create policy cxc_isolation on cuentas_por_cobrar
  using (
    cuenta_id = auth.uid()
    and (negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

-- ============================================================
-- GASTOS
-- ============================================================
create table gastos (
  id                   uuid primary key default gen_random_uuid(),
  cuenta_id            uuid not null references cuentas(id) on delete cascade,
  negocio_id           uuid references negocios(id) on delete cascade,
  ambito               text not null check (ambito in ('LABORAL','PERSONAL')),
  tipo_gasto_id        uuid not null references tipos_gasto(id),
  monto                numeric(18,4) not null check (monto > 0),
  moneda_id            uuid not null references monedas(id),
  fecha                date not null default current_date,
  forma_pago           text not null check (forma_pago in ('EFECTIVO','BANCO','TARJETA')),
  cuenta_financiera_id uuid not null references cuentas_financieras(id),
  created_at           timestamptz not null default now(),
  constraint chk_gasto_ambito check (
    (ambito = 'PERSONAL' and negocio_id is null) or
    (ambito = 'LABORAL'  and negocio_id is not null)
  )
);
create index idx_gastos_negocio_fecha on gastos(negocio_id, fecha desc);
alter table gastos enable row level security;
create policy gastos_isolation on gastos
  using (
    cuenta_id = auth.uid()
    and (negocio_id is null
         or negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  );

-- ============================================================
-- LEDGER DE CUENTA (Caja/Banco)
-- ============================================================
create table movimientos_cuenta (
  id                   uuid primary key default gen_random_uuid(),
  cuenta_financiera_id uuid not null references cuentas_financieras(id) on delete cascade,
  tipo                 text not null check (tipo in ('INGRESO','EGRESO')),
  monto                numeric(18,4) not null check (monto > 0),
  fecha                date not null default current_date,
  referencia_tipo      text,
  referencia_id        uuid,
  created_at           timestamptz not null default now()
);
create index idx_mov_cuenta_cta on movimientos_cuenta(cuenta_financiera_id, fecha desc);
alter table movimientos_cuenta enable row level security;
create policy movimientos_cuenta_isolation on movimientos_cuenta
  using (exists (
    select 1 from cuentas_financieras cf
    where cf.id = movimientos_cuenta.cuenta_financiera_id and cf.cuenta_id = auth.uid()
    and (cf.negocio_id is null
         or cf.negocio_id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  ));

-- ============================================================
-- RETIROS DE UTILIDAD
-- ============================================================
create table retiros_utilidad (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id) on delete cascade,
  cuenta_id   uuid not null references cuentas(id) on delete cascade,
  monto       numeric(18,4) not null check (monto > 0),
  fecha       date not null default current_date,
  origen      text not null check (origen in ('MANUAL','REGLA')),
  regla_id    uuid,
  created_at  timestamptz not null default now()
);
alter table retiros_utilidad enable row level security;
-- Nota: a diferencia de las demás tablas Laborales, Personal necesita leer
-- retiros de TODOS los negocios de la cuenta (FR25: "identificado con su
-- negocio de origen" en el módulo Personal). Por eso esta policy NO exige
-- coincidencia de negocio_id para SELECT — solo para el resto de tablas.
create policy retiros_isolation on retiros_utilidad
  using (cuenta_id = auth.uid());

-- ============================================================
-- REGLA DE RETIRO PREDETERMINADO (antes omitida por espacio — ver ADR-001)
-- ============================================================
create table regla_retiro (
  id          uuid primary key default gen_random_uuid(),
  negocio_id  uuid not null references negocios(id) on delete cascade,
  tipo        text not null check (tipo in ('PORCENTAJE','MONTO_FIJO')),
  valor       numeric(18,4) not null check (valor > 0),
  periodo     text not null default 'MENSUAL' check (periodo in ('MENSUAL')),
  activa      boolean not null default true,
  -- Idempotencia del job de cierre de período (ADR-001): formato 'YYYY-MM'
  -- del último período en que esta regla ya generó su retiro. Evita que un
  -- reintento del cron duplique el retiro del mismo mes.
  ultimo_periodo_aplicado text,
  created_at  timestamptz not null default now(),
  unique (negocio_id)  -- una regla activa por negocio (FR26: "de forma independiente para cada negocio")
);
alter table regla_retiro enable row level security;
create policy regla_retiro_isolation on regla_retiro
  using (exists (
    select 1 from negocios n
    where n.id = regla_retiro.negocio_id and n.cuenta_id = auth.uid()
    and (n.id = nullif(current_setting('app.active_negocio_id', true), '')::uuid
         or current_setting('app.active_negocio_id', true) = '*')
  ));

-- ============================================================
-- RESERVA FINANCIERA (antes omitida por espacio — ver ADR-001)
-- ============================================================
create table reserva_financiera (
  id                   uuid primary key default gen_random_uuid(),
  cuenta_id            uuid not null unique references cuentas(id) on delete cascade,  -- única por cuenta (FR31)
  objetivo_monto       numeric(18,4) not null check (objetivo_monto >= 0),
  aporte_por_periodo   numeric(18,4) not null check (aporte_por_periodo >= 0),
  periodo              text not null default 'MENSUAL' check (periodo in ('MENSUAL')),
  progreso_acumulado   numeric(18,4) not null default 0,
  -- Idempotencia del job de cierre de período (ADR-001): mismo propósito que
  -- regla_retiro.ultimo_periodo_aplicado.
  ultimo_periodo_aplicado text,
  created_at           timestamptz not null default now()
);
alter table reserva_financiera enable row level security;
create policy reserva_financiera_isolation on reserva_financiera
  using (cuenta_id = auth.uid());
```

**Notas de diseño transversales al esquema:**

1. **Ledger vs. saldo denormalizado:** `cuentas_financieras.saldo_actual` se actualiza en la misma transacción que cada `INSERT` a `movimientos_cuenta`/`movimientos_tarjeta` (vía la función de aplicación `aplicarMovimiento`, no vía trigger de Postgres — se mantiene la lógica en `packages/database` para que sea testeable con Vitest sin depender de comportamiento de trigger). El ledger es la fuente de verdad auditable; el saldo denormalizado es una proyección para lectura rápida.
2. **`retiros_utilidad` es la única tabla con RLS de negocio "relajada" a propósito** — está documentado explícitamente en el propio SQL para que no se lea como un descuido de copy-paste en una futura revisión.
3. **`ultimo_periodo_aplicado` en `regla_retiro`/`reserva_financiera` (ADR-001):** guarda el período (`'YYYY-MM'`) ya procesado por el job de cierre. Es la clave de idempotencia que evita duplicar el retiro/aporte automático si el cron se reintenta o corre más de una vez en el mismo día de cierre. Ver "Jobs Programados (Cierre de Período)" en Backend Architecture.
4. **Bypass `'*'` de `app.active_negocio_id`:** se usa exclusivamente en la Server Action de solo lectura `obtenerDashboardConsolidado` (Story 5.4). Es responsabilidad de **Coding Standards** (ver abajo) que ninguna Server Action de escritura pueda fijar ese valor — se aplica en código, no en RLS, porque RLS no puede distinguir "intención de lectura" de "intención de escritura" dentro de la misma policy `USING`. Se refuerza con revisión de CodeRabbit sobre cualquier PR que toque `withRlsContext`.

---
