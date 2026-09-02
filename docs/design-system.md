# Design System — Financial Control / BizSystem Pro / Fiscal Precision

Extraído de un export de Google Stitch: `~/Downloads/stitch_gesti_n_financiera_empresarial/` (ZIP actualizado, 9 pantallas + spec de tokens). Es un sistema completo (Material Design 3) para gestión financiera empresarial.

> **Nota:** este documento reemplaza al `design-system.md` original (la paleta emerald hecha a mano, ya aplicada en `apps/web/src/components/ui/*`). Este archivo documenta lo que hay en el export de Stitch — **todavía no está aplicado al código de la app**. Ver "Qué falta decidir" al final.

**Página viva de referencia** (paleta, tipografía y componentes de las primeras 6 pantallas, armados en una sola página): https://claude.ai/code/artifact/fe54f507-3437-4c90-8411-3cab35b24a8c — **todavía no incluye** los 7 patrones nuevos que trajeron las últimas 4 pantallas (tabla de datos, badge sólido, barra de progreso horizontal, banner de alerta, tarjeta KPI "tonal", fila de cuenta bancaria, selector de fecha). Pedime que la actualice si la vas a necesitar.

## Pantallas del export (9 + 1 spec)

Todas comparten el mismo `tailwind.config` inline (colores, tipografía, spacing, radios) con **una sola variación menor**: `surface-container` es `#f0edef` en las primeras 5 pantallas y `#eceef0` en las 4 nuevas — diferencia mínima, no afecta el resto del sistema. Tech stack: Tailwind CDN (`?plugins=forms,container-queries`), fuente **Inter**, iconos **Material Symbols Outlined**.

| # | Pantalla | Título (`<title>`) | Carpeta fuente | Marca / sidebar |
|---|---|---|---|---|
| 1 | Dashboard Operativo | Dashboard Operativo - Fiscal Precision | `dashboard_operativo_centralizado/` | Fiscal Precision / Enterprise Hub |
| 2 | Punto de Venta (Ventas y Facturación) | Punto de Venta - BizSystem Pro | `ventas_y_facturaci_n/` | BizSystem Pro / Corporate HQ |
| 3 | Control de Inventario y Stock | Control de Inventario y Stock - BizSystem Pro | `control_de_inventario_y_stock/` | BizSystem Pro / Corporate HQ |
| 4 | Gestión de Entradas y Salidas de Almacén | Gestión de Entradas y Salidas - BizSystem Pro | `entradas_y_salidas_de_almac_n/` | BizSystem Pro / Corporate HQ |
| 5 | Gastos Operativos | Gastos Operativos - BizSystem Pro | `gastos_operativos_detallados/` | BizSystem Pro / Corporate HQ |
| 6 | Deudores (Cuentas por Cobrar) | Deudores - Financial Control | `cuentas_por_cobrar/` | Financial Control / Control Panel |
| 7 | Gestión de Caja y Bancos | Gestión de Caja - Financial Control | `gesti_n_de_caja_y_bancos/` | Financial Control / Control Panel |
| 8 | Reportes Operativos y de Ventas | Reportes - Financial Control | `reportes_operativos_y_ventas/` | Financial Control / Control Panel |
| 9 | Inventario y Rentabilidad Detallada | Inventario Detallado - Financial Control | `inventario_y_rentabilidad_detallada/` | Financial Control / Control Panel |
| — | Spec de tokens (sin pantalla propia) | — | `fiscal_precision/DESIGN.md` | — |

Cada carpeta de pantalla trae `code.html` (HTML/Tailwind standalone, funcional) + `screen.png` (captura de referencia).

### Resumen de cada pantalla

