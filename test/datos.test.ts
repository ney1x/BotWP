import { DateTime } from 'luxon';
import { describe, expect, test } from 'vitest';
import { interpretarDivisas, parsearCsv } from '../src/datos/divisas.js';
import { estimarOro, FuenteOro, interpretarPeso } from '../src/datos/oro.js';
import { convertirProducto, FuenteTienda } from '../src/datos/tienda.js';

const zona = 'America/New_York';
const horario = { zona, feriados: [] };
const en = (iso: string) => DateTime.fromISO(iso, { zone: zona }).toJSDate();

const respuesta = (cuerpo: unknown, status = 200) =>
  new Response(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo), { status });

const TARIFA = {
  '24k': { carat: '24', price: '118' },
  '22k': { carat: '22', price: '111' },
  '18k': { carat: '18', price: '91' },
  '14k': { carat: '14', price: '71' },
  '10k': { carat: '10', price: '50' },
};

describe('oro', () => {
  test('interpreta peso y quilates en varias formas', () => {
    expect(interpretarPeso('tengo 5 g de 18k')).toEqual({ gramos: 5, quilates: 18 });
    expect(interpretarPeso('18k 3,5 gramos')).toEqual({ gramos: 3.5, quilates: 18 });
    expect(interpretarPeso('cadena 14 kilates de 12gr')).toEqual({ gramos: 12, quilates: 14 });
    expect(interpretarPeso('cuánto vale el oro?')).toBeNull();
  });

  test('estima gramos × precio y rechaza quilates sin precio', () => {
    const t = { '18k': 91 };
    expect(estimarOro(t, 5, 18)).toEqual({ ok: true, usd: 455, precioGramo: 91 });
    expect(estimarOro(t, 5, 12).ok).toBe(false);
    expect(estimarOro(t, -1, 18).ok).toBe(false);
  });

  test('cachea la lectura y no usa una tarifa inválida', async () => {
    let llamadas = 0;
    let cuerpo: unknown = TARIFA;
    const f = (async () => {
      llamadas++;
      return respuesta(cuerpo);
    }) as typeof fetch;
    const fuente = new FuenteOro('http://x', f);
    const t0 = new Date('2026-11-05T12:00:00Z');
    expect((await fuente.obtener(t0)).ok).toBe(true);
    await fuente.obtener(new Date(t0.getTime() + 60_000));
    expect(llamadas).toBe(1);

    cuerpo = { ...TARIFA, '18k': { carat: '18', price: '9' } }; // error de tipeo
    const r = await fuente.obtener(new Date(t0.getTime() + 20 * 60_000));
    expect(r.ok).toBe(false);
  });

  test('si la red falla usa la última buena hasta 2 h', async () => {
    let caida = false;
    const f = (async () => {
      if (caida) throw new Error('red');
      return respuesta(TARIFA);
    }) as typeof fetch;
    const fuente = new FuenteOro('http://x', f);
    const t0 = new Date('2026-11-05T12:00:00Z');
    await fuente.obtener(t0);
    caida = true;
    expect((await fuente.obtener(new Date(t0.getTime() + 30 * 60_000))).ok).toBe(true);
    expect((await fuente.obtener(new Date(t0.getTime() + 3 * 60 * 60_000))).ok).toBe(false);
  });
});

describe('divisas', () => {
  const csv = 'moneda,compra,venta,confirmado\nEUR,1.10,1.18,2026-11-07 09:30\n"GBP","1,35",1.42,2026-11-07 09:30\nCAD,0.70,0.75,2026-11-02 09:00';

  test('parsea CSV con comillas', () => {
    expect(parsearCsv('a,"b,c",d')).toEqual([['a', 'b,c', 'd']]);
  });

  test('el domingo usa las tasas confirmadas el sábado y descarta las vencidas', () => {
    const r = interpretarDivisas(csv, en('2026-11-08T12:00'), horario);
    expect(r.estado).toBe('vigente');
    if (r.estado === 'vigente') expect(r.tasas.map((t) => t.moneda)).toEqual(['EUR', 'GBP']);
  });

  test('el lunes 10:01 sin confirmar → consultar', () => {
    expect(interpretarDivisas(csv, en('2026-11-09T10:01'), horario).estado).toBe('consultar');
  });

  test('faltan columnas → consultar', () => {
    expect(interpretarDivisas('moneda,compra\nEUR,1', en('2026-11-08T12:00'), horario).estado).toBe('consultar');
  });
});

describe('tienda', () => {
  const wc = (id: number, extra: Record<string, unknown> = {}) => ({
    id,
    name: `Anillo 18K &#8211; ${id}`,
    permalink: `https://www.frankysefectivo.com/producto/anillo-${id}/`,
    is_in_stock: true,
    prices: { price: '125000', currency_minor_unit: 2 },
    images: [{ src: `https://img/${id}.jpg` }],
    categories: [{ slug: 'anillos', name: 'Anillos' }],
    ...extra,
  });

  test('convierte precio en centavos y descarta inglés y sin stock', () => {
    expect(convertirProducto(wc(1))).toMatchObject({ id: 1, nombre: 'Anillo 18K – 1', precioUsd: 1250 });
    expect(convertirProducto(wc(2, { permalink: 'https://x.com/en/product/ring/' }))).toBeNull();
    expect(convertirProducto(wc(3, { is_in_stock: false }))).toBeNull();
  });

  test('pagina, filtra por categoría y precio, y cuenta categorías', async () => {
    const pagina1 = Array.from({ length: 100 }, (_, i) => wc(i + 1));
    const pagina2 = [wc(101, { categories: [{ slug: 'cadenas', name: 'Cadenas' }], prices: { price: '30000', currency_minor_unit: 2 } })];
    const f = (async (url: string) => respuesta(/page=1$/.test(url) ? pagina1 : pagina2)) as unknown as typeof fetch;
    const t = new FuenteTienda('http://wc', f);
    const cats = await t.categorias();
    expect(cats[0]).toEqual({ slug: 'anillos', nombre: 'Anillos', cantidad: 100 });
    const baratas = await t.buscar({ precioMaximo: 500 });
    expect(baratas.total).toBe(1);
    const anillos = await t.buscar({ categoria: 'anillos', desde: 95 });
    expect(anillos.piezas).toHaveLength(3);
    expect(anillos.total).toBe(100);
  });
});
