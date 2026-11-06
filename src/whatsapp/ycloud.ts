import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from '../log.js';
import { contenidoDe, cuerpoCloud } from './cloudApi.js';
import type { Entrante, ProveedorWhatsApp, Saliente } from './tipos.js';

/**
 * Adaptador de YCloud (BSP) para producción con Coexistence.
 * Docs: https://docs.ycloud.com/api-reference/whatsapp-messages/send-a-message-directly.md
 */

type Fetch = typeof fetch;
type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export interface OpcionesYCloud {
  apiKey: string;
  /** Número del negocio en E.164, ej. +17868782085. */
  numero: string;
  url?: string;
}

/** Internamente los teléfonos van solo con dígitos (como los da Cloud API). */
export const soloDigitos = (tel: string) => tel.replace(/\D/g, '');
const e164 = (tel: string) => `+${soloDigitos(tel)}`;

export class YCloudApi implements ProveedorWhatsApp {
  constructor(
    private readonly o: OpcionesYCloud,
    private readonly f: Fetch = fetch,
  ) {}

  async enviar(para: string, m: Saliente): Promise<void> {
    const res = await this.f(this.o.url ?? 'https://api.ycloud.com/v2/whatsapp/messages/sendDirectly', {
      method: 'POST',
      headers: { 'X-API-Key': this.o.apiKey, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpoYCloud(this.o.numero, para, m)),
    });
    const texto = await res.text().catch(() => '');
    if (!res.ok) throw new Error(`YCloud ${res.status}: ${texto.slice(0, 500)}`);
    try {
      const r = JSON.parse(texto) as Json;
      if (r.status === 'failed') throw new Error(`YCloud falló: ${r.errorCode ?? ''} ${r.errorMessage ?? ''}`.trim());
    } catch (e) {
      if (e instanceof SyntaxError) return; // respuesta sin JSON: se da por enviada
      throw e;
    }
  }
}

/** Mismo contenido que Cloud API, con `from`/`to` en E.164 y sin los campos propios de Meta. */
export function cuerpoYCloud(numero: string, para: string, m: Saliente): Record<string, unknown> {
  const { messaging_product: _mp, recipient_type: _rt, to: _to, ...contenido } = cuerpoCloud(para, m);
  return { from: e164(numero), to: e164(para), ...contenido };
}

/**
 * Verifica `YCloud-Signature: t=<unix>,s=<hex>` = HMAC-SHA256(secreto, `${t}.${cuerpo}`).
 * Rechaza firmas con más de `toleranciaSeg` de diferencia (protección contra repetición).
 */
export function firmaYCloudValida(
  cuerpoCrudo: string,
  cabecera: string | undefined,
  secreto: string,
  ahoraMs = Date.now(),
  toleranciaSeg = 300,
): boolean {
  if (!cabecera) return false;
  const partes = Object.fromEntries(
    cabecera.split(',').map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).trim(), p.slice(i + 1).trim()];
    }),
  );
  const t = partes.t;
  const s = partes.s;
  if (!t || !s || !/^\d+$/.test(t) || !/^[0-9a-f]+$/i.test(s)) return false;
  if (Math.abs(Math.floor(ahoraMs / 1000) - Number(t)) > toleranciaSeg) return false;
  const esperada = createHmac('sha256', secreto).update(`${t}.`).update(cuerpoCrudo, 'utf8').digest();
  const recibida = Buffer.from(s, 'hex');
  return recibida.length === esperada.length && timingSafeEqual(recibida, esperada);
}

/** Eventos de webhook de YCloud → eventos internos. Ignora estados de entrega y otros tipos. */
export function interpretarWebhookYCloud(cuerpo: unknown): Entrante[] {
  const e = cuerpo as Json;
  if (!e || typeof e !== 'object') return [];

  if (e.type === 'whatsapp.inbound_message.received') {
    const m = e.whatsappInboundMessage as Json | undefined;
    if (!m?.from || !(m.wamid || m.id)) return [];
    return [
      {
        tipo: 'mensaje',
        id: String(m.wamid ?? m.id),
        de: soloDigitos(String(m.from)),
        nombre: m.customerProfile?.name ? String(m.customerProfile.name) : undefined,
        ts: new Date(m.sendTime ?? e.createTime ?? Date.now()),
        contenido: contenidoDe(m),
      },
    ];
  }

  // Coexistence: lo que el asesor escribió desde la app WhatsApp Business.
  if (e.type === 'whatsapp.smb.message.echoes') {
    const m = e.whatsappMessage as Json | undefined;
    if (!m?.to || !(m.wamid || m.id)) return [];
    return [
      {
        tipo: 'eco',
        id: String(m.wamid ?? m.id),
        para: soloDigitos(String(m.to)),
        ts: new Date(m.sendTime ?? m.createTime ?? e.createTime ?? Date.now()),
        texto: m.type === 'text' ? String(m.text?.body ?? '') : undefined,
      },
    ];
  }

  if (e.type) log.debug('ycloud: evento ignorado', { tipo: e.type });
  return [];
}
