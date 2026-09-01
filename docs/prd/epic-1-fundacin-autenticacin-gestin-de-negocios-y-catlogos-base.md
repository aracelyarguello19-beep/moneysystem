# Epic 1 Fundación, Autenticación, Gestión de Negocios y Catálogos Base

Establecer la base técnica del sistema —proyecto desplegable, autenticación individual y aislamiento estricto entre cuentas—, la gestión de negocios como entidad central del modelo de datos —incluyendo aislamiento entre negocios de una misma cuenta— y los dos catálogos configurables (monedas, tipos de gasto) de los que dependen todos los módulos siguientes. Al cerrar este epic, un usuario puede crear su cuenta, entrar de forma privada, dar de alta uno o varios negocios completamente independientes entre sí, y configurar en qué monedas y con qué tipos de gasto va a operar cada uno, tanto en cada negocio como en Personal.

## Story 1.1 Inicialización del proyecto y página de estado

Como dueño de cuenta,
quiero que el sistema esté desplegado y accesible,
para poder empezar a usarlo apenas esté listo.

### Acceptance Criteria

1: El proyecto está inicializado con la estructura definida por @architect (monorepo, service architecture del PRD) y control de versiones.
2: Existe una página de estado accesible sin autenticación que confirma que el sistema y su base de datos están operativos.
3: El pipeline de build/deploy mínimo permite llevar cambios a un ambiente accesible por el usuario.
4: La base de datos relacional está provisionada y conectada a la aplicación.

## Story 1.2 Registro y autenticación individual por cuenta

Como persona que quiere empezar a usar el sistema,
quiero crear mi propia cuenta y autenticarme con ella,
para tener un espacio privado exclusivamente mío.

### Acceptance Criteria

1: Una persona puede crear una cuenta nueva con credenciales propias (sin invitación ni login compartido).
2: Una persona puede iniciar y cerrar sesión con sus credenciales.
3: Cada cuenta creada queda asociada a un único dueño desde el momento del registro (FR1).
4: Intentos de acceso con credenciales inválidas son rechazados con un mensaje claro, sin revelar si el usuario existe.

## Story 1.3 Aislamiento de datos multi-tenant entre cuentas

Como dueño de cuenta,
quiero que nadie más pueda ver ni tocar mis datos financieros,
para que mi información de negocio y personal permanezca privada.

### Acceptance Criteria

1: Toda consulta a datos financieros (transacciones, saldos, catálogos) queda filtrada obligatoriamente por la cuenta autenticada, a nivel de acceso a datos (no solo de interfaz) (FR2, NFR1).
2: Una prueba de integración verifica que, autenticado como la Cuenta A, ninguna operación de lectura o escritura puede afectar datos de la Cuenta B.
3: Un intento de acceder a un recurso de otra cuenta por identificador directo (ej. manipulando una URL) es rechazado, no solo ocultado en la interfaz.

## Story 1.4 Alta y gestión de negocios

Como dueño de cuenta,
quiero dar de alta uno o varios negocios dentro de mi cuenta y cambiar entre ellos,
para operar cada uno como una unidad independiente.

### Acceptance Criteria

1: El usuario puede crear un negocio nuevo dentro de su cuenta indicando al menos un nombre (FR3).
2: El usuario puede crear más de un negocio en la misma cuenta; cada uno queda registrado con un identificador interno independiente.
3: El usuario puede ver y usar un selector de negocio activo disponible en cualquier pantalla del módulo Laboral, y cambiar el negocio activo en cualquier momento (FR5).
4: El usuario puede archivar o dar de baja un negocio; un negocio archivado no acepta nuevas transacciones, pero su historial permanece consultable (FR4).
5: Dar de alta un negocio nuevo se completa en menos de 2 minutos (NFR11).

## Story 1.5 Aislamiento de datos entre negocios de una cuenta

Como dueño de cuenta,
quiero que los datos de un negocio no se mezclen con los de otro negocio mío,
para que mis indicadores y saldos por negocio sean confiables.

### Acceptance Criteria

1: Toda consulta a datos transaccionales y de catálogo (compras, ventas, gastos, saldos, ítems, monedas, tipos de gasto) queda filtrada obligatoriamente por el negocio activo además de por la cuenta autenticada, a nivel de acceso a datos (FR6, NFR2).
2: Una prueba de integración verifica que, dentro de la misma cuenta, ninguna operación de lectura o escritura sobre el Negocio A puede afectar datos del Negocio B.
3: El selector de negocio activo determina exclusivamente sobre qué negocio se opera y qué datos se muestran; ninguna pantalla del módulo Laboral, salvo el dashboard consolidado (ver Epic 5), mezcla transacciones de negocios distintos.

## Story 1.6 Catálogo de monedas por negocio y Personal

Como dueño de cuenta,
quiero agregar las monedas que realmente uso, por separado en cada negocio y en Personal,
para no cargar monedas que no me sirven ni mezclar los catálogos entre negocios.

### Acceptance Criteria

1: El usuario puede agregar, ver y desactivar monedas en el catálogo del negocio activo, de forma independiente del catálogo de cualquier otro negocio (FR7).
2: El usuario puede agregar, ver y desactivar monedas en el catálogo del módulo Personal, de forma independiente del catálogo de cualquier negocio (FR8).
3: Agregar una moneda en un negocio no la habilita automáticamente en otro negocio ni en Personal.
4: El Guaraní está disponible como moneda base de consolidación en cada negocio y en Personal por defecto (ver Epic 5).

## Story 1.7 Catálogo de tipos de gasto por negocio y Personal

Como dueño de cuenta,
quiero crear mis propios tipos de gasto y clasificarlos correctamente en cada negocio,
para que los indicadores financieros de cada uno se calculen bien desde el primer gasto que registre.

### Acceptance Criteria

1: El usuario puede crear tipos de gasto en el catálogo del negocio activo, clasificando cada uno obligatoriamente como Operativo o Financiero al momento de crearlo (FR9, NFR7).
2: El usuario puede crear tipos de gasto en el catálogo Personal, clasificando cada uno obligatoriamente como Fijo, Variable o Financiero al momento de crearlo (FR10, NFR7). Financiero es para intereses/cargos de tarjeta de crédito personal (ver Story 6.4).
3: No es posible guardar un tipo de gasto sin su clasificación.
4: El catálogo de tipos de gasto de cada negocio es independiente del de los demás negocios y del de Personal (un tipo creado en uno no aparece en otro).

---
