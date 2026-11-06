import { randomUUID } from 'node:crypto';
import type { Almacen, ClaveContador, Conversacion, DatosReporte, Direccion, Ficha, MensajeGuardado } from './tipos.js';

/** Almacén en memoria: para el simulador, los tests y una demo sin base de datos. */
export class AlmacenMemoria implements Almacen {
  readonly conversaciones = new Map<string, Conversacion>();
  readonly mensajes: MensajeGuardado[] = [];
  readonly fichas: (Ficha & { id: string })[] = [];
  private readonly contadores = new Map<string, number>();
  private readonly procesados = new Map<string, number>();
  readonly gastos = new Map<string, number>();

  async iniciar() {}

  async obtenerConversacion(telefono: string) {
    const c = this.conversaciones.get(telefono);
    return c ? structuredClone(c) : undefined;
  }

  async guardarConversacion(c: Conversacion) {
    this.conversaciones.set(c.telefono, structuredClone(c));
  }

  async registrarMensaje(telefono: string, direccion: Direccion, texto: string) {
    this.mensajes.push({ telefono, direccion, texto, creado: new Date() });
  }

  async incrementar(telefono: string, clave: ClaveContador, dia: string) {
    const k = `${telefono}|${clave}|${dia}`;
    const v = (this.contadores.get(k) ?? 0) + 1;
    this.contadores.set(k, v);
    return v;
  }

  async yaProcesado(id: string) {
    if (this.procesados.has(id)) return true;
    this.procesados.set(id, Date.now());
    if (this.procesados.size > 5000) {
      const viejo = this.procesados.keys().next().value;
      if (viejo !== undefined) this.procesados.delete(viejo);
    }
    return false;
  }

  async guardarFicha(f: Ficha) {
    const id = randomUUID();
    this.fichas.push({ ...f, id });
    return id;
  }

  async sumarGasto(dia: string, usd: number) {
    const v = (this.gastos.get(dia) ?? 0) + usd;
    this.gastos.set(dia, v);
    return v;
  }

  async datosReporte(desde: Date, hasta: Date, diaDesde: string, diaHasta: string): Promise<DatosReporte> {
    const dentro = (d: Date) => d >= desde && d < hasta;
    return {
      mensajes: this.mensajes.filter((m) => dentro(m.creado)).map((m) => ({ ...m })),
      fichas: this.fichas
        .map((f) => ({ tipo: f.tipo, fueraDeHorario: f.fueraDeHorario, creada: new Date(f.creada) }))
        .filter((f) => dentro(f.creada)),
      gastosIA: [...this.gastos].filter(([dia]) => dia >= diaDesde && dia < diaHasta).map(([dia, usd]) => ({ dia, usd })),
    };
  }

  async purgar(antesDe: Date) {
    for (let i = this.mensajes.length - 1; i >= 0; i--) if (this.mensajes[i]!.creado < antesDe) this.mensajes.splice(i, 1);
  }

  async cerrar() {}
}
