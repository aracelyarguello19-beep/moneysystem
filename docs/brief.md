# Project Brief: Money Sistem

> **Nombre del proyecto:** Money Sistem — confirmado por el usuario. Sistema de Control Financiero (Personal + Laboral, Multi-Negocio).

---

## Executive Summary

Sistema de control financiero de doble ámbito — **laboral (uno o varios negocios)** y **personal** — que centraliza en un solo lugar la contabilidad de compra-venta de mercadería/servicios, cuentas por cobrar, cuentas por pagar (incluida tarjeta de crédito), inventario, saldos bancarios y efectivo **de cada negocio que el usuario opera**, calculando automáticamente los indicadores clave de rentabilidad de cada uno (margen líquido, ganancia bruta, ganancia neta, etc.) — con vista individual por negocio y vista consolidada de todos juntos — y alimentando con esos resultados la planificación financiera personal (reserva, gastos fijos y variables).

- **Problema principal:** hoy no existe un único lugar donde se registre la operación comercial (compras, costos, ventas) —de uno o varios negocios— y se derive de ahí, sin cálculo manual, la salud financiera de cada uno y del conjunto — y esa salud financiera tampoco se conecta con las finanzas personales para decidir cuánto ahorrar o gastar.
- **Mercado/usuario objetivo:** personas que venden mercadería/servicios, posiblemente en más de un negocio a la vez, y necesitan ver de un vistazo cuánto gana cada uno y cuánto ganan todos juntos, cuánto les deben, cuánta mercadería tienen y cuánta plata hay en bancos y en efectivo. El sistema es multiusuario, pero cada cuenta es **privada y exclusiva de su dueño**: no hay colaboración ni visibilidad compartida entre cuentas distintas.
- **Propuesta de valor clave:** un solo registro de "compra → costo → venta" por cada negocio, que se traduce automáticamente en todos los indicadores financieros estándar (sin que el usuario tenga que saber contabilidad), con la posibilidad de sumar varios negocios bajo una misma cuenta y un puente directo hacia las finanzas personales.

---

## Problem Statement

**Estado actual y dolor:**
- La información financiera del negocio —o de varios negocios, si el usuario opera más de uno— (compras, ventas, costos, deudas de clientes, stock, caja y bancos) está dispersa o no se registra de forma estructurada.
- No hay visibilidad clara de indicadores clave: cuánto se gana realmente después de costos, gastos operativos, gastos financieros e impuestos — el usuario mismo indica que no conoce la terminología exacta de algunos de estos conceptos (ver sección de terminología más abajo), lo cual confirma que hoy se calculan mal o no se calculan.
- Cuando hay más de un negocio, no hay forma simple de ver cuánto rinde cada uno por separado ni cuánto suman todos juntos.
- Las finanzas personales dependen del resultado de esos negocios, pero no hay conexión automática entre "cuánto ganó cada negocio este mes" y "cuánto me puedo pagar / cuánto reservo / cuánto gasto".

**Impacto:**
- Riesgo de tomar decisiones (retirar dinero de un negocio, gastar personalmente, fiar mercadería) sin saber el margen real disponible de ese negocio puntual.
- Riesgo de descapitalizar un negocio al no separar claramente su ganancia de la plata disponible para gastos personales.
- Cuentas por cobrar sin seguimiento sistemático → riesgo de pérdida de dinero adeudado, multiplicado si hay varios negocios con clientes propios cada uno.

**Por qué ahora:** el negocio (o los negocios) ya operan (compran y venden mercadería) pero sin sistema — cada mes que pasa sin datos estructurados es historial financiero perdido que no se puede reconstruir.

---

## Proposed Solution

Un sistema con **tres niveles**:

1. **Uno o varios Negocios (Módulo Laboral, repetible):** el usuario puede dar de alta más de un negocio dentro de su cuenta. Cada negocio es una unidad independiente con su propio registro transaccional de compras de productos (con su costo), ventas (con su precio e ítems vendidos) y gastos (operativos y financieros). De esos registros se derivan automáticamente todos los indicadores financieros de **ese negocio** (ver tabla de fórmulas abajo), su valor de inventario, sus cuentas por cobrar y sus saldos de caja/bancos.

2. **Vista consolidada de todos los negocios:** además de ver cada negocio por separado, el usuario ve un total sumado de todos sus negocios juntos (indicadores, saldos, deudas).

