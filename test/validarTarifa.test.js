'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { validarTarifa } = require('../src/precios/validarTarifa');

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

const conPrecio = (clave, price) => ({ ...REAL, [clave]: { ...REAL[clave], price } });
const sin = (clave) => {
  const copia = { ...REAL };
  delete copia[clave];
  return copia;
};

test('tarifa real pasa y se normaliza a números', () => {
  const r = validarTarifa(REAL);
  assert.equal(r.ok, true, r.errores.join('\n'));
  assert.equal(r.tarifa['24k'], 118);
  assert.equal(r.tarifa['9k'], 45);
});

test('rechaza formato que no es objeto', () => {
  for (const raw of [null, [], 'x', 42]) assert.equal(validarTarifa(raw).ok, false);
});

test('rechaza si falta un quilate requerido', () => {
  const r = validarTarifa(sin('18k'));
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /18k: falta/);
});

test('acepta que falten quilates opcionales (21k, 9k)', () => {
  assert.equal(validarTarifa(sin('21k')).ok, true);
});

test('rechaza precio vacío, cero, negativo o con texto', () => {
  for (const p of ['', '0', '-5', '91abc', 'NaN', null]) {
    assert.equal(validarTarifa(conPrecio('18k', p)).ok, false, `precio ${p}`);
  }
});

test('rechaza carat que no coincide con la clave', () => {
  const raw = { ...REAL, '18k': { carat: '14', price: '91' } };
  assert.equal(validarTarifa(raw).ok, false);
});

test('rechaza orden roto (18k más caro que 22k)', () => {
  const r = validarTarifa(conPrecio('18k', '112'));
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /orden/);
});

test('rechaza precio que no cuadra con la pureza (18k = 9 por error de tipeo)', () => {
  const r = validarTarifa(conPrecio('18k', '9'));
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /pureza/);
});

test('rechaza 24k fuera de rango absoluto', () => {
  const todo = Object.fromEntries(
    Object.entries(REAL).map(([k, v]) => [k, { ...v, price: String(Number(v.price) * 10) }]),
  );
  assert.equal(validarTarifa(todo).ok, false);
});

test('rechaza salto mayor a 10 % contra la última lectura buena', () => {
  const anterior = validarTarifa(REAL).tarifa;
  const r = validarTarifa(conPrecio('24k', '131'), { anterior }); // +11 %
  assert.equal(r.ok, false);
  assert.match(r.errores.join(), /salto/);
});

test('acepta movimiento normal contra la última lectura', () => {
  const anterior = validarTarifa(REAL).tarifa;
  assert.equal(validarTarifa(conPrecio('24k', '121'), { anterior }).ok, true); // +2.5 %
});

test('acepta 12k cuando lo agreguen a la fuente', () => {
  const raw = { ...REAL, '12k': { carat: '12', price: '60' } };
  const r = validarTarifa(raw);
  assert.equal(r.ok, true, r.errores.join('\n'));
  assert.equal(r.tarifa['12k'], 60);
});
