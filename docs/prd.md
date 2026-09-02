# Money System (Personal + Laboral, Multi-Negocio) — Product Requirements Document (PRD)

> Nombre de trabajo: `[NOMBRE_PROYECTO]` — placeholder heredado del Project Brief, no bloquea el avance.

---

## Goals and Background Context

### Goals

- Reemplazar el registro manual/disperso de compras, ventas y gastos por un único sistema transaccional.
- Permitir dar de alta **uno o varios negocios independientes** dentro de una misma cuenta, cada uno con su propio catálogo, inventario, cuentas por cobrar/pagar y saldos, más una **vista consolidada** que suma todos los negocios de la cuenta.
- Calcular automáticamente toda la cadena de indicadores de rentabilidad de **cada negocio** (Ingresos Brutos, Ingresos Netos, CMV, CSV, Ganancia Bruta, Resultado Operativo, Gastos Financieros, Ganancia Líquida, Margen de Ganancia) sin cálculo manual, tanto individualmente como sumados entre todos los negocios.
- Dar visibilidad diaria de cuánto le deben a cada negocio (cuentas por cobrar) y cuánto debe cada negocio (tarjeta de crédito / cuentas por pagar), por negocio y consolidado.
- Dar visibilidad diaria de saldo en caja, en cada banco y del valor de mercadería en stock, por negocio, por moneda y consolidado en Guaraníes entre todos los negocios.
- Conectar el resultado de cualquiera de los negocios con las finanzas personales a través de retiros de utilidades explícitos (manuales o por regla predeterminada, configurables por negocio), sin mezclar capital de trabajo con disponible personal.
- Permitir planificar reserva financiera, gastos fijos y gastos variables personales a partir de lo efectivamente retirado de cualquiera de los negocios.
- Garantizar que cada cuenta de usuario sea completamente privada y esté aislada de las demás — multiusuario sin colaboración ni visibilidad compartida — y que, dentro de una misma cuenta, los datos de cada negocio permanezcan aislados de los demás negocios del usuario.
- Permitir operar en múltiples monedas, definidas por el propio usuario, en catálogos independientes entre cada negocio y el módulo Personal.

### Background Context

Hoy la información financiera de quien vende mercadería o servicios por cuenta propia —posiblemente en más de un negocio a la vez— está dispersa o no se registra de forma estructurada: compras, ventas, costos, deudas de clientes, stock, caja y bancos. Esto hace que no exista visibilidad clara de cuánto se gana realmente después de costos, gastos operativos, gastos financieros e impuestos en cada negocio, que no haya forma simple de ver cuánto rinde cada uno por separado ni cuánto suman todos juntos, y que las finanzas personales queden desconectadas del resultado real de esos negocios: no hay una respuesta automática a "cuánto gané este mes en este negocio", "cuánto gané entre todos" ni a "cuánto puedo gastar o reservar en base a eso". El riesgo concreto es tomar decisiones —retirar dinero de un negocio, fiar mercadería, gastar personalmente— sin conocer el margen real disponible de ese negocio puntual, y terminar descapitalizándolo al no separar su ganancia de la plata disponible para gastos personales.

Este sistema resuelve el problema con tres niveles interconectados. El módulo **Laboral** permite dar de alta **uno o varios negocios** dentro de la cuenta; cada negocio es una unidad completamente independiente que registra tres eventos atómicos —compra, venta, gasto— y de ahí deriva automáticamente todos los indicadores financieros estándar de **ese negocio**, su valor de inventario, sus cuentas por cobrar y sus saldos de caja/banco, sin que el usuario necesite saber contabilidad. Una **vista consolidada** suma los indicadores, saldos y deudas de todos los negocios de la cuenta. El módulo **Personal**, único por cuenta, se alimenta exclusivamente de **retiros de utilidades** explícitos desde cualquiera de los negocios —no del 100% de la ganancia líquida de ninguno— y permite planificar reserva, gastos fijos y variables. El sistema es multiusuario pero cada cuenta es privada y exclusiva de su dueño, con aislamiento estricto también entre los negocios de una misma cuenta, y soporta múltiples monedas administradas por el propio usuario por negocio, con el Guaraní como moneda base de consolidación.

### Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-08-31 | 1.0 | PRD inicial generado a partir de `docs/brief.md` | Morgan (@pm) |
| 2026-08-31 | 2.0 | Reescritura estructural: el modelo pasa de "un negocio por cuenta" a "uno o varios negocios independientes por cuenta, con vista consolidada". Se incorpora Negocio como entidad intermedia entre Cuenta y las transacciones/catálogos; se agregan gestión de negocios, aislamiento entre negocios y dashboard consolidado; se actualizan Goals, FR, NFR, UI Design Goals, Technical Assumptions y los 6 epics existentes. Basado en la actualización de `docs/brief.md`. | Morgan (@pm) |
| 2026-08-31 | 2.1 | Cierre de Open Questions del brief: no hay datos históricos a migrar en el MVP (confirmado por el usuario); sin estimación de cantidad de negocios (@architect debe diseñar sin asumir un número fijo). Se agrega recomendación no vinculante de @pm sobre tasa de cambio (esquema híbrido: fuente automática + fallback a última tasa conocida + override manual), a validar por @architect. | Morgan (@pm) |
| 2026-08-31 | 2.2 | Decisión confirmada por el usuario: la tasa de cambio se carga 100% manualmente en el MVP (se descarta la fuente externa automática para esta fase, queda como Fase 2). Se agrega FR36; se actualiza Story 5.3 con AC de carga manual; se cierra el punto técnico que quedaba abierto para @architect. | Morgan (@pm) |
| 2026-08-31 | 2.3 | Revalidación formal contra `pm-checklist.md`: se corrige el Checklist Results Report, que había quedado desactualizado tras v2.1/v2.2 — seguía listando la tasa de cambio y las Open Questions del brief como pendientes pese a estar ya resueltas, y el conteo de FR no reflejaba el FR36 agregado en v2.2 (corregido de 35 a 36). Se verificó trazabilidad 1:1 de las 36 FR y las 11 NFR contra las 26 historias; sin hallazgos que bloqueen el pase a arquitectura. | Morgan (@pm) |

