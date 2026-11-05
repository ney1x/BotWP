import { serve } from '@hono/node-server';
import { armarMotor } from './armar.js';
import { cargarConfig } from './config.js';
import { errorATexto, log } from './log.js';
import { crearServidor } from './servidor.js';
import { CloudApi } from './whatsapp/cloudApi.js';

const config = cargarConfig();

const faltan = (['WA_TOKEN', 'WA_PHONE_NUMBER_ID', 'WA_VERIFY_TOKEN'] as const).filter((k) => !config[k]);
if (faltan.length) throw new Error(`Faltan variables de WhatsApp: ${faltan.join(', ')}`);
if (!config.WA_APP_SECRET) log.warn('sin WA_APP_SECRET: no se verifica la firma del webhook (solo aceptable en pruebas)');

const wa = new CloudApi({ token: config.WA_TOKEN!, phoneNumberId: config.WA_PHONE_NUMBER_ID!, graphVersion: config.WA_GRAPH_VERSION });
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
serve({ fetch: app.fetch, port: config.PORT }, (info) => log.info('servidor escuchando', { puerto: info.port }));
