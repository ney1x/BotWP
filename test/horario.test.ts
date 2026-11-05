import { DateTime } from 'luxon';
import { describe, expect, test } from 'vitest';
import { describirApertura, estaAbierto, siguienteApertura, vigenteHasta } from '../src/horario.js';

const zona = 'America/New_York';
const o = { zona, feriados: ['2026-12-25'] };
const en = (iso: string) => DateTime.fromISO(iso, { zone: zona }).toJSDate();
const local = (d: Date) => DateTime.fromJSDate(d, { zone: zona }).toFormat('yyyy-MM-dd HH:mm');

describe('horario', () => {
  test('abierto lunes 10:00, cerrado 18:30 y domingo', () => {
    expect(estaAbierto(en('2026-11-09T10:00'), o)).toBe(true); // lunes
    expect(estaAbierto(en('2026-11-09T18:30'), o)).toBe(false);
    expect(estaAbierto(en('2026-11-08T12:00'), o)).toBe(false); // domingo
    expect(estaAbierto(en('2026-12-25T12:00'), o)).toBe(false); // feriado (viernes)
  });

  test('siguiente apertura salta domingo y feriados', () => {
    expect(local(siguienteApertura(en('2026-11-07T12:00'), o))).toBe('2026-11-09 09:00'); // sáb → lun
    expect(local(siguienteApertura(en('2026-11-09T08:00'), o))).toBe('2026-11-09 09:00'); // antes de abrir
    expect(local(siguienteApertura(en('2026-12-24T19:00'), o))).toBe('2026-12-26 09:00'); // salta Navidad
  });

  test('tasa confirmada el sábado vale hasta el lunes 10:00', () => {
    expect(local(vigenteHasta(en('2026-11-07T09:30'), o))).toBe('2026-11-09 10:00');
  });

  test('si la confirman el domingo, vale lo mismo (gana la más reciente)', () => {
    expect(local(vigenteHasta(en('2026-11-08T15:00'), o))).toBe('2026-11-09 10:00');
  });

  test('confirmada el lunes 9:15 vale hasta el martes 10:00', () => {
    expect(local(vigenteHasta(en('2026-11-09T09:15'), o))).toBe('2026-11-10 10:00');
  });

  test('describe la apertura en palabras', () => {
    expect(describirApertura(en('2026-11-09T07:00'), o)).toBe('hoy a las 9:00');
    expect(describirApertura(en('2026-11-09T20:00'), o)).toBe('mañana a las 9:00');
    expect(describirApertura(en('2026-11-07T20:00'), o)).toBe('el lunes a las 9:00');
  });
});
