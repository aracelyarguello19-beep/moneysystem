# Epic 5 Dashboard de Indicadores Laborales y Consolidación Multi-Negocio/Multi-Moneda

Calcular automáticamente toda la cadena de indicadores financieros definida en el brief para cada negocio, mostrar el patrimonio de cada uno consolidado en Guaraníes sin perder el detalle por moneda, y sumar los resultados de todos los negocios de la cuenta en una vista consolidada. Este es el epic que entrega la promesa central del sistema: saber cuánto se gana realmente en cada negocio y entre todos, sin cálculo manual.

## Story 5.1 Cálculo de indicadores laborales

Como dueño de cuenta,
quiero ver los indicadores financieros del negocio activo calculados automáticamente,
para saber cuánto gano realmente en ese negocio sin usar una calculadora aparte.

### Acceptance Criteria

1: El sistema calcula, para el negocio activo y un período seleccionado, Ingresos Brutos, Ingresos Netos (restando impuesto sobre la venta, cancelaciones y devoluciones), CMV, CSV, Ganancia Bruta, Gastos Operativos, Resultado Operativo, Gastos Financieros, Ganancia Líquida y Margen de Ganancia (FR21).
2: Cada indicador se calcula con la fórmula exacta definida en la tabla de terminología del brief, en el orden: Ingresos Brutos → Ingresos Netos → Ganancia Bruta → Resultado Operativo → Ganancia Líquida.
3: Una prueba automatizada verifica el cálculo correcto de la cadena completa, dentro de un mismo negocio, ante: ventas mixtas de producto y servicio, una venta cancelada parcialmente, y gastos de ambas clasificaciones.
4: Los indicadores del negocio activo se recalculan en tiempo real al registrar una nueva transacción dentro del período visualizado (NFR4).

## Story 5.2 Desglose por producto/servicio y filtro por período

Como dueño de cuenta,
quiero poder ver los indicadores del negocio activo filtrados por período y separados entre productos y servicios,
para entender qué parte de ese negocio rinde más.

### Acceptance Criteria

1: El usuario puede filtrar el dashboard de indicadores del negocio activo por un rango de fechas (FR22).
2: El usuario puede ver el desglose de CMV/CSV y de Ganancia Bruta de ese negocio, separado entre ítems tipo producto e ítems tipo servicio.
3: Cambiar el período o el desglose no requiere recargar toda la aplicación ni esperar más de unos segundos.

## Story 5.3 Consolidación multi-moneda con tasa de cambio registrada

Como dueño de cuenta,
quiero ver el total consolidado en Guaraníes del negocio activo además del detalle por cada moneda,
para tener una única cifra de referencia aunque ese negocio opere en varias monedas.

### Acceptance Criteria

1: El usuario puede cargar y actualizar manualmente la tasa de cambio de cada moneda no base habilitada en el negocio activo (FR36).
2: El sistema muestra, para el negocio activo y junto al detalle por moneda, un total consolidado en Guaraníes que convierte cada saldo en otra moneda usando la última tasa de cambio cargada por el usuario (FR34, FR36).
3: Cada transacción en moneda distinta al Guaraní queda asociada a la tasa de cambio vigente en ese momento, de forma persistente (FR35).
4: Un reporte de un período pasado de ese negocio no cambia si el usuario carga una tasa de cambio nueva después (verificado con una prueba automatizada).
5: El usuario puede ver, para cada moneda no base de ese negocio, qué tasa se usó y en qué fecha se registró.

## Story 5.4 Dashboard consolidado entre negocios

Como dueño de cuenta,
quiero ver mis indicadores y saldos sumados entre todos mis negocios,
para saber cuánto gano y cuánto tengo en conjunto sin sumarlo yo mismo.

### Acceptance Criteria

1: El sistema muestra un dashboard consolidado que suma los indicadores (Ingresos Brutos → Ganancia Líquida y Margen) de todos los negocios activos de la cuenta, convirtiendo primero cada uno a Guaraníes con su tasa registrada antes de sumar (FR23).
2: El sistema muestra saldos y deudas consolidados —caja + bancos + tarjetas + cuentas por cobrar + cuentas por pagar— sumados entre todos los negocios de la cuenta, junto con el detalle individual por negocio (FR24).
3: Los negocios archivados no se incluyen en el consolidado por defecto, salvo que el usuario elija explícitamente incluir históricos.
4: Una prueba automatizada verifica que el consolidado de dos negocios en monedas distintas se calcula convirtiendo primero cada negocio a Guaraníes, sin sumar montos de monedas distintas directamente.

---