1. **Dashboard Operativo**: home del sistema. Grilla "bento" de 12 columnas: 4 tarjetas KPI (Ventas, Margen, Inventario, OPEX) + gráfico de barras Ventas vs. Gastos a la izquierda; Alertas Críticas (stock bajo + facturas vencidas) + Actividad Reciente a la derecha. Usa **glass panel** (glassmorphism), único caso en todo el export.
2. **Punto de Venta**: facturación tipo POS. Grilla de productos + carrito/resumen. Botones primarios grandes, botones ícono circulares.
3. **Control de Inventario y Stock**: tarjetas KPI (una en rojo, alerta de stock bajo) + tabla de productos con badge de estado por fila.
4. **Entradas y Salidas de Almacén**: registro de movimientos de almacén, mismo layout de tabla con badges que Inventario.
5. **Gastos Operativos**: listado detallado de gastos, mismo patrón de tarjetas KPI + tabla.
6. **Deudores (Cuentas por Cobrar)**: 3 KPIs arriba (Total por Cobrar, Vencido, Por Vencer) + tabla real (`<table>`) de clientes con fecha de vencimiento, monto, saldo, badge de estado (**variante sólida**, no la translúcida `/10`) y botón de acción que solo aparece al pasar el mouse por la fila.
7. **Gestión de Caja y Bancos**: Resumen de Saldos arriba, lista de Cuentas Bancarias (ícono + nombre + tipo de cuenta) y tabla de Transacciones Recientes con badges "Completado"/"Pendiente Arqueo". Trae los dos `<select>` con estilo nativo (`form-select`, plugin Forms de Tailwind).
8. **Reportes Operativos y de Ventas**: "Sales & Expenses Reports" — Operating Profitability, gráfico "Expenses by Category" con **barras horizontales de progreso** (no barras verticales), "Product Sales" con selector de rango de fechas.
9. **Inventario y Rentabilidad Detallada**: banner de alerta descartable ("Acción Requerida: Reposición de Inventario") + KPI bento grid "tonal" (variante de tarjeta KPI sin el glassmorphism, con ícono chico apagado arriba a la derecha).

### Nomenclatura / branding — 3 variantes conviviendo

El mismo sistema de tokens tiene **3 identidades de marca** distintas según el lote de pantallas en que Stitch las generó. Es la misma paleta/tipografía/spacing en las 3 — cambia el nombre, el logo-texto del sidebar y, en las últimas 4, el nombre de la sección superior ("Control Panel" en vez de nada):

| Marca | Pantallas | Nombre de cuenta (sidebar) |
|---|---|---|
| **BizSystem Pro** | 2, 3, 4, 5 | Corporate HQ |
| **Fiscal Precision** | 1 (Dashboard) | Enterprise Hub |
| **Financial Control** | 6, 7, 8, 9 | Control Panel |

## Paleta de color

Sistema Material 3: cada color "base" tiene su contraparte `on-*` (texto/ícono que va **encima** de ese fondo) y variantes `-container` (fondo suave del mismo color).

### Colores principales

| Token | Hex | Uso |
|---|---|---|
| `primary` | `#000000` | Acción principal, marca, títulos destacados |
| `on-primary` | `#ffffff` | Texto/ícono sobre `primary` |
| `primary-container` | `#131b2e` | Fondo del logo/avatar de cuenta, íconos de KPI "ventas"/"cuentas bancarias" |
| `on-primary-container` | `#7c839b` | Texto/ícono sobre `primary-container` |
| `secondary` | `#515f74` | Acciones secundarias, texto de énfasis medio |
| `on-secondary` | `#ffffff` | Texto sobre `secondary` |
| `secondary-container` | `#d5e3fd` | Fondo de ítem de navegación activo |
| `on-secondary-container` | `#57657b` | Texto sobre `secondary-container` |
| `tertiary` | `#0ea5e9` | Foco de inputs/selects, acentos informativos (celeste) |
| `on-tertiary` | `#ffffff` | Texto sobre `tertiary` |
| `tertiary-container` | `#271901` | — |
| `on-tertiary-container` | `#98805d` | — |

### Semánticos (estado)

