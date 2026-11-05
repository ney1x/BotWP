import { Hono } from 'hono';
import type { Config } from './config.js';
import { log } from './log.js';
import { firmaValida, interpretarWebhook } from './whatsapp/cloudApi.js';
import type { Entrante } from './whatsapp/tipos.js';

export interface OpcionesServidor {
  config: Config;
  procesar: (e: Entrante) => Promise<void>;
}

export function crearServidor({ config, procesar }: OpcionesServidor) {
  const app = new Hono();

  app.get('/salud', (c) => c.json({ ok: true }));

  // Verificación del webhook al configurarlo en Meta.
  app.get('/webhook', (c) => {
    const modo = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const reto = c.req.query('hub.challenge');
    if (modo === 'subscribe' && config.WA_VERIFY_TOKEN && token === config.WA_VERIFY_TOKEN && reto) {
      return c.text(reto);
    }
    return c.text('forbidden', 403);
  });

  app.post('/webhook', async (c) => {
    const crudo = await c.req.text();
    if (config.WA_APP_SECRET && !firmaValida(crudo, c.req.header('x-hub-signature-256'), config.WA_APP_SECRET)) {
      log.warn('webhook: firma inválida');
      return c.text('firma inválida', 401);
    }
    let cuerpo: unknown;
    try {
      cuerpo = JSON.parse(crudo);
    } catch {
      return c.text('json inválido', 400);
    }
    // Meta exige respuesta rápida: se responde 200 y se procesa en segundo plano.
    for (const e of interpretarWebhook(cuerpo)) void procesar(e);
    return c.text('ok');
  });

  return app;
}
