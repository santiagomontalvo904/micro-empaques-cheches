# Micro Empaques Cheches · servicio local

La aplicación organiza la planeación de planta, las diez rutas de producción, las colas por proceso y el registro de cantidades. Se ejecuta en el computador anfitrión de planta y sincroniza las terminales de la red local mediante un servicio Node.js.

## Requisitos e inicio

- Windows con Node.js 20 o posterior. No requiere instalar paquetes.
- Descomprime el paquete en el computador anfitrión y ejecuta `INICIAR.bat`.
- También puedes abrir `ABRIR APLICACION.bat` o `ABRIR PLANEACION.bat`. En el primer inicio se crean en el Escritorio los accesos directos **Micro Empaques Cheches** y **Planeacion de planta - Micro Empaques Cheches**. El segundo abre directamente la sección Planeación.
- Si aún no existe configuración, el iniciador crea `config.local.bat` con datos en `%USERPROFILE%\Documents\Codex\MicroEmpaquesCheches-Datos` y respaldos en `%USERPROFILE%\Documents\Codex\MicroEmpaquesCheches-Respaldos`, que coincide con la instalación local previa.
- El iniciador comprueba Node.js, levanta el servicio en una ventana aparte, espera su confirmación y abre la aplicación en el navegador. Mantén abierta la ventana del servicio durante el turno. Si ya hay un servicio activo en el puerto 4173, solo abre la app.
- No abras `index.html` directamente: esa vista local no inicia el servicio y puede mostrar “conexión rechazada”. Usa uno de los archivos `.bat`; el navegador abrirá `http://localhost:4173/` y la planeación directa abrirá `http://localhost:4173/?page=planeacion`.
- Para cambiar las ubicaciones, edita `config.local.bat`. Configura una carpeta de respaldo en otro disco si necesitas protección frente a una falla del disco principal.
- El navegador abre `http://localhost:4173` automáticamente. En una instalación nueva aparecen órdenes DEMO pendientes, una por cada ruta, para revisar los tableros. Al importar la primera fila válida de la planeación real, las órdenes DEMO se quitan automáticamente. La información queda en `planta.json` dentro de la carpeta de datos.

Para inicio manual avanzado, define ambas carpetas y arranca Node:

```powershell
$env:DATA_DIR = 'C:\MicroEmpaques\datos'
$env:BACKUP_DIR = 'D:\MicroEmpaquesCheches\Respaldos'
$env:REQUIRE_SEPARATE_BACKUP = '1'
node .\server.mjs
```

## Planeación e importación

En **Planeación**, selecciona el libro `.xlsx` o un `.csv`, elige la hoja, verifica el mapa de columnas y revisa las filas antes de importar. El botón **Cargar y actualizar órdenes** muestra los pasos de validación, guardado y confirmación del servidor. Selecciona una ruta para ver su secuencia completa en la misma pantalla. El libro original se lee, pero no se modifica ni queda conectado en línea.

El cliente y la referencia son la identificación principal de cada orden; debajo se muestran la orden de corrugación y la orden de convertidora vinculadas. Las cantidades de láminas corrugadas, convertidas y la meta de cajas se conservan por separado. Al actualizar una orden se conserva el progreso y el historial; no se reemplaza la ruta de una orden que ya comenzó producción. `Fecha ingreso` es la llegada a planta y `Fecha despacho` es el plazo objetivo. Prioridad y cabida se pueden mapear desde el archivo. Las fechas de Excel y los seriales numéricos se convierten a día/mes/año en las listas y fichas. En cada orden puedes adjuntar un plano o arte PNG, JPG o WEBP de hasta 10 MB; el archivo queda guardado con respaldo y se muestra al abrir la ficha técnica de la orden. Se admiten `.xlsx` y `.csv`; los `.xls` antiguos no están soportados.

En **Configuración** se pueden revisar y editar rutas y máquinas. Una ruta define el orden del proceso. La programación de máquina es complementaria y no cambia esa secuencia. La asignación se administra en su pantalla separada, no desde el tablero de estaciones.

## Rutas de producción

Cada ruta sigue el orden de la lista:

1. Corrugador → Convertidora → Guillotina → Impresoras → Laminadoras → Troqueladoras → Despique → Contada → Estresada → Despachos.
2. Corrugador → Convertidora → Guillotina → Impresoras → Laminadoras → Troqueladoras → Despique → Pegadoras → Contada → Estresada → Despachos.
3. Corrugador → Convertidora → Guillotina → Impresoras → Laminadoras → Troqueladoras → Despique → Pegadoras → Contada → Zunchada → Despachos.
4. Corrugador → Convertidora → Guillotina → Impresoras → Laminadoras → Troqueladoras → Despique → Pegadoras → Contada → Encajada → Despachos.
5. Corrugador → Convertidora → Convertidora → Guillotina → Guillotina → Impresoras → Laminadoras → Laminadoras → Troqueladoras → Despique → Contada → Estresada → Despachos.
6. Corrugador → Corrugador → Convertidora → Convertidora → Guillotina → Guillotina → Impresoras → Laminadoras → Laminadoras → Troqueladoras → Despique → Contada → Estresada → Despachos.
7. Corrugador → Convertidora → Laminadoras → Cuchillos / score → Flexográfica → Pegadoras → Zunchada → Despachos.
8. Corrugador → Convertidora → Guillotina → Laminadoras → Flexográfica → Pegadoras → Zunchada → Despachos.
9. Corrugador → Convertidora → Guillotina → Impresoras → Laminadoras → Flexográfica → Troqueladoras → Despique → Contada → Estresada → Despachos.
10. Corrugador → Convertidora → Guillotina → Impresoras → Laminadoras → Troqueladoras → Despique → Pegada manual → Contada → Estresada → Despachos.

