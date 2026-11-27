# Micro Empaques Cheches

Aplicación web para planeación de planta, asignación de máquinas, seguimiento de órdenes y registro de producción. Usa React, Next.js App Router y TypeScript.

## Ejecutar

Con Node.js 20.9 o posterior:

```sh
npm ci
npm run dev
```

Abre [http://localhost:4173](http://localhost:4173). Para la instalación de planta, ejecuta `npm run build` y luego `npm start`. En Windows, `ABRIR APLICACION.bat` y `ABRIR PLANEACION.bat` instalan y compilan en el primer inicio, cuando faltan las dependencias o la compilación. Después de actualizar el código, ejecuta nuevamente `npm ci` y `npm run build` antes de iniciar el servicio.

## Organización

| Directorio | Responsabilidad |
| --- | --- |
| `src/app` | Rutas del App Router. Resumen, planeación, asignación, operario, estaciones y configuración. |
| `src/app/api` | Endpoints para estado, salud del servicio, vista previa de archivos y adjuntos. |
| `src/features` | Componentes y lógica por área. Órdenes, planeación, producción, configuración y sincronización. |
| `src/components` | Navegación y componentes de interfaz compartidos. |
| `src/types` | Tipos de órdenes, rutas, operaciones, entregas y contratos de la API. |
| `src/server` | Persistencia, respaldos, adjuntos y lectura de Excel/CSV. |

`npm run typecheck` verifica los tipos. `npm run build` valida y genera la compilación de producción.

## Usar los datos de la instalación anterior

Detén el servidor antiguo antes de iniciar Next.js. Usa los mismos valores de `DATA_DIR` y `BACKUP_DIR` de la instalación anterior. El servicio lee el mismo `planta.json`, sus respaldos y las imágenes existentes. En Windows, el iniciador toma esas rutas de `config.local.bat`. En una instalación nueva, los valores predeterminados desde npm son `data/` y `data/backups/`.

La persistencia usa archivos locales y un único proceso Node.js en el equipo anfitrión. Las terminales de planta acceden al mismo servidor por la red privada. Consulta [la guía de operación](LEEME.md) para configurar almacenamiento, importar órdenes y operar los tableros.
