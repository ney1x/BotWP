import { Hono } from 'hono';
import type { Config } from './config.js';
import { log } from './log.js';
import { firmaValida, interpretarWebhook } from './whatsapp/cloudApi.js';
import type { Entrante } from './whatsapp/tipos.js';
import { firmaYCloudValida, interpretarWebhookYCloud } from './whatsapp/ycloud.js';

export interface OpcionesServidor {
  config: Config;
  procesar: (e: Entrante) => Promise<void>;
  ahora?: () => number;
}

export function crearServidor({ config, procesar, ahora = Date.now }: OpcionesServidor) {
  const app = new Hono();
  const ycloud = config.WA_PROVEEDOR === 'ycloud';

  app.get('/salud', (c) => c.json({ ok: true, proveedor: config.WA_PROVEEDOR }));

  // Verificación del webhook al configurarlo en Meta (solo Cloud API directo).
  app.get('/webhook', (c) => {
    const modo = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const reto = c.req.query('hub.challenge');
    if (!ycloud && modo === 'subscribe' && config.WA_VERIFY_TOKEN && token === config.WA_VERIFY_TOKEN && reto) {
      return c.text(reto);
    }
    return c.text('forbidden', 403);
  });

  app.post('/webhook', async (c) => {
    const crudo = await c.req.text();

    if (ycloud) {
      if (config.YCLOUD_WEBHOOK_SECRET && !firmaYCloudValida(crudo, c.req.header('ycloud-signature'), config.YCLOUD_WEBHOOK_SECRET, ahora())) {
        log.warn('webhook ycloud: firma inválida');
        return c.text('firma inválida', 401);
      }
    } else if (config.WA_APP_SECRET && !firmaValida(crudo, c.req.header('x-hub-signature-256'), config.WA_APP_SECRET)) {
      log.warn('webhook: firma inválida');
      return c.text('firma inválida', 401);
    }

    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      return c.text('json inválido', 400);
    }
    // Respuesta rápida; se procesa en segundo plano (los ids repetidos se descartan en el motor).
    const eventos = ycloud ? interpretarWebhookYCloud(cuerpo) : interpretarWebhook(cuerpo);
    for (const e of eventos) void procesar(e);
    return c.text('ok');
  });

  return app;
}