| Token | Hex | Uso |
|---|---|---|
| `error` | `#ba1a1a` | Errores, alertas críticas, stock agotado, facturas/cuentas vencidas |
| `on-error` | `#ffffff` | Texto sobre `error` |
| `error-container` | `#ffdad6` | Fondo suave para tarjetas de alerta y badge sólido "Vencido" |
| `on-error-container` | `#93000a` | Texto sobre `error-container` |
| `success` | `#10b981` | Confirmaciones, stock saludable, montos positivos, tendencia positiva, "Completado" |
| `warning` | `#f59e0b` | Stock bajo, pendientes, "Pendiente Arqueo" |

### Superficies (fondos y bordes)

| Token | Hex (pantallas 1-5) | Hex (pantallas 6-9) | Uso |
|---|---|---|---|
| `background` | `#fcf8fa` | `#fcf8fa` | Fondo general de la página |
| `surface` | `#f7f9fb` | `#f7f9fb` | Fondo de header/inputs |
| `surface-dim` | `#d8dadc` | `#d8dadc` | — |
| `surface-bright` | `#fcf8fa` | `#fcf8fa` | — |
| `surface-container-lowest` | `#ffffff` | `#ffffff` | Fondo de tarjetas/cards elevadas, filas de tabla |
| `surface-container-low` | `#f6f3f5` | `#f6f3f5` | Fondo del sidebar, header de tabla |
| `surface-container` | `#f0edef` | `#eceef0` | Hover de botones secundarios, track de barra de progreso |
| `surface-container-high` | `#eae7e9` | `#eae7e9` | Hover de ítems de lista |
| `surface-container-highest` | `#e4e2e4` | `#e4e2e4` | — |
| `surface-variant` | `#e4e2e4` | `#e4e2e4` | — |
| `surface-tint` | `#565e74` | `#565e74` | Hover de botones primarios |
| `on-background` / `on-surface` | `#1b1b1d` | `#1b1b1d` | Texto principal |
| `on-surface-variant` | `#45464d` | `#45464d` | Texto secundario |
| `outline` | `#76777d` | `#76777d` | Bordes con más contraste (inputs) |
| `outline-variant` | `#c6c6cd` | `#c6c6cd` | Bordes sutiles (separadores, cards), serie "Gastos" en gráficos |
| `inverse-surface` | `#303032` | `#303032` | — |
| `inverse-on-surface` | `#f3f0f2` | `#f3f0f2` | — |
| `inverse-primary` | `#bec6e0` | `#bec6e0` | — |

No hay paleta dark completa definida (`darkMode: "class"` está declarado, y hay algún `dark:` suelto en el Dashboard, pero sin bloque de colores dark propio) — el sistema, tal como está, es **solo light**.

> ⚠️ **Inconsistencia detectada**: `inventario_y_rentabilidad_detallada/code.html` usa en el banner de alerta colores hardcodeados fuera del token system: `text-[#93000a]` y `hover:bg-[#ffb4ab]/20` en vez de `text-on-error-container` y una variante de `error-container`. Es el único lugar de las 9 pantallas que no usa tokens.

## Tipografía

Familia única: **Inter**. Escala con nombre semántico (no `text-sm`/`text-lg` genéricos):

| Token | Tamaño | Line-height | Peso |
|---|---|---|---|
| `headline-lg` | 32px | 40px | 700 |
| `headline-lg-mobile` | 28px | 36px | 700 |
| `headline-md` | 24px | 32px | 700 |
| `headline-sm` | 20px | 28px | 600 |
| `body-lg` | 16px | 24px | 400 |
| `body-md` | 14px | 20px | 400 |
| `label-lg` | 14px | 20px | 600 |
| `label-md` | 12px | 16px | 500 |

Uso en clases: `font-headline-md text-headline-md` (la fuente y el tamaño/line-height/peso son utilidades separadas en este config).

## Espaciado y bordes