---

## Requirements

### Functional

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

### Non Functional

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

## User Interface Design Goals

### Overall UX Vision

La experiencia debe sentirse como llevar un libro contable simple, no como operar un software contable — incluso teniendo varios negocios abiertos a la vez. El usuario carga hechos cortos (compré, vendí, gasté, retiré) en el negocio que corresponda, y el sistema hace todo el trabajo de traducirlos a indicadores financieros. La superficie principal es un dashboard que se **escanea, no se lee**: el total y los indicadores más importantes arriba, el detalle abajo, con el estado (deuda pendiente, saldo bajo, moneda, negocio activo) siempre legible mediante forma y color, no solo número.

### Key Interaction Paradigms

Formularios de carga rápida para las transacciones más frecuentes (venta, compra, gasto) accesibles desde cualquier pantalla del módulo activo. Un selector de ámbito persistente **Laboral / Personal** — en la línea del mockup ya validado con el usuario ("Panorama Multi-Moneda") — determina qué catálogos, cuentas y formularios se muestran. Dentro de Laboral, un **selector de negocio activo**, siempre visible, determina sobre cuál de los negocios del usuario se está operando o consultando; cambiar de negocio no requiere salir de la pantalla actual. Toda cifra en pantalla usa números tabulares y muestra su moneda de origen; los montos convertidos a Guaraníes se distinguen visualmente del monto en moneda original, nunca se mezclan sin etiqueta.

### Core Screens and Views

- Inicio de sesión / creación de cuenta
- Gestión de Negocios (alta, selector de negocio activo, archivar/reactivar)
- Panorama Financiero (dashboard con selector Laboral/Personal, total consolidado y desglose por moneda)
- Dashboard Consolidado (suma de indicadores, saldos y deudas de todos los negocios de la cuenta)
- Dashboard de Indicadores del Negocio activo (Ingresos Brutos → Ganancia Líquida, Margen, desglose producto vs. servicio)
- Catálogo de Ítems (productos y servicios) del negocio activo
- Registro de Compra
- Registro de Venta (con cancelación/devolución)
- Cuentas por Cobrar
- Registro de Gasto (Laboral, en el negocio activo, o Personal, según ámbito activo)
- Tarjeta de Crédito y Cuentas por Pagar
- Retiro de Utilidades (con selección de negocio de origen)
- Reserva Financiera y Balance Personal
- Configuración de Catálogos (Monedas, Tipos de Gasto) del negocio activo o de Personal

### Accessibility: WCAG AA

_Supuesto del PM, no especificado por el usuario — validar con @ux-design-expert._

### Branding

Sin lineamientos de marca formales definidos. El mockup de confirmación ya compartido y aprobado por el usuario ("Panorama Multi-Moneda") estableció una dirección tentativa: acento esmeralda, tipografía serif (Instrument Serif) para títulos y monoespaciada (IBM Plex Mono) para cifras. Se toma como punto de partida, a validar formalmente como sistema de diseño por @ux-design-expert, incluyendo cómo se representa visualmente el selector de negocio activo.

### Target Device and Platforms: Web Responsive

---

## Technical Assumptions

### Repository Structure: Monorepo

Una única aplicación fullstack simplifica compartir tipos entre validación de formularios y las fórmulas financieras (indicadores, conversión de moneda), que deben mantenerse consistentes en todo el sistema y repetirse de forma idéntica para cada negocio de la cuenta.

### Service Architecture

**Monolito modular** dentro de una aplicación fullstack (ej. Next.js App Router + Server Actions/API routes), adecuado al volumen bajo-medio de transacciones descrito en el brief. No se justifica una arquitectura de microservicios para este MVP. El **modelo de datos es jerárquico**: Cuenta → (uno o varios Negocios, cada uno con sus propias transacciones, catálogos y saldos) + Cuenta → Personal (único, no se repite por negocio).

### Testing Requirements

**Unit + Integration**, con foco especial en tres áreas de alto riesgo identificadas en el brief:
- Las fórmulas financieras de la tabla de indicadores (Ingresos Brutos → Ganancia Líquida), con cobertura exhaustiva de casos límite: cancelaciones/devoluciones, ítems tipo servicio (CSV) vs. producto (CMV), y montos en múltiples monedas — a nivel de un negocio individual y en el consolidado entre negocios.
- El aislamiento multi-tenant entre cuentas: pruebas de integración que verifiquen que ninguna consulta puede devolver o modificar datos de una cuenta distinta a la autenticada.
- El aislamiento entre negocios de una misma cuenta: pruebas de integración que verifiquen que ninguna consulta sobre un negocio puede devolver o modificar datos de otro negocio del mismo dueño.

### Additional Technical Assumptions and Requests

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

## Epic List

