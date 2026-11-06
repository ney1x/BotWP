import { createHmac } from 'node:crypto';
import { describe, expect, test } from 'vitest';
import { cuerpoCloud, firmaValida, interpretarWebhook } from '../src/whatsapp/cloudApi.js';

const envoltura = (field: string, value: unknown) => ({ object: 'whatsapp_business_account', entry: [{ id: '1', changes: [{ field, value }] }] });

describe('webhook de Cloud API', () => {
  test('texto, botón, lista, imagen y audio', () => {
    const cuerpo = envoltura('messages', {
      contacts: [{ wa_id: '17865550000', profile: { name: 'Ana' } }],
      messages: [
        { from: '17865550000', id: 'm1', timestamp: '1762300000', type: 'text', text: { body: 'hola' } },
        { from: '17865550000', id: 'm2', timestamp: '1762300001', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'SI', title: 'Sí' } } },
        { from: '17865550000', id: 'm3', timestamp: '1762300002', type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'MENU_ORO', title: 'Precio del oro' } } },
        { from: '17865550000', id: 'm4', timestamp: '1762300003', type: 'image', image: { id: 'media1', caption: 'mi reloj' } },
        { from: '17865550000', id: 'm5', timestamp: '1762300004', type: 'audio', audio: { id: 'a1' } },
      ],
    });
    const ev = interpretarWebhook(cuerpo);
    expect(ev).toHaveLength(5);
    expect(ev[0]).toMatchObject({ tipo: 'mensaje', de: '17865550000', nombre: 'Ana', contenido: { clase: 'texto', texto: 'hola' } });
    expect(ev[1]).toMatchObject({ contenido: { clase: 'opcion', id: 'SI' } });
    expect(ev[2]).toMatchObject({ contenido: { clase: 'opcion', id: 'MENU_ORO' } });
    expect(ev[3]).toMatchObject({ contenido: { clase: 'imagen', mediaId: 'media1' } });
    expect(ev[4]).toMatchObject({ contenido: { clase: 'audio' } });
  });

  test('ignora estados de entrega y cuerpos raros', () => {
    expect(interpretarWebhook(envoltura('messages', { statuses: [{ id: 'x', status: 'read' }] }))).toEqual([]);
    expect(interpretarWebhook(null)).toEqual([]);
    expect(interpretarWebhook({ entry: 'x' })).toEqual([]);
  });

  test('eco del asesor desde la app (Coexistence)', () => {
    const ev = interpretarWebhook(
      envoltura('smb_message_echoes', {
        message_echoes: [{ from: '17868782085', to: '17865550000', id: 'e1', timestamp: '1762300100', type: 'text', text: { body: 'Hola, soy Carlos' } }],
      }),
    );
    expect(ev).toEqual([{ tipo: 'eco', id: 'e1', para: '17865550000', ts: new Date(1762300100 * 1000), texto: 'Hola, soy Carlos' }]);
  });

  test('firma HMAC', () => {
    const cuerpo = '{"a":1}';
    const firma = 'sha256=' + createHmac('sha256', 'secreto').update(cuerpo).digest('hex');
    expect(firmaValida(cuerpo, firma, 'secreto')).toBe(true);
    expect(firmaValida(cuerpo + ' ', firma, 'secreto')).toBe(false);
    expect(firmaValida(cuerpo, undefined, 'secreto')).toBe(false);
    expect(firmaValida(cuerpo, 'sha256=abc', 'secreto')).toBe(false);
  });

  test('respeta los límites de WhatsApp al armar botones y listas', () => {
    const b = cuerpoCloud('1', {
      clase: 'botones',
      texto: 'x',
      botones: [1, 2, 3, 4].map((i) => ({ id: `b${i}`, titulo: 'Un título demasiado largo para botón' })),
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(b.interactive.action.buttons).toHaveLength(3);
    expect([...b.interactive.action.buttons[0].reply.title].length).toBeLessThanOrEqual(20);

    const l = cuerpoCloud('1', {
      clase: 'lista',
      texto: 'x',
      boton: 'Ver',
      secciones: [
        { titulo: 'A', filas: Array.from({ length: 8 }, (_, i) => ({ id: `a${i}`, titulo: `Fila ${i}` })) },
        { titulo: 'B', filas: Array.from({ length: 8 }, (_, i) => ({ id: `b${i}`, titulo: `Fila ${i}` })) },
      ],
    }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
    const filas = l.interactive.action.sections.flatMap((s: { rows: unknown[] }) => s.rows);
    expect(filas).toHaveLength(10);
  });
});