| Token | Valor | Uso |
|---|---|---|
| `spacing.base` | 4px | Unidad base |
| `spacing.gutter` | 16px | Espacio entre elementos de una fila/grupo |
| `spacing.margin-mobile` | 16px | Padding lateral en mobile |
| `spacing.margin-desktop` | 32px | Padding lateral en desktop |
| `spacing.sidebar-width` | 260px | Ancho fijo del sidebar |
| `rounded` (DEFAULT) | 0.125rem | Botones, inputs, badges |
| `rounded-lg` | 0.25rem | — |
| `rounded-xl` | 0.5rem | Cards grandes |
| `rounded-full` | 0.75rem* | *(así está en el config; para círculos reales — avatares, dots, barras de progreso — se usa la utilidad estándar `rounded-full` de Tailwind, no este token) |

## Layout general

Todas las pantallas comparten el mismo esqueleto:

- **Sidebar fijo** (`w-sidebar-width` = 260px, oculto en mobile): logo + nombre de cuenta arriba, botón primario de acción rápida, nav con íconos, Support/Sign Out abajo separado por un borde.
- **Topbar fijo** (alto 64px / `h-16`): título a la izquierda, buscador + notificaciones + settings + avatar a la derecha.
- **Contenido**: `padding` con `margin-desktop`/`margin-mobile`, tarjetas KPI arriba, tablas de datos, gráficos o grilla bento abajo.

## Iconografía

**Material Symbols Outlined** (Google Fonts), variable font con `FILL`/`wght`/`GRAD`/`opsz`. Ícono activo usa `style="font-variation-settings:'FILL' 1"` (o `data-weight="fill"`) para pasar de outline a relleno.

## Componentes (patrones de clases reales)

### Botón primario
```html
<button class="bg-primary text-on-primary font-label-lg text-label-lg py-2 px-4 rounded hover:bg-surface-tint transition-colors shadow-sm">
```

### Botón secundario (outline)
```html
<button class="bg-surface border border-outline-variant text-primary font-label-md text-label-md py-2 px-4 rounded-DEFAULT hover:bg-surface-container transition-colors">
```

### Botón ícono (circular)
```html
<button class="p-2 text-on-surface-variant hover:bg-surface-container rounded-full transition-colors">
```

### Botón de acción en fila (solo visible al hover) — nuevo, pantalla Deudores
```html
<tr class="hover:bg-surface-container-lowest transition-colors group">
  <!-- ...celdas... -->
  <td class="px-6 py-4 text-right">
    <button class="text-on-surface-variant hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity">
      <span class="material-symbols-outlined">more_vert</span>
    </button>
  </td>
</tr>
```
Patrón: `opacity-0` + `group-hover:opacity-100` en el botón, `group` en la fila — aparece solo al pasar el mouse.

### Input de búsqueda
```html
<input class="pl-10 pr-4 py-1.5 bg-surface-container-low border border-outline-variant rounded font-body-md text-body-md focus:outline-none focus:border-tertiary focus:ring-1 focus:ring-tertiary" placeholder="Buscar..." type="text"/>
```

### Select nativo (Tailwind Forms plugin) — nuevo, pantalla Caja y Bancos
```html
<select class="form-select bg-surface-container-lowest border-outline-variant text-on-surface text-label-lg font-label-lg rounded py-1 px-3 w-full sm:w-auto focus:border-tertiary focus:ring-0">
  <option>Todas las Monedas</option>
  <option>PYG</option>
  <option>USD</option>
</select>
```
Requiere el plugin `forms` de Tailwind (ya cargado: `?plugins=forms,container-queries` en el script del CDN) — sin él, la clase `form-select` no resetea los estilos nativos del `<select>`.

### Selector de rango de fechas (trigger) — nuevo, pantalla Reportes
```html
<div class="flex items-center gap-2 px-3 py-1.5 border border-outline-variant rounded text-on-surface font-body-md text-body-md cursor-pointer hover:border-primary transition-colors focus-within:border-tertiary">
  <span class="material-symbols-outlined text-[18px]">calendar_today</span>
  <span>Oct 1 - Oct 31</span>
</div>
```

### Ítem de navegación (sidebar)
```html
<!-- inactivo -->
<a class="text-on-surface-variant flex items-center gap-base px-4 py-3 hover:bg-surface-container-high rounded-lg font-label-lg text-label-lg">
<!-- activo -->
<a class="bg-secondary-container text-on-secondary-container font-bold rounded-lg flex items-center gap-base px-4 py-3 font-label-lg text-label-lg">
```

