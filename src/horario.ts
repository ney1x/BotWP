import { DateTime } from 'luxon';

/** Horario de atención: lunes a sábado 9:00–18:30 (hora de Miami). Domingo y feriados cerrado. */
export const HORARIO = {
  dias: [1, 2, 3, 4, 5, 6], // luxon: 1 = lunes … 7 = domingo
  abre: { hour: 9, minute: 0 },
  cierra: { hour: 18, minute: 30 },
} as const;

export interface OpcionesHorario {
  zona: string;
  feriados: string[]; // YYYY-MM-DD
}

function enZona(fecha: Date, o: OpcionesHorario): DateTime {
  return DateTime.fromJSDate(fecha, { zone: o.zona });
}

function esDiaHabil(d: DateTime, o: OpcionesHorario): boolean {
  return (HORARIO.dias as readonly number[]).includes(d.weekday) && !o.feriados.includes(d.toISODate() ?? '');
}

export function estaAbierto(ahora: Date, o: OpcionesHorario): boolean {
  const d = enZona(ahora, o);
  if (!esDiaHabil(d, o)) return false;
  const abre = d.set({ ...HORARIO.abre, second: 0, millisecond: 0 });
  const cierra = d.set({ ...HORARIO.cierra, second: 0, millisecond: 0 });
  return d >= abre && d < cierra;
}

/** Próximo momento de apertura estrictamente posterior a `despues`. */
export function siguienteApertura(despues: Date, o: OpcionesHorario): Date {
  const base = enZona(despues, o);
  for (let i = 0; i < 30; i++) {
    const dia = base.plus({ days: i });
    const apertura = dia.set({ ...HORARIO.abre, second: 0, millisecond: 0 });
    if (apertura > base && esDiaHabil(dia, o)) return apertura.toJSDate();
  }
  throw new Error('No se encontró apertura en 30 días (revisar FERIADOS)');
}

/**
 * Una tasa de cambio confirmada vale hasta la siguiente apertura de la tienda + 1 hora.
 * Confirmada el sábado → vale hasta el lunes 10:00. Si la confirman el domingo, gana esa.
 */
export function vigenteHasta(confirmadaEn: Date, o: OpcionesHorario): Date {
  return new Date(siguienteApertura(confirmadaEn, o).getTime() + 60 * 60 * 1000);
}

/** "hoy a las 9:00", "mañana a las 9:00" o "el lunes a las 9:00". */
export function describirApertura(ahora: Date, o: OpcionesHorario): string {
  const a = enZona(siguienteApertura(ahora, o), o);
  const hoy = enZona(ahora, o).startOf('day');
  const diff = Math.round(a.startOf('day').diff(hoy, 'days').days);
  const hora = a.toFormat('H:mm');
  if (diff === 0) return `hoy a las ${hora}`;
  if (diff === 1) return `mañana a las ${hora}`;
  return `el ${a.setLocale('es').toFormat('cccc')} a las ${hora}`;
}

/** Día calendario en la zona del negocio (para contadores diarios). */
export function diaLocal(fecha: Date, zona: string): string {
  return DateTime.fromJSDate(fecha, { zone: zona }).toISODate() ?? fecha.toISOString().slice(0, 10);
}

/** Fecha y hora legibles para el contexto de la IA. */
export function ahoraLegible(fecha: Date, zona: string): string {
  return DateTime.fromJSDate(fecha, { zone: zona }).setLocale('es').toFormat("cccc d 'de' LLLL yyyy, H:mm");
}