- **Epic 1: Fundación, Autenticación, Gestión de Negocios y Catálogos Base** — Levantar el proyecto con autenticación individual, aislamiento multi-tenant entre cuentas y entre negocios, la gestión de negocios (alta, selector, archivo) y los catálogos configurables de monedas y tipos de gasto que todo el resto del sistema usa.
- **Epic 2: Catálogo de Ítems e Inventario Laboral** — Dar de alta productos/servicios y registrar compras dentro del negocio activo, manteniendo el valor de mercadería en stock siempre actualizado.
- **Epic 3: Ventas y Cuentas por Cobrar** — Registrar ventas (con cancelaciones/devoluciones) y hacer seguimiento de quién le debe a cada negocio.
- **Epic 4: Gastos, Pasivos y Saldos del Negocio** — Registrar gastos clasificados, la deuda de tarjeta de crédito/cuentas por pagar, y mantener visibles los saldos de caja y banco de cada negocio.
- **Epic 5: Dashboard de Indicadores Laborales y Consolidación Multi-Negocio/Multi-Moneda** — Calcular automáticamente toda la cadena de indicadores financieros por negocio, consolidar el patrimonio en Guaraníes dentro de cada uno, y sumar los resultados de todos los negocios de la cuenta.
- **Epic 6: Retiro de Utilidades y Módulo Personal** — Conectar cualquiera de los negocios con las finanzas personales mediante retiros explícitos, y habilitar la planificación personal (reserva, gastos fijos/varios, tarjeta personal).

---

## Epic 1 Fundación, Autenticación, Gestión de Negocios y Catálogos Base

Establecer la base técnica del sistema —proyecto desplegable, autenticación individual y aislamiento estricto entre cuentas—, la gestión de negocios como entidad central del modelo de datos —incluyendo aislamiento entre negocios de una misma cuenta— y los dos catálogos configurables (monedas, tipos de gasto) de los que dependen todos los módulos siguientes. Al cerrar este epic, un usuario puede crear su cuenta, entrar de forma privada, dar de alta uno o varios negocios completamente independientes entre sí, y configurar en qué monedas y con qué tipos de gasto va a operar cada uno, tanto en cada negocio como en Personal.

### Story 1.1 Inicialización del proyecto y página de estado

Como dueño de cuenta,
quiero que el sistema esté desplegado y accesible,
para poder empezar a usarlo apenas esté listo.

#### Acceptance Criteria

1: El proyecto está inicializado con la estructura definida por @architect (monorepo, service architecture del PRD) y control de versiones.
2: Existe una página de estado accesible sin autenticación que confirma que el sistema y su base de datos están operativos.
3: El pipeline de build/deploy mínimo permite llevar cambios a un ambiente accesible por el usuario.
4: La base de datos relacional está provisionada y conectada a la aplicación.

### Story 1.2 Registro y autenticación individual por cuenta

Como persona que quiere empezar a usar el sistema,
quiero crear mi propia cuenta y autenticarme con ella,
para tener un espacio privado exclusivamente mío.

#### Acceptance Criteria

1: Una persona puede crear una cuenta nueva con credenciales propias (sin invitación ni login compartido).
2: Una persona puede iniciar y cerrar sesión con sus credenciales.
3: Cada cuenta creada queda asociada a un único dueño desde el momento del registro (FR1).
4: Intentos de acceso con credenciales inválidas son rechazados con un mensaje claro, sin revelar si el usuario existe.

### Story 1.3 Aislamiento de datos multi-tenant entre cuentas

Como dueño de cuenta,
quiero que nadie más pueda ver ni tocar mis datos financieros,
para que mi información de negocio y personal permanezca privada.

#### Acceptance Criteria

1: Toda consulta a datos financieros (transacciones, saldos, catálogos) queda filtrada obligatoriamente por la cuenta autenticada, a nivel de acceso a datos (no solo de interfaz) (FR2, NFR1).
2: Una prueba de integración verifica que, autenticado como la Cuenta A, ninguna operación de lectura o escritura puede afectar datos de la Cuenta B.
3: Un intento de acceder a un recurso de otra cuenta por identificador directo (ej. manipulando una URL) es rechazado, no solo ocultado en la interfaz.

### Story 1.4 Alta y gestión de negocios

Como dueño de cuenta,
quiero dar de alta uno o varios negocios dentro de mi cuenta y cambiar entre ellos,
para operar cada uno como una unidad independiente.

#### Acceptance Criteria

1: El usuario puede crear un negocio nuevo dentro de su cuenta indicando al menos un nombre (FR3).
2: El usuario puede crear más de un negocio en la misma cuenta; cada uno queda registrado con un identificador interno independiente.
3: El usuario puede ver y usar un selector de negocio activo disponible en cualquier pantalla del módulo Laboral, y cambiar el negocio activo en cualquier momento (FR5).
4: El usuario puede archivar o dar de baja un negocio; un negocio archivado no acepta nuevas transacciones, pero su historial permanece consultable (FR4).
5: Dar de alta un negocio nuevo se completa en menos de 2 minutos (NFR11).

### Story 1.5 Aislamiento de datos entre negocios de una cuenta

Como dueño de cuenta,
quiero que los datos de un negocio no se mezclen con los de otro negocio mío,
para que mis indicadores y saldos por negocio sean confiables.

#### Acceptance Criteria

1: Toda consulta a datos transaccionales y de catálogo (compras, ventas, gastos, saldos, ítems, monedas, tipos de gasto) queda filtrada obligatoriamente por el negocio activo además de por la cuenta autenticada, a nivel de acceso a datos (FR6, NFR2).
2: Una prueba de integración verifica que, dentro de la misma cuenta, ninguna operación de lectura o escritura sobre el Negocio A puede afectar datos del Negocio B.
3: El selector de negocio activo determina exclusivamente sobre qué negocio se opera y qué datos se muestran; ninguna pantalla del módulo Laboral, salvo el dashboard consolidado (ver Epic 5), mezcla transacciones de negocios distintos.

