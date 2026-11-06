export interface Turno {
  rol: 'usuario' | 'bot';
  texto: string;
  ts: string; // ISO
}

export interface EstadoFormulario {
  tipo: string;
  paso: number;
  datos: Record<string, string>;
  fotos: string[]; // mediaId de WhatsApp
}

export interface Conversacion {
  telefono: string;
  nombre?: string;
  historial: Turno[]; // solo los últimos turnos (contexto para la IA)
  formulario?: EstadoFormulario;
  pausadoHasta?: string; // ISO: un asesor está atendiendo, el bot calla
  soloMenuHasta?: string; // ISO: modo solo menú (anti-spam)
  fueraDeTemaSeguidos: number;
  esperandoAsesor?: string; // ISO: ya se pidió asesor
  tienda?: { categoria?: string; texto?: string; precioMaximo?: number; desde: number };
  fotosSueltas?: string[]; // fotos recibidas fuera de un formulario
  actualizado: string;
}

export interface Ficha {
  telefono: string;
  nombre?: string;
  tipo: string;
  motivo: string;
  datos: Record<string, string>;
  fotos: string[];
  fueraDeHorario: boolean;
  creada: string;
}

export type ClaveContador = 'ia' | 'respuestas';

/** entrante = cliente · saliente = bot · asesor = eco desde la app · aviso = ficha enviada a ASESOR_WHATSAPP */
export type Direccion = 'entrante' | 'saliente' | 'asesor' | 'aviso';

export interface MensajeGuardado {
  telefono: string;
  direccion: string;
  texto: string;
  creado: Date;
}

/** Datos crudos de un período para el reporte mensual. */
export interface DatosReporte {
  mensajes: MensajeGuardado[];
  fichas: { tipo: string; fueraDeHorario: boolean; creada: Date }[];
  gastosIA: { dia: string; usd: number }[];
}

export interface Almacen {
  iniciar(): Promise<void>;
  obtenerConversacion(telefono: string): Promise<Conversacion | undefined>;
  guardarConversacion(c: Conversacion): Promise<void>;
  registrarMensaje(telefono: string, direccion: Direccion, texto: string): Promise<void>;
  /** Suma 1 y devuelve el nuevo valor. */
  incrementar(telefono: string, clave: ClaveContador, dia: string): Promise<number>;
  /** true si el id ya había sido procesado (webhooks repetidos). */
  yaProcesado(idMensaje: string): Promise<boolean>;
  guardarFicha(f: Ficha): Promise<string>;
  /** Suma el gasto y devuelve el total del día. */
  sumarGasto(dia: string, usd: number): Promise<number>;
  /** Mensajes y fichas con desde <= creado < hasta; gastos con diaDesde <= dia < diaHasta (YYYY-MM-DD). */
  datosReporte(desde: Date, hasta: Date, diaDesde: string, diaHasta: string): Promise<DatosReporte>;
  purgar(antesDe: Date): Promise<void>;
  cerrar(): Promise<void>;
}

export function conversacionNueva(telefono: string, ahora: Date): Conversacion {
  return { telefono, historial: [], fueraDeTemaSeguidos: 0, actualizado: ahora.toISOString() };
}
