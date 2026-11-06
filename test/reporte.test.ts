import { DateTime } from 'luxon';
import { describe, expect, test } from 'vitest';
import { AlmacenMemoria } from '../src/almacen/memoria.js';
import { armarReporte, formatearReporte, rangoMes } from '../src/reporteMensual.js';

const zona = 'America/New_York';
const t = (iso: string) => DateTime.fromISO(iso, { zone: zona }).toJSDate();
const base = { zona, gratisMes: 1000, usdPorMensaje: 0.0034 };

async function datosNoviembre(a: AlmacenMemoria) {
  const { inicio, fin } = rangoMes('2026-11', zona);
  return a.datosReporte(inicio.toJSDate(), fin.toJSDate(), inicio.toISODate()!, fin.toISODate()!);
}

describe('reporte mensual', () => {
  test('rango del mes en hora de Miami y mes inválido', () => {
    const { inicio, fin } = rangoMes('2026-11', zona);
    expect(inicio.toISO()).toBe('2026-11-01T00:00:00.000-04:00');
    expect(fin.toISODate()).toBe('2026-12-01');
    expect(() => rangoMes('2026-13', zona)).toThrow();
    expect(() => rangoMes('nov', zona)).toThrow();
  });

  test('cuenta cobrables, promedio desde el primer mensaje y proyección', async () => {
    const a = new AlmacenMemoria();
    const m = (telefono: string, direccion: string, texto: string, iso: string) =>
      a.mensajes.push({ telefono, direccion, texto, creado: t(iso) });
    m('1', 'entrante', 'hola', '2026-10-31T23:00'); // otro mes: no cuenta
    m('1', 'entrante', '[Precio del oro]', '2026-11-11T10:15');
    m('1', 'saliente', 'tabla', '2026-11-11T10:15');
    m('2', 'entrante', '[Precio del oro]', '2026-11-12T10:40');
    m('2', 'saliente', 'tabla', '2026-11-12T10:40');
    m('2', 'entrante', '[imagen]', '2026-11-12T15:00');
    m('2', 'saliente', 'foto', '2026-11-12T15:00');
    m('99', 'aviso', '[ficha asesor]', '2026-11-12T15:01');
    m('2', 'asesor', 'hola, soy Carlos', '2026-11-12T15:05');
    a.fichas.push({ id: 'f', telefono: '2', tipo: 'asesor', motivo: 'x', datos: {}, fotos: [], fueraDeHorario: true, creada: t('2026-11-12T15:01').toISOString() });
    a.gastos.set('2026-11-12', 0.012).set('2026-10-30', 5);

    const r = armarReporte(await datosNoviembre(a), { ...base, mes: '2026-11', ahora: t('2026-11-15T12:00') });
    expect(r).toMatchObject({
      parcial: true,
      diasMes: 30,
      diasMedidos: 5, // 11 → 15 a mediodía
      chats: 2,
      entrantes: 3,
      salientes: 3,
      avisos: 1,
      delAsesor: 1,
      cobrables: 4,
      promedioDiario: 0.8,
      proyeccionMes: 24,
      usoGratisPct: 2,
      costoYCloudUsd: 0,
      fichas: 1,
      fichasFueraDeHorario: 1,
      gastoIAUsd: 0.01,
      porChat: 1.5,
    });
    expect(r.horasPico[0]).toEqual([10, 2]);
    expect(r.temas).toEqual([['Precio del oro', 2]]);
    expect(formatearReporte(r)).toContain('Proyección del mes: 24 de 1000 gratis');
  });

  test('pasado los gratis estima el costo; mes cerrado no es parcial', () => {
    const mensajes = Array.from({ length: 1500 }, (_, i) => ({
      telefono: String(i % 50),
      direccion: 'saliente',
      texto: '',
      creado: t(`2026-11-${String((i % 30) + 1).padStart(2, '0')}T12:00`),
    }));
    const r = armarReporte({ mensajes, fichas: [], gastosIA: [] }, { ...base, mes: '2026-11', ahora: t('2026-12-03T09:00') });
    expect(r.parcial).toBe(false);
    expect(r.diasMedidos).toBe(30);
    expect(r.proyeccionMes).toBe(1500);
    expect(r.costoYCloudUsd).toBe(1.7); // 500 × $0.0034
  });

  test('sin mensajes no divide por cero', () => {
    const r = armarReporte({ mensajes: [], fichas: [], gastosIA: [] }, { ...base, mes: '2026-11', ahora: t('2026-11-02T08:00') });
    expect(r).toMatchObject({ cobrables: 0, promedioDiario: 0, porChat: 0, proyeccionMes: 0 });
    expect(formatearReporte(r)).toContain('(sin datos)');
  });
});
