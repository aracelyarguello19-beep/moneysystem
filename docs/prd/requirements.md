# Requirements

## Functional

1. FR1: El sistema permite crear una cuenta de usuario individual con autenticación propia; cada cuenta pertenece a un único dueño.
2. FR2: El sistema aísla completamente los datos de cada cuenta — ningún usuario puede ver, consultar ni modificar datos de otra cuenta, aún ejecutando la misma funcionalidad.
3. FR3: El usuario puede dar de alta uno o varios negocios dentro de su cuenta; cada negocio es una unidad independiente con su propio catálogo de ítems, catálogo de monedas, catálogo de tipos de gasto, inventario, cuentas por cobrar/pagar y saldos de caja/banco/tarjeta.
4. FR4: El usuario puede archivar o dar de baja un negocio sin borrar su historial; un negocio archivado deja de operar pero permanece disponible para consulta.
5. FR5: El usuario puede cambiar el negocio activo desde un selector disponible en cualquier pantalla del módulo Laboral.
6. FR6: El sistema aísla completamente los datos entre los distintos negocios de una misma cuenta — ninguna operación sobre un negocio puede leer ni modificar datos de otro negocio de la misma cuenta.
7. FR7: El usuario puede administrar un catálogo de monedas por cada negocio, agregando las monedas que ese negocio use (ej. Guaraní, Dólar, Real), de forma independiente del catálogo de cualquier otro negocio.
8. FR8: El usuario puede administrar un catálogo de monedas para el módulo Personal, independiente del catálogo de cualquier negocio.
9. FR9: El usuario puede administrar un catálogo de tipos de gasto por cada negocio, clasificando cada tipo obligatoriamente como Operativo o Financiero al crearlo, de forma independiente del catálogo de cualquier otro negocio.
10. FR10: El usuario puede administrar un catálogo de tipos de gasto para el módulo Personal, clasificando cada tipo obligatoriamente como Fijo, Variable o Financiero al crearlo (Financiero es para intereses/cargos de tarjeta de crédito personal, ver FR30 y Story 6.4).
11. FR11: El usuario puede dar de alta ítems vendibles dentro de un negocio, definiendo cada uno como **Producto** (con stock y costo de compra) o **Servicio** (sin stock, con costo de prestación).
12. FR12: El usuario puede registrar compras de productos, dentro de un negocio, indicando costo unitario, cantidad, fecha, proveedor opcional y forma de pago (efectivo, banco, tarjeta de crédito o a crédito con proveedor); la compra actualiza el stock y el costo del producto en ese negocio.
13. FR13: El sistema mantiene el valor de la mercadería en stock de cada negocio, valorizado a costo, por producto y en total.
14. FR14: El usuario puede registrar, dentro de un negocio, una venta compuesta por uno o más ítems (productos y/o servicios), indicando precio de venta, cantidad cuando aplica, cliente opcional, forma de cobro e impuesto sobre la venta aplicado si corresponde.
15. FR15: Al vender un servicio, el usuario puede registrar el costo asociado a prestarlo (mano de obra, insumos, terceros), que alimenta el cálculo de CSV de ese negocio.
16. FR16: El usuario puede cancelar o devolver una venta de un negocio, total o parcialmente, revirtiendo su efecto en Ingresos Netos, en el saldo cobrado y en el stock cuando corresponde.
17. FR17: El sistema mantiene, por negocio, cuentas por cobrar por cliente, mostrando cuánto debe cada uno, desde cuándo, y su estado (pendiente / pagado parcial / pagado).
18. FR18: El usuario puede registrar gastos de un negocio indicando monto, tipo de gasto (del catálogo de ese negocio), fecha y forma de pago.
19. FR19: El sistema mantiene, por negocio, el saldo/deuda de la tarjeta de crédito y de otras cuentas por pagar, incrementando con cada consumo y reduciendo con cada pago de resumen; los intereses/cargos de tarjeta se clasifican automáticamente como Gasto Financiero de ese negocio.
20. FR20: El sistema mantiene, por negocio, el saldo de caja y de cada cuenta bancaria, por moneda, actualizado con cada transacción.
21. FR21: El sistema calcula automáticamente, para un negocio y período seleccionados, los indicadores: Ingresos Brutos, Ingresos Netos, CMV, CSV, Ganancia Bruta, Gastos Operativos, Resultado Operativo, Gastos Financieros, Ganancia Líquida y Margen de Ganancia.
22. FR22: El usuario puede desglosar el dashboard de indicadores de un negocio por producto vs. servicio y filtrarlo por período.
23. FR23: El sistema muestra un dashboard consolidado que suma los indicadores de todos los negocios de la cuenta, convirtiendo cada uno a Guaraníes antes de sumar.
24. FR24: El sistema muestra saldos y deudas consolidados (caja + bancos + tarjetas + cuentas por cobrar + cuentas por pagar), sumados entre todos los negocios de la cuenta, junto con el detalle por negocio.
25. FR25: El usuario puede registrar un retiro de utilidades manual eligiendo el negocio de origen y el monto a retirar; el retiro reduce caja/banco de ese negocio y aparece como ingreso en el módulo Personal, identificado con su negocio de origen.
26. FR26: El usuario puede configurar, de forma independiente para cada negocio, una regla de retiro predeterminado (porcentaje fijo o monto fijo por período) que el sistema aplica automáticamente salvo ajuste puntual.
27. FR27: La ganancia líquida no retirada de un negocio permanece como capital de trabajo de ese negocio y no aparece como disponible en el módulo Personal.
28. FR28: El usuario puede registrar gastos personales fijos, con un tipo de gasto del catálogo Personal clasificado como Fijo.
29. FR29: El usuario puede registrar gastos personales variables/varios, con un tipo de gasto del catálogo Personal clasificado como Variable.
30. FR30: El sistema mantiene el saldo/deuda de la(s) tarjeta(s) de crédito personal(es), con la misma lógica de consumo/pago de resumen que la tarjeta de un negocio.
31. FR31: El usuario puede definir un objetivo de reserva financiera y cuánto destinar por período, y ver el progreso acumulado.
32. FR32: El sistema calcula el balance personal: retiros recibidos (de cualquiera de los negocios) − gastos fijos − gastos varios − aporte a reserva = disponible, mostrando la deuda de tarjeta personal aparte como pasivo.
33. FR33: Cada caja, cuenta bancaria y tarjeta de crédito se define en una moneda del catálogo correspondiente (el de su negocio, o el de Personal); cada transacción respeta la moneda de la cuenta/medio de pago usado.
34. FR34: El sistema muestra, por negocio y consolidado entre negocios, un total en Guaraníes, convirtiendo cada saldo/monto en otra moneda usando la tasa de cambio registrada.
35. FR35: Cada conversión de moneda queda asociada a la tasa de cambio vigente en el momento de la transacción, de forma que el histórico no cambie si la tasa se actualiza después.
36. FR36: El usuario puede cargar y actualizar manualmente la tasa de cambio de cada moneda distinta al Guaraní; el sistema usa la última tasa cargada por el usuario para las conversiones hasta que este la actualice (no hay fuente externa automática en el MVP).

