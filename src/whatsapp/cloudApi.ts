import { createHmac, timingSafeEqual } from 'node:crypto';
import { log } from '../log.js';
import { recortar, type Contenido, type Entrante, type ProveedorWhatsApp, type Saliente } from './tipos.js';

/**
 * Adaptador de WhatsApp Cloud API (Meta) directo.
 * Se usa para la demo con el número de prueba de Meta y para migrar luego a Tech Provider propio.
 */

type Fetch = typeof fetch;

export interface OpcionesCloud {
  token: string;
  phoneNumberId: string;
  graphVersion: string;
}

export class CloudApi implements ProveedorWhatsApp {
  constructor(
    private readonly o: OpcionesCloud,
    private readonly f: Fetch = fetch,
  ) {}

  async enviar(para: string, m: Saliente): Promise<void> {
    const url = `https://graph.facebook.com/${this.o.graphVersion}/${this.o.phoneNumberId}/messages`;
    const res = await this.f(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.o.token}`, 'content-type': 'application/json' },
      body: JSON.stringify(cuerpoCloud(para, m)),
    });
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      throw new Error(`Cloud API ${res.status}: ${detalle.slice(0, 500)}`);
    }
  }
}

export function cuerpoCloud(para: string, m: Saliente): Record<string, unknown> {
  const base = { messaging_product: 'whatsapp', recipient_type: 'individual', to: para };
  switch (m.clase) {
    case 'texto':
      return { ...base, type: 'text', text: { body: recortar(m.texto, 4096), preview_url: true } };
    case 'imagen':
      return { ...base, type: 'image', image: { link: m.url, caption: m.caption ? recortar(m.caption, 1024) : undefined } };
    case 'botones':
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: recortar(m.texto, 1024) },
          action: {
            buttons: m.botones.slice(0, 3).map((b) => ({ type: 'reply', reply: { id: b.id, title: recortar(b.titulo, 20) } })),
          },
        },
      };
    case 'lista': {
      let restantes = 10;
      const secciones = m.secciones
        .map((s) => {
          const filas = s.filas.slice(0, Math.max(0, restantes));
          restantes -= filas.length;
          return {
            title: recortar(s.titulo, 24),
            rows: filas.map((f) => ({
              id: recortar(f.id, 200),
              title: recortar(f.titulo, 24),
              description: f.descripcion ? recortar(f.descripcion, 72) : undefined,
            })),
          };
        })
        .filter((s) => s.rows.length > 0);
      return {
        ...base,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: recortar(m.texto, 4096) },
          action: { button: recortar(m.boton, 20), sections: secciones },
        },
      };
    }
  }
}

/** Verifica X-Hub-Signature-256 (HMAC-SHA256 del cuerpo crudo con el App Secret). */
export function firmaValida(cuerpoCrudo: string, firma: string | undefined, appSecret: string): boolean {
  if (!firma?.startsWith('sha256=')) return false;
  const esperada = createHmac('sha256', appSecret).update(cuerpoCrudo, 'utf8').digest('hex');
  const a = Buffer.from(firma.slice(7), 'hex');
  const b = Buffer.from(esperada, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

function contenidoDe(m: Json): Contenido {
  switch (m.type) {
    case 'text':
      return { clase: 'texto', texto: String(m.text?.body ?? '') };
    case 'interactive': {
      const r = m.interactive?.button_reply ?? m.interactive?.list_reply;
      if (r?.id) return { clase: 'opcion', id: String(r.id), titulo: String(r.title ?? '') };
      return { clase: 'otro', detalle: 'interactive' };
    }
    case 'button': // respuesta rápida de plantilla
      return { clase: 'opcion', id: String(m.button?.payload ?? ''), titulo: String(m.button?.text ?? '') };
    case 'image':
      return { clase: 'imagen', mediaId: String(m.image?.id ?? ''), caption: m.image?.caption };
    case 'audio':
      return { clase: 'audio' };
    default:
      return { clase: 'otro', detalle: String(m.type) };
  }
}

/** Convierte el cuerpo del webhook en eventos internos. Ignora estados de entrega. */
export function interpretarWebhook(cuerpo: unknown): Entrante[] {
  const eventos: Entrante[] = [];
  const entradas = (cuerpo as Json)?.entry;
  if (!Array.isArray(entradas)) return eventos;
  for (const entrada of entradas) {
    for (const cambio of entrada?.changes ?? []) {
      const v = cambio?.value ?? {};
      if (cambio?.field === 'messages') {
        const nombres = new Map<string, string>();
        for (const c of v.contacts ?? []) if (c?.wa_id) nombres.set(String(c.wa_id), String(c.profile?.name ?? ''));
        for (const m of v.messages ?? []) {
          if (!m?.id || !m?.from) continue;
          eventos.push({
            tipo: 'mensaje',
            id: String(m.id),
            de: String(m.from),
            nombre: nombres.get(String(m.from)) || undefined,
            ts: new Date(Number(m.timestamp ?? 0) * 1000),
            contenido: contenidoDe(m),
          });
        }
      } else if (cambio?.field === 'smb_message_echoes') {
        // Coexistence: lo que el asesor escribió desde la app.
        for (const m of v.message_echoes ?? []) {
          if (!m?.id || !m?.to) continue;
          eventos.push({
            tipo: 'eco',
            id: String(m.id),
            para: String(m.to),
            ts: new Date(Number(m.timestamp ?? 0) * 1000),
            texto: m.type === 'text' ? String(m.text?.body ?? '') : undefined,
          });
        }
      } else if (cambio?.field !== undefined) {
        log.debug('webhook: campo ignorado', { campo: cambio.field });
      }
    }
  }
  return eventos;
}
