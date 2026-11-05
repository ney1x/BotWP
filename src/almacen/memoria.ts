import { randomUUID } from 'node:crypto';
import type { Almacen, ClaveContador, Conversacion, Ficha } from './tipos.js';

/** Almacén en memoria: para el simulador, los tests y una demo sin base de datos. */
export class AlmacenMemoria implements Almacen {
  readonly conversaciones = new Map<string, Conversacion>();
  readonly mensajes: { telefono: string; direccion: string; texto: string; creado: Date }[] = [];
  readonly fichas: (Ficha & { id: string })[] = [];
  private readonly contadores = new Map<string, number>();
  private readonly procesados = new Map<string, number>();
  private readonly gastos = new Map<string, number>();

  async iniciar() {}

  async obtenerConversacion(telefono: string) {
    const c = this.conversaciones.get(telefono);
    return c ? structuredClone(c) : undefined;
  }

  async guardarConversacion(c: Conversacion) {
    this.conversaciones.set(c.telefono, structuredClone(c));
  }

  async registrarMensaje(telefono: string, direccion: 'entrante' | 'saliente' | 'asesor', texto: string) {
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

  async purgar(antesDe: Date) {
    for (let i = this.mensajes.length - 1; i >= 0; i--) if (this.mensajes[i]!.creado < antesDe) this.mensajes.splice(i, 1);
  }

  async cerrar() {}
}
