/** Modelo interno, independiente del proveedor (Cloud API directo, YCloud…). */

export type Contenido =
  | { clase: 'texto'; texto: string }
  | { clase: 'opcion'; id: string; titulo: string } // respuesta a botón o lista
  /** `url`: enlace de descarga que manda YCloud (necesita la API key; válido 30 días). */
  | { clase: 'imagen'; mediaId: string; url?: string; caption?: string }
  | { clase: 'audio' }
  | { clase: 'otro'; detalle: string };

export type Entrante =
  | { tipo: 'mensaje'; id: string; de: string; nombre?: string; ts: Date; contenido: Contenido }
  /** Mensaje que un asesor envió desde la app WhatsApp Business (Coexistence). */
  | { tipo: 'eco'; id: string; para: string; ts: Date; texto?: string };

export interface Boton {
  id: string;
  titulo: string; // máx. 20 caracteres
}

export interface FilaLista {
  id: string;
  titulo: string; // máx. 24
  descripcion?: string; // máx. 72
}

export type Saliente =
  | { clase: 'texto'; texto: string }
  | { clase: 'botones'; texto: string; botones: Boton[] } // máx. 3
  | { clase: 'lista'; texto: string; boton: string; secciones: { titulo: string; filas: FilaLista[] }[] } // máx. 10 filas
  | { clase: 'imagen'; url?: string; mediaId?: string; caption?: string }; // url pública o media subida

export interface ProveedorWhatsApp {
  enviar(para: string, mensaje: Saliente): Promise<void>;
  /**
   * Reenvía una foto que mandó un cliente: la descarga, la sube como media propia y la envía.
   * `ref` es el enlace de descarga (YCloud) o el media id (Cloud API).
   */
  reenviarImagen?(para: string, ref: string, caption?: string): Promise<void>;
}

/** Recorta a `max` caracteres sin cortar a la mitad de un carácter compuesto. */
export function recortar(s: string, max: number): string {
  const chars = [...s];
  return chars.length <= max ? s : chars.slice(0, max - 1).join('') + '…';
}
