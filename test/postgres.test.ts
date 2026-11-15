import pg from 'pg';
import { afterAll, describe, expect, test } from 'vitest';
import { AlmacenPostgres } from '../src/almacen/postgres.js';
import { conversacionNueva } from '../src/almacen/tipos.js';

/**
 * Persistencia real en PostgreSQL (simula un reinicio con dos conexiones distintas).
 * Solo corre con TEST_DATABASE_URL, por ejemplo:
 *   docker run --rm -e POSTGRES_PASSWORD=x -p 5433:5432 postgres:17
 *   $env:TEST_DATABASE_URL='postgres://postgres:x@localhost:5433/postgres'; npx vitest run test/postgres.test.ts
 */
const url = process.env.TEST_DATABASE_URL;
const TEL = `1999${Date.now() % 10_000_000}`;

describe.skipIf(!url)('AlmacenPostgres', () => {
  const abiertos: AlmacenPostgres[] = [];
  const nuevo = async () => {
    const a = new AlmacenPostgres(url!);
    abiertos.push(a);
    await a.iniciar();
    return a;
  };
  afterAll(async () => {
    await Promise.all(abiertos.map((a) => a.cerrar()));
  });

  test('conversación con CRM, seguimiento y ficha sobreviven a un reinicio', async () => {
    const ahora = new Date();
    const a = await nuevo();
    const conv = conversacionNueva(TEL, ahora);
    conv.formularioPausado = { tipo: 'reloj', paso: 1, datos: { pieza: 'Rolex' }, fotos: [] };
    conv.seguimiento = { motivo: 'pensarlo', cuando: new Date(ahora.getTime() - 1000).toISOString(), tema: 'la cotización de su pieza', creado: ahora.toISOString(), estado: 'programado' };
    conv.crm = { estado: 'seguimiento_programado', responsable: 'bot', proximaAccion: 'Bot: enviar un único seguimiento', actualizado: ahora.toISOString() };
    await a.guardarConversacion(conv);
    const id = await a.guardarFicha({ telefono: TEL, tipo: 'asesor', motivo: 'x', datos: {}, fotos: [], fueraDeHorario: false, creada: ahora.toISOString(), avisado: false, estado: 'aviso_fallido' });
    await a.actualizarFicha(id, { avisado: true, estado: 'pendiente_asesor' });
    await a.cerrar();
    abiertos.pop();

    const b = await nuevo();
    expect(await b.obtenerConversacion(TEL)).toMatchObject({
      formularioPausado: { datos: { pieza: 'Rolex' } },
      seguimiento: { estado: 'programado' },
      crm: { estado: 'seguimiento_programado', responsable: 'bot' },
    });
    expect(await b.seguimientosVencidos(ahora)).toContain(TEL);
    const d = await b.datosReporte(new Date(ahora.getTime() - 60_000), new Date(ahora.getTime() + 60_000), '2000-01-01', '2100-01-01');
    expect(d.fichas.length).toBeGreaterThan(0);

    const cliente = new pg.Client({ connectionString: url });
    await cliente.connect();
    const r = await cliente.query<{ datos: Record<string, unknown> }>('SELECT datos FROM fichas WHERE id = $1', [id]);
    await cliente.end();
    expect(r.rows[0]?.datos).toMatchObject({ telefono: TEL, avisado: true, estado: 'pendiente_asesor' });
  });
});
