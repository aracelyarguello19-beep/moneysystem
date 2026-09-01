# Epic 4 Gastos, Pasivos y Saldos del Negocio

Registrar los gastos de cada negocio ya clasificados, llevar el pasivo de tarjeta de crédito/cuentas por pagar de cada uno, y mantener siempre visibles los saldos reales de caja y banco por negocio. Al cerrar este epic, cada negocio tiene su lado de "lo que debo" y "lo que tengo líquido" completamente reflejado, sin mezclarse con el de otros negocios.

## Story 4.1 Registro de gastos del negocio

Como dueño de cuenta,
quiero registrar cada gasto del negocio activo con su tipo,
para que se clasifique correctamente como Operativo o Financiero en los indicadores de ese negocio.

### Acceptance Criteria

1: El usuario puede registrar un gasto dentro del negocio activo, indicando monto, tipo de gasto (del catálogo de ese negocio, configurado en Epic 1), fecha y forma de pago (efectivo/banco/tarjeta de crédito) (FR18).
2: El gasto reduce el saldo de la cuenta/medio de pago usado en ese negocio, o aumenta la deuda de tarjeta de ese negocio si se paga con tarjeta de crédito.
3: La clasificación Operativo/Financiero del tipo de gasto elegido determina en qué indicador de ese negocio impacta (Gastos Operativos o Gastos Financieros — ver Epic 5), sin que el usuario tenga que elegirlo de nuevo en cada gasto.

## Story 4.2 Tarjeta de crédito y cuentas por pagar del negocio

Como dueño de cuenta,
quiero ver cuánto debe cada uno de mis negocios en tarjeta de crédito y otras cuentas,
para no perder de vista los pasivos de cada negocio.

### Acceptance Criteria

1: El sistema mantiene el saldo/deuda de cada tarjeta de crédito del negocio activo, aumentando con cada consumo y disminuyendo con cada pago de resumen registrado (FR19).
2: Los intereses o cargos de la tarjeta se registran automáticamente como Gasto Financiero de ese negocio.
3: El usuario puede ver el total adeudado en tarjetas de crédito y otras cuentas por pagar del negocio activo, separado y claramente distinguido de las cuentas por cobrar (activo) de ese mismo negocio.
4: El usuario puede registrar un pago de resumen de tarjeta, reduciendo la deuda de ese negocio y afectando el saldo de la cuenta usada para pagarlo, dentro del mismo negocio.

## Story 4.3 Saldos de caja y banco por moneda

Como dueño de cuenta,
quiero ver mi saldo de efectivo y de cada cuenta bancaria de cada negocio, en su propia moneda,
para saber cuánta liquidez tengo realmente en cada negocio.

### Acceptance Criteria

1: El sistema mantiene el saldo de caja y de cada cuenta bancaria del negocio activo, en la moneda en la que fue definida cada una (FR20, FR33).
2: Cada compra, venta, gasto o pago de resumen que use una cuenta/caja de ese negocio actualiza su saldo inmediatamente.
3: El usuario puede ver el detalle de saldos del negocio activo agrupado por moneda (base para la consolidación del Epic 5).

---