### Badge de estado — variante A: translúcida (la más usada)
```html
<span class="inline-flex items-center px-2 py-0.5 rounded-DEFAULT text-xs font-medium bg-success/10 text-success border border-success/20">En stock</span>
<span class="inline-flex items-center px-2 py-0.5 rounded-DEFAULT text-xs font-medium bg-warning/10 text-warning border border-warning/20">Stock bajo</span>
<span class="inline-flex items-center px-2 py-0.5 rounded-DEFAULT text-xs font-medium bg-error/10 text-error border border-error/20">Agotado</span>
```
Patrón: fondo del color al 10% + texto sólido + borde al 20%. Usada en Inventario, Entradas/Salidas y Caja ("Completado"/"Pendiente Arqueo").

### Badge de estado — variante B: sólida (nuevo, pantalla Deudores)
```html
<span class="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-error-container text-on-error-container">Vencido</span>
```
Patrón: fondo `-container` sólido + texto `on-*-container`, sin borde. Mismo par semántico que la variante A pero con más peso visual — la usa la tabla de Deudores para "Vencido".

### Dot de estado
```html
<span class="w-2 h-2 rounded-full bg-success"></span>
```

### Banner de alerta descartable — nuevo, pantalla Inventario Detallado
```html
<div class="flex items-start gap-3 p-4 rounded-lg bg-error-container/20 border border-error-container">
  <span class="material-symbols-outlined text-on-error-container">warning</span>
  <div class="flex-1">
    <h4 class="font-label-lg text-label-lg text-on-error-container mb-0.5">Acción Requerida: Reposición de Inventario</h4>
    <p class="font-body-md text-body-md text-on-error-container opacity-90">Existen 3 artículos críticos por debajo del nivel mínimo de stock...</p>
  </div>
  <button class="text-on-error-container hover:bg-error-container/40 p-1.5 rounded transition-colors">
    <span class="material-symbols-outlined text-sm">close</span>
  </button>
</div>
```
(Normalizado a tokens — el original usa `text-[#93000a]` y `hover:bg-[#ffb4ab]/20` hardcodeados, ver inconsistencia arriba.) Full-width, para avisos que requieren acción a nivel de página, no de fila.

### Tabla de datos real
```html
<table class="w-full text-left border-collapse">
  <thead>
    <tr class="border-b border-outline-variant bg-surface-container-low">
      <th class="px-6 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider">Cliente/Empresa</th>
      <th class="px-6 py-3 font-label-md text-label-md text-on-surface-variant uppercase tracking-wider text-right">Monto Original</th>
      <!-- ... -->
    </tr>
  </thead>
  <tbody class="font-body-md text-on-surface divide-y divide-outline-variant">
    <tr class="hover:bg-surface-container-lowest transition-colors group">
      <td class="px-6 py-4">...</td>
      <td class="px-6 py-4 text-right">$50,000.00</td>
    </tr>
  </tbody>
</table>
```
`<table>` semántico real (no divs simulando filas). Encabezado en mayúsculas sobre `surface-container-low`, filas separadas con `divide-y divide-outline-variant`, hover por fila.

### Fila de cuenta bancaria — nuevo, pantalla Caja y Bancos
```html
<div class="bg-surface-container-lowest rounded-lg border border-outline-variant p-4 flex flex-col gap-4">
  <div class="flex items-center justify-between pb-3 border-b border-outline-variant">
    <div class="flex items-center gap-3">
      <div class="w-10 h-10 bg-primary-container rounded flex items-center justify-center text-on-primary-container">
        <span class="material-symbols-outlined">account_balance</span>
      </div>
      <div>
        <div class="font-label-lg text-label-lg font-bold">Banco Itaú</div>
        <div class="font-label-md text-label-md text-on-surface-variant">Cta. Cte. PYG</div>
      </div>
    </div>
    <!-- saldo / acciones a la derecha -->
  </div>
</div>
```
Mismo patrón de "ícono cuadrado + título + subtítulo" que otras tarjetas, empaquetado como fila de lista en vez de tarjeta suelta.

