import type { LecturaDivisas } from './divisas.js';
import { errorATexto, log } from '../log.js';

const BASE = 'https://cash165.wixsite.com/website';
const PAGINAS = {
  compra: BASE + '/tasa-de-cambio',
  venta: BASE + '/copia-de-tasas-de-cambio-compra',
} as const;

const MONEDAS = new Map([
  ['euro', 'EUR'],
  ['dolarcanadie', 'CAD'],
  ['dolarcanadiense', 'CAD'],
  ['libraesterlina', 'GBP'],
  ['dolaraustra', 'AUD'],
  ['dolaraustral', 'AUD'],
  ['dolaraustraliano', 'AUD'],
  ['francosuizo', 'CHF'],
  ['realbrasilero', 'BRL'],
  ['realbrasileno', 'BRL'],
  ['pesocolomb', 'COP'],
  ['pesocolombia', 'COP'],
  ['pesocolombiano', 'COP'],
  ['pesomexicano', 'MXN'],
]);

type Operacion = keyof typeof PAGINAS;

function leerTasas(html: string, operacion: Operacion): Map<string, number> {
  const titulo = html.match(/<title>\s*Precio de (compra|venta)\b/i)?.[1]?.toLowerCase();
  const contenido = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1];
  if (titulo !== operacion || !contenido) return new Map();

  const tasas = new Map<string, number>();
  const ambiguas = new Set<string>();
  // Wix guarda el importe y su unidad en un mismo bloque de texto.
  for (const [, bloque = ''] of contenido.matchAll(/<div\b[^>]*\bdata-testid="richTextElement"[^>]*>([\s\S]*?)<\/div>/gi)) {
    const texto = bloque
      .replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|#160|#x0*a0);/gi, ' ')
      .replace(/&([aeiou])acute;/gi, '$1')
      .replace(/[\u200b-\u200d\ufeff]/g, '')
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .trim();
    const fila = texto.match(/^\$\s*(\d+(?:\.\d+)?)\s+dolares\s+por?\s+(?:1\s+)?([a-z\s]+)\.?$/);
    if (!fila) continue;

    const [, importe, etiqueta = ''] = fila;
    const moneda = MONEDAS.get(etiqueta.replace(/\s/g, ''));
    const precio = Number(importe);
    if (!moneda || !Number.isFinite(precio) || precio <= 0 || ambiguas.has(moneda)) continue;

    const anterior = tasas.get(moneda);
    if (anterior !== undefined && anterior !== precio) {
      ambiguas.add(moneda);
      tasas.delete(moneda);
    } else {
      tasas.set(moneda, precio);
    }
  }
  return tasas;
}

export class FuenteDivisasWix {
  private cache?: { venceEn: number; lectura: Promise<LecturaDivisas> };

  constructor(private readonly f: typeof fetch = fetch) {}

  obtener(ahora = new Date()): Promise<LecturaDivisas> {
    if (!this.cache || ahora.getTime() >= this.cache.venceEn) {
      const lectura = this.leer().then((resultado) => {
        if (resultado.estado === 'consultar' && this.cache?.lectura === lectura) this.cache = undefined;
        return resultado;
      });
      this.cache = { venceEn: ahora.getTime() + 5 * 60_000, lectura };
    }
    return this.cache.lectura;
  }

  private async leer(): Promise<LecturaDivisas> {
    try {
      const [compras, ventas] = await Promise.all([this.leerPagina('compra'), this.leerPagina('venta')]);
      const tasas = [...compras].flatMap(([moneda, compra]) => {
        const venta = ventas.get(moneda);
        return venta !== undefined && venta >= compra ? [{ moneda, compra, venta }] : [];
      });
      if (tasas.length) return { estado: 'referencial', tasas };
      log.warn('divisas wix: no se encontraron pares de compra y venta');
    } catch (e) {
      log.warn('divisas wix: error de lectura', { error: errorATexto(e) });
    }
    return { estado: 'consultar', motivo: 'no se pudieron leer las tasas publicadas' };
  }

  private async leerPagina(operacion: Operacion): Promise<Map<string, number>> {
    const respuesta = await this.f(PAGINAS[operacion], { signal: AbortSignal.timeout(5000) });
    if (!respuesta.ok) throw new Error(operacion + ' HTTP ' + respuesta.status);
    return leerTasas(await respuesta.text(), operacion);
  }
}
