# Testing Strategy

Refleja directamente las tres áreas de alto riesgo que el propio PRD identifica en "Testing Requirements" — no son una checklist genérica, son la prioridad de inversión de testing de este proyecto.

## Testing Pyramid

```text
                E2E Tests (Playwright)
               /  flujos críticos de  \
              /   cada epic, felices   \
             /________________________ \
            Integration Tests (Vitest + Postgres real)
           /  aislamiento cuenta/negocio, RLS real   \
          /____________________________________________\
     Frontend Unit (Vitest+RTL)      Backend/Domain Unit (Vitest)
     componentes, forms                indicadores, conversión moneda
```

## Test Organization

**Frontend Tests:**
```text
apps/web/tests/
├── components/          # render + interacción de formularios de carga rápida
└── hooks/                # hooks de React Query (mockeando Server Actions)
```

**Backend Tests:**
```text
packages/domain/tests/
├── indicadores/
│   ├── cadena-completa.test.ts     # AC de Story 5.1: ventas mixtas, cancelación parcial, ambas clasificaciones de gasto
│   ├── ventas-servicio-vs-producto.test.ts
│   └── multi-moneda-consolidacion.test.ts   # AC de Story 5.4: no sumar montos de monedas distintas sin convertir
└── moneda/
    └── conversion-tasa-historica.test.ts    # AC de Story 5.3: un reporte pasado no cambia si se carga una tasa nueva

packages/database/tests/
├── aislamiento-cuentas.test.ts     # AC de Story 1.3: Cuenta A no puede leer/escribir datos de Cuenta B — CONTRA POSTGRES REAL, no mockeado
└── aislamiento-negocios.test.ts    # AC de Story 1.5: Negocio A no puede leer/escribir datos de Negocio B de la misma cuenta — ídem
```

**Por qué los tests de aislamiento corren contra Postgres real (no mockeado):** el propio mecanismo que se está verificando (RLS) *vive en Postgres*, no en el código de la aplicación — un mock de Prisma pasaría trivialmente aunque las políticas RLS estuvieran mal escritas o ausentes, dando una falsa sensación de seguridad exactamente en el área que el PRD marca como crítica. `packages/database/tests` usa el servicio Postgres del job de CI (ver CI/CD Pipeline) con las migraciones y policies reales aplicadas.

**E2E Tests:**
```text
apps/web/e2e/
├── epic-1-onboarding.spec.ts        # registro, login, alta de negocio, cambio de negocio activo
├── epic-2-inventario.spec.ts
├── epic-3-ventas.spec.ts
├── epic-4-gastos.spec.ts
├── epic-5-dashboards.spec.ts        # incluye verificación visual de consolidado vs. detalle por negocio
└── epic-6-personal.spec.ts
```

## Test Examples

**Frontend Component Test:**
```typescript
// apps/web/tests/components/registrar-venta-form.test.tsx
it("no permite enviar sin cliente cuando la forma de cobro es CREDITO_CLIENTE", async () => {
  render(<RegistrarVentaForm />);
  await selectFormaCobro("CREDITO_CLIENTE");
  await submitForm();
  expect(screen.getByText(/cliente es requerido/i)).toBeInTheDocument();
});
```

**Backend API Test (dominio puro):**
```typescript
// packages/domain/tests/indicadores/cadena-completa.test.ts
it("calcula Ganancia Líquida correctamente con venta cancelada parcialmente y gastos mixtos", () => {
  const datos = buildDatosPeriodoNegocio({
    ventas: [ventaConProductoYServicio, ventaCanceladaParcial],
    gastos: [gastoOperativo, gastoFinanciero],
  });
  const indicadores = calcularIndicadores(datos);
  expect(indicadores.gananciaLiquida).toBe(expectedGananciaLiquida);
});
```

**E2E Test:**
```typescript
// apps/web/e2e/epic-1-onboarding.spec.ts (verificación de aislamiento desde la UI)
test("Cuenta A no puede acceder a un negocio de Cuenta B por URL directa", async ({ browser }) => {
  const negocioIdDeB = await crearNegocioComoCuentaB(browser);
  const pageA = await loginComoCuentaA(browser);
  await pageA.goto(`/laboral/dashboard?negocio=${negocioIdDeB}`);
  await expect(pageA.getByText(/no encontrado|no autorizado/i)).toBeVisible();
});
```

---