3. **Módulo Personal (único, uno por cuenta):** presupuesto personal que recibe como input los **retiros de utilidades** de cualquiera de los negocios —no automáticamente el 100% de la ganancia líquida de cada uno, sino solo lo que el usuario solicita puntualmente o lo que deja predeterminado como regla (ej. un % fijo o un monto fijo por período)— y permite planificar cuánto destinar a reserva financiera, gastos fijos y gastos variables.

**Diferenciador clave:** el usuario solo carga hechos simples (compré esto a este costo, vendí esto a este precio, pagué este gasto) en cada negocio — el sistema calcula todos los indicadores contables/financieros derivados, negocio por negocio y en conjunto. Cero cálculo manual, cero planillas paralelas.

**Por qué va a funcionar:** el modelo de datos parte de tres eventos atómicos (compra, venta, gasto) más tres saldos (caja, banco, cuentas por cobrar), repetidos por negocio — con eso alcanza para derivar el 100% de los indicadores pedidos, tanto por negocio como sumados, lo que mantiene el registro diario simple aunque el reporte final sea sofisticado.

---

## Target Users

### Primary User Segment: Dueño de cuenta (uno o varios negocios + finanzas personales propias)

- **Perfil:** una persona dueña de uno o más negocios de compra-venta de mercadería/servicios, que además maneja sus finanzas personales en paralelo. El sistema tendrá múltiples personas usándolo (multiusuario), pero **cada una opera en su propia cuenta privada** — sin relación ni visibilidad entre las cuentas de distintos dueños.
- **Comportamiento actual:** compra y vende productos/servicios en uno o varios negocios, probablemente hoy con registro manual o disperso; necesita saber cuánto gana cada negocio, cuánto ganan todos juntos, y cuánto puede disponer para gastos personales.
- **Necesidades:** ver rentabilidad real de cada uno de sus negocios y del conjunto, saber quién le debe y cuánto en cada negocio, saber cuánta mercadería y efectivo/banco tiene por negocio, y traducir todo eso en su propio plan financiero personal — todo dentro de un espacio privado que solo esa persona puede ver.
- **Objetivo:** tomar decisiones informadas (cuánto retirar de cada negocio, cuánto reservar, cuánto reinvertir en mercadería) sin exponer sus datos financieros a nadie más.

> **Nota para @architect/@pm:** el sistema es **multiusuario y multi-tenant, pero privado** — cada cuenta pertenece a una única persona y está completamente aislada de las demás cuentas (confirmado por el usuario: "cada cuenta será privada y exclusivamente para el dueño de esa cuenta"). Dentro de una misma cuenta, el usuario puede dar de alta **uno o varios negocios**, cada uno con su propio catálogo de ítems, monedas, tipos de gasto, inventario, cuentas por cobrar/pagar y saldos — **independientes entre sí** (confirmado por el usuario), más una vista consolidada que suma todos los negocios de la cuenta. El módulo Personal es único por cuenta (no se repite por negocio). No hay colaboración sobre un mismo negocio ni entre cuentas distintas, no hay roles compartidos, no hay visibilidad cruzada entre cuentas. La arquitectura debe garantizar aislamiento de datos por cuenta (cada consulta filtrada por el dueño autenticado) como requisito de seguridad, no como feature opcional.

---

## Goals & Success Metrics

### Business Objectives
- Tener el 100% de las transacciones (compras, ventas, gastos) de cada negocio registradas en el sistema, reemplazando cualquier registro manual/disperso.
- Contar con los indicadores laborales (ver tabla de fórmulas) calculados automáticamente por negocio y en conjunto, disponibles en tiempo real, sin cálculo manual.
- Contar con visibilidad diaria de: saldo en caja, saldo en bancos, valor de mercadería en stock y total de cuentas por cobrar, tanto por negocio como sumado entre todos.

### User Success Metrics
- El usuario puede responder "¿cuánto gané realmente este mes en este negocio?" y "¿cuánto gané entre todos mis negocios?" sin abrir una calculadora ni una planilla externa.
- El usuario puede saber en menos de 10 segundos cuánto le debe cada cliente, en el negocio que corresponda.
- Registrar una compra, una venta o un gasto toma menos de 1 minuto, incluyendo elegir en qué negocio se registra.
- Dar de alta un negocio nuevo dentro de la cuenta toma menos de 2 minutos.

