# Epic 3 Ventas y Cuentas por Cobrar

Habilitar el registro de ventas —de productos y de servicios, mezclados en una misma operación, dentro del negocio activo— junto con la posibilidad de cancelarlas o devolverlas, y llevar el control de quién le debe a cada negocio. Al cerrar este epic, el usuario puede vender, corregir una venta mal cargada, y saber en todo momento cuánto le deben en total y quién, en cada negocio.

## Story 3.1 Registro de ventas

Como dueño de cuenta,
quiero registrar, en el negocio activo, una venta con uno o más productos y/o servicios,
para que quede reflejada en los ingresos de ese negocio y, si corresponde, en el cobro.

### Acceptance Criteria

1: El usuario puede registrar, dentro del negocio activo, una venta con uno o más ítems (producto y/o servicio mezclados) del catálogo de ese negocio, cada uno con su precio de venta y cantidad cuando aplica (FR14).
2: La venta admite cliente opcional, forma de cobro (efectivo/banco/tarjeta/a crédito) e impuesto sobre la venta aplicado si corresponde.
3: Si la venta incluye productos, el stock de cada producto vendido se reduce en la cantidad correspondiente, dentro de ese negocio.
4: Si la forma de cobro es "a crédito", se genera automáticamente una cuenta por cobrar del negocio activo, asociada al cliente, por el monto correspondiente (ver Story 3.4).
5: El impuesto sobre la venta registrado en la transacción alimenta el cálculo de Ingresos Netos de ese negocio (ver Epic 5).

## Story 3.2 Registro de costo de servicio prestado

Como dueño de cuenta,
quiero registrar cuánto me costó prestar un servicio que vendí en el negocio activo,
para que el sistema pueda calcular correctamente el CSV de ese negocio.

### Acceptance Criteria

1: Al vender un ítem tipo Servicio dentro del negocio activo, el usuario puede registrar el costo asociado a prestarlo (mano de obra, insumos, terceros) (FR15).
2: El costo de servicio registrado alimenta el cálculo de CSV en el dashboard de indicadores de ese negocio (ver Epic 5), separado del CMV de productos.
3: Si no se registra costo de servicio para una venta de servicio, el sistema lo trata como costo cero y lo señala visualmente como dato incompleto.

## Story 3.3 Cancelaciones y devoluciones de venta

Como dueño de cuenta,
quiero poder anular una venta total o parcialmente en el negocio activo,
para corregir errores de carga o aceptar una devolución sin que los indicadores de ese negocio queden mal.

### Acceptance Criteria

1: El usuario puede cancelar o devolver una venta existente del negocio activo, total o parcialmente (FR16).
2: La cancelación/devolución revierte el efecto de esa porción de la venta en Ingresos Netos de ese negocio.
3: Si la venta cancelada/devuelta incluía productos, el stock correspondiente se repone en ese negocio.
4: Si la venta cancelada/devuelta ya había sido cobrada, el saldo cobrado (caja/banco) de ese negocio se ajusta o se registra el reembolso correspondiente.
5: Si la venta había generado una cuenta por cobrar, esta se ajusta o cancela según la porción devuelta.

## Story 3.4 Cuentas por cobrar

Como dueño de cuenta,
quiero saber quién le debe a cada negocio y cuánto,
para poder hacer seguimiento y no perder dinero adeudado en ninguno de mis negocios.

### Acceptance Criteria

1: El usuario puede ver, para el negocio activo, una lista de cuentas por cobrar por cliente, con el monto adeudado, la fecha de origen y el estado (pendiente / pagado parcial / pagado) (FR17).
2: El usuario puede registrar un pago total o parcial de una cuenta por cobrar, actualizando su estado y el saldo de caja/banco de ese negocio.
3: El total adeudado por todos los clientes del negocio activo es visible como una única cifra agregada.
4: El detalle de cuánto debe un cliente específico, dentro del negocio correspondiente, es accesible en menos de 10 segundos desde el listado (alineado a la meta de éxito del usuario en el brief).

---
