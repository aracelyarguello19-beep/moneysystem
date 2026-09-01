# Data Models

Los modelos centrales, compartidos entre frontend y backend vía `packages/domain`. La entidad `Negocio` es la pieza intermedia obligatoria entre `Cuenta` y todo el resto (tal como exige el PRD v2.0+). El ámbito **Personal** reutiliza las mismas tablas de catálogo/transacción que el ámbito **Laboral** con `negocio_id = null` y `ambito = 'PERSONAL'`, en vez de duplicar modelos — evita mantener dos veces la misma lógica de gasto/catálogo/saldo con un `ambito` como discriminador explícito.

## Cuenta

**Purpose:** Dueño único de todos los datos del sistema (FR1). Un registro por persona autenticada; su `id` es el mismo UUID que Supabase Auth asigna al usuario, así que `Cuenta` no duplica credenciales — solo extiende metadata de aplicación.

**Key Attributes:**
- id: UUID — igual a `auth.users.id` de Supabase (relación 1:1)
- email: string — espejo de conveniencia del email de Auth
- createdAt: Date — fecha de alta

```typescript
export interface Cuenta {
  id: string;        // UUID, == Supabase auth user id
  email: string;
  createdAt: Date;
}
```

**Relationships:**
- Una `Cuenta` tiene muchos `Negocio` (FR3)
- Una `Cuenta` tiene como máximo una `ReservaFinanciera` (Personal, único por cuenta)

## Negocio

**Purpose:** Unidad de negocio independiente dentro de una cuenta (FR3-FR6). Entidad intermedia obligatoria: toda tabla transaccional o de catálogo del módulo Laboral referencia un `negocioId`.

**Key Attributes:**
- id: UUID
- cuentaId: string — dueño
- nombre: string
- estado: 'ACTIVO' | 'ARCHIVADO' (FR4)
- archivedAt: Date | null

```typescript
export interface Negocio {
  id: string;
  cuentaId: string;
  nombre: string;
  estado: "ACTIVO" | "ARCHIVADO";
  createdAt: Date;
  archivedAt: Date | null;
}
```

**Relationships:**
- Pertenece a una `Cuenta`
- Tiene muchos `Moneda`, `TipoGasto`, `Item`, `CuentaFinanciera`, `Compra`, `Venta`, `Gasto`, `RetiroUtilidad` (todos con `negocioId` obligatorio)

## Moneda

**Purpose:** Catálogo de monedas, independiente por negocio y para Personal (FR7, FR8).

**Key Attributes:**
- id: UUID
- cuentaId, negocioId (null si ámbito Personal)
- ambito: 'LABORAL' | 'PERSONAL'
- codigo: string (ej. "PYG", "USD") — no restringido a ISO-4217 porque el usuario define sus propias monedas (PRD: "monedas definidas por el propio usuario")
- esBase: boolean — Guaraní por defecto en cada ámbito (Story 1.6)
- activa: boolean

```typescript
export interface Moneda {
  id: string;
  cuentaId: string;
  negocioId: string | null;
  ambito: "LABORAL" | "PERSONAL";
  codigo: string;
  nombre: string;
  esBase: boolean;
  activa: boolean;
}
```

**Relationships:**
- Pertenece a un `Negocio` (Laboral) o directamente a una `Cuenta` (Personal, `negocioId = null`)
- Referenciada por `Item`, `CuentaFinanciera`, `Compra`, `Venta`, `Gasto`, `TasaCambio`

## TipoGasto

**Purpose:** Catálogo de tipos de gasto, clasificado obligatoriamente al crearse (FR9, FR10, NFR7).

**Key Attributes:**
- ambito: 'LABORAL' | 'PERSONAL'
- clasificacion: 'OPERATIVO' | 'FINANCIERO' (si Laboral) — 'FIJO' | 'VARIABLE' | 'FINANCIERO' (si Personal)

> **ADR-001 (post-creación de stories):** `FINANCIERO` se agregó a Personal para que el interés/cargo de tarjeta de crédito personal se pueda registrar como "gasto financiero personal" (Story 6.4 AC2, FR30) — sin esto, el CHECK constraint original solo permitía Fijo/Variable y la AC era irrealizable. **Pendiente:** FR10 y Story 1.7 AC2 en el PRD todavía dicen "Fijo o Variable" — @po/@pm debe sincronizar ese texto (no es un cambio de arquitectura, es una corrección de redacción del PRD).

```typescript
export type ClasificacionGastoLaboral = "OPERATIVO" | "FINANCIERO";
export type ClasificacionGastoPersonal = "FIJO" | "VARIABLE" | "FINANCIERO";

export interface TipoGasto {
  id: string;
  cuentaId: string;
  negocioId: string | null;
  ambito: "LABORAL" | "PERSONAL";
  nombre: string;
  clasificacion: ClasificacionGastoLaboral | ClasificacionGastoPersonal;
}
```