### Key Performance Indicators (KPIs)
- **Margen líquido (%) por negocio y consolidado:** Ganancia líquida / Ingresos brutos × 100 — objetivo: visible siempre actualizado, en ambas vistas.
- **Cobertura de reserva financiera:** meses de gastos personales fijos cubiertos por la reserva — objetivo a definir por el usuario (ej. 3-6 meses).
- **Antigüedad de cuentas por cobrar:** % de deuda con más de 30/60/90 días, por negocio — objetivo: minimizar deuda vencida.

---

## Terminología Financiera — Aclaración de Conceptos (a validar con el usuario)

El usuario pidió estos indicadores pero indicó no conocer con precisión toda la nomenclatura contable. Se propone el siguiente mapeo estándar (a confirmar antes de pasar a PRD, porque define directamente el modelo de datos). **Todas las fórmulas aplican a nivel de un negocio individual; la vista consolidada las suma entre todos los negocios de la cuenta.**

| Término pedido por el usuario | Nombre contable estándar | Fórmula |
|---|---|---|
| Ingresos Brutos | Ventas Totales / Ingresos Brutos | Σ (precio de venta de productos × cantidad) + Σ (precio de venta de servicios) |
| Ingresos Netos | Ingresos Netos | Ingresos Brutos − Impuesto sobre la Venta − Cancelaciones − Devoluciones |
| CMV | Costo de Mercadería Vendida (COGS) — solo aplica a ítems tipo **producto** | Σ (costo de compra × cantidad vendida) |
| CSV | Costo de Servicios Vendidos — solo aplica a ítems tipo **servicio** (mano de obra, insumos, terceros subcontratados, etc. asociados a prestar ese servicio) | Σ (costo del servicio prestado) |
| Ganancia Bruta | Utilidad Bruta | Ingresos Netos − CMV − CSV |
| Resultado (Ganancia menos gastos operativos) | Resultado Operativo (EBIT) | Ganancia Bruta − Gastos Operativos |
| "Ganancia menos gastos financieros" (sin nombre) | **Resultado antes de Impuesto a la Renta (EBT)**, tras restar **Gastos Financieros** (intereses, comisiones bancarias, cargos de tarjeta de crédito, gastos de financiamiento) | Resultado Operativo − Gastos Financieros |
| Ganancia Líquida | Utilidad Neta / Ganancia Neta | Resultado antes de Impuesto a la Renta − Impuesto a la Renta |
| Margen de Ganancia | Margen Neto (%) | Ganancia Líquida / Ingresos Brutos × 100 |

> ⚠️ **Dos impuestos distintos, no confundir:** el **Impuesto sobre la Venta** (ej. IVA u otro impuesto transaccional) se resta temprano, al pasar de Ingresos Brutos a Ingresos Netos. El **Impuesto a la Renta/Ganancias** (sobre la utilidad del negocio) se resta al final, para llegar a Ganancia Líquida. Son conceptos y momentos distintos del cálculo.

> ⚠️ **Consolidado entre negocios:** el total de "todos los negocios juntos" se calcula sumando cada indicador ya calculado por negocio (ej. Ganancia Líquida consolidada = suma de la Ganancia Líquida de cada negocio), respetando la conversión de moneda de cada uno a Guaraníes antes de sumar (ver sección Multi-moneda en MVP Scope).

**Datos atómicos necesarios para derivar toda la tabla, por cada negocio:**
- Por cada ítem vendible, se define un **tipo: producto o servicio**:
  - **Producto:** costo de compra, cantidad comprada (stock), precio de venta, cantidad vendida → alimenta CMV.
  - **Servicio:** costo asociado a prestarlo (mano de obra, insumos, terceros), precio de venta → alimenta CSV. No tiene stock/inventario.
- Por cada venta: impuesto sobre la venta aplicado (si corresponde) y si fue total o parcialmente **cancelada/devuelta** → alimenta Ingresos Netos.
- Gastos operativos del negocio (alquiler, sueldos, insumos, etc.), clasificados como tal.
- Gastos financieros del negocio (intereses de préstamos, comisiones bancarias, cargos/intereses de tarjeta de crédito, mora), clasificados como tal — para separarlos de los gastos operativos.
- Impuesto a la Renta/Ganancias pagado o a pagar, si se quiere llegar a "ganancia líquida" real.

