import { serve } from '@hono/node-server';
import { armarMotor } from './armar.js';
import { cargarConfig, type Config } from './config.js';
import { errorATexto, log } from './log.js';
import { crearServidor } from './servidor.js';
import { CloudApi } from './whatsapp/cloudApi.js';
import type { ProveedorWhatsApp } from './whatsapp/tipos.js';
import { YCloudApi } from './whatsapp/ycloud.js';

const config = cargarConfig();

function exigir(claves: (keyof Config)[]) {
  const faltan = claves.filter((k) => !config[k]);
  if (faltan.length) throw new Error(`Faltan variables para ${config.WA_PROVEEDOR}: ${faltan.join(', ')}`);
}

function crearWhatsApp(): ProveedorWhatsApp {
  if (config.WA_PROVEEDOR === 'ycloud') {
    exigir(['YCLOUD_API_KEY', 'YCLOUD_NUMERO']);
    if (!config.YCLOUD_WEBHOOK_SECRET) log.warn('sin YCLOUD_WEBHOOK_SECRET: no se verifica la firma del webhook (solo aceptable en pruebas)');
    return new YCloudApi({ apiKey: config.YCLOUD_API_KEY!, numero: config.YCLOUD_NUMERO! });
  }
  exigir(['WA_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_VERIFY_TOKEN']);
  if (!config.WA_APP_SECRET) log.warn('sin WA_APP_SECRET: no se verifica la firma del webhook (solo aceptable en pruebas)');
  return new CloudApi({ token: config.WA_TOKEN!, phoneNumberId: config.WA_PHONE_NUMBER_ID!, graphVersion: config.WA_GRAPH_VERSION });
}

const wa = crearWhatsApp();
const { motor, almacen } = armarMotor(config, wa);
await almacen.iniciar();

// Retención: purga diaria de datos más viejos que RETENCION_DIAS.
const purgar = () =>
  almacen
    .purgar(new Date(Date.now() - config.RETENCION_DIAS * 24 * 60 * 60 * 1000))
    .catch((e) => log.error('purga falló', { error: errorATexto(e) }));
void purgar();
setInterval(purgar, 24 * 60 * 60 * 1000).unref();

const app = crearServidor({ config, procesar: (e) => motor.procesar(e) });
serve({ fetch: app.fetch, port: config.PORT }, (info) =>
  log.info('servidor escuchando', { puerto: info.port, proveedor: config.WA_PROVEEDOR }),
);