**Relationships:**
- Pertenece a un `Negocio` o a `Cuenta` (Personal)
- Referenciado por `Gasto`

## Item

**Purpose:** Ítem vendible del negocio — Producto (con stock) o Servicio (sin stock) (FR11).

**Key Attributes:**
- tipo: 'PRODUCTO' | 'SERVICIO'
- precioVenta, costoCompra (solo Producto), stockActual (solo Producto)
- tieneMovimientos: boolean — bloquea el cambio de `tipo` una vez que hay compras/ventas asociadas (AC de Story 2.1)

```typescript
export interface Item {
  id: string;
  negocioId: string;
  tipo: "PRODUCTO" | "SERVICIO";
  nombre: string;
  precioVenta: string;       // Decimal serializado — nunca `number` (ver Coding Standards)
  monedaId: string;
  costoCompra: string | null;
  stockActual: string;       // "0" para Servicio, siempre
  tieneMovimientos: boolean;
}
```

**Relationships:**
- Pertenece a un `Negocio`
- Referenciado por `Compra` (solo Producto) y `VentaItem` (Producto o Servicio)

## CuentaFinanciera

**Purpose:** Modelo unificado de Caja, Cuenta Bancaria y Tarjeta de Crédito (FR19, FR20, FR30) — un solo concepto ("medio de pago con saldo/deuda") en vez de tres tablas paralelas con lógica duplicada.

**Key Attributes:**
- tipo: 'CAJA' | 'BANCO' | 'TARJETA'
- saldoActual: decimal — positivo para Caja/Banco, representa deuda (negativo o campo `deuda`) para Tarjeta
- limiteCredito: decimal | null — solo Tarjeta

```typescript
export interface CuentaFinanciera {
  id: string;
  cuentaId: string;
  negocioId: string | null;   // null = Personal
  ambito: "LABORAL" | "PERSONAL";
  tipo: "CAJA" | "BANCO" | "TARJETA";
  nombre: string;
  monedaId: string;
  saldoActual: string;        // Tarjeta: negativo = deuda
  limiteCredito: string | null;
}
```

**Relationships:**
- Pertenece a un `Negocio` o a `Cuenta` (Personal)
- Referenciada como destino/origen por `Compra`, `Venta`, `Gasto`, `PagoCxC`, `MovimientoTarjeta`, `MovimientoCuenta`

## TasaCambio

**Purpose:** Snapshot inmutable de la tasa de cambio manual cargada por el usuario para una moneda no base (FR35, FR36). Cada transacción en moneda distinta a Guaraní queda asociada a la tasa vigente en ese momento — el histórico nunca se recalcula.

```typescript
export interface TasaCambio {
  id: string;
  monedaId: string;
  tasa: string;              // 1 unidad de `monedaId` = `tasa` Guaraníes
  vigenteDesde: Date;
  registradaPor: string;     // cuentaId
}
```

**Relationships:**
- Pertenece a una `Moneda`
- Referenciada (snapshot, no FK viva de "tasa actual") por `Compra.tasaCambioId`, `Venta.tasaCambioId`

## Compra

**Purpose:** Registro de compra de mercadería (FR12) — actualiza stock y saldo/deuda automáticamente.

```typescript
export type FormaPagoCompra = "EFECTIVO" | "BANCO" | "TARJETA" | "CREDITO_PROVEEDOR";

export interface Compra {
  id: string;
  negocioId: string;
  itemId: string;
  costoUnitario: string;
  cantidad: string;
  fecha: Date;
  proveedor: string | null;
  formaPago: FormaPagoCompra;
  cuentaFinancieraId: string | null;  // null solo si CREDITO_PROVEEDOR
  monedaId: string;
  tasaCambioId: string | null;        // null si moneda == base
}
```

**Relationships:** Pertenece a `Negocio` e `Item`; afecta `CuentaFinanciera` (saldo) o genera deuda de tarjeta (`MovimientoTarjeta`).

## Venta / VentaItem

**Purpose:** Venta compuesta por uno o más ítems (FR14), con cancelación/devolución total o parcial (FR16).

```typescript
export type FormaCobro = "EFECTIVO" | "BANCO" | "TARJETA" | "CREDITO_CLIENTE";
export type EstadoVenta = "ACTIVA" | "CANCELADA" | "DEVUELTA_PARCIAL";

export interface Venta {
  id: string;
  negocioId: string;
  cliente: string | null;
  fecha: Date;
  formaCobro: FormaCobro;
  impuesto: string;           // monto de impuesto aplicado, alimenta Ingresos Netos
  estado: EstadoVenta;
  cuentaFinancieraId: string | null; // null si CREDITO_CLIENTE (ver CuentaPorCobrar)
  monedaId: string;
  tasaCambioId: string | null;
}

export interface VentaItem {
  id: string;
  ventaId: string;
  itemId: string;
  cantidad: string | null;    // null para Servicio sin cantidad explícita
  precioUnitario: string;
  costoServicio: string | null;  // solo Servicio (FR15) — null tratado como 0 y señalado (AC Story 3.2)
  cantidadDevuelta: string;   // acumulador de devoluciones parciales
}
```