### Story 1.6 Catálogo de monedas por negocio y Personal

Como dueño de cuenta,
quiero agregar las monedas que realmente uso, por separado en cada negocio y en Personal,
para no cargar monedas que no me sirven ni mezclar los catálogos entre negocios.

#### Acceptance Criteria

1: El usuario puede agregar, ver y desactivar monedas en el catálogo del negocio activo, de forma independiente del catálogo de cualquier otro negocio (FR7).
2: El usuario puede agregar, ver y desactivar monedas en el catálogo del módulo Personal, de forma independiente del catálogo de cualquier negocio (FR8).
3: Agregar una moneda en un negocio no la habilita automáticamente en otro negocio ni en Personal.
4: El Guaraní está disponible como moneda base de consolidación en cada negocio y en Personal por defecto (ver Epic 5).

### Story 1.7 Catálogo de tipos de gasto por negocio y Personal

Como dueño de cuenta,
quiero crear mis propios tipos de gasto y clasificarlos correctamente en cada negocio,
para que los indicadores financieros de cada uno se calculen bien desde el primer gasto que registre.

#### Acceptance Criteria

1: El usuario puede crear tipos de gasto en el catálogo del negocio activo, clasificando cada uno obligatoriamente como Operativo o Financiero al momento de crearlo (FR9, NFR7).
2: El usuario puede crear tipos de gasto en el catálogo Personal, clasificando cada uno obligatoriamente como Fijo, Variable o Financiero al momento de crearlo (FR10, NFR7). Financiero es para intereses/cargos de tarjeta de crédito personal (ver Story 6.4).
3: No es posible guardar un tipo de gasto sin su clasificación.
4: El catálogo de tipos de gasto de cada negocio es independiente del de los demás negocios y del de Personal (un tipo creado en uno no aparece en otro).

---

## Epic 2 Catálogo de Ítems e Inventario Laboral

Habilitar el registro de qué vende cada negocio (productos y servicios) y qué compra para poder venderlo, manteniendo siempre visible cuánta mercadería hay en stock y a qué costo, dentro del negocio activo. Al cerrar este epic, el usuario puede dar de alta el catálogo de cada negocio y registrar compras reales, con el valor de inventario reflejándose correctamente por negocio.

### Story 2.1 Alta de ítems vendibles (producto/servicio)

Como dueño de cuenta,
quiero dar de alta, en el negocio activo, cada cosa que vendo como producto o como servicio,
para que el sistema sepa después si le corresponde CMV o CSV en ese negocio.

#### Acceptance Criteria

1: El usuario puede crear un ítem vendible dentro del negocio activo, eligiendo tipo Producto o Servicio (FR11).
2: Un ítem tipo Producto tiene campos de costo de compra y stock; un ítem tipo Servicio no genera stock.
3: El tipo del ítem no puede cambiarse después de tener movimientos asociados (compras o ventas), para no corromper el histórico de CMV/CSV de ese negocio.
4: El usuario puede editar el nombre, precio de venta y otros datos no estructurales del ítem en cualquier momento.
5: El catálogo de ítems del negocio activo es independiente del catálogo de cualquier otro negocio.

### Story 2.2 Registro de compras de productos

Como dueño de cuenta,
quiero registrar, en el negocio activo, cada compra de mercadería con su costo,
para que el stock y el costo del producto de ese negocio queden actualizados automáticamente.

#### Acceptance Criteria

1: El usuario puede registrar una compra dentro del negocio activo, indicando producto, costo unitario, cantidad, fecha, proveedor opcional y forma de pago (efectivo/banco/tarjeta de crédito/a crédito con proveedor) (FR12).
2: La compra solo admite ítems tipo Producto del catálogo del negocio activo; un ítem tipo Servicio no aparece como opción.
3: Al confirmar la compra, el stock del producto aumenta en la cantidad comprada y el saldo de la cuenta/medio de pago usado, dentro de ese negocio, se actualiza según corresponda.
4: Si la forma de pago es tarjeta de crédito, la deuda de tarjeta de ese negocio aumenta en el monto de la compra (ver Epic 4).

### Story 2.3 Valor de mercadería (inventario)

Como dueño de cuenta,
quiero ver cuánto vale mi mercadería en stock, por producto y en total, en el negocio activo,
para saber cuánto capital tengo inmovilizado en inventario en ese negocio.

#### Acceptance Criteria

1: El usuario puede ver el stock actual de cada producto del negocio activo, valorizado a su costo de compra (FR13).
2: El usuario puede ver el valor total de mercadería en stock del negocio activo, agregando todos sus productos.
3: El valor de inventario se actualiza inmediatamente después de cada compra y cada venta que afecte stock, dentro de ese negocio.
4: Los ítems tipo Servicio no aparecen en la vista de inventario. El inventario de un negocio no incluye productos de otro negocio.

---

## Epic 3 Ventas y Cuentas por Cobrar

Habilitar el registro de ventas —de productos y de servicios, mezclados en una misma operación, dentro del negocio activo— junto con la posibilidad de cancelarlas o devolverlas, y llevar el control de quién le debe a cada negocio. Al cerrar este epic, el usuario puede vender, corregir una venta mal cargada, y saber en todo momento cuánto le deben en total y quién, en cada negocio.

### Story 3.1 Registro de ventas

Como dueño de cuenta,
quiero registrar, en el negocio activo, una venta con uno o más productos y/o servicios,
para que quede reflejada en los ingresos de ese negocio y, si corresponde, en el cobro.

