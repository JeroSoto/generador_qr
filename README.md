# QR Office · Generador de QR para documentos de Office

Aplicación web (Node.js + HTML, CSS y JavaScript) que convierte documentos de **Word, Excel, PowerPoint, Access, Visio,
Publisher, Project, OneNote y Outlook**, además de PDF, RTF, OpenDocument, CSV y TXT, en un **código QR**.

El servidor guarda el documento y el QR lleva a una **página de descarga** optimizada para el móvil. También puedes crear
el QR de un **enlace de OneDrive, SharePoint, Google Drive, Dropbox** u otro servicio en la nube.

> Un código QR sólo admite unos 2,9 KB de datos, y un documento de Office pesa mucho más. Por eso el QR no contiene el
> archivo, sino un enlace corto a la página desde la que se descarga.

---

## Índice

1. [Características](#características)
2. [Requisitos](#requisitos)
3. [Instalación](#instalación)
4. [Configuración](#configuración)
5. [Ejecución](#ejecución)
6. [Uso](#uso)
7. [Usar los QR desde el móvil](#usar-los-qr-desde-el-móvil)
8. [Formatos admitidos](#formatos-admitidos)
9. [API REST](#api-rest)
10. [Estructura del proyecto](#estructura-del-proyecto)
11. [Pruebas](#pruebas)
12. [Trabajar con VS Code](#trabajar-con-vs-code)
13. [Solución de problemas](#solución-de-problemas)
14. [Documentación adicional](#documentación-adicional)
15. [Licencia](#licencia)

---

## Características

- **Subida de documentos** arrastrando y soltando o con el selector de archivos, con barra de progreso.
- **Validación real del contenido**: además de la extensión se comprueba la firma binaria del archivo, así que un
  ejecutable renombrado a `.docx` se rechaza.
- **Página de descarga** para quien escanea el QR: nombre, tipo, tamaño, fecha, caducidad, número de descargas, huella
  SHA-256 y aviso si el formato puede contener macros.
- **Vista previa en Office para la Web** (Word, Excel y PowerPoint) cuando la aplicación está publicada en Internet.
- **QR de enlaces en la nube**, con detección del servicio (OneDrive, SharePoint, Microsoft 365, Google, Dropbox, Box, iCloud).
- **Personalización del QR**: colores, tamaño (256 a 2048 px), nivel de corrección de errores (L, M, Q, H) y margen.
- **Avisos de legibilidad**: contraste bajo, colores invertidos o margen insuficiente.
- **Descarga en PNG y SVG**, copia de la imagen y del enlace al portapapeles.
- **Historial local** en el navegador, desde el que se puede volver a ver un QR o eliminar el documento del servidor.
- **Caducidad automática** de los documentos (7 días por defecto) y limpieza periódica.
- **Detección automática de la IP de la red local**, para que los QR funcionen desde cualquier móvil conectado a la misma Wi-Fi.
- **Seguridad**: cabeceras HTTP con Helmet (CSP incluida), límite de peticiones, nombres de archivo saneados, tokens de
  eliminación guardados como hash y archivos almacenados sin extensión.
- Interfaz en español, adaptable a móvil y con tema claro u oscuro según el sistema.

## Requisitos

| Requisito | Versión |
|-----------|---------|
| [Node.js](https://nodejs.org/) | 22.9 o superior (probado con 24.13) |
| npm | Incluido con Node.js |
| Navegador | Chrome, Edge, Firefox o Safari actuales |

No necesita base de datos ni servicios externos.

## Instalación

```powershell
git clone https://github.com/JeroSoto/generador_qr.git
```

```powershell
cd generador_qr
```

```powershell
npm install
```

## Configuración

La configuración se hace con variables de entorno. Copia el archivo de ejemplo y edítalo si necesitas cambiar algo
(todas las variables son opcionales):

```powershell
Copy-Item .env.example .env
```

| Variable | Defecto | Descripción |
|----------|---------|-------------|
| `PORT` | `3000` | Puerto del servidor. |
| `HOST` | `0.0.0.0` | Interfaz de red. `0.0.0.0` permite el acceso desde la red local; `127.0.0.1` lo limita a este equipo. |
| `PUBLIC_BASE_URL` | *(vacío)* | URL a la que apuntan los QR. Vacío = IP de la red local detectada automáticamente. |
| `MAX_FILE_SIZE_MB` | `25` | Tamaño máximo de cada documento (1-1024 MB). |
| `FILE_TTL_HOURS` | `168` | Horas que se conserva cada documento. `0` = sin caducidad. |
| `STORAGE_DIR` | `storage` | Carpeta de los documentos y del índice de metadatos. |
| `TRUST_PROXY` | `0` | Número de proxies inversos delante del servidor. |
| `RATE_LIMIT_UPLOADS` | `30` | Subidas permitidas por IP cada 15 minutos. |
| `RATE_LIMIT_QR` | `600` | Imágenes QR permitidas por IP cada 15 minutos. |
| `LOG_REQUESTS` | `true` | Muestra cada petición en la consola. |

## Ejecución

```powershell
npm start
```

Para desarrollo, con reinicio automático al guardar archivos del servidor:

```powershell
npm run dev
```

Al arrancar, la consola muestra la dirección de la aplicación y la URL a la que apuntarán los QR:

```text
  QR Office · generador de códigos QR para documentos
  ---------------------------------------------------
  Abre la aplicación:   http://localhost:3000
  Los QR apuntarán a:   http://192.168.1.20:3000
  Tamaño máximo:        25 MB
  Caducidad:            168 h
```

Abre `http://localhost:3000` en el navegador.

## Uso

1. **Elige el origen.**
   - *Subir documento*: arrastra un archivo a la zona punteada o haz clic para elegirlo. Se sube y se valida al momento.
   - *Enlace en la nube*: pega el enlace para compartir de tu documento y pulsa **Generar QR**. Comprueba que el permiso
     del enlace sea «Cualquier persona con el vínculo».
2. **Personaliza el QR** (opcional): colores, tamaño de la imagen, corrección de errores y margen. Si alguna combinación
   dificulta la lectura aparece un aviso.
3. **Descarga o comparte**: *Descargar PNG*, *SVG* (vectorial, ideal para imprimir), *Copiar imagen* o *Abrir enlace*
   para comprobar la página de descarga.
4. **Historial**: en la parte inferior aparecen los QR generados desde este navegador. Puedes volver a mostrarlos,
   copiar su enlace o eliminar el documento del servidor (el QR dejará de funcionar).

Consejo: usa la corrección **Q** o **H** si el QR se va a imprimir en superficies que puedan ensuciarse o doblarse.

## Usar los QR desde el móvil

Un QR que apunta a `localhost` sólo funciona en el propio ordenador. Por eso, si no defines `PUBLIC_BASE_URL`, la
aplicación pregunta al sistema qué interfaz usa para salir a la red (normalmente el Wi-Fi o el cable) y usa esa IP. Los
adaptadores virtuales (VMware, VirtualBox, WSL, VPN…) se descartan.

- **Misma red Wi-Fi**: funciona sin configurar nada. La primera vez Windows puede pedir permiso para Node.js en el
  firewall: permite el acceso en **redes privadas**.
- **Desde Internet**: publica la aplicación en un servidor o detrás de un túnel (por ejemplo, Cloudflare Tunnel o ngrok)
  y define `PUBLIC_BASE_URL=https://tu-dominio`. Si hay un proxy delante, define también `TRUST_PROXY=1`. Con una URL
  pública se activa además el botón «Ver en línea con Office para la Web» en la página de descarga.

La insignia de la cabecera indica a dónde apuntan los QR: **Red local**, **Público** o **Sólo este equipo**.

## Formatos admitidos

| Familia | Extensiones |
|---------|-------------|
| Word | `.doc` `.docx` `.docm` `.dot` `.dotx` `.dotm` `.rtf` `.odt` |
| Excel | `.xls` `.xlsx` `.xlsm` `.xlsb` `.xlt` `.xltx` `.xltm` `.csv` `.ods` |
| PowerPoint | `.ppt` `.pptx` `.pptm` `.pps` `.ppsx` `.ppsm` `.pot` `.potx` `.potm` `.odp` |
| Access | `.mdb` `.accdb` |
| Visio | `.vsd` `.vsdx` |
| Publisher | `.pub` |
| Project | `.mpp` |
| OneNote | `.one` |
| Outlook | `.msg` |
| PDF | `.pdf` |
| Texto | `.txt` |

El catálogo completo vive en [`src/constants/officeFormats.js`](src/constants/officeFormats.js); el frontend lo recibe
del servidor, así que añadir un formato sólo requiere tocar ese archivo.

## API REST

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/api/health` | Estado del servicio. |
| `GET` | `/api/config` | Formatos, límites, valores por defecto del QR y URL base. |
| `POST` | `/api/documents` | Sube un documento (`multipart/form-data`, campo `file`). Devuelve `201` con el documento y su `deleteToken`. |
| `GET` | `/api/documents/:id` | Metadatos públicos del documento. |
| `GET` | `/api/documents/:id/qr` | QR del documento. Parámetros: `format`, `size`, `margin`, `ecc`, `fg`, `bg`, `download`. |
| `DELETE` | `/api/documents/:id` | Elimina el documento. Requiere la cabecera `X-Delete-Token`. |
| `POST` | `/api/qr` | QR de un texto o enlace (JSON: `text`, `format`, `size`, `margin`, `ecc`, `fg`, `bg`). |
| `GET` | `/d/:id` | Página de descarga (la que abre el QR). |
| `GET` | `/d/:id/download` | Descarga del archivo original. |

Los errores de la API tienen siempre la forma `{ "error": { "code": "…", "message": "…" } }`. La referencia completa,
con códigos de error y ejemplos, está en la [documentación técnica](docs/DOCUMENTACION-TECNICA.md#7-referencia-de-la-api).
En [`docs/api.http`](docs/api.http) hay peticiones listas para la extensión REST Client.

## Estructura del proyecto

```text
generador_qr/
├── .vscode/                    Configuración de VS Code (depuración, tareas, extensiones)
├── docs/
│   ├── SRS-IEEE-830.md         Especificación de requisitos (IEEE 830)
│   ├── DOCUMENTACION-TECNICA.md Arquitectura, flujos, módulos, API y guía de extensión
│   └── api.http                Peticiones de ejemplo (REST Client)
├── prototipo/                  Prototipo original sólo frontend (referencia histórica)
├── public/                     Frontend estático
│   ├── index.html
│   ├── css/styles.css          Estilos de la aplicación
│   ├── css/share.css           Estilos de la página de descarga
│   ├── img/favicon.svg
│   └── js/                     Módulos ES del navegador (app, api, ui, historial, opciones, enlaces)
├── src/                        Servidor Node.js (Express)
│   ├── server.js               Punto de entrada
│   ├── app.js                  Composición de la aplicación
│   ├── config.js               Variables de entorno
│   ├── constants/officeFormats.js
│   ├── middleware/             Errores y registro de peticiones
│   ├── routes/                 API REST y rutas públicas de descarga
│   ├── services/               Validación, QR, almacén de documentos
│   ├── utils/                  Formato, red, seguridad, errores HTTP
│   └── views/pages.js          HTML de la página de descarga y de error
├── test/                       Pruebas automáticas (node:test)
├── storage/                    Documentos subidos (se crea al arrancar, ignorado por Git)
├── .env.example
├── package.json
└── README.md
```

## Pruebas

```powershell
npm test
```

Usa el ejecutor de pruebas integrado en Node.js (`node:test`), sin dependencias extra. Las pruebas levantan la aplicación
en un puerto aleatorio con una carpeta de almacenamiento temporal y cubren: validación de formatos y firmas, generación
de QR, subida y descarga completas, eliminación con token, límites de tamaño, caducidad, cabeceras de seguridad y
detección de red.

## Trabajar con VS Code

Abre la carpeta del proyecto (`code .`). Al hacerlo, VS Code sugerirá las extensiones recomendadas.

- **Ejecutar y depurar** (`F5`): «Iniciar servidor (depuración)» arranca el servidor con puntos de interrupción.
- **Tareas** (`Ctrl+Shift+B`): «Servidor en modo desarrollo» ejecuta `npm run dev`.
- **REST Client**: abre `docs/api.http` y pulsa «Send Request» sobre cada petición.
- **Mermaid**: la extensión recomendada muestra los diagramas de la documentación técnica en la vista previa de Markdown.

## Solución de problemas

| Problema | Solución |
|----------|----------|
| El móvil no abre el QR | Comprueba que esté en la misma Wi-Fi y que el firewall de Windows permita Node.js en redes privadas. Revisa la URL que muestra la consola al arrancar. |
| La IP detectada no es la correcta | Define `PUBLIC_BASE_URL=http://TU_IP:3000` en `.env` y reinicia. |
| `El puerto 3000 ya está en uso` | Cierra la otra aplicación o cambia `PORT` en `.env`. |
| «Formato no admitido» | Revisa la tabla de formatos. Si el archivo tiene la extensión correcta, puede estar dañado o renombrado. |
| «Copiar imagen» no funciona | Los navegadores sólo lo permiten en `https` o `localhost`. Usa «Descargar PNG». |
| El botón de Office para la Web no aparece | Sólo se muestra para Word, Excel y PowerPoint cuando `PUBLIC_BASE_URL` es una dirección pública de Internet. |

## Documentación adicional

- [Especificación de requisitos de software (IEEE 830)](docs/SRS-IEEE-830.md)
- [Documentación técnica: arquitectura, flujos de datos, módulos, API y cómo extender el proyecto](docs/DOCUMENTACION-TECNICA.md)

## Licencia

[MIT](LICENSE).