**Relationships:** `Venta` pertenece a `Negocio`; tiene muchos `VentaItem`; puede generar una `CuentaPorCobrar`.

## CuentaPorCobrar / PagoCxC

**Purpose:** Deuda de cliente hacia el negocio por ventas a crédito (FR17), con pagos totales/parciales.

```typescript
export type EstadoCxC = "PENDIENTE" | "PARCIAL" | "PAGADO";

export interface CuentaPorCobrar {
  id: string;
  negocioId: string;
  ventaId: string;
  cliente: string;
  montoOriginal: string;
  montoPagado: string;
  estado: EstadoCxC;
}

export interface PagoCxC {
  id: string;
  cuentaPorCobrarId: string;
  monto: string;
  fecha: Date;
  cuentaFinancieraId: string;  // dónde entró el cobro
}
```

## Gasto

**Purpose:** Gasto clasificado, Laboral (en el negocio activo) o Personal (FR18, FR28, FR29).

```typescript
export type FormaPagoGasto = "EFECTIVO" | "BANCO" | "TARJETA";

export interface Gasto {
  id: string;
  cuentaId: string;
  negocioId: string | null;   // null = Personal
  ambito: "LABORAL" | "PERSONAL";
  tipoGastoId: string;
  monto: string;
  monedaId: string;
  fecha: Date;
  formaPago: FormaPagoGasto;
  cuentaFinancieraId: string;
}
```

## MovimientoTarjeta / MovimientoCuenta

**Purpose:** Ledger append-only de cada cambio de saldo/deuda — `CuentaFinanciera.saldoActual` es un valor denormalizado reconciliable desde estos movimientos, no la única fuente de verdad. Da auditabilidad (útil para debug de discrepancias) sin costo de complejidad para el usuario final.

```typescript
export interface MovimientoTarjeta {
  id: string;
  cuentaFinancieraId: string;  // debe ser tipo TARJETA
  tipo: "CONSUMO" | "PAGO_RESUMEN" | "INTERES";
  monto: string;
  fecha: Date;
  referenciaTipo: "COMPRA" | "GASTO" | "MANUAL" | null;
  referenciaId: string | null;
}

export interface MovimientoCuenta {
  id: string;
  cuentaFinancieraId: string;  // tipo CAJA o BANCO
  tipo: "INGRESO" | "EGRESO";
  monto: string;
  fecha: Date;
  referenciaTipo: "COMPRA" | "VENTA" | "GASTO" | "PAGO_CXC" | "RETIRO" | "MANUAL" | null;
  referenciaId: string | null;
}
```

## RetiroUtilidad / ReglaRetiro

**Purpose:** Puente explícito entre un negocio y Personal (FR25-FR27) — manual o por regla predeterminada (FR26).

> **ADR-001:** el "cierre de período" que aplica `ReglaRetiro` automáticamente (FR26/Story 6.2 AC2) es un job programado (Vercel Cron), no un cálculo on-read — ver "Jobs Programados (Cierre de Período)" en Backend Architecture. `ultimoPeriodoAplicado` es la clave de idempotencia del job.

```typescript
export type TipoRegla = "PORCENTAJE" | "MONTO_FIJO";

export interface ReglaRetiro {
  id: string;
  negocioId: string;          // único por negocio
  tipo: TipoRegla;
  valor: string;
  periodo: "MENSUAL";
  activa: boolean;
  ultimoPeriodoAplicado: string | null;  // 'YYYY-MM' — ADR-001
}

export interface RetiroUtilidad {
  id: string;
  negocioId: string;
  monto: string;
  fecha: Date;
  origen: "MANUAL" | "REGLA";
  reglaId: string | null;
}
```

## ReservaFinanciera

**Purpose:** Objetivo de ahorro personal y progreso acumulado (FR31), único por cuenta.

> **ADR-001:** `aportePorPeriodo` se aplica automáticamente sobre `progresoAcumulado` en el mismo job de cierre de período que ejecuta `ReglaRetiro` (simétrico a FR26) — no hay endpoint para "confirmar" el aporte cada mes; si el usuario quiere pausarlo, define `aportePorPeriodo = 0`. Story 6.5 no pide historial por período, solo el acumulado (AC1), así que no se modela una tabla de movimientos de reserva — si en el futuro se necesita auditoría por período, agregar una tabla `aportes_reserva` análoga a `retiros_utilidad`.

```typescript
export interface ReservaFinanciera {
  id: string;
  cuentaId: string;            // único
  objetivoMonto: string;
  aportePorPeriodo: string;
  periodo: "MENSUAL";
  progresoAcumulado: string;
  ultimoPeriodoAplicado: string | null;  // 'YYYY-MM' — ADR-001
}
```

---
