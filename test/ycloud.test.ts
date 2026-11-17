import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { configPorDefecto } from '../src/config.js';
import { crearServidor } from '../src/servidor.js';
import type { Entrante } from '../src/whatsapp/tipos.js';
import { cuerpoYCloud, firmaYCloudValida, interpretarWebhookYCloud, YCloudApi } from '../src/whatsapp/ycloud.js';

const entrante = (m: Record<string, unknown>) => ({
  id: 'evt_1',
  type: 'whatsapp.inbound_message.received',
  apiVersion: 'v2',
  createTime: '2026-11-05T20:00:00.000Z',
  whatsappInboundMessage: {
    id: '65a1',
    wamid: 'wamid.ABC',
    wabaId: 'WABA',
    from: '+17865550000',
    customerProfile: { name: 'Ana' },
    to: '+17868782085',
    sendTime: '2026-11-05T20:00:00.000Z',
    ...m,
  },
});

const firmar = (cuerpo: string, secreto: string, t: number) =>
  `t=${t},s=${createHmac('sha256', secreto).update(`${t}.${cuerpo}`).digest('hex')}`;

describe('webhook de YCloud', () => {
  test('mensaje de texto: teléfono sin "+", nombre y wamid como id', () => {
    const [e] = interpretarWebhookYCloud(entrante({ type: 'text', text: { body: 'hola' } }));
    expect(e).toEqual({
      tipo: 'mensaje',
      id: 'wamid.ABC',
      de: '17865550000',
      nombre: 'Ana',
      ts: new Date('2026-11-05T20:00:00.000Z'),
      contenido: { clase: 'texto', texto: 'hola' },
    });
  });

  test('botón, lista, imagen y audio', () => {
    const c = (m: Record<string, unknown>) => (interpretarWebhookYCloud(entrante(m))[0] as Extract<Entrante, { tipo: 'mensaje' }>).contenido;
    expect(c({ type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'SI', title: 'Sí' } } })).toEqual({ clase: 'opcion', id: 'SI', titulo: 'Sí' });
    expect(c({ type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'MENU_ORO', title: 'Precio del oro' } } })).toMatchObject({ clase: 'opcion', id: 'MENU_ORO' });
    expect(c({ type: 'image', image: { id: 'img1', link: 'https://api.ycloud.com/x', caption: 'reloj' } })).toEqual({ clase: 'imagen', mediaId: 'img1', url: 'https://api.ycloud.com/x', caption: 'reloj' });
    expect(c({ type: 'audio', audio: { id: 'a1' } })).toEqual({ clase: 'audio' });
  });

  test('eco del asesor desde la app (whatsapp.smb.message.echoes)', () => {
    const ev = interpretarWebhookYCloud({
      id: 'evt_2',
      type: 'whatsapp.smb.message.echoes',
      whatsappMessage: { id: 'm2', wamid: 'wamid.ECO', from: '+17868782085', to: '+17865550000', type: 'text', text: { body: 'Soy Carlos' }, sendTime: '2026-11-05T20:01:00.000Z' },
    });
    expect(ev).toEqual([{ tipo: 'eco', id: 'wamid.ECO', para: '17865550000', ts: new Date('2026-11-05T20:01:00.000Z'), texto: 'Soy Carlos' }]);
  });

  test('ignora estados de entrega y cuerpos raros', () => {
    expect(interpretarWebhookYCloud({ type: 'whatsapp.message.updated', whatsappMessage: { id: 'x' } })).toEqual([]);
    expect(interpretarWebhookYCloud(null)).toEqual([]);
    expect(interpretarWebhookYCloud(entrante({ from: undefined }))).toEqual([]);
  });

  test('firma YCloud-Signature: válida, alterada, vieja y mal formada', () => {
    const cuerpo = '{"id":"evt_1"}';
    const t = 1_793_000_000;
    const ahora = t * 1000;
    const cab = firmar(cuerpo, 'secreto', t);
    expect(firmaYCloudValida(cuerpo, cab, 'secreto', ahora)).toBe(true);
    expect(firmaYCloudValida(cuerpo + ' ', cab, 'secreto', ahora)).toBe(false);
    expect(firmaYCloudValida(cuerpo, cab, 'otro', ahora)).toBe(false);
    expect(firmaYCloudValida(cuerpo, cab, 'secreto', ahora + 301_000)).toBe(false);
    expect(firmaYCloudValida(cuerpo, undefined, 'secreto', ahora)).toBe(false);
    expect(firmaYCloudValida(cuerpo, 't=abc,s=zz', 'secreto', ahora)).toBe(false);
  });
});