### Tarjeta de alerta / KPI simple
```html
<div class="bg-surface-container-lowest p-6 rounded-lg border border-error-container bg-error-container/20 shadow-sm">
  <h3 class="font-label-lg text-label-lg text-error">Alertas de Stock Bajo</h3>
  <p class="font-headline-lg-mobile text-headline-lg-mobile text-error font-bold">24</p>
</div>
```

### Tarjeta KPI con tendencia (glass panel — solo Dashboard)
```html
<div class="glass-panel p-5 rounded-lg flex flex-col justify-between hover:-translate-y-1 transition-transform duration-300">
  <div class="flex justify-between items-start mb-4">
    <div class="w-10 h-10 rounded bg-primary-container flex items-center justify-center text-on-primary-container">
      <span class="material-symbols-outlined">payments</span>
    </div>
    <span class="px-2 py-0.5 bg-success/10 text-success rounded text-xs font-semibold flex items-center gap-1">
      <span class="material-symbols-outlined text-[14px]">trending_up</span> +12.5%
    </span>
  </div>
  <div>
    <p class="font-label-md text-label-md text-on-surface-variant uppercase tracking-wide">Ventas Mensuales</p>
    <h4 class="font-headline-md text-headline-md text-on-surface mt-1">$124,500.00</h4>
  </div>
</div>
```
Patrón: ícono con fondo `-container` (arriba-izquierda) + badge de tendencia `bg-{color}/10 text-{color}` (arriba-derecha) + label en mayúsculas + valor grande.

### Tarjeta KPI "tonal" (variante sólida) — nuevo, pantalla Inventario Detallado
```html
<div class="bg-surface-container-lowest border border-outline-variant rounded p-5 flex flex-col justify-between">
  <div class="flex justify-between items-start mb-4">
    <span class="font-label-lg text-label-lg text-on-surface-variant">Valorización de Stock</span>
    <span class="material-symbols-outlined text-on-surface-variant opacity-50 text-xl">account_balance</span>
  </div>
  <div>
    <div class="font-headline-lg text-headline-lg text-on-surface">$142,500.00</div>
    <div class="flex items-center gap-1 mt-1">
      <span class="material-symbols-outlined text-success text-sm">trending_up</span>
      <span class="font-label-md text-label-md text-success">+4.2%</span>
      <span class="font-label-md text-label-md text-on-surface-variant ml-1">vs. mes anterior</span>
    </div>
  </div>
</div>
```
A diferencia de la tarjeta con tendencia: label primero (no el ícono), ícono chico y apagado (`opacity-50`) arriba a la derecha en vez de con halo de color, y la tendencia va **debajo del valor** (no arriba) con texto de comparación (`vs. mes anterior`, `objetivo superado`) en vez de solo el badge.

