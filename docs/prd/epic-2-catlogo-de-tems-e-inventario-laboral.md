# Epic 2 Catálogo de Ítems e Inventario Laboral

Habilitar el registro de qué vende cada negocio (productos y servicios) y qué compra para poder venderlo, manteniendo siempre visible cuánta mercadería hay en stock y a qué costo, dentro del negocio activo. Al cerrar este epic, el usuario puede dar de alta el catálogo de cada negocio y registrar compras reales, con el valor de inventario reflejándose correctamente por negocio.

## Story 2.1 Alta de ítems vendibles (producto/servicio)

Como dueño de cuenta,
quiero dar de alta, en el negocio activo, cada cosa que vendo como producto o como servicio,
para que el sistema sepa después si le corresponde CMV o CSV en ese negocio.

### Acceptance Criteria

1: El usuario puede crear un ítem vendible dentro del negocio activo, eligiendo tipo Producto o Servicio (FR11).
2: Un ítem tipo Producto tiene campos de costo de compra y stock; un ítem tipo Servicio no genera stock.
3: El tipo del ítem no puede cambiarse después de tener movimientos asociados (compras o ventas), para no corromper el histórico de CMV/CSV de ese negocio.
4: El usuario puede editar el nombre, precio de venta y otros datos no estructurales del ítem en cualquier momento.
5: El catálogo de ítems del negocio activo es independiente del catálogo de cualquier otro negocio.

## Story 2.2 Registro de compras de productos

Como dueño de cuenta,
quiero registrar, en el negocio activo, cada compra de mercadería con su costo,
para que el stock y el costo del producto de ese negocio queden actualizados automáticamente.

### Acceptance Criteria

1: El usuario puede registrar una compra dentro del negocio activo, indicando producto, costo unitario, cantidad, fecha, proveedor opcional y forma de pago (efectivo/banco/tarjeta de crédito/a crédito con proveedor) (FR12).
2: La compra solo admite ítems tipo Producto del catálogo del negocio activo; un ítem tipo Servicio no aparece como opción.
3: Al confirmar la compra, el stock del producto aumenta en la cantidad comprada y el saldo de la cuenta/medio de pago usado, dentro de ese negocio, se actualiza según corresponda.
4: Si la forma de pago es tarjeta de crédito, la deuda de tarjeta de ese negocio aumenta en el monto de la compra (ver Epic 4).

## Story 2.3 Valor de mercadería (inventario)

Como dueño de cuenta,
quiero ver cuánto vale mi mercadería en stock, por producto y en total, en el negocio activo,
para saber cuánto capital tengo inmovilizado en inventario en ese negocio.

### Acceptance Criteria

1: El usuario puede ver el stock actual de cada producto del negocio activo, valorizado a su costo de compra (FR13).
2: El usuario puede ver el valor total de mercadería en stock del negocio activo, agregando todos sus productos.
3: El valor de inventario se actualiza inmediatamente después de cada compra y cada venta que afecte stock, dentro de ese negocio.
4: Los ítems tipo Servicio no aparecen en la vista de inventario. El inventario de un negocio no incluye productos de otro negocio.

---