---

## MVP Scope

### Core Features (Must Have)

**Gestión de Negocios (nuevo, transversal al módulo Laboral):**
- El usuario puede dar de alta **uno o varios negocios** dentro de su cuenta (ej. "Almacén Centro", "Ferretería Ruta 2").
- Cada negocio es una unidad completamente independiente dentro de la cuenta: tiene su propio catálogo de ítems, su propio catálogo de monedas, su propio catálogo de tipos de gasto, su propio inventario, sus propias cuentas por cobrar/pagar, y sus propios saldos de caja/banco/tarjeta.
- El usuario puede cambiar de negocio activo desde cualquier pantalla del módulo Laboral (selector de negocio), de forma similar al selector Laboral/Personal ya definido.
- El usuario puede ver un **dashboard consolidado** que suma los indicadores, saldos y deudas de todos sus negocios, además de ver cada negocio individualmente.
- Dar de baja o archivar un negocio no borra su historial — queda disponible para consulta aunque deje de operar.

**Multi-moneda (dentro de cada negocio y en Personal):**
- **Catálogo de monedas administrado por el usuario, por negocio:** cada negocio tiene su propio catálogo de monedas — el usuario agrega las que ese negocio realmente usa (ej. Guaraní, Dólar, Real). El catálogo de Personal es independiente del de cualquier negocio.
- Cada caja, cuenta bancaria y tarjeta de crédito se define en una de las monedas habilitadas para ese negocio (o para Personal).
- Cada transacción (compra, venta, gasto, retiro) se registra en la moneda de la cuenta/medio de pago usado.
- Los indicadores y saldos se calculan correctamente **por moneda** — no se suman montos de monedas distintas sin conversión.
- **Guaraní (PYG) como moneda base de consolidación:** además de ver cada moneda por separado, el dashboard muestra un **total consolidado en Guaraníes** por negocio y entre todos los negocios, convirtiendo cada saldo/monto en otra moneda usando una tasa de cambio.
- **Tasa de cambio — Decisión confirmada (2026-08-31):** para el MVP, la tasa de cambio se carga **manualmente** por el usuario (el usuario la actualiza cuando quiere; el sistema usa la última tasa cargada para las conversiones hasta que se actualice). Se descarta integrar una fuente externa automática en el MVP, para no sumar complejidad ni una dependencia externa innecesaria en esta fase — queda como posible mejora de Fase 2 (ver Post-MVP Vision). Como siempre, cada conversión debe registrar qué tasa se usó en el momento, para que el histórico no cambie retroactivamente si el usuario carga una tasa nueva después.

**Catálogo de tipos de gasto (por negocio y en Personal):**
- El usuario define sus propios **tipos/categorías de gasto** (ej. "Alquiler del local", "Sueldos", "Marketing", en cada negocio; "Supermercado", "Colegio", "Streaming", en Personal) — no vienen precargados como lista cerrada.
- El catálogo de tipos de gasto de **cada negocio es independiente** de los demás negocios y del de Personal — un tipo creado en un negocio no aparece en otro ni en Personal.
- Cada tipo de gasto que se crea en un **negocio** debe clasificarse obligatoriamente como **Operativo** o **Financiero** (esa clasificación es la que alimenta Gastos Operativos y Gastos Financieros en la tabla de indicadores — ver Terminología). El usuario elige el nombre del tipo; el sistema exige la clasificación al crearlo.
- Cada tipo de gasto que se crea en **Personal** debe clasificarse como **Fijo** o **Variable**, para alimentar el balance personal.