Las operaciones repetidas se conservan como pasos separados. Flexográfica tiene su propia cola y no se mezcla con Impresoras. Contada, Estresada, Zunchada y Encajada también tienen colas distintas. Pegadoras incluye la máquina de caja regular.

## Tableros y producción

El **Resumen de planta** presenta el cliente y la referencia, y muestra debajo las órdenes relacionadas. Los indicadores y la actividad se calculan a partir de las órdenes e historiales guardados; las órdenes DEMO se quitan automáticamente al importar la primera fila válida del libro real.

El **Tablero de estaciones** tiene una cola por operación. Todas las órdenes pendientes aparecen en cada etapa que les corresponde según su ruta; por ejemplo, una orden de Ruta 1 sin avance aparece pendiente en Corrugadores. Corrugación y convertidora pueden avanzar en paralelo. Las operaciones posteriores solo reciben la cantidad que liberaron sus pasos anteriores y, para el laminado compartido, ambas ramas.

La pantalla de programación de máquinas muestra el equipo previsto por operación. En Configuración administra el catálogo de código y nombre; por ejemplo, el código 04 puede mostrar Hans Mosquera. Los registros conservan ambos valores y muestran el nombre junto al código. En Vista de operario, cada tarea requiere escoger una máquina y pulsar Iniciar antes de registrar cantidad. Después se puede cerrar jornada o liberar una operación. El modo operario oculta las demás secciones y deja Vista de operario y Tablero de estaciones disponibles; es un control de pantalla, no un inicio de sesión ni un permiso de seguridad.

Despacho registra unidades despachadas y averías aparte. La cola **Entregado a cliente** registra la cantidad efectivamente recibida; ese registro no cambia el total despachado ni las averías.

## Sincronización, respaldos y recuperación

El computador anfitrión ejecuta el servicio central todo el turno. En cada terminal de la misma red de planta abre `http://IP-DEL-ANFITRION:4173`; permite Node.js en el Firewall solo para la red privada de planta. La aplicación consulta el servidor cada cinco segundos y cada terminal conserva su selección de área y máquina, por lo que el monitor de coordinación mantiene la vista completa mientras cada terminal puede mostrar su máquina. Este servicio está preparado para la LAN de planta; para acceder desde fuera de esa red hace falta una VPN o una instalación remota protegida. No expongas el puerto directamente a Internet.

Los registros de producción, liberación, despacho y entrega solo aparecen confirmados después de que el servidor sincronice el archivo principal y su respaldo. Mientras esperan, se identifican como **Pendiente, no confirmado**; una liberación pendiente permanece en su estación y no habilita la siguiente. Las escrituras usan revisiones e identificadores idempotentes. Ante una revisión incompatible, la app conserva el cambio pendiente y evita sobrescribir el estado central.

Por cada escritura, el servidor sincroniza el JSON y una copia versionada de la misma revisión. Al iniciar, recupera la revisión válida más alta si el archivo principal falta, está dañado o quedó atrasado. Para restaurar manualmente, detén el servicio y conserva una copia del archivo actual antes de reemplazar `DATA_DIR\planta.json` por el respaldo elegido. Es recomendable conectar un UPS al computador anfitrión y al router o switch.

La aplicación intenta mantener una cola en IndexedDB con durabilidad estricta y una copia recuperable local. Cuando IndexedDB no está disponible, el registro requiere conexión al servidor. `localStorage` por sí solo no garantiza sincronización física a disco; considera una acción guardada cuando la interfaz muestre confirmación del servidor.

## Verificación y alcance

Se verificaron la sintaxis de la aplicación, las diez rutas y su migración desde catálogos anteriores, la separación de colas, la selección obligatoria de máquina, los códigos con nombre, el formato de fechas, la importación y confirmación de guardado, la recuperación desde respaldos y la lectura de vista previa de la hoja `ORDENES` (1.251 filas). La instalación en el computador anfitrión, la apertura del Firewall privado y el acceso entre terminales de la LAN aún deben comprobarse físicamente en planta.

La app no está integrada con la base existente, no tiene inicio de sesión ni permisos por usuario, y no conecta servicios externos. Antes del uso diario, define el computador anfitrión, la ubicación de datos y respaldos, y quién tendrá acceso a la red local.
