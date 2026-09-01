# Core Workflows

## Registro de venta a crédito (con actualización de stock, CxC y saldo)

```mermaid
sequenceDiagram
    actor U as Usuario
    participant UI as Formulario de Venta
    participant SA as Server Action: registrarVenta
    participant RLS as withRlsContext
    participant DB as Postgres (RLS)
    participant Engine as Motor de Indicadores

    U->>UI: Completa venta (ítems, cliente, forma de cobro = CRÉDITO)
    UI->>SA: registrarVenta(negocioId, input)
    SA->>SA: Valida input con Zod (packages/domain)
    SA->>RLS: withRlsContext(cuentaId, negocioId, fn)
    RLS->>DB: BEGIN + SET LOCAL request.jwt.claims / app.active_negocio_id
    RLS->>DB: INSERT venta, venta_items
    alt incluye productos
        RLS->>DB: UPDATE items.stock_actual (decrementa)
    end
    RLS->>DB: INSERT cuentas_por_cobrar (monto = total venta)
    DB-->>RLS: COMMIT
    RLS-->>SA: Venta creada
    SA->>SA: revalidatePath(dashboard del negocio)
    SA-->>UI: Result.ok(venta)
    UI-->>U: Confirmación + saldo/CxC actualizados
    Note over Engine: Los indicadores se recalculan on-read<br/>en la próxima consulta al dashboard (NFR4) — no hay batch.
```

## Cálculo de indicadores financieros (lectura, negocio activo)

```mermaid
sequenceDiagram
    actor U as Usuario
    participant UI as Dashboard de Indicadores
    participant SA as Server Action: obtenerIndicadores
    participant RLS as withRlsContext
    participant DB as Postgres (RLS)
    participant Engine as packages/domain: calcularIndicadores

    U->>UI: Abre dashboard (negocio activo, período)
    UI->>SA: obtenerIndicadores(negocioId, periodo)
    SA->>RLS: withRlsContext(cuentaId, negocioId, fn)
    RLS->>DB: SELECT agregados de ventas, compras, gastos, devoluciones (período)
    DB-->>RLS: Datos crudos del negocio
    RLS-->>SA: DatosPeriodoNegocio
    SA->>Engine: calcularIndicadores(datos)
    Engine-->>SA: IndicadoresFinancieros (Ingresos Brutos → Margen)
    SA-->>UI: Result.ok(indicadores)
    UI-->>U: Dashboard actualizado (tiempo real, NFR4)
```

## Retiro de utilidades (negocio → Personal)

```mermaid
sequenceDiagram
    actor U as Usuario
    participant UI as Formulario de Retiro
    participant SA as Server Action: registrarRetiro
    participant RLS as withRlsContext
    participant DB as Postgres (RLS)

    U->>UI: Elige negocio de origen + monto
    UI->>SA: registrarRetiro(negocioId, monto)
    SA->>RLS: withRlsContext(cuentaId, negocioId, fn)
    RLS->>DB: UPDATE cuentas_financieras (caja/banco del negocio, -monto)
    RLS->>DB: INSERT retiros_utilidad (negocioId, monto, origen=MANUAL)
    Note over DB: retiros_utilidad no tiene RLS de negocio único al leerse<br/>desde Personal — Personal lee retiros de TODOS los negocios<br/>de la cuenta (bypass "*" de solo lectura, ver Database Architecture)
    DB-->>RLS: COMMIT
    RLS-->>SA: RetiroUtilidad creado
    SA-->>UI: Result.ok(retiro)
    UI-->>U: Confirmación — aparece como ingreso en Personal (FR25)
```

## Cierre de período automático (retiro por regla + aporte a reserva) — ADR-001

```mermaid
sequenceDiagram
    participant Cron as Vercel Cron (06:00 UTC diario)
    participant RH as Route Handler: /api/cron/cierre-periodo
    participant Dom as packages/domain: ejecutarCierreDePeriodo
    participant RLS as withRlsContext (por negocio/cuenta)
    participant DB as Postgres (RLS)

    Cron->>RH: GET /api/cron/cierre-periodo (Authorization: Bearer CRON_SECRET)
    RH->>RH: Valida CRON_SECRET
    alt no es el último día del mes
        RH-->>Cron: 200 { status: "skip" }
    else es último día del mes
        RH->>Dom: ejecutarCierreDePeriodo(periodo = 'YYYY-MM')
        loop cada Negocio con ReglaRetiro.activa=true y ultimoPeriodoAplicado != periodo
            Dom->>RLS: withRlsContext(cuentaId, negocioId, fn)
            RLS->>DB: calcula monto (PORCENTAJE|MONTO_FIJO de ganancia líquida)
            RLS->>DB: UPDATE cuentas_financieras (-monto) + INSERT retiros_utilidad(origen=REGLA)
            RLS->>DB: UPDATE regla_retiro SET ultimo_periodo_aplicado = periodo
        end
        loop cada ReservaFinanciera con aportePorPeriodo>0 y ultimoPeriodoAplicado != periodo
            Dom->>RLS: withRlsContext(cuentaId, negocioId=null, fn)
            RLS->>DB: UPDATE reserva_financiera SET progreso_acumulado += aporte_por_periodo,<br/>ultimo_periodo_aplicado = periodo
        end
        Dom-->>RH: resumen { retiros_generados, reservas_actualizadas }
        RH-->>Cron: 200 { status: "ok", ...resumen }
    end
    Note over DB: Story 6.2 AC4 (historial deja claro MANUAL vs REGLA) se satisface<br/>con la columna retiros_utilidad.origen ya existente — sin cambio adicional.
```

## Contexto de aislamiento por request (negocio + cuenta)

```mermaid
sequenceDiagram
    participant SA as Server Action (cualquiera del módulo Laboral)
    participant Ctx as withRlsContext(cuentaId, negocioId, fn)
    participant Tx as Prisma $transaction
    participant PG as Postgres

    SA->>Ctx: withRlsContext(cuentaId, negocioId, callback)
    Ctx->>Ctx: Verifica en código: negocio.cuentaId === cuentaId<br/>(defensa en profundidad, no confía solo en RLS)
    Ctx->>Tx: prisma.$transaction(async tx => ...)
    Tx->>PG: SET LOCAL request.jwt.claims = '{"sub":"<cuentaId>"}'
    Tx->>PG: SET LOCAL app.active_negocio_id = '<negocioId>'
    Tx->>PG: (queries del callback — filtradas por RLS automáticamente)
    PG-->>Tx: filas (solo de esa cuenta + ese negocio)
    Tx-->>Ctx: resultado
    Ctx-->>SA: resultado
    Note over PG: Si negocioId o cuentaId no coinciden con una fila,<br/>RLS la excluye — no es posible leerla ni escribirla,<br/>incluso si el código de aplicación tuviera un bug (NFR1/NFR2).
```

---
