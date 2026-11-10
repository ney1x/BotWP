import { DateTime } from 'luxon';
import { vigenteHasta, type OpcionesHorario } from '../horario.js';
import { log, errorATexto } from '../log.js';

export interface CotizacionDivisa {
  moneda: string;
  compra: number;
  venta: number;
}

export interface Tasa extends CotizacionDivisa {
  confirmadaEn: Date;
}

export type LecturaDivisas =
  | { estado: 'vigente'; tasas: Tasa[] }
  | { estado: 'referencial'; tasas: CotizacionDivisa[] }
  | { estado: 'consultar'; motivo: string };

type Fetch = typeof fetch;

/** CSV mínimo con soporte de comillas dobles. */
export function parsearCsv(texto: string): string[][] {
  const filas: string[][] = [];
  for (const linea of texto.replace(/\r/g, '').split('\n')) {
    if (!linea.trim()) continue;
    const celdas: string[] = [];
    let actual = '';
    let comillas = false;
    for (let i = 0; i < linea.length; i++) {
      const c = linea[i];
      if (comillas) {
        if (c === '"' && linea[i + 1] === '"') {
          actual += '"';
          i++;
        } else if (c === '"') comillas = false;
        else actual += c;
      } else if (c === '"') comillas = true;
      else if (c === ',') {
        celdas.push(actual.trim());
        actual = '';
      } else actual += c;
    }
    celdas.push(actual.trim());
    filas.push(celdas);
  }
  return filas;
}

const numero = (s: string | undefined) => {
  if (!s) return NaN;
  return Number(s.replace(/[$\s]/g, '').replace(',', '.'));
};

/**
 * Planilla (Google Sheets publicada como CSV) que edita el negocio:
 *   moneda,compra,venta,confirmado
 *   EUR,1.10,1.18,2026-11-05 09:15
 * `confirmado` es fecha y hora de Miami. Una fila vale hasta la siguiente apertura + 1 h.
 */
export function interpretarDivisas(csv: string, ahora: Date, horario: OpcionesHorario): LecturaDivisas {
  const filas = parsearCsv(csv);
  const cabecera = filas.shift()?.map((c) => c.toLowerCase());
  if (!cabecera) return { estado: 'consultar', motivo: 'planilla vacía' };
  const idx = (n: string) => cabecera.indexOf(n);
  const [iM, iC, iV, iF] = [idx('moneda'), idx('compra'), idx('venta'), idx('confirmado')];
  if ([iM, iC, iV, iF].some((i) => i < 0)) return { estado: 'consultar', motivo: 'faltan columnas' };

  const tasas: Tasa[] = [];
  for (const f of filas) {
    const moneda = f[iM]?.toUpperCase();
    const compra = numero(f[iC]);
    const venta = numero(f[iV]);
    const fecha = DateTime.fromFormat(f[iF] ?? '', 'yyyy-MM-dd H:mm', { zone: horario.zona });
    const confirmada = fecha.isValid ? fecha : DateTime.fromISO(f[iF] ?? '', { zone: horario.zona });
    if (!moneda || !(compra > 0) || !(venta > 0) || !confirmada.isValid) continue;
    const confirmadaEn = confirmada.toJSDate();
    if (confirmadaEn > ahora) continue; // fecha futura = error de tipeo
    if (ahora >= vigenteHasta(confirmadaEn, horario)) continue; // vencida
    tasas.push({ moneda, compra, venta, confirmadaEn });
  }
  if (tasas.length === 0) return { estado: 'consultar', motivo: 'tasas sin confirmar hoy' };
  return { estado: 'vigente', tasas };
}

export class FuenteDivisas {
  private cache?: { csv: string; leidoEn: number };

  constructor(
    private readonly url: string | undefined,
    private readonly horario: OpcionesHorario,
    private readonly f: Fetch = fetch,
    private readonly ttlMs = 5 * 60 * 1000,
  ) {}

  async obtener(ahora = new Date()): Promise<LecturaDivisas> {
    if (!this.url) return { estado: 'consultar', motivo: 'planilla no configurada' };
    if (!this.cache || ahora.getTime() - this.cache.leidoEn > this.ttlMs) {
      try {
        const res = await this.f(this.url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        this.cache = { csv: await res.text(), leidoEn: ahora.getTime() };
      } catch (e) {
        log.warn('divisas: error de lectura', { error: errorATexto(e) });
        if (!this.cache) return { estado: 'consultar', motivo: 'no se pudo leer la planilla' };
      }
    }
    return interpretarDivisas(this.cache.csv, ahora, this.horario);
  }
}
