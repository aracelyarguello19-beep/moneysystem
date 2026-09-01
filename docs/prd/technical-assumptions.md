# Technical Assumptions

## Repository Structure: Monorepo

Una única aplicación fullstack simplifica compartir tipos entre validación de formularios y las fórmulas financieras (indicadores, conversión de moneda), que deben mantenerse consistentes en todo el sistema y repetirse de forma idéntica para cada negocio de la cuenta.

## Service Architecture

**Monolito modular** dentro de una aplicación fullstack (ej. Next.js App Router + Server Actions/API routes), adecuado al volumen bajo-medio de transacciones descrito en el brief. No se justifica una arquitectura de microservicios para este MVP. El **modelo de datos es jerárquico**: Cuenta → (uno o varios Negocios, cada uno con sus propias transacciones, catálogos y saldos) + Cuenta → Personal (único, no se repite por negocio).

## Testing Requirements

**Unit + Integration**, con foco especial en tres áreas de alto riesgo identificadas en el brief:
- Las fórmulas financieras de la tabla de indicadores (Ingresos Brutos → Ganancia Líquida), con cobertura exhaustiva de casos límite: cancelaciones/devoluciones, ítems tipo servicio (CSV) vs. producto (CMV), y montos en múltiples monedas — a nivel de un negocio individual y en el consolidado entre negocios.
- El aislamiento multi-tenant entre cuentas: pruebas de integración que verifiquen que ninguna consulta puede devolver o modificar datos de una cuenta distinta a la autenticada.
- El aislamiento entre negocios de una misma cuenta: pruebas de integración que verifiquen que ninguna consulta sobre un negocio puede devolver o modificar datos de otro negocio del mismo dueño.

## Additional Technical Assumptions and Requests

- Base de datos relacional (PostgreSQL sugerido, alineado al preset técnico activo del framework AIOX) — a confirmar con @architect.
- El preset técnico activo en este proyecto AIOX es `nextjs-react` (Next.js 16+, React, TypeScript, Tailwind, Zustand, React Query); se toma como punto de partida, sujeto a validación final de @architect.
- El modelo de datos incorpora **Negocio** como entidad intermedia entre Cuenta y las transacciones/catálogos: toda tabla transaccional o de catálogo del módulo Laboral debe llevar tanto la referencia a la cuenta como al negocio al que pertenece.
- Aislamiento multi-tenant recomendado vía filtrado obligatorio por cuenta **y por negocio** en cada consulta (ej. Row-Level Security compuesta si la base de datos lo soporta), no solo por lógica de aplicación — tratado como requisito de seguridad, no como detalle de implementación (ver NFR1, NFR2).
- Cada registro monetario debe almacenar su moneda de origen; las conversiones a Guaraníes se calculan y persisten con la tasa usada en el momento de la transacción, no se recalculan en tiempo de lectura (ver FR35).
- No se requiere integración con pasarelas de pago ni con entidades bancarias externas para el MVP (fuera de alcance, ver brief — Out of Scope).
- **Tasa de cambio — decidido:** carga 100% manual por el usuario en el MVP (FR36); no se integra fuente externa automática en esta fase, para mantener la implementación simple y sin dependencias externas. Queda como posible mejora de Fase 2 (ver `docs/brief.md` — Post-MVP Vision).
- No hay datos históricos a migrar para el MVP (confirmado por el usuario) — no se requiere funcionalidad de importación/migración en esta fase. La cantidad de negocios por cuenta no tiene una estimación del usuario, por lo que @architect no debe asumir un número fijo o reducido al dimensionar el selector de negocio ni el modelo de datos.
- No hay transferencias directas entre negocios en el MVP (fuera de alcance, ver brief) — la única salida de un negocio hacia otro ámbito es el retiro de utilidades hacia Personal.

---