**Por cada Negocio (repetible):**
- **Catálogo de ítems vendibles con tipo:** cada ítem se da de alta como **producto** (tiene stock, costo de compra) o **servicio** (sin stock, costo de prestación) — esta distinción es la que separa CMV de CSV en los reportes.
- **Registro de compras de productos:** producto, costo unitario, cantidad, fecha, proveedor (opcional), forma de pago (efectivo/banco/tarjeta de crédito/a crédito con proveedor). No aplica a servicios.
- **Registro de ventas:** ítem(s) vendido(s) —producto y/o servicio, mezclables en una misma venta—, precio de venta, cantidad (si aplica), fecha, cliente (opcional), forma de cobro (efectivo/banco/tarjeta/a crédito), impuesto sobre la venta aplicado (si corresponde).
- **Cancelaciones y devoluciones de venta:** anular una venta (total o parcial) revirtiendo su efecto en Ingresos Netos, en el saldo cobrado y, si era producto, en el stock.
- **Registro de costo de servicio prestado:** al vender un servicio, registrar su costo asociado (mano de obra, insumos, terceros) para poder calcular CSV.
- **Registro de gastos del negocio:** monto, tipo de gasto (del catálogo propio de ese negocio, clasificado como Operativo o Financiero), fecha, forma de pago (efectivo/banco/tarjeta de crédito).
- **Cuentas por cobrar (activo):** quién le debe a ese negocio, cuánto, desde cuándo, estado (pendiente/pagado parcial/pagado).
- **Cuentas por pagar / Tarjeta de crédito del negocio (pasivo):** deuda de ese negocio con terceros y con su tarjeta de crédito — cada consumo con tarjeta suma deuda, cada pago de resumen la reduce; los intereses/cargos de la tarjeta se clasifican como Gasto Financiero.
- **Valor de mercadería (inventario):** stock actual valorizado a costo, por producto y total, propio de ese negocio. Los servicios no generan inventario.
- **Saldos de caja, bancos y tarjeta(s) de crédito:** saldo actual en efectivo, por cada cuenta bancaria y saldo/deuda pendiente de cada tarjeta de crédito de ese negocio, actualizado con cada transacción.
- **Retiro de utilidades (puente negocio → personal):** transacción explícita que registra cuánto retira el usuario de la ganancia líquida de ese negocio en particular. Reduce caja/banco de ese negocio y aparece como ingreso en el módulo personal, identificado con el negocio de origen. Puede ser:
  - **Manual:** el usuario pide un retiro puntual de un monto determinado desde un negocio específico.
  - **Predeterminado:** una regla configurada de antemano por negocio (ej. "retirar 30% de la ganancia líquida cada mes de este negocio" o "retirar Gs. X fijo cada mes") que el sistema aplica automáticamente salvo que el usuario la desactive o ajuste ese período.
  - La ganancia líquida **no retirada** queda como capital de trabajo de ese negocio (no se mezcla con lo personal ni con otros negocios).
- **Dashboard de indicadores de ese negocio:** Ingresos Brutos, CMV, CSV, Ganancia Bruta, Gastos Operativos, Resultado Operativo, Gastos Financieros (incluye intereses de tarjeta), Ganancia Líquida, Margen de Ganancia — todos calculados automáticamente, filtrables por período y desglosables por productos vs. servicios.

**Consolidado de todos los Negocios:**
- **Dashboard consolidado:** los mismos indicadores de la tabla de terminología, sumados entre todos los negocios de la cuenta (convirtiendo cada uno a Guaraníes antes de sumar).
- **Saldos y deudas consolidados:** caja + bancos + tarjetas + cuentas por cobrar + cuentas por pagar, sumados entre todos los negocios, además del detalle por negocio.

**Personal (único por cuenta):**
- **Retiro de utilidades como input:** solo lo efectivamente retirado de cualquiera de los negocios (manual o por regla predeterminada) se refleja como ingreso disponible en el módulo personal, identificado por negocio de origen — no la ganancia líquida completa de ninguno.
- **Reserva financiera:** definir un monto/objetivo de reserva y cuánto destinar por período; ver progreso acumulado.
- **Gastos fijos:** registro de gastos personales recurrentes, con un tipo de gasto del catálogo propio de Personal clasificado como Fijo, y forma de pago (efectivo/banco/tarjeta de crédito).
- **Gastos varios:** registro de gastos personales no recurrentes, con un tipo de gasto del catálogo propio de Personal clasificado como Variable, y forma de pago (efectivo/banco/tarjeta de crédito).
- **Tarjeta de crédito personal (pasivo):** saldo/deuda pendiente de la(s) tarjeta(s) personal(es) — cada consumo suma deuda, cada pago de resumen la reduce; los intereses/cargos se registran como gasto financiero personal.
- **Balance personal:** ingresos (incluye retiros de todos los negocios) − gastos fijos − gastos varios − aporte a reserva = disponible; con la deuda de tarjeta visible aparte como pasivo pendiente.