#### Acceptance Criteria

1: El usuario puede registrar, dentro del negocio activo, una venta con uno o más ítems (producto y/o servicio mezclados) del catálogo de ese negocio, cada uno con su precio de venta y cantidad cuando aplica (FR14).
2: La venta admite cliente opcional, forma de cobro (efectivo/banco/tarjeta/a crédito) e impuesto sobre la venta aplicado si corresponde.
3: Si la venta incluye productos, el stock de cada producto vendido se reduce en la cantidad correspondiente, dentro de ese negocio.
4: Si la forma de cobro es "a crédito", se genera automáticamente una cuenta por cobrar del negocio activo, asociada al cliente, por el monto correspondiente (ver Story 3.4).
5: El impuesto sobre la venta registrado en la transacción alimenta el cálculo de Ingresos Netos de ese negocio (ver Epic 5).

### Story 3.2 Registro de costo de servicio prestado

Como dueño de cuenta,
quiero registrar cuánto me costó prestar un servicio que vendí en el negocio activo,
para que el sistema pueda calcular correctamente el CSV de ese negocio.

#### Acceptance Criteria

1: Al vender un ítem tipo Servicio dentro del negocio activo, el usuario puede registrar el costo asociado a prestarlo (mano de obra, insumos, terceros) (FR15).
2: El costo de servicio registrado alimenta el cálculo de CSV en el dashboard de indicadores de ese negocio (ver Epic 5), separado del CMV de productos.
3: Si no se registra costo de servicio para una venta de servicio, el sistema lo trata como costo cero y lo señala visualmente como dato incompleto.

### Story 3.3 Cancelaciones y devoluciones de venta

Como dueño de cuenta,
quiero poder anular una venta total o parcialmente en el negocio activo,
para corregir errores de carga o aceptar una devolución sin que los indicadores de ese negocio queden mal.

#### Acceptance Criteria

1: El usuario puede cancelar o devolver una venta existente del negocio activo, total o parcialmente (FR16).
2: La cancelación/devolución revierte el efecto de esa porción de la venta en Ingresos Netos de ese negocio.
3: Si la venta cancelada/devuelta incluía productos, el stock correspondiente se repone en ese negocio.
4: Si la venta cancelada/devuelta ya había sido cobrada, el saldo cobrado (caja/banco) de ese negocio se ajusta o se registra el reembolso correspondiente.
5: Si la venta había generado una cuenta por cobrar, esta se ajusta o cancela según la porción devuelta.

### Story 3.4 Cuentas por cobrar

Como dueño de cuenta,
quiero saber quién le debe a cada negocio y cuánto,
para poder hacer seguimiento y no perder dinero adeudado en ninguno de mis negocios.

#### Acceptance Criteria

1: El usuario puede ver, para el negocio activo, una lista de cuentas por cobrar por cliente, con el monto adeudado, la fecha de origen y el estado (pendiente / pagado parcial / pagado) (FR17).
2: El usuario puede registrar un pago total o parcial de una cuenta por cobrar, actualizando su estado y el saldo de caja/banco de ese negocio.
3: El total adeudado por todos los clientes del negocio activo es visible como una única cifra agregada.
4: El detalle de cuánto debe un cliente específico, dentro del negocio correspondiente, es accesible en menos de 10 segundos desde el listado (alineado a la meta de éxito del usuario en el brief).

---

## Epic 4 Gastos, Pasivos y Saldos del Negocio

Registrar los gastos de cada negocio ya clasificados, llevar el pasivo de tarjeta de crédito/cuentas por pagar de cada uno, y mantener siempre visibles los saldos reales de caja y banco por negocio. Al cerrar este epic, cada negocio tiene su lado de "lo que debo" y "lo que tengo líquido" completamente reflejado, sin mezclarse con el de otros negocios.

### Story 4.1 Registro de gastos del negocio

Como dueño de cuenta,
quiero registrar cada gasto del negocio activo con su tipo,
para que se clasifique correctamente como Operativo o Financiero en los indicadores de ese negocio.

#### Acceptance Criteria

1: El usuario puede registrar un gasto dentro del negocio activo, indicando monto, tipo de gasto (del catálogo de ese negocio, configurado en Epic 1), fecha y forma de pago (efectivo/banco/tarjeta de crédito) (FR18).
2: El gasto reduce el saldo de la cuenta/medio de pago usado en ese negocio, o aumenta la deuda de tarjeta de ese negocio si se paga con tarjeta de crédito.
3: La clasificación Operativo/Financiero del tipo de gasto elegido determina en qué indicador de ese negocio impacta (Gastos Operativos o Gastos Financieros — ver Epic 5), sin que el usuario tenga que elegirlo de nuevo en cada gasto.

### Story 4.2 Tarjeta de crédito y cuentas por pagar del negocio

Como dueño de cuenta,
quiero ver cuánto debe cada uno de mis negocios en tarjeta de crédito y otras cuentas,
para no perder de vista los pasivos de cada negocio.

#### Acceptance Criteria

1: El sistema mantiene el saldo/deuda de cada tarjeta de crédito del negocio activo, aumentando con cada consumo y disminuyendo con cada pago de resumen registrado (FR19).
2: Los intereses o cargos de la tarjeta se registran automáticamente como Gasto Financiero de ese negocio.
3: El usuario puede ver el total adeudado en tarjetas de crédito y otras cuentas por pagar del negocio activo, separado y claramente distinguido de las cuentas por cobrar (activo) de ese mismo negocio.
4: El usuario puede registrar un pago de resumen de tarjeta, reduciendo la deuda de ese negocio y afectando el saldo de la cuenta usada para pagarlo, dentro del mismo negocio.

