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

/** Estado comercial del contacto (CRM mínimo). */
export type EstadoComercial =
  | 'conversando' // sin solicitud abierta
  | 'en_formulario'
  | 'pendiente_asesor'
  | 'aviso_fallido'
  | 'en_atencion'
  | 'pensandolo'
  | 'seguimiento_programado'
  | 'seguimiento_enviado'
  | 'sin_respuesta'
  | 'no_interesado';

export interface Crm {
  estado: EstadoComercial;
  /** 'bot' o 'asesor' (con su número si se conoce). */
  responsable: string;
  proximaAccion?: string;
  proximaAccionCuando?: string; // ISO
  actualizado: string; // ISO
}

/**
 * Un único mensaje de seguimiento dentro de la ventana de 24 h de Meta (sin plantilla).
 * pensarlo = el cliente dijo "lo pienso" · formulario = dejó un formulario a medias.
 */
export interface Seguimiento {
  motivo: 'pensarlo' | 'formulario';
  cuando: string; // ISO
  tema: string;
  creado: string; // ISO
  estado: 'programado' | 'enviado' | 'cancelado' | 'vencido';
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
  ultimaFotoSuelta?: string; // ISO: para no repetir la pregunta en una ráfaga de fotos
  ultimoEntrante?: string; // ISO: último mensaje del cliente (ventana de 24 h de Meta)
  formularioPausado?: EstadoFormulario; // el cliente dijo "lo pienso" a mitad del formulario
  seguimiento?: Seguimiento;
  ultimoSeguimiento?: string; // ISO: último seguimiento enviado (máximo uno por ventana)
  sinSeguimiento?: boolean; // el cliente pidió que no le escribamos
  avisoPendiente?: Ficha; // ficha cuyo aviso al asesor falló: se reintenta
  crm?: Crm;
  actualizado: string;
}

export interface Ficha {
  id?: string; // lo asigna el almacén
  telefono: string;
  nombre?: string;
  tipo: string;
  motivo: string;
  datos: Record<string, string>;
  fotos: string[];
  fueraDeHorario: boolean;
  creada: string;
  /** false si el aviso a ASESOR_WHATSAPP falló. */
  avisado?: boolean;
  fotosReenviadas?: number;
  fotosFallidas?: number;
  estado?: EstadoComercial;
  responsable?: string;
  proximaAccion?: string;
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
  /** Mezcla `cambios` en una ficha ya guardada. */
  actualizarFicha(id: string, cambios: Partial<Ficha>): Promise<void>;
  /** Suma el gasto y devuelve el total del día. */
  sumarGasto(dia: string, usd: number): Promise<number>;
  /** Mensajes y fichas con desde <= creado < hasta; gastos con diaDesde <= dia < diaHasta (YYYY-MM-DD). */
  datosReporte(desde: Date, hasta: Date, diaDesde: string, diaHasta: string): Promise<DatosReporte>;
  /** Teléfonos con un seguimiento programado para antes de `hasta`. */
  seguimientosVencidos(hasta: Date): Promise<string[]>;
  purgar(antesDe: Date): Promise<void>;
  cerrar(): Promise<void>;
}

export function conversacionNueva(telefono: string, ahora: Date): Conversacion {
  const ts = ahora.toISOString();
  return { telefono, historial: [], fueraDeTemaSeguidos: 0, crm: { estado: 'conversando', responsable: 'bot', actualizado: ts }, actualizado: ts };
}
