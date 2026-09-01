# Next Steps

## UX Expert Prompt

Este PRD (`docs/prd.md`) y el Project Brief actualizado (`docs/brief.md`) están listos para iniciar el modo de creación de arquitectura de UX. Revisá la sección "User Interface Design Goals" — en particular el nuevo selector de negocio activo, las Core Screens de Gestión de Negocios y Dashboard Consolidado, y la dirección tentativa de branding validada con el mockup "Panorama Multi-Moneda" — y desarrollá los flujos de usuario y el sistema de diseño para los tres niveles del sistema (Negocios, Laboral por negocio, y Personal).

## Architect Prompt

Este PRD (`docs/prd.md`) está listo para iniciar el modo de creación de arquitectura. Prestá especial atención a: el cambio estructural de este PRD respecto a la versión 1.0 — Negocio pasa a ser una entidad intermedia obligatoria entre Cuenta y las transacciones (Cuenta → Negocios(N) → transacciones/catálogos; Cuenta → Personal(1)); el aislamiento multi-tenant como requisito de seguridad no negociable, ahora en dos niveles: entre cuentas (NFR1) y entre negocios de una misma cuenta (NFR2); el modelo de datos de multi-moneda con tasa de cambio **cargada manualmente por el usuario** y persistida por transacción, tanto dentro de un negocio como en el consolidado entre negocios (FR33-FR36, Stories 5.3-5.4) — no hay integración con fuente externa automática en el MVP, esa decisión ya está cerrada; la separación de catálogos (monedas y tipos de gasto) entre cada negocio y Personal (FR7-FR10); y la cadena de cálculo de indicadores financieros definida en la Story 5.1, replicada por negocio y sumada en la Story 5.4. El stack sugerido (`nextjs-react`, PostgreSQL) es el preset activo del framework AIOX — validalo o reemplazalo según corresponda.
