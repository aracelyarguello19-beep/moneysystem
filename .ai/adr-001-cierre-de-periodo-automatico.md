# ADR-001: Mecanismo de cierre de período automático (retiro por regla + aporte a reserva)

- **Fecha:** 2026-08-31
- **Estado:** Aceptado
- **Autor:** Aria (Architect)
- **Origen:** Gaps de arquitectura reportados por River (SM) al crear las stories 6.2 y 6.5 a partir de `docs/prd/epic-6-*.md`

## Contexto

- **Story 6.2 AC2** (FR26): "El sistema aplica la regla automáticamente al cierre de cada período configurado, generando el retiro correspondiente a ese negocio sin intervención manual."
- **Story 6.5 AC1** (FR31): "El usuario puede definir un objetivo de reserva financiera y cuánto destinar por período, y ver el progreso acumulado hacia ese objetivo."

Ninguna de las dos ACs especifica el mecanismo técnico que dispara esa acción "sin intervención manual". El Tech Stack (Vercel + Next.js + Supabase/Prisma) no tenía documentado ningún componente de job programado/cron. `data-models.md` ya modelaba `ReglaRetiro` y `ReservaFinanciera` con un campo `periodo: "MENSUAL"` fijo (sin campo de día de cierre configurable), y `ReservaFinanciera.progresoAcumulado` como acumulado — lo que ya implicaba una aplicación periódica automática, pero sin definir el disparador.

Restricción relevante: **NFR4** exige que los indicadores financieros se calculen siempre on-read, nunca por batch nocturno. Esto NO aplica al retiro/aporte automático — son escrituras de estado (generar una transacción), no cálculo de indicadores de lectura — pero se documenta explícitamente para que quede claro que esta decisión no contradice NFR4.

## Decisión

1. **Mecanismo:** Vercel Cron Jobs (`vercel.json` → `crons`), sin agregar infraestructura nueva (ya estamos en Vercel).
2. **Endpoint:** nuevo Route Handler `GET /api/cron/cierre-periodo`, segundo endpoint REST del sistema junto al health check, protegido con el header `Authorization: Bearer $CRON_SECRET` que Vercel inyecta automáticamente.
3. **Cadencia:** diaria (`0 6 * * *`, 06:00 UTC), pero es no-op salvo que la fecha sea el último día calendario del mes (único período soportado en MVP: `MENSUAL`).
4. **Lógica de dominio reutilizada:** el job llama las mismas funciones de `packages/domain` que usan `registrarRetiro`/`configurarReglaRetiro` — no se duplica lógica de negocio en SQL/PL-pgSQL (se descartó `pg_cron` por esta razón).
5. **Idempotencia:** se agrega la columna `ultimo_periodo_aplicado` ('YYYY-MM') a `regla_retiro` y `reserva_financiera`. El job solo procesa una regla/reserva si ese campo es distinto del período actual, y lo actualiza en la misma transacción — así un reintento del cron no duplica retiros ni aportes.
6. **Aislamiento:** cada retiro/aporte se ejecuta con `withRlsContext(cuentaId, negocioId, fn)` — el job itera negocio por negocio, nunca usa el bypass `'*'` de escritura.
7. **Reserva financiera:** el aporte se aplica automáticamente (simétrico al retiro por regla) — no hay paso de confirmación manual mensual. Si el usuario quiere pausar el aporte, define `aportePorPeriodo = 0` (no hay AC que pida un endpoint de pausa explícito).

## Alternativas consideradas

- **Supabase `pg_cron` + función SQL:** descartada — duplicaría lógica de negocio fuera de `packages/domain`, no testeable con el mismo Vitest suite, rompe la fuente única de verdad del dominio.
- **Cálculo on-read del retiro/aporte "pendiente" en el dashboard (sin job):** descartada — Story 6.2 AC2 y AC4 exigen que el retiro quede registrado como movimiento en el historial (`retiros_utilidad`) "sin intervención manual", no que se muestre como un pendiente calculado; requiere una escritura real.

## Consecuencias

- Nuevo endpoint REST sin sesión de usuario → superficie de ataque adicional, mitigada con `CRON_SECRET`.
- Solo corre en Production (los crons de Vercel no se disparan en Preview/Development) — testing de este flujo requiere invocar el Route Handler manualmente en dev/CI (a documentar en la story de implementación).
- Historial de aportes a reserva: no se modela una tabla de movimientos (solo el acumulado), consistente con Story 6.5 AC1. Si en el futuro se pide auditoría por período, agregar tabla `aportes_reserva` análoga a `retiros_utilidad`.

## Archivos actualizados

- `docs/architecture/backend-architecture.md` — sección "Jobs Programados (Cierre de Período)"
- `docs/architecture/deployment-architecture.md` — sección "Jobs Programados" (`vercel.json`, `CRON_SECRET`)
- `docs/architecture/api-specification.md` — segundo endpoint REST
- `docs/architecture/core-workflows.md` — diagrama de secuencia del cierre de período
- `docs/architecture/data-models.md` — `ultimoPeriodoAplicado` en `ReglaRetiro` y `ReservaFinanciera`
- `docs/architecture/database-schema.md` — DDL explícito de `regla_retiro` y `reserva_financiera` (antes omitido por espacio)
- `docs/architecture/index.md` — ToC actualizado
