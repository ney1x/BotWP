import { describe, expect, test } from 'vitest';
import { validarTarifa } from '../src/precios/validarTarifa.js';

// Copia de una lectura real de la fuente de precios.
const REAL = {
  '24k': { carat: '24', price: '118' },
  '22k': { carat: '22', price: '111' },
  '21k': { carat: '21', price: '100' },
  '18k': { carat: '18', price: '91' },
  '14k': { carat: '14', price: '71' },
  '10k': { carat: '10', price: '50' },
  '9k': { carat: '9', price: '45' },
};
type Clave = keyof typeof REAL;

const conPrecio = (clave: Clave, price: unknown) => ({ ...REAL, [clave]: { ...REAL[clave], price } });
const sin = (clave: Clave) => {
  const copia: Record<string, unknown> = { ...REAL };
  delete copia[clave];
  return copia;
};

describe('validarTarifa', () => {
  test('tarifa real pasa y se normaliza a números', () => {
    const r = validarTarifa(REAL);
    expect(r.ok, r.errores.join('\n')).toBe(true);
    expect(r.tarifa['24k']).toBe(118);
    expect(r.tarifa['9k']).toBe(45);
  });

  test('rechaza formato que no es objeto', () => {
    for (const raw of [null, [], 'x', 42]) expect(validarTarifa(raw).ok).toBe(false);
  });

  test('rechaza si falta un quilate requerido', () => {
    const r = validarTarifa(sin('18k'));
    expect(r.ok).toBe(false);
    expect(r.errores.join()).toMatch(/18k: falta/);
  });

  test('acepta que falten quilates opcionales (21k, 9k)', () => {
    expect(validarTarifa(sin('21k')).ok).toBe(true);
  });

  test('rechaza precio vacío, cero, negativo o con texto', () => {
    for (const p of ['', '0', '-5', '91abc', 'NaN', null]) {
      expect(validarTarifa(conPrecio('18k', p)).ok, `precio ${String(p)}`).toBe(false);
    }
  });

  test('rechaza carat que no coincide con la clave', () => {
    const raw = { ...REAL, '18k': { carat: '14', price: '91' } };
    expect(validarTarifa(raw).ok).toBe(false);
  });

  test('rechaza orden roto (18k más caro que 22k)', () => {
    const r = validarTarifa(conPrecio('18k', '112'));
    expect(r.ok).toBe(false);
    expect(r.errores.join()).toMatch(/orden/);
  });

  test('rechaza precio que no cuadra con la pureza (18k = 9 por error de tipeo)', () => {
    const r = validarTarifa(conPrecio('18k', '9'));
    expect(r.ok).toBe(false);
    expect(r.errores.join()).toMatch(/pureza/);
  });

  test('rechaza 24k fuera de rango absoluto', () => {
    const todo = Object.fromEntries(
      Object.entries(REAL).map(([k, v]) => [k, { ...v, price: String(Number(v.price) * 10) }]),
    );
    expect(validarTarifa(todo).ok).toBe(false);
  });

  test('rechaza salto mayor a 10 % contra la última lectura buena', () => {
    const anterior = validarTarifa(REAL).tarifa;
    const r = validarTarifa(conPrecio('24k', '131'), { anterior }); // +11 %
    expect(r.ok).toBe(false);
    expect(r.errores.join()).toMatch(/salto/);
  });

  test('acepta movimiento normal contra la última lectura', () => {
    const anterior = validarTarifa(REAL).tarifa;
    expect(validarTarifa(conPrecio('24k', '121'), { anterior }).ok).toBe(true); // +2.5 %
  });

  test('acepta 12k cuando lo agreguen a la fuente', () => {
    const raw = { ...REAL, '12k': { carat: '12', price: '60' } };
    const r = validarTarifa(raw);
    expect(r.ok, r.errores.join('\n')).toBe(true);
    expect(r.tarifa['12k']).toBe(60);
  });
});