### Out of Scope for MVP
- Facturación electrónica / integración con AFIP-SET u organismo fiscal equivalente.
- Conciliación bancaria automática (import de extractos bancarios).
- Reportes fiscales/impositivos formales (más allá del registro de "impuestos" como gasto/categoría).
- App móvil nativa (puede evaluarse post-MVP; MVP asume web responsive).
- Colaboración multiusuario sobre un mismo negocio o cuenta (cada cuenta es privada, de un único dueño; no hay invitar/compartir acceso con terceros en el MVP).
- Transferencias directas entre negocios (ej. "prestar" mercadería o dinero de un negocio a otro) — cada negocio queda financieramente independiente; solo el módulo Personal recibe retiros desde los negocios.

### MVP Success Criteria
El MVP es exitoso si el usuario puede, sin salir del sistema: dar de alta más de un negocio; registrar una compra, una venta y un gasto en el negocio que corresponda; ver el dashboard de cada negocio con todos los indicadores de la tabla de terminología calculados correctamente; ver el dashboard consolidado sumando todos sus negocios; ver cuánto le deben en total por negocio y quién debe qué; ver su saldo de caja/banco/mercadería por negocio y consolidado; y ver reflejado en su planificación personal lo efectivamente retirado de cada negocio (reserva, fijos, varios).

---

## Post-MVP Vision

### Phase 2 Features
- Alertas de cuentas por cobrar vencidas.
- Conciliación bancaria (import de movimientos).
- Reportes exportables (PDF/Excel) por período, por negocio o consolidados.
- Cotización automática de tasa de cambio vía fuente externa (API de cotizaciones o Banco Central del Paraguay), con carga manual como fallback — el MVP arranca 100% manual.

### Long-term Vision
Sistema de referencia diaria del usuario para decisiones tanto de cada negocio (reponer stock, fiar o no a un cliente, cuándo escalar gastos) como personales (cuándo un gasto grande es viable según la reserva), con historial multi-año para ver evolución de márgenes y capacidad de ahorro, por negocio y en conjunto.

### Expansion Opportunities
- Transferencias controladas entre negocios de una misma cuenta (préstamos internos), si el usuario lo solicita más adelante.
- Proyecciones/presupuesto a futuro (no solo histórico).
- Integración con métodos de pago electrónicos locales.

---

## Technical Considerations

> Notas iniciales, no decisiones finales — corresponde a @architect definirlas en detalle.

### Platform Requirements
- **Target Platforms:** Web responsive (uso desde celular y computadora), dado que múltiples personas (cada una en su propia cuenta privada, cada una potencialmente con varios negocios) van a acceder desde distintos dispositivos.
- **Browser/OS Support:** navegadores modernos estándar.
- **Performance Requirements:** cálculo de indicadores en tiempo real, por negocio y consolidado, sobre volumen bajo-medio de transacciones por negocio (no escala masiva).

### Technology Preferences
- **Frontend:** a definir por @architect.
- **Backend:** a definir por @architect.
- **Database:** relacional (los datos son inherentemente transaccionales y requieren integridad — compras, ventas, gastos, saldos — con una entidad "negocio" como nivel intermedio entre cuenta y las transacciones).
- **Hosting/Infrastructure:** a definir; requisito no funcional clave es respaldo/backup de datos financieros (dato crítico, no debe perderse).

### Architecture Considerations
- **Repository Structure:** a definir.
- **Service Architecture:** a definir.
- **Integration Requirements:** ninguna integración externa obligatoria para el MVP (ver Out of Scope).
- **Security/Compliance:** datos financieros sensibles y **privados por diseño** → requiere autenticación individual por persona (sin logins compartidos) y **aislamiento estricto de datos entre cuentas** (ningún usuario debe poder ver ni acceder a datos de otra cuenta, a nivel de consulta/base de datos, no solo de interfaz); considerar cifrado en reposo si se usa un proveedor cloud.
- **Modelo de datos jerárquico:** Cuenta → (uno o varios Negocios, cada uno con sus propias transacciones/catálogos/saldos) + Cuenta → Personal (único). Toda consulta debe filtrar correctamente por negocio además de por cuenta, para no mezclar datos entre negocios de un mismo usuario.

---

## Constraints & Assumptions