### Bento grid (pantallas Dashboard e Inventario Detallado)
```css
.bento-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 16px; }
```
```html
<div class="bento-grid">
  <div class="col-span-12 lg:col-span-8 bento-grid gap-y-4 gap-x-4"><!-- columna izquierda --></div>
  <div class="col-span-12 lg:col-span-4 flex flex-col gap-4"><!-- columna derecha --></div>
</div>
```
En Inventario Detallado se usa una grilla más simple (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`) para las 4 tarjetas KPI "tonal", sin la clase `.bento-grid` explícita.

### Glass panel (solo Dashboard)
```css
.glass-panel {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid theme('colors.outline-variant');
}
```
Único lugar de las 9 pantallas con glassmorphism — el resto usa `bg-surface-container-lowest` sólido.

### Gráfico de barras verticales (placeholder, sin librería)
```html
<div class="flex-1 bg-surface-container-lowest border border-outline-variant rounded flex items-stretch p-4 gap-2 h-64">
  <div class="flex-1 h-full flex justify-center items-end gap-1">
    <div class="w-3/5 bg-primary h-[40%] rounded-t"></div>
    <div class="w-3/5 bg-outline-variant h-[20%] rounded-t"></div>
  </div>
  <!-- ...un grupo por período -->
</div>
```
> ⚠️ **Bug en el HTML original de Stitch** (pantalla Dashboard): el contenedor usaba `items-end` en vez de `items-stretch`, y a cada grupo le faltaba `h-full`. Con `items-end`, cada grupo se encoge a su contenido (altura 0) y las barras con `height: %` quedan invisibles. Ya corregido acá y en la página de referencia; **el `code.html` original en Downloads todavía tiene el bug sin corregir**.

### Gráfico de barras horizontales / progreso (nuevo, pantalla Reportes)
```html
<div class="space-y-4">
  <div>
    <div class="flex justify-between font-body-md text-body-md mb-1">
      <span class="text-on-surface">Payroll &amp; Benefits</span>
      <span class="font-medium">$45,200</span>
    </div>
    <div class="w-full bg-surface-container rounded-full h-2">
      <div class="bg-primary h-2 rounded-full" style="width: 65%"></div>
    </div>
  </div>
  <!-- ...una fila por categoría -->
</div>
```
Mucho más simple y sin el bug del gráfico vertical (el ancho en `%` de un bloque normal no tiene el problema de altura de un flex item) — preferible como patrón por defecto para mostrar "distribución por categoría" (usado en "Expenses by Category").

### Lista de alertas con acento lateral
```html
<li class="flex justify-between items-center bg-surface-container-lowest border border-outline-variant p-2 rounded border-l-2 border-l-error">
  <div class="flex flex-col">
    <span class="font-body-md text-body-md text-on-surface font-medium">INV-2023-089</span>
    <span class="font-label-md text-label-md text-on-surface-variant">TechCorp Inc.</span>
  </div>
  <span class="font-label-lg text-label-lg text-error block">$4,500.00</span>
</li>
```

### Feed de actividad reciente
```html
<li class="flex gap-3">
  <div class="w-8 h-8 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
    <span class="material-symbols-outlined text-sm">add_shopping_cart</span>
  </div>
  <div>
    <p class="font-body-md text-body-md text-on-surface"><span class="font-semibold">Venta completada</span> - Factura #092</p>
    <p class="font-label-md text-label-md text-on-surface-variant">Hace 10 mins • $1,250.00</p>
  </div>
</li>
```
Mismo patrón de ícono circular con fondo `/10` que la tarjeta KPI, a tamaño chico (`w-8 h-8`) — convención general para "ícono con halo de color del estado".

## Patrones NO encontrados en ninguna de las 9 pantallas

Para que quede explícito qué no hay (y no asumir de más): sin tabs, sin modales/diálogos, sin paginación, sin checkboxes, sin gráficos de anillo/dona ni ningún `<svg>`/`<canvas>` — toda visualización de datos es con `<div>`s (barras verticales u horizontales). El anillo de "estado de cobranza" que se armó en la página de referencia del artifact **no viene de Stitch** — fue una adaptación propia inspirada en una imagen de referencia distinta que pasó el usuario antes de este export.

## Qué falta decidir

- Este sistema (Material 3, negro/navy + celeste) es **visualmente distinto** al que ya está aplicado en `apps/web` (paleta emerald, construida a mano y ya migrada en 40+ archivos). Aplicarlo implica reemplazar `tokens.yaml`, `globals.css` y `components/ui/*`, no sumarlo.
- Sin decidir: ¿se migra la app a esta paleta nueva, se usa solo como referencia puntual, o queda como documentación de un concept aparte?
- La página de referencia (artifact) no tiene todavía los 7 patrones nuevos de las pantallas 6-9.
- El bug del gráfico de barras verticales sigue sin corregir en el `code.html` original de Stitch.
- La inconsistencia de colores hardcodeados en el banner de `inventario_y_rentabilidad_detallada/code.html` sigue sin corregir en el original.