### Story 4.3 Saldos de caja y banco por moneda

Como dueño de cuenta,
quiero ver mi saldo de efectivo y de cada cuenta bancaria de cada negocio, en su propia moneda,
para saber cuánta liquidez tengo realmente en cada negocio.

#### Acceptance Criteria

1: El sistema mantiene el saldo de caja y de cada cuenta bancaria del negocio activo, en la moneda en la que fue definida cada una (FR20, FR33).
2: Cada compra, venta, gasto o pago de resumen que use una cuenta/caja de ese negocio actualiza su saldo inmediatamente.
3: El usuario puede ver el detalle de saldos del negocio activo agrupado por moneda (base para la consolidación del Epic 5).

---

## Epic 5 Dashboard de Indicadores Laborales y Consolidación Multi-Negocio/Multi-Moneda

Calcular automáticamente toda la cadena de indicadores financieros definida en el brief para cada negocio, mostrar el patrimonio de cada uno consolidado en Guaraníes sin perder el detalle por moneda, y sumar los resultados de todos los negocios de la cuenta en una vista consolidada. Este es el epic que entrega la promesa central del sistema: saber cuánto se gana realmente en cada negocio y entre todos, sin cálculo manual.

### Story 5.1 Cálculo de indicadores laborales

Como dueño de cuenta,
quiero ver los indicadores financieros del negocio activo calculados automáticamente,
para saber cuánto gano realmente en ese negocio sin usar una calculadora aparte.

#### Acceptance Criteria

1: El sistema calcula, para el negocio activo y un período seleccionado, Ingresos Brutos, Ingresos Netos (restando impuesto sobre la venta, cancelaciones y devoluciones), CMV, CSV, Ganancia Bruta, Gastos Operativos, Resultado Operativo, Gastos Financieros, Ganancia Líquida y Margen de Ganancia (FR21).
2: Cada indicador se calcula con la fórmula exacta definida en la tabla de terminología del brief, en el orden: Ingresos Brutos → Ingresos Netos → Ganancia Bruta → Resultado Operativo → Ganancia Líquida.
3: Una prueba automatizada verifica el cálculo correcto de la cadena completa, dentro de un mismo negocio, ante: ventas mixtas de producto y servicio, una venta cancelada parcialmente, y gastos de ambas clasificaciones.
4: Los indicadores del negocio activo se recalculan en tiempo real al registrar una nueva transacción dentro del período visualizado (NFR4).

### Story 5.2 Desglose por producto/servicio y filtro por período

Como dueño de cuenta,
quiero poder ver los indicadores del negocio activo filtrados por período y separados entre productos y servicios,
para entender qué parte de ese negocio rinde más.

#### Acceptance Criteria

1: El usuario puede filtrar el dashboard de indicadores del negocio activo por un rango de fechas (FR22).
2: El usuario puede ver el desglose de CMV/CSV y de Ganancia Bruta de ese negocio, separado entre ítems tipo producto e ítems tipo servicio.
3: Cambiar el período o el desglose no requiere recargar toda la aplicación ni esperar más de unos segundos.

### Story 5.3 Consolidación multi-moneda con tasa de cambio registrada

Como dueño de cuenta,
quiero ver el total consolidado en Guaraníes del negocio activo además del detalle por cada moneda,
para tener una única cifra de referencia aunque ese negocio opere en varias monedas.

#### Acceptance Criteria

1: El usuario puede cargar y actualizar manualmente la tasa de cambio de cada moneda no base habilitada en el negocio activo (FR36).
2: El sistema muestra, para el negocio activo y junto al detalle por moneda, un total consolidado en Guaraníes que convierte cada saldo en otra moneda usando la última tasa de cambio cargada por el usuario (FR34, FR36).
3: Cada transacción en moneda distinta al Guaraní queda asociada a la tasa de cambio vigente en ese momento, de forma persistente (FR35).
4: Un reporte de un período pasado de ese negocio no cambia si el usuario carga una tasa de cambio nueva después (verificado con una prueba automatizada).
5: El usuario puede ver, para cada moneda no base de ese negocio, qué tasa se usó y en qué fecha se registró.

### Story 5.4 Dashboard consolidado entre negocios

Como dueño de cuenta,
quiero ver mis indicadores y saldos sumados entre todos mis negocios,
para saber cuánto gano y cuánto tengo en conjunto sin sumarlo yo mismo.

#### Acceptance Criteria

1: El sistema muestra un dashboard consolidado que suma los indicadores (Ingresos Brutos → Ganancia Líquida y Margen) de todos los negocios activos de la cuenta, convirtiendo primero cada uno a Guaraníes con su tasa registrada antes de sumar (FR23).
2: El sistema muestra saldos y deudas consolidados —caja + bancos + tarjetas + cuentas por cobrar + cuentas por pagar— sumados entre todos los negocios de la cuenta, junto con el detalle individual por negocio (FR24).
3: Los negocios archivados no se incluyen en el consolidado por defecto, salvo que el usuario elija explícitamente incluir históricos.
4: Una prueba automatizada verifica que el consolidado de dos negocios en monedas distintas se calcula convirtiendo primero cada negocio a Guaraníes, sin sumar montos de monedas distintas directamente.

---

## Epic 6 Retiro de Utilidades y Módulo Personal

Conectar el resultado de cualquiera de los negocios con las finanzas personales mediante retiros explícitos —nunca el 100% automático de la ganancia líquida— y habilitar la planificación personal completa: gastos fijos, variables, tarjeta personal y reserva financiera. Al cerrar este epic, el sistema cumple la promesa completa del brief: saber cuánto gana cada negocio y cuánto de eso puede disponer la persona.

