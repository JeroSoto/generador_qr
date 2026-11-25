/**
 * Punto de entrada: carga la configuración, crea la aplicación, abre el
 * puerto y programa la limpieza periódica de documentos caducados.
 *
 * Uso:  npm start   (o npm run dev para reiniciar al guardar cambios)
 */
import http from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './app.js';
import { buildDefaultBaseUrl, describeBaseUrl, detectLanIPv4 } from './utils/network.js';
import { formatBytes } from './utils/format.js';

/** Cada cuánto se eliminan los documentos caducados. */
const PURGE_INTERVAL_MS = 30 * 60 * 1000;

function printBanner({ port, baseUrl, config }) {
  const { reachableFromOtherDevices, publicInternet } = describeBaseUrl(baseUrl);
  const lines = [
    '',
    '  QR Office · generador de códigos QR para documentos',
    '  ---------------------------------------------------',
    `  Abre la aplicación:   http://localhost:${port}`,
    `  Los QR apuntarán a:   ${baseUrl}`,
    `  Tamaño máximo:        ${formatBytes(config.maxFileSizeBytes)}`,
    `  Caducidad:            ${config.fileTtlHours > 0 ? `${config.fileTtlHours} h` : 'sin caducidad'}`,
    '',
  ];
  if (!reachableFromOtherDevices) {
    lines.push('  AVISO: los QR apuntan a localhost y sólo funcionarán en este equipo.');
    lines.push('  Define PUBLIC_BASE_URL o HOST=0.0.0.0 en .env para usarlos desde el móvil.', '');
  } else if (!publicInternet) {
    lines.push('  Los móviles conectados a la misma red Wi-Fi podrán abrir los QR.');
    lines.push('  Si no cargan, permite Node.js en el Firewall de Windows (redes privadas).', '');
  }
  console.log(lines.join('\n'));
}

async function main() {
  const config = loadConfig();
  const { app, store } = await createApp(config);
  const server = http.createServer(app);

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`El puerto ${config.port} ya está en uso. Cierra la otra aplicación o cambia PORT en .env.`);
    } else if (error.code === 'EACCES') {
      console.error(`No hay permisos para usar el puerto ${config.port}. Prueba con un puerto mayor que 1024.`);
    } else {
      console.error('Error del servidor:', error);
    }
    process.exit(1);
  });

  // Se detecta antes de abrir el puerto para que el primer QR ya use la IP correcta.
  const lanAddress = config.publicBaseUrl ? null : await detectLanIPv4();

  server.listen(config.port, config.host, () => {
    const { port } = server.address();
    const baseUrl = config.publicBaseUrl ?? buildDefaultBaseUrl(port, config.host, lanAddress);
    app.locals.baseUrl = baseUrl;
    app.locals.baseUrlSource = config.publicBaseUrl ? 'env' : describeBaseUrl(baseUrl).reachableFromOtherDevices ? 'lan' : 'localhost';
    printBanner({ port, baseUrl, config });
  });

  const purge = () =>
    store
      .purgeExpired()
      .then((removed) => removed > 0 && console.log(`[limpieza] ${removed} documento(s) caducado(s) eliminado(s).`))
      .catch((error) => console.error('[limpieza] Error al eliminar documentos caducados:', error));
  purge();
  setInterval(purge, PURGE_INTERVAL_MS).unref();

  const shutdown = (signal) => {
    console.log(`\nSeñal ${signal} recibida. Cerrando el servidor…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('No se pudo iniciar la aplicación:', error.message);
  process.exit(1);
});