## Non Functional

1. NFR1: El aislamiento de datos entre cuentas debe garantizarse a nivel de consulta/base de datos, no solo de interfaz — ninguna consulta puede devolver datos de otra cuenta bajo ninguna circunstancia.
2. NFR2: El aislamiento de datos entre los distintos negocios de una misma cuenta debe garantizarse a nivel de consulta/base de datos, no solo de interfaz — ninguna consulta sobre un negocio puede devolver datos de otro negocio de esa misma cuenta.
3. NFR3: El sistema debe respaldar (backup) periódicamente los datos financieros; la pérdida de datos de compras, ventas o deudas se considera un incidente crítico.
4. NFR4: Los indicadores financieros deben calcularse y reflejarse en la interfaz en tiempo real (sin proceso batch nocturno) sobre el volumen bajo-medio de transacciones descrito en el brief.
5. NFR5: El sistema debe ser accesible como aplicación web responsive, utilizable desde celular y computadora, en navegadores modernos estándar.
6. NFR6: Toda cantidad monetaria debe llevar su moneda asociada — el modelo de datos debe impedir estructuralmente que se sumen montos de distintas monedas sin conversión.
7. NFR7: El sistema debe exigir la clasificación (Operativo/Financiero o Fijo/Variable) en el momento de crear un tipo de gasto — no puede quedar sin clasificar.
8. NFR8: Los datos financieros deben almacenarse en una base de datos relacional que garantice integridad transaccional (ACID), dado el carácter financiero de la información.
9. NFR9: El acceso a cada cuenta requiere autenticación individual; no se permiten sesiones ni logins compartidos entre distintas personas.
10. NFR10: Registrar una compra, una venta o un gasto debe poder completarse en menos de 1 minuto desde la perspectiva del usuario, incluyendo elegir en qué negocio se registra.
11. NFR11: Dar de alta un negocio nuevo dentro de la cuenta debe poder completarse en menos de 2 minutos.

---