### Story 6.1 Retiro de utilidades manual

Como dueño de cuenta,
quiero retirar puntualmente un monto de la ganancia líquida de uno de mis negocios,
para tener ese dinero disponible en mis finanzas personales sin mezclarlo con el capital de trabajo de ese negocio ni con el de los demás.

#### Acceptance Criteria

1: El usuario puede registrar un retiro de utilidades manual eligiendo el negocio de origen y el monto a retirar (FR25).
2: El retiro reduce la caja/banco de ese negocio en el monto retirado y aparece como ingreso en el módulo Personal, identificado con su negocio de origen.
3: La ganancia líquida no retirada permanece como capital de trabajo del negocio de origen y no aparece como disponible en el módulo Personal (FR27).
4: El sistema muestra el historial de retiros realizados, con fecha, monto y negocio de origen, tanto por negocio como agregado en Personal.

### Story 6.2 Regla de retiro predeterminado

Como dueño de cuenta,
quiero configurar una regla para que mis retiros se hagan solos, por cada negocio,
para no tener que pedirlos manualmente cada período.

#### Acceptance Criteria

1: El usuario puede configurar, de forma independiente para cada negocio, una regla de retiro predeterminado como porcentaje fijo de la ganancia líquida de ese negocio o como monto fijo por período (FR26).
2: El sistema aplica la regla automáticamente al cierre de cada período configurado, generando el retiro correspondiente a ese negocio sin intervención manual.
3: El usuario puede desactivar la regla de un negocio o ajustar puntualmente el monto de un período específico, sin afectar la regla de otro negocio.
4: Si coexisten un retiro manual y la regla predeterminada del mismo negocio en el mismo período, el sistema deja claro en el historial cuál origina cada movimiento.

### Story 6.3 Gastos personales fijos y variables

Como dueño de cuenta,
quiero registrar mis gastos personales fijos y variables por separado,
para entender mi estructura de gastos recurrentes vs. ocasionales.

#### Acceptance Criteria

1: El usuario puede registrar un gasto personal fijo, asociado a un tipo de gasto del catálogo Personal clasificado como Fijo, y forma de pago (FR28).
2: El usuario puede registrar un gasto personal variable/vario, asociado a un tipo de gasto del catálogo Personal clasificado como Variable, y forma de pago (FR29).
3: Ambos tipos de gasto se reflejan por separado en el balance personal (ver Story 6.5).

### Story 6.4 Tarjeta de crédito personal

Como dueño de cuenta,
quiero ver cuánto debo en mi tarjeta de crédito personal,
para no perder de vista esa deuda al planificar mis gastos.

#### Acceptance Criteria

1: El sistema mantiene el saldo/deuda de la(s) tarjeta(s) de crédito personal(es), con la misma lógica de consumo/pago de resumen que la tarjeta de un negocio (FR30).
2: Los intereses/cargos de la tarjeta personal se registran como gasto financiero personal.
3: El usuario puede ver la deuda de tarjeta personal como pasivo, separado del disponible en el balance personal.

### Story 6.5 Reserva financiera y balance personal

Como dueño de cuenta,
quiero definir cuánto reservar y ver mi balance personal completo,
para saber cuánto tengo realmente disponible después de mis compromisos y mi ahorro, sin importar de cuál de mis negocios provino.

#### Acceptance Criteria

1: El usuario puede definir un objetivo de reserva financiera y cuánto destinar por período, y ver el progreso acumulado hacia ese objetivo (FR31).
2: El sistema calcula el balance personal como: retiros recibidos de todos los negocios − gastos fijos − gastos varios − aporte a reserva = disponible (FR32).
3: El usuario puede ver el desglose de los retiros recibidos por negocio de origen dentro del balance personal.
4: La deuda de tarjeta de crédito personal se muestra aparte, como pasivo pendiente, sin restarse directamente del disponible calculado.
5: El usuario puede responder "cuánto puedo gastar/reservar" viendo una única pantalla, sin cálculo externo (alineado a la meta de éxito del usuario en el brief).

---

## Checklist Results Report

### Resumen Ejecutivo

- **Completitud general del PRD:** ~90%. El documento cubre problema, usuarios, alcance MVP multi-negocio, requisitos funcionales y no funcionales, UI de alto nivel, supuestos técnicos y 6 epics con 26 historias y criterios de aceptación testeables.
- **Adecuación del alcance MVP:** Just Right. El alcance es amplio para un MVP (dos módulos completos más soporte a múltiples negocios independientes), pero cada feature está directamente atada al problema del brief; no se detectaron features especulativas. El propio brief ya documentó qué queda fuera (facturación electrónica, conciliación bancaria automática, roles compartidos, transferencias entre negocios, etc.).
- **Preparación para arquitectura:** Ready. Los puntos abiertos que quedan (hosting, budget/timeline) son decisiones legítimas de @architect o de negocio, no ambigüedades de producto. El mecanismo de tasa de cambio ya fue decidido (100% manual, FR36) y las Open Questions del brief (datos históricos, cantidad de negocios) ya fueron cerradas con el usuario. El cambio estructural de negocio único a multi-negocio fue incorporado consistentemente en Goals, FR/NFR, UI, Technical Assumptions y en los 6 epics existentes.
- **Gaps más relevantes:** no hay investigación de mercado ni competitiva (el brief ya documentó que no aplicaba, al ser un sistema para uso propio del usuario, no un producto de mercado masivo); budget, timeline y hosting siguen sin definir.

