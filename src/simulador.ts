/**
 * Chat de prueba por consola, sin WhatsApp. Usa datos reales del sitio y la IA si hay ANTHROPIC_API_KEY.
 *   npm run simular
 * Escriba texto normal; para tocar un botón o fila escriba su número (ej. "2").
 * Comandos: /foto, /audio, /eco <texto> (simula al asesor escribiendo desde la app), /salir
 */
import { createInterface } from 'node:readline/promises';
import { armarMotor } from './armar.js';
import { cargarConfig } from './config.js';
import type { Contenido, ProveedorWhatsApp, Saliente } from './whatsapp/tipos.js';

const TEL = '15550000000';
let opciones: { id: string; titulo: string }[] = [];

const consola: ProveedorWhatsApp = {
  async enviar(para, m: Saliente) {
    if (para !== TEL) {
      console.log(`\n\x1b[35m[→ asesor ${para}]\n${'texto' in m ? m.texto : ''}\x1b[0m`);
      return;
    }
    const bot = (s: string) => console.log(`\n\x1b[36m${s}\x1b[0m`);
    switch (m.clase) {
      case 'texto':
        bot(m.texto);
        break;
      case 'imagen':
        bot(`🖼  ${m.url}\n${m.caption ?? ''}`);
        break;
      case 'botones':
        opciones = m.botones;
        bot(`${m.texto}\n${m.botones.map((b, i) => `  [${i + 1}] ${b.titulo}`).join('\n')}`);
        break;
      case 'lista':
        opciones = m.secciones.flatMap((s) => s.filas);
        bot(`${m.texto}\n${opciones.map((f, i) => `  ${i + 1}. ${f.titulo}`).join('\n')}`);
        break;
    }
  },
};

process.env.NODE_ENV ??= 'test'; // silencia logs informativos
const config = cargarConfig({ ...process.env, DATABASE_URL: '', ASESOR_WHATSAPP: process.env.ASESOR_WHATSAPP ?? '15559999999' });
const { motor } = armarMotor(config, consola);
const rl = createInterface({ input: process.stdin, output: process.stdout });
let n = 0;

const prompt = () => process.stdout.write('\n\x1b[33mUsted> \x1b[0m');
console.log('Simulador Franky\'s Efectivo. Escriba "hola" para empezar. /salir para terminar.');
prompt();
for await (const bruta of rl) {
  const linea = bruta.trim();
  if (!process.stdin.isTTY) console.log(linea);
  if (linea === '/salir') break;
  if (!linea) {
    prompt();
    continue;
  }
  const id = `sim-${++n}`;
  if (linea.startsWith('/eco')) {
    await motor.procesar({ tipo: 'eco', id, para: TEL, ts: new Date(), texto: linea.slice(4).trim() || 'Hola, le atiende un asesor' });
    console.log('(asesor escribió desde la app)');
    prompt();
    continue;
  }
  let contenido: Contenido;
  const num = Number(linea);
  if (Number.isInteger(num) && opciones[num - 1]) contenido = { clase: 'opcion', ...opciones[num - 1]! };
  else if (linea === '/foto') contenido = { clase: 'imagen', mediaId: `media-${n}` };
  else if (linea === '/audio') contenido = { clase: 'audio' };
  else contenido = { clase: 'texto', texto: linea };
  await motor.procesar({ tipo: 'mensaje', id, de: TEL, nombre: 'Prueba', ts: new Date(), contenido });
  prompt();
}
rl.close();
process.exit(0);