describe('envío por YCloud', () => {
  test('arma el cuerpo con from/to en E.164 y formato nativo de WhatsApp', () => {
    expect(cuerpoYCloud('+1 (786) 878-2085', '17865550000', { clase: 'texto', texto: 'hola' })).toEqual({
      from: '+17868782085',
      to: '+17865550000',
      type: 'text',
      text: { body: 'hola', preview_url: true },
    });
    const b = cuerpoYCloud('+17868782085', '17865550000', { clase: 'botones', texto: 'x', botones: [{ id: 'SI', titulo: 'Sí' }] });
    expect(b).toMatchObject({ type: 'interactive', interactive: { type: 'button', action: { buttons: [{ type: 'reply', reply: { id: 'SI', title: 'Sí' } }] } } });
    expect(b).not.toHaveProperty('messaging_product');
  });

  test('envía con X-API-Key y falla si YCloud responde status failed', async () => {
    const llamadas: { url: string; init: RequestInit }[] = [];
    let respuesta = { id: 'm1', status: 'accepted' } as Record<string, unknown>;
    const f = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, init });
      return new Response(JSON.stringify(respuesta));
    }) as unknown as typeof fetch;
    const api = new YCloudApi({ apiKey: 'clave', numero: '+17868782085' }, f);
    await api.enviar('17865550000', { clase: 'texto', texto: 'hola' });
    expect(llamadas[0]?.url).toBe('https://api.ycloud.com/v2/whatsapp/messages/sendDirectly');
    expect((llamadas[0]?.init.headers as Record<string, string>)['X-API-Key']).toBe('clave');

    respuesta = { id: 'm2', status: 'failed', errorCode: '131047', errorMessage: 'Re-engagement message' };
    await expect(api.enviar('17865550000', { clase: 'texto', texto: 'hola' })).rejects.toThrow(/131047/);
  });

  test('error HTTP se propaga', async () => {
    const f = (async () => new Response('{"error":{"code":"x"}}', { status: 400 })) as unknown as typeof fetch;
    await expect(new YCloudApi({ apiKey: 'k', numero: '+1' }, f).enviar('1', { clase: 'texto', texto: 'x' })).rejects.toThrow(/YCloud 400/);
  });
});

describe('servidor con WA_PROVEEDOR=ycloud', () => {
  const config = configPorDefecto({ WA_PROVEEDOR: 'ycloud', YCLOUD_WEBHOOK_SECRET: 'secreto' });
  const t = 1_793_000_000;

  test('firma válida → procesa el mensaje; inválida → 401', async () => {
    const recibidos: Entrante[] = [];
    const app = crearServidor({ config, procesar: async (e) => void recibidos.push(e), ahora: () => t * 1000 });
    const cuerpo = JSON.stringify(entrante({ type: 'text', text: { body: 'hola' } }));

    const ok = await app.request('/webhook', { method: 'POST', body: cuerpo, headers: { 'YCloud-Signature': firmar(cuerpo, 'secreto', t) } });
    expect(ok.status).toBe(200);
    expect(recibidos).toHaveLength(1);

    const mal = await app.request('/webhook', { method: 'POST', body: cuerpo, headers: { 'YCloud-Signature': firmar(cuerpo, 'otro', t) } });
    expect(mal.status).toBe(401);
    expect(recibidos).toHaveLength(1);
  });

  test('la verificación GET de Meta no aplica con YCloud', async () => {
    const app = crearServidor({ config: { ...config, WA_VERIFY_TOKEN: 'x' }, procesar: async () => {} });
    const r = await app.request('/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=123');
    expect(r.status).toBe(403);
  });
});

describe('reenvío de fotos por YCloud', () => {
  test('descarga el enlace con la API key, sube el archivo y lo envía por id', async () => {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      if (url.includes('/media/download/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
      if (url.includes('/upload')) return new Response(JSON.stringify({ id: 'subida-1' }));
      return new Response(JSON.stringify({ status: 'accepted' }));
    }) as unknown as typeof fetch;
    const api = new YCloudApi({ apiKey: 'k', numero: '+17868782085' }, f);
    await api.reenviarImagen('17860000000', 'https://api.ycloud.com/v2/whatsapp/media/download/1?sig=x', 'Foto de +1786');

    expect(llamadas[0]!.url).toContain('/media/download/1');
    expect((llamadas[0]!.init?.headers as Record<string, string>)['X-API-Key']).toBe('k');
    expect(llamadas[1]!.url).toBe('https://api.ycloud.com/v2/whatsapp/media/%2B17868782085/upload');
    expect(llamadas[1]!.init?.body).toBeInstanceOf(FormData);
    expect(JSON.parse(String(llamadas[2]!.init?.body))).toMatchObject({ to: '+17860000000', type: 'image', image: { id: 'subida-1' } });
  });

  test('la API key nunca viaja a otro dominio ni por HTTP', async () => {
    const llamadas: string[] = [];
    const f = (async (url: string) => {
      llamadas.push(url);
      return new Response('x');
    }) as unknown as typeof fetch;
    const api = new YCloudApi({ apiKey: 'clave-ficticia', numero: '+1' }, f);
    await expect(api.reenviarImagen('1', 'https://atacante.example/robar')).rejects.toThrow('no permitido');
    await expect(api.reenviarImagen('1', 'https://api.ycloud.com.atacante.example/x')).rejects.toThrow('no permitido');
    await expect(api.reenviarImagen('1', 'http://api.ycloud.com/x')).rejects.toThrow();
    expect(llamadas).toEqual([]);
  });

  test('una redirección se sigue sin la API key', async () => {
    const llamadas: { url: string; init?: RequestInit }[] = [];
    const f = (async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      if (url.includes('/media/download/')) return new Response(null, { status: 302, headers: { location: 'https://cdn.otro.example/a.jpg' } });
      if (url.includes('cdn.otro.example')) return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } });
      if (url.includes('/upload')) return new Response(JSON.stringify({ id: 'm1' }));
      return new Response('{}');
    }) as unknown as typeof fetch;
    await new YCloudApi({ apiKey: 'k', numero: '+1' }, f).reenviarImagen('1', 'https://api.ycloud.com/v2/whatsapp/media/download/9');
    expect(llamadas[0]!.init?.redirect).toBe('manual');
    expect(llamadas[1]!.url).toBe('https://cdn.otro.example/a.jpg');
    expect(llamadas[1]!.init?.headers).toBeUndefined();
  });

  test('sin enlace de descarga falla (el motor lo registra y sigue)', async () => {
    const api = new YCloudApi({ apiKey: 'k', numero: '+1' }, (async () => new Response('{}')) as unknown as typeof fetch);
    await expect(api.reenviarImagen('1', 'media-sin-link')).rejects.toThrow('enlace');
  });
});