### Category Statuses

| Category | Status | Critical Issues |
|---|---|---|
| 1. Problem Definition & Context | PASS | Ninguno — problema, usuarios y métricas heredados del brief actualizado (multi-negocio) y refinados con el usuario en múltiples rondas. |
| 2. MVP Scope Definition | PASS | Alcance amplio pero justificado; incorpora gestión de negocios y consolidado como parte del MVP, tal como lo exige el brief actualizado. |
| 3. User Experience Requirements | PARTIAL | UI Goals son de alto nivel (correcto para PRD), incluyen el selector de negocio y el dashboard consolidado, pero no hay flujos de usuario detallados ni estados de error — corresponde a @ux-design-expert. |
| 4. Functional Requirements | PASS | 36 FR, todos trazables a una historia con AC testeables (verificado 1:1 en esta revalidación), incluyendo gestión de negocios (FR3-FR6), consolidación entre negocios (FR23-FR24) y carga manual de tasa de cambio (FR36). |
| 5. Non-Functional Requirements | PASS | 11 NFR; cubre seguridad/aislamiento entre cuentas Y entre negocios (NFR1-NFR2), backup, performance, plataforma, integridad de datos. |
| 6. Epic & Story Structure | PASS | Epic 1 incluye setup de proyecto y gestión de negocios; historias secuenciadas sin dependencias hacia adelante; el resto de epics quedó explícitamente re-alcanzado "por negocio activo". |
| 7. Technical Guidance | PARTIAL | Guía técnica inicial dada (monolito, monorepo, testing, jerarquía Cuenta→Negocios→transacciones, mecanismo de tasa de cambio ya decidido); hosting y el diseño concreto del esquema de datos quedan explícitamente para @architect. |
| 8. Cross-Functional Requirements | PARTIAL | Entidades y relaciones de datos claras a nivel de negocio, incluyendo Negocio como entidad intermedia; no se definió esquema formal (corresponde a @architect/@data-engineer). |
| 9. Clarity & Communication | PASS | Terminología financiera y modelo multi-negocio unificados con el usuario a lo largo de todo el brief y este PRD. |

### Critical Deficiencies

Ninguna deficiencia bloqueante. Los ítems PARTIAL corresponden a trabajo que pertenece a la siguiente fase (arquitectura/UX), no a huecos de producto.

### Recommendations

- **HIGH:** @architect debe definir el diseño concreto de la jerarquía Cuenta → Negocios(N) → Personal(1) en el modelo de datos antes de diseñar el esquema relacional (Stories 1.4, 1.5). El mecanismo de tasa de cambio ya está decidido (100% manual, FR36) y no requiere definición adicional de @architect más allá del modelado de datos estándar.
- **MEDIUM:** @ux-design-expert debe convertir las "Core Screens" en flujos de usuario detallados y estados de error antes de que @sm cree las historias de UI, prestando atención especial al comportamiento del selector de negocio activo, a cómo se distingue visualmente el consolidado del detalle por negocio, y al diseño de ese selector sin asumir una cantidad fija de negocios (no hay estimación del usuario).
- ~~Relevar datos históricos y estimación de negocios~~ **Resuelto (2026-08-31):** no hay datos históricos a migrar en el MVP; sin estimación de cantidad de negocios (@architect debe diseñar sin asumir un número fijo — ver Change Log v2.1).
- **LOW:** Confirmar budget y timeline con el usuario para poder priorizar entre los 6 epics si hiciera falta recortar alcance.

### Final Decision

**READY FOR ARCHITECT** — el PRD está completo y estructurado para iniciar la fase de arquitectura, con el modelo multi-negocio incorporado de forma consistente en todo el documento y los puntos técnicos abiertos explícitamente delegados a @architect.

---

## Next Steps

### UX Expert Prompt

Este PRD (`docs/prd.md`) y el Project Brief actualizado (`docs/brief.md`) están listos para iniciar el modo de creación de arquitectura de UX. Revisá la sección "User Interface Design Goals" — en particular el nuevo selector de negocio activo, las Core Screens de Gestión de Negocios y Dashboard Consolidado, y la dirección tentativa de branding validada con el mockup "Panorama Multi-Moneda" — y desarrollá los flujos de usuario y el sistema de diseño para los tres niveles del sistema (Negocios, Laboral por negocio, y Personal).

### Architect Prompt

Este PRD (`docs/prd.md`) está listo para iniciar el modo de creación de arquitectura. Prestá especial atención a: el cambio estructural de este PRD respecto a la versión 1.0 — Negocio pasa a ser una entidad intermedia obligatoria entre Cuenta y las transacciones (Cuenta → Negocios(N) → transacciones/catálogos; Cuenta → Personal(1)); el aislamiento multi-tenant como requisito de seguridad no negociable, ahora en dos niveles: entre cuentas (NFR1) y entre negocios de una misma cuenta (NFR2); el modelo de datos de multi-moneda con tasa de cambio **cargada manualmente por el usuario** y persistida por transacción, tanto dentro de un negocio como en el consolidado entre negocios (FR33-FR36, Stories 5.3-5.4) — no hay integración con fuente externa automática en el MVP, esa decisión ya está cerrada; la separación de catálogos (monedas y tipos de gasto) entre cada negocio y Personal (FR7-FR10); y la cadena de cálculo de indicadores financieros definida en la Story 5.1, replicada por negocio y sumada en la Story 5.4. El stack sugerido (`nextjs-react`, PostgreSQL) es el preset activo del framework AIOX — validalo o reemplazalo según corresponda.
