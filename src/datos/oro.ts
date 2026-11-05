import { log, errorATexto } from '../log.js';
import { quilatesDeClave, validarTarifa, type Tarifa } from '../precios/validarTarifa.js';

export type LecturaOro =
  | { ok: true; tarifa: Tarifa; leidaEn: Date }
  | { ok: false; motivo: string };

type Fetch = typeof fetch;

/**
 * Lee la tarifa pública de la calculadora del sitio (USD por gramo).
 * Cachea 15 min. Si una lectura nueva no pasa validación, NO se usa: se pasa a asesor.
 * Si la red falla, se sigue usando la última buena hasta 2 h.
 */
export class FuenteOro {
  private ultimaBuena?: { tarifa: Tarifa; leidaEn: Date };
  private ultimoIntento = 0;
  private ultimoError?: string;

  constructor(
    private readonly url: string,
    private readonly f: Fetch = fetch,
    private readonly ttlMs = 15 * 60 * 1000,
    private readonly maxViejaMs = 2 * 60 * 60 * 1000,
  ) {}

  async obtener(ahora = new Date()): Promise<LecturaOro> {
    const cacheFresca = this.ultimaBuena && ahora.getTime() - this.ultimaBuena.leidaEn.getTime() < this.ttlMs;
    if (cacheFresca) return { ok: true, ...this.ultimaBuena! };
    if (ahora.getTime() - this.ultimoIntento < 60_000 && this.ultimoError) return this.respaldo(ahora);

    this.ultimoIntento = ahora.getTime();
    try {
      const res = await this.f(this.url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw: unknown = await res.json();
      const r = validarTarifa(raw, this.ultimaBuena ? { anterior: this.ultimaBuena.tarifa } : {});
      if (!r.ok) {
        // Dato raro: no cotizar con él ni con el viejo.
        this.ultimoError = `tarifa inválida: ${r.errores.join('; ')}`;
        log.warn('oro: tarifa inválida', { errores: r.errores });
        return { ok: false, motivo: this.ultimoError };
      }
      this.ultimaBuena = { tarifa: r.tarifa, leidaEn: ahora };
      this.ultimoError = undefined;
      return { ok: true, ...this.ultimaBuena };
    } catch (e) {
      this.ultimoError = `no se pudo leer: ${errorATexto(e)}`;
      log.warn('oro: error de lectura', { error: this.ultimoError });
      return this.respaldo(ahora);
    }
  }

  private respaldo(ahora: Date): LecturaOro {
    if (this.ultimaBuena && ahora.getTime() - this.ultimaBuena.leidaEn.getTime() < this.maxViejaMs) {
      return { ok: true, ...this.ultimaBuena };
    }
    return { ok: false, motivo: this.ultimoError ?? 'sin datos' };
  }
}

export type Estimacion = { ok: true; usd: number; precioGramo: number } | { ok: false; motivo: string };

export function estimarOro(tarifa: Tarifa, gramos: number, quilates: number): Estimacion {
  if (!Number.isFinite(gramos) || gramos <= 0 || gramos > 5000) return { ok: false, motivo: 'gramos inválidos' };
  const precio = tarifa[`${quilates}k`];
  if (precio === undefined) return { ok: false, motivo: `no hay precio publicado para ${quilates}k` };
  return { ok: true, usd: Math.round(precio * gramos * 100) / 100, precioGramo: precio };
}

export function tablaOro(tarifa: Tarifa): string {
  return Object.entries(tarifa)
    .sort((a, b) => (quilatesDeClave(b[0]) ?? 0) - (quilatesDeClave(a[0]) ?? 0))
    .map(([k, v]) => `• ${k.toUpperCase()}: $${v} por gramo`)
    .join('\n');
}

/** Extrae "5 g de 18k", "18k 3.5 gramos", "3,5gr 14 kilates". */
export function interpretarPeso(texto: string): { gramos: number; quilates: number } | null {
  const t = texto.toLowerCase().replace(',', '.');
  const g = /(\d+(?:\.\d+)?)\s*(?:g|gr|grs|gramos?)\b/.exec(t);
  const k = /(\d{1,2})\s*(?:k|kt|kts|kilates?|quilates?)\b/.exec(t);
  if (!g || !k) return null;
  return { gramos: Number(g[1]), quilates: Number(k[1]) };
}
