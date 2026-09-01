# Epic 6 Retiro de Utilidades y Módulo Personal

Conectar el resultado de cualquiera de los negocios con las finanzas personales mediante retiros explícitos —nunca el 100% automático de la ganancia líquida— y habilitar la planificación personal completa: gastos fijos, variables, tarjeta personal y reserva financiera. Al cerrar este epic, el sistema cumple la promesa completa del brief: saber cuánto gana cada negocio y cuánto de eso puede disponer la persona.

## Story 6.1 Retiro de utilidades manual

Como dueño de cuenta,
quiero retirar puntualmente un monto de la ganancia líquida de uno de mis negocios,
para tener ese dinero disponible en mis finanzas personales sin mezclarlo con el capital de trabajo de ese negocio ni con el de los demás.

### Acceptance Criteria

1: El usuario puede registrar un retiro de utilidades manual eligiendo el negocio de origen y el monto a retirar (FR25).
2: El retiro reduce la caja/banco de ese negocio en el monto retirado y aparece como ingreso en el módulo Personal, identificado con su negocio de origen.
3: La ganancia líquida no retirada permanece como capital de trabajo del negocio de origen y no aparece como disponible en el módulo Personal (FR27).
4: El sistema muestra el historial de retiros realizados, con fecha, monto y negocio de origen, tanto por negocio como agregado en Personal.

## Story 6.2 Regla de retiro predeterminado

Como dueño de cuenta,
quiero configurar una regla para que mis retiros se hagan solos, por cada negocio,
para no tener que pedirlos manualmente cada período.

### Acceptance Criteria

1: El usuario puede configurar, de forma independiente para cada negocio, una regla de retiro predeterminado como porcentaje fijo de la ganancia líquida de ese negocio o como monto fijo por período (FR26).
2: El sistema aplica la regla automáticamente al cierre de cada período configurado, generando el retiro correspondiente a ese negocio sin intervención manual.
3: El usuario puede desactivar la regla de un negocio o ajustar puntualmente el monto de un período específico, sin afectar la regla de otro negocio.
4: Si coexisten un retiro manual y la regla predeterminada del mismo negocio en el mismo período, el sistema deja claro en el historial cuál origina cada movimiento.

## Story 6.3 Gastos personales fijos y variables

Como dueño de cuenta,
quiero registrar mis gastos personales fijos y variables por separado,
para entender mi estructura de gastos recurrentes vs. ocasionales.

### Acceptance Criteria

1: El usuario puede registrar un gasto personal fijo, asociado a un tipo de gasto del catálogo Personal clasificado como Fijo, y forma de pago (FR28).
2: El usuario puede registrar un gasto personal variable/vario, asociado a un tipo de gasto del catálogo Personal clasificado como Variable, y forma de pago (FR29).
3: Ambos tipos de gasto se reflejan por separado en el balance personal (ver Story 6.5).

## Story 6.4 Tarjeta de crédito personal

Como dueño de cuenta,
quiero ver cuánto debo en mi tarjeta de crédito personal,
para no perder de vista esa deuda al planificar mis gastos.

### Acceptance Criteria

1: El sistema mantiene el saldo/deuda de la(s) tarjeta(s) de crédito personal(es), con la misma lógica de consumo/pago de resumen que la tarjeta de un negocio (FR30).
2: Los intereses/cargos de la tarjeta personal se registran como gasto financiero personal.
3: El usuario puede ver la deuda de tarjeta personal como pasivo, separado del disponible en el balance personal.

## Story 6.5 Reserva financiera y balance personal

Como dueño de cuenta,
quiero definir cuánto reservar y ver mi balance personal completo,
para saber cuánto tengo realmente disponible después de mis compromisos y mi ahorro, sin importar de cuál de mis negocios provino.

### Acceptance Criteria

1: El usuario puede definir un objetivo de reserva financiera y cuánto destinar por período, y ver el progreso acumulado hacia ese objetivo (FR31).
2: El sistema calcula el balance personal como: retiros recibidos de todos los negocios − gastos fijos − gastos varios − aporte a reserva = disponible (FR32).
3: El usuario puede ver el desglose de los retiros recibidos por negocio de origen dentro del balance personal.
4: La deuda de tarjeta de crédito personal se muestra aparte, como pasivo pendiente, sin restarse directamente del disponible calculado.
5: El usuario puede responder "cuánto puedo gastar/reservar" viendo una única pantalla, sin cálculo externo (alineado a la meta de éxito del usuario en el brief).

---
