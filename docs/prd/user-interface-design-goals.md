# User Interface Design Goals

## Overall UX Vision

La experiencia debe sentirse como llevar un libro contable simple, no como operar un software contable — incluso teniendo varios negocios abiertos a la vez. El usuario carga hechos cortos (compré, vendí, gasté, retiré) en el negocio que corresponda, y el sistema hace todo el trabajo de traducirlos a indicadores financieros. La superficie principal es un dashboard que se **escanea, no se lee**: el total y los indicadores más importantes arriba, el detalle abajo, con el estado (deuda pendiente, saldo bajo, moneda, negocio activo) siempre legible mediante forma y color, no solo número.

## Key Interaction Paradigms

Formularios de carga rápida para las transacciones más frecuentes (venta, compra, gasto) accesibles desde cualquier pantalla del módulo activo. Un selector de ámbito persistente **Laboral / Personal** — en la línea del mockup ya validado con el usuario ("Panorama Multi-Moneda") — determina qué catálogos, cuentas y formularios se muestran. Dentro de Laboral, un **selector de negocio activo**, siempre visible, determina sobre cuál de los negocios del usuario se está operando o consultando; cambiar de negocio no requiere salir de la pantalla actual. Toda cifra en pantalla usa números tabulares y muestra su moneda de origen; los montos convertidos a Guaraníes se distinguen visualmente del monto en moneda original, nunca se mezclan sin etiqueta.

## Core Screens and Views

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

## Accessibility: WCAG AA

_Supuesto del PM, no especificado por el usuario — validar con @ux-design-expert._

## Branding

Sin lineamientos de marca formales definidos. El mockup de confirmación ya compartido y aprobado por el usuario ("Panorama Multi-Moneda") estableció una dirección tentativa: acento esmeralda, tipografía serif (Instrument Serif) para títulos y monoespaciada (IBM Plex Mono) para cifras. Se toma como punto de partida, a validar formalmente como sistema de diseño por @ux-design-expert, incluyendo cómo se representa visualmente el selector de negocio activo.

## Target Device and Platforms: Web Responsive

---
