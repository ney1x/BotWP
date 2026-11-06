import pg from 'pg';
import type { Almacen, ClaveContador, Conversacion, DatosReporte, Direccion, Ficha, MensajeGuardado } from './tipos.js';

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS conversaciones (
  telefono TEXT PRIMARY KEY,
  datos JSONB NOT NULL,
  actualizado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS mensajes (
  id BIGSERIAL PRIMARY KEY,
  telefono TEXT NOT NULL,
  direccion TEXT NOT NULL,
  texto TEXT NOT NULL,
  creado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS mensajes_creado ON mensajes (creado);
CREATE TABLE IF NOT EXISTS contadores (
  telefono TEXT NOT NULL,
  clave TEXT NOT NULL,
  dia DATE NOT NULL,
  valor INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (telefono, clave, dia)
);
CREATE TABLE IF NOT EXISTS procesados (
  id TEXT PRIMARY KEY,
  creado TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS fichas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono TEXT NOT NULL,
  tipo TEXT NOT NULL,
  datos JSONB NOT NULL,
  creada TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gastos (
  dia DATE PRIMARY KEY,
  usd NUMERIC(12, 6) NOT NULL DEFAULT 0
);
`;

export class AlmacenPostgres implements Almacen {
  private readonly pool: pg.Pool;

  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 5 });
  }

  async iniciar() {
    await this.pool.query(ESQUEMA);
  }

  async obtenerConversacion(telefono: string) {
    const r = await this.pool.query<{ datos: Conversacion }>('SELECT datos FROM conversaciones WHERE telefono = $1', [
      telefono,
    ]);
    return r.rows[0]?.datos;
  }

  async guardarConversacion(c: Conversacion) {
    await this.pool.query(
      `INSERT INTO conversaciones (telefono, datos, actualizado) VALUES ($1, $2, now())
       ON CONFLICT (telefono) DO UPDATE SET datos = EXCLUDED.datos, actualizado = now()`,
      [c.telefono, JSON.stringify(c)],
    );
  }

  async registrarMensaje(telefono: string, direccion: Direccion, texto: string) {
    await this.pool.query('INSERT INTO mensajes (telefono, direccion, texto) VALUES ($1, $2, $3)', [
      telefono,
      direccion,
      texto,
    ]);
  }

  async incrementar(telefono: string, clave: ClaveContador, dia: string) {
    const r = await this.pool.query<{ valor: number }>(
      `INSERT INTO contadores (telefono, clave, dia, valor) VALUES ($1, $2, $3, 1)
       ON CONFLICT (telefono, clave, dia) DO UPDATE SET valor = contadores.valor + 1
       RETURNING valor`,
      [telefono, clave, dia],
    );
    return r.rows[0]?.valor ?? 1;
  }

  async yaProcesado(id: string) {
    const r = await this.pool.query('INSERT INTO procesados (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
    return r.rowCount === 0;
  }

  async guardarFicha(f: Ficha) {
    const r = await this.pool.query<{ id: string }>(
      'INSERT INTO fichas (telefono, tipo, datos) VALUES ($1, $2, $3) RETURNING id',
      [f.telefono, f.tipo, JSON.stringify(f)],
    );
    return r.rows[0]!.id;
  }

  async sumarGasto(dia: string, usd: number) {
    const r = await this.pool.query<{ usd: string }>(
      `INSERT INTO gastos (dia, usd) VALUES ($1, $2)
       ON CONFLICT (dia) DO UPDATE SET usd = gastos.usd + EXCLUDED.usd RETURNING usd`,
      [dia, usd],
    );
    return Number(r.rows[0]?.usd ?? usd);
  }

  async datosReporte(desde: Date, hasta: Date, diaDesde: string, diaHasta: string): Promise<DatosReporte> {
    // Del texto solo interesan los botones tocados ("[Precio del oro]"): no se lee lo que escribió el cliente.
    const mensajes = await this.pool.query<MensajeGuardado>(
      `SELECT telefono, direccion, CASE WHEN texto LIKE '[%]' THEN left(texto, 80) ELSE '' END AS texto, creado
       FROM mensajes WHERE creado >= $1 AND creado < $2`,
      [desde, hasta],
    );
    const fichas = await this.pool.query<{ tipo: string; fuera: boolean | null; creada: Date }>(
      `SELECT tipo, (datos->>'fueraDeHorario')::boolean AS fuera, creada FROM fichas WHERE creada >= $1 AND creada < $2`,
      [desde, hasta],
    );
    const gastos = await this.pool.query<{ dia: string; usd: string }>(
      'SELECT dia::text AS dia, usd FROM gastos WHERE dia >= $1::date AND dia < $2::date',
      [diaDesde, diaHasta],
    );
    return {
      mensajes: mensajes.rows,
      fichas: fichas.rows.map((f) => ({ tipo: f.tipo, fueraDeHorario: f.fuera ?? false, creada: f.creada })),
      gastosIA: gastos.rows.map((g) => ({ dia: g.dia, usd: Number(g.usd) })),
    };
  }

  /** Retención: borra mensajes, conversaciones inactivas, fichas y contadores viejos. */
  async purgar(antesDe: Date) {
    await this.pool.query('DELETE FROM mensajes WHERE creado < $1', [antesDe]);
    await this.pool.query('DELETE FROM conversaciones WHERE actualizado < $1', [antesDe]);
    await this.pool.query('DELETE FROM fichas WHERE creada < $1', [antesDe]);
    await this.pool.query('DELETE FROM contadores WHERE dia < $1::date', [antesDe]);
    await this.pool.query("DELETE FROM procesados WHERE creado < now() - interval '7 days'");
  }

  async cerrar() {
    await this.pool.end();
  }
}