### Constraints
- **Budget:** no definido — a relevar.
- **Timeline:** no definido — a relevar.
- **Resources:** desarrollo vía AIOX (pipeline @pm → @architect → @sm → @dev → @qa).
- **Technical:** ninguna restricción técnica declarada aún (stack a definir en fase de arquitectura).

### Key Assumptions
- El negocio vende **productos (con stock/costo de compra) y servicios (con costo de prestación, sin stock)**, ambos en simultáneo — confirmado por el usuario. El modelo de datos debe soportar ambos tipos de ítem desde el MVP, por cada negocio.
- "Gastos financieros" se refiere a costos de financiamiento (intereses, comisiones bancarias, mora), no a "gastos generales del negocio".
- El sistema tendrá múltiples cuentas de usuario, pero cada cuenta es **privada y exclusiva de su dueño** — confirmado por el usuario. No hay colaboración ni datos compartidos entre cuentas distintas; no se requieren roles/permisos dentro de una cuenta para el MVP, sino aislamiento estricto entre cuentas.
- Una misma cuenta puede tener **uno o varios negocios**, cada uno con catálogos, inventario, cuentas por cobrar/pagar y saldos **independientes entre sí** — confirmado por el usuario. Existe además una vista **consolidada** que suma todos los negocios de la cuenta — confirmado por el usuario.
- El sistema soporta **múltiples monedas** desde el MVP (confirmado por el usuario) — cada cuenta bancaria/caja/tarjeta tiene su propia moneda, y cada transacción respeta la moneda del medio de pago usado. El **Guaraní (PYG) es la moneda base de consolidación**: los totales generales (por negocio y entre todos) se muestran convertidos a Guaraníes usando una tasa de cambio (confirmado por el usuario).
- El módulo personal se alimenta de **retiros de utilidades** de cualquiera de los negocios, no del 100% de la ganancia líquida de ninguno — confirmado por el usuario. Un retiro puede ser manual (a pedido) o automático según una regla predeterminada (% o monto fijo por período) por negocio; la parte no retirada queda como capital de trabajo de ese negocio. El usuario puede además tener otros ingresos personales no relacionados a ningún negocio (a confirmar).
- Las tarjetas de crédito (de cada negocio y personales) se modelan como **pasivo con saldo/deuda pendiente**, no solo como "forma de pago": cada consumo incrementa la deuda y cada pago de resumen la reduce; los intereses/cargos que genera la tarjeta son Gasto Financiero.
- Las **monedas** y los **tipos de gasto** son catálogos que el usuario administra (agregar los que necesite), no listas cerradas predefinidas por el sistema — y son **independientes entre cada negocio y Personal** (confirmado por el usuario).
- No hay transferencias directas entre negocios en el MVP — cada negocio es financieramente independiente; la única salida de un negocio hacia otro ámbito es el retiro de utilidades hacia Personal.

---

## Risks & Open Questions

### Key Risks
- **Mezcla de productos y servicios en el modelo de datos:** si el catálogo de ítems no distingue bien el tipo (producto vs. servicio) desde el diseño inicial, CMV y CSV pueden calcularse mal o solaparse.
- **Confusión ingresos brutos vs. netos:** si no se define bien la diferencia, dos indicadores del dashboard podrían terminar mostrando lo mismo.
- **Mezcla de fondos negocio/personal:** si el retiro de utilidades no se modela como transacción explícita y separada de la ganancia líquida, el módulo personal puede mostrar como disponible plata que en realidad sigue siendo capital de trabajo del negocio.
- **Dato financiero crítico sin backup:** pérdida de datos de compras/ventas/deudas sería un daño serio — requiere estrategia de respaldo desde el diseño.
- **Confusión activo vs. pasivo:** si cuentas por cobrar (te deben) y tarjeta de crédito/cuentas por pagar (debés) no se muestran claramente separadas, el balance general puede leerse al revés.
- **Mezcla de monedas en los cálculos:** si los indicadores (Ingresos Brutos, Ganancia Bruta, etc.) suman montos de distintas monedas sin conversión, los reportes quedan directamente inutilizables — el diseño de datos debe llevar la moneda en cada transacción desde el día 1.
- **Tipo de gasto sin clasificar correctamente:** si al crear un tipo de gasto el usuario no lo marca bien como Operativo/Financiero (por negocio) o Fijo/Variable (Personal), los indicadores que dependen de esa clasificación (Resultado Operativo, Gastos Financieros, balance personal) quedan mal calculados — el sistema debe exigir la clasificación al momento de crear el tipo, no dejarla opcional.
- **Tasa de cambio desactualizada o inconsistente:** si la tasa usada para consolidar en Guaraníes no se registra por transacción (y solo se aplica "la tasa de hoy" a todo el histórico), los reportes de meses pasados cambiarían cada vez que se actualice la tasa — hay que fijar la tasa usada en el momento de cada conversión.
- **Fuga de datos entre cuentas:** al ser un sistema multi-tenant con datos altamente sensibles (finanzas personales y de negocio), un error de aislamiento (ej. una consulta sin filtrar por dueño) expondría los datos privados de una cuenta a otro usuario — requiere que @architect trate el aislamiento por cuenta como requisito de seguridad crítico, no como detalle de implementación.
- **Mezcla de datos entre negocios de una misma cuenta:** si una consulta filtra solo por cuenta y no también por negocio, un negocio podría "ver" transacciones, saldos o inventario de otro negocio del mismo dueño — igual de grave que la fuga entre cuentas distintas para efectos del cálculo de indicadores, aunque el dueño sea la misma persona.
- **Consolidado mal calculado:** si el total de "todos los negocios" no convierte primero cada negocio a Guaraníes antes de sumar, el consolidado quedaría sumando monedas distintas como si fueran la misma.

