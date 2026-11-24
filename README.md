# Micro Empaques Cheches

Aplicación local para planeación de planta, rutas, colas por proceso y registro de producción.

## Inicio en Windows

1. Instala Node.js 20 o posterior.
2. Descarga o clona este repositorio en el computador anfitrión de la planta.
3. Ejecuta `ABRIR APLICACION.bat` o `ABRIR PLANEACION.bat`. El segundo abre directamente la vista Planeación.
4. Mantén abierta la ventana del servicio mientras se usa la aplicación. El iniciador crea accesos directos en el Escritorio.

También puedes iniciar el servidor con `npm start` y abrir `http://localhost:4173/`.

## Datos y seguridad

La aplicación guarda sus órdenes y respaldos localmente, fuera del código. `demo-data.json` contiene solamente órdenes DEMO. El `.gitignore` excluye libros Excel, archivos CSV de órdenes, planos, datos locales, respaldos y configuración local.

El repositorio conserva el código; GitHub no ejecuta el servidor Node de esta aplicación. Para usarla desde otros equipos debe ejecutarse el servidor en un computador anfitrión accesible en la red. No expongas directamente este servidor a Internet: antes requiere autenticación y un despliegue protegido.

Consulta [LEEME.md](LEEME.md) para la guía completa de rutas, importación y operación.
