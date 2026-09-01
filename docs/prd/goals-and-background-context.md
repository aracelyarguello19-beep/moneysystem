# Goals and Background Context

## Goals

- Reemplazar el registro manual/disperso de compras, ventas y gastos por un único sistema transaccional.
- Permitir dar de alta **uno o varios negocios independientes** dentro de una misma cuenta, cada uno con su propio catálogo, inventario, cuentas por cobrar/pagar y saldos, más una **vista consolidada** que suma todos los negocios de la cuenta.
- Calcular automáticamente toda la cadena de indicadores de rentabilidad de **cada negocio** (Ingresos Brutos, Ingresos Netos, CMV, CSV, Ganancia Bruta, Resultado Operativo, Gastos Financieros, Ganancia Líquida, Margen de Ganancia) sin cálculo manual, tanto individualmente como sumados entre todos los negocios.
- Dar visibilidad diaria de cuánto le deben a cada negocio (cuentas por cobrar) y cuánto debe cada negocio (tarjeta de crédito / cuentas por pagar), por negocio y consolidado.
- Dar visibilidad diaria de saldo en caja, en cada banco y del valor de mercadería en stock, por negocio, por moneda y consolidado en Guaraníes entre todos los negocios.
- Conectar el resultado de cualquiera de los negocios con las finanzas personales a través de retiros de utilidades explícitos (manuales o por regla predeterminada, configurables por negocio), sin mezclar capital de trabajo con disponible personal.
- Permitir planificar reserva financiera, gastos fijos y gastos variables personales a partir de lo efectivamente retirado de cualquiera de los negocios.
- Garantizar que cada cuenta de usuario sea completamente privada y esté aislada de las demás — multiusuario sin colaboración ni visibilidad compartida — y que, dentro de una misma cuenta, los datos de cada negocio permanezcan aislados de los demás negocios del usuario.
- Permitir operar en múltiples monedas, definidas por el propio usuario, en catálogos independientes entre cada negocio y el módulo Personal.

## Background Context

Hoy la información financiera de quien vende mercadería o servicios por cuenta propia —posiblemente en más de un negocio a la vez— está dispersa o no se registra de forma estructurada: compras, ventas, costos, deudas de clientes, stock, caja y bancos. Esto hace que no exista visibilidad clara de cuánto se gana realmente después de costos, gastos operativos, gastos financieros e impuestos en cada negocio, que no haya forma simple de ver cuánto rinde cada uno por separado ni cuánto suman todos juntos, y que las finanzas personales queden desconectadas del resultado real de esos negocios: no hay una respuesta automática a "cuánto gané este mes en este negocio", "cuánto gané entre todos" ni a "cuánto puedo gastar o reservar en base a eso". El riesgo concreto es tomar decisiones —retirar dinero de un negocio, fiar mercadería, gastar personalmente— sin conocer el margen real disponible de ese negocio puntual, y terminar descapitalizándolo al no separar su ganancia de la plata disponible para gastos personales.

Este sistema resuelve el problema con tres niveles interconectados. El módulo **Laboral** permite dar de alta **uno o varios negocios** dentro de la cuenta; cada negocio es una unidad completamente independiente que registra tres eventos atómicos —compra, venta, gasto— y de ahí deriva automáticamente todos los indicadores financieros estándar de **ese negocio**, su valor de inventario, sus cuentas por cobrar y sus saldos de caja/banco, sin que el usuario necesite saber contabilidad. Una **vista consolidada** suma los indicadores, saldos y deudas de todos los negocios de la cuenta. El módulo **Personal**, único por cuenta, se alimenta exclusivamente de **retiros de utilidades** explícitos desde cualquiera de los negocios —no del 100% de la ganancia líquida de ninguno— y permite planificar reserva, gastos fijos y variables. El sistema es multiusuario pero cada cuenta es privada y exclusiva de su dueño, con aislamiento estricto también entre los negocios de una misma cuenta, y soporta múltiples monedas administradas por el propio usuario por negocio, con el Guaraní como moneda base de consolidación.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 1.0 | PRD inicial generado a partir de `docs/brief.md` | Morgan (@pm) |
| 2026-08-31 | 2.0 | Reescritura estructural: el modelo pasa de "un negocio por cuenta" a "uno o varios negocios independientes por cuenta, con vista consolidada". Se incorpora Negocio como entidad intermedia entre Cuenta y las transacciones/catálogos; se agregan gestión de negocios, aislamiento entre negocios y dashboard consolidado; se actualizan Goals, FR, NFR, UI Design Goals, Technical Assumptions y los 6 epics existentes. Basado en la actualización de `docs/brief.md`. | Morgan (@pm) |
| 2026-08-31 | 2.1 | Cierre de Open Questions del brief: no hay datos históricos a migrar en el MVP (confirmado por el usuario); sin estimación de cantidad de negocios (@architect debe diseñar sin asumir un número fijo). Se agrega recomendación no vinculante de @pm sobre tasa de cambio (esquema híbrido: fuente automática + fallback a última tasa conocida + override manual), a validar por @architect. | Morgan (@pm) |
| 2026-08-31 | 2.2 | Decisión confirmada por el usuario: la tasa de cambio se carga 100% manualmente en el MVP (se descarta la fuente externa automática para esta fase, queda como Fase 2). Se agrega FR36; se actualiza Story 5.3 con AC de carga manual; se cierra el punto técnico que quedaba abierto para @architect. | Morgan (@pm) |
| 2026-08-31 | 2.3 | Revalidación formal contra `pm-checklist.md`: se corrige el Checklist Results Report, que había quedado desactualizado tras v2.1/v2.2 — seguía listando la tasa de cambio y las Open Questions del brief como pendientes pese a estar ya resueltas, y el conteo de FR no reflejaba el FR36 agregado en v2.2 (corregido de 35 a 36). Se verificó trazabilidad 1:1 de las 36 FR y las 11 NFR contra las 26 historias; sin hallazgos que bloqueen el pase a arquitectura. | Morgan (@pm) |

---
