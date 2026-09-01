# ADR-002: Clasificación FINANCIERO en el catálogo de tipos de gasto Personal

- **Fecha:** 2026-08-31
- **Estado:** Aceptado y confirmado — PRD sincronizado por @po (Pax) el 2026-08-31
- **Autor:** Aria (Architect)
- **Origen:** Gap de arquitectura reportado por River (SM) al crear la story 6.4 a partir de `docs/prd/epic-6-*.md`

## Contexto

Contradicción encontrada entre dos partes del PRD ya aprobado:

- **FR10 / Story 1.7 AC2:** "El usuario puede crear tipos de gasto en el catálogo Personal, clasificando cada uno obligatoriamente como **Fijo o Variable** al momento de crearlo."
- **Story 6.4 AC2** (área FR30): "Los intereses/cargos de la tarjeta personal se registran como **gasto financiero personal**."

El schema ya materializaba la restricción de FR10 literalmente: `database-schema.md`, tabla `tipos_gasto`, `constraint chk_tipo_gasto_ambito check ((ambito = 'PERSONAL' ... clasificacion in ('FIJO','VARIABLE')) or ...)`. Bajo ese constraint, Story 6.4 AC2 es **irrealizable** — no existe forma de guardar un tipo de gasto Personal como "financiero".

## Decisión

Extender el catálogo Personal para admitir una tercera clasificación `FINANCIERO`, simétrica a la que ya existe en Laboral (`OPERATIVO | FINANCIERO`):

- `ClasificacionGastoPersonal`: `"FIJO" | "VARIABLE" | "FINANCIERO"` (antes solo `"FIJO" | "VARIABLE"`).
- CHECK constraint de `tipos_gasto` actualizado para permitir `FINANCIERO` en ámbito `PERSONAL`.

Se optó por esto en vez de forzar el interés de tarjeta a `VARIABLE` porque: (a) Story 6.4 AC2 usa literalmente la palabra "financiero", (b) el balance personal (Story 6.5 AC2: "retiros − gastos fijos − gastos varios − aporte a reserva = disponible") no tiene una línea para "gastos financieros" separada — forzar el interés a Variable lo mezclaría con gastos varios ocasionales, distorsionando esa categoría; tratarlo como su propia clasificación (igual que en Laboral) mantiene la simetría del modelo y no exige inventar una cuarta cosa no pedida por ninguna AC.

## Confirmación de @po (2026-08-31)

Pax (PO) revisó la decisión de Aria durante la validación de las 26 stories y la confirmó sin cambios: agregar `FINANCIERO` a Personal es la lectura correcta de Story 6.4 AC2, no una invención de alcance. Se sincronizó el texto del PRD:
- `docs/prd/requirements.md` — FR10 → "Fijo, Variable o Financiero"
- `docs/prd.md` — FR10 y Story 1.7 AC2 (espejo del sharded)
- `docs/prd/epic-1-*.md` — Story 1.7 AC2 → "Fijo, Variable o Financiero"
- `docs/stories/1.7.story.md` — AC2, schema Zod (Task 1), Data Model, DDL, Change Log v0.2

## Consecuencias

- Ninguna pendiente — PRD y schema ya consistentes.
- No requiere migración de datos existentes (constraint más permisivo, no más restrictivo).

## Archivos actualizados

- `docs/architecture/data-models.md` — `ClasificacionGastoPersonal`
- `docs/architecture/database-schema.md` — CHECK constraint de `tipos_gasto`
- `docs/prd/requirements.md`, `docs/prd.md`, `docs/prd/epic-1-*.md`, `docs/stories/1.7.story.md` — sync de texto (@po, 2026-08-31)