### Open Questions — Resueltas (2026-08-31)
- **¿Hay registro previo a migrar?** No, no hay ningún registro previo para el usuario actual. Podría volverse relevante en el futuro si otro usuario del sistema quisiera dar de alta un negocio nuevo con historial propio en otro sistema/planilla, pero **no es un requisito del MVP** — no se construye funcionalidad de migración/importación en esta fase.
- **¿Cuántos negocios estima manejar?** Sin estimación. **No bloqueante**, pero implica que @architect debe diseñar el selector de negocio y el modelo de datos sin asumir un número fijo o reducido de negocios por cuenta.

### Areas Needing Further Research
- Relevar volumen esperado de transacciones mensuales (compras/ventas/gastos, productos y servicios) por negocio, para dimensionar la arquitectura.

---

## Appendices

### A. Research Summary
No se realizó investigación de mercado externa para este brief — el alcance surge directamente de los requisitos funcionales detallados provistos por el usuario en la activación de este agente.

### C. References
- Requisitos originales del usuario (ver historial de esta conversación / handoff a @pm).

---

## Next Steps

### Immediate Actions
1. Pasar este brief a **@pm** para actualizar el PRD ya generado (`docs/prd.md`) — el modelo de negocio único pasa a ser multi-negocio, lo que impacta epics y requisitos funcionales/no funcionales existentes, no solo agrega un epic nuevo.
2. @pm coordina con **@architect** la selección de stack técnico y arquitectura de datos, con especial atención a los modelos clave ya definidos en este brief: jerarquía Cuenta → Negocios (N) → Personal (1), catálogo producto/servicio (CMV vs. CSV) por negocio, activos/pasivos (cuentas por cobrar vs. tarjeta de crédito/cuentas por pagar) por negocio, retiro de utilidades (manual o por regla predeterminada) desde cualquier negocio hacia lo personal, autenticación individual por persona, y multi-moneda con consolidación en Guaraníes tanto por negocio como entre todos los negocios.
3. ~~Confirmar con el usuario si hay datos históricos previos... y si tiene una estimación de cuántos negocios va a manejar.~~ **Resuelto (2026-08-31):** no hay datos históricos a migrar; sin estimación de cantidad de negocios (ver Open Questions).

### PM Handoff
Este Project Brief provee el contexto completo para el Sistema de Control Financiero (Personal + Laboral Multi-Negocio). @pm debe revisar este brief actualizado en profundidad — en particular el cambio estructural de "un solo negocio" a "uno o varios negocios por cuenta, con vista consolidada"— y actualizar el PRD (`docs/prd.md`) en consecuencia: los requisitos funcionales, el epic list y las historias que asumían un único negocio por cuenta deben revisarse para incorporar el nivel "negocio" como entidad intermedia entre cuenta y las transacciones. Relevar con el usuario si hay datos históricos a migrar antes de cerrar los requisitos funcionales finales.
