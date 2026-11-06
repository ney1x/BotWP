import type { EstadoFormulario } from '../almacen/tipos.js';
import type { Contenido, Saliente } from '../whatsapp/tipos.js';
import { ID } from './textos.js';

type TipoPaso = 'texto' | 'si_no' | 'fotos';

interface Paso {
  campo: string;
  etiqueta: string; // cómo aparece en la ficha del asesor
  pregunta: string;
  tipo: TipoPaso;
  /** Si en un paso sí/no responde "no", se corta el formulario y pasa a asesor con esta nota. */
  siNoCorta?: string;
}

export interface DefFormulario {
  tipo: string;
  motivo: string;
  pasos: Paso[];
}

export const FORMULARIOS: Record<string, DefFormulario> = {
  reloj: {
    tipo: 'reloj',
    motivo: 'Cotización de reloj o joya',
    pasos: [
      { campo: 'pieza', etiqueta: 'Pieza', tipo: 'texto', pregunta: '¿Qué pieza desea cotizar? Por ejemplo: reloj Rolex, anillo de oro con diamante, cadena 14k.' },
      { campo: 'modelo', etiqueta: 'Marca / modelo / referencia', tipo: 'texto', pregunta: 'Indíqueme la marca, el modelo o la referencia si la conoce (o escriba *no sé*).' },
      { campo: 'papeles', etiqueta: 'Caja y papeles', tipo: 'si_no', pregunta: '¿Tiene la caja o los papeles originales?' },
      { campo: 'estado', etiqueta: 'Estado', tipo: 'texto', pregunta: '¿En qué estado está? (funciona, rayones, piezas rotas…)' },
      { campo: 'fotos', etiqueta: 'Fotos', tipo: 'fotos', pregunta: 'Envíeme fotos de la pieza (frente, reverso y detalles). Cuando termine toque *Listo*.' },
    ],
  },
  domicilio: {
    tipo: 'domicilio',
    motivo: 'Préstamo a domicilio: solicitud de visita',
    pasos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', pregunta: 'Para agendar la visita, ¿cuál es su nombre completo?' },
      { campo: 'direccion', etiqueta: 'Dirección', tipo: 'texto', pregunta: '¿En qué dirección le visitamos?' },
      { campo: 'codigo_postal', etiqueta: 'Código postal', tipo: 'texto', pregunta: '¿Cuál es el código postal?' },
      { campo: 'dia_hora', etiqueta: 'Día y hora preferidos', tipo: 'texto', pregunta: '¿Qué día y hora le quedan mejor?' },
      { campo: 'fotos', etiqueta: 'Fotos de las joyas', tipo: 'fotos', pregunta: 'Si puede, envíeme fotos de las joyas. Cuando termine (o si prefiere no enviar) toque *Listo*.' },
    ],
  },
  vehiculo: {
    tipo: 'vehiculo',
    motivo: 'Préstamo con garantía de vehículo',
    pasos: [
      { campo: 'libre_deuda', etiqueta: 'Libre de deuda', tipo: 'si_no', pregunta: '¿El vehículo está libre de deuda (sin financiamiento pendiente)?', siNoCorta: 'El vehículo tiene deuda.' },
      { campo: 'titulo_a_nombre', etiqueta: 'Título a su nombre', tipo: 'si_no', pregunta: '¿El título está a su nombre?', siNoCorta: 'El título no está a su nombre.' },
      { campo: 'tipo_vehiculo', etiqueta: 'Tipo', tipo: 'texto', pregunta: '¿Qué tipo de vehículo es? (auto, moto, camión, bote u otro)' },
      { campo: 'anio_marca_modelo', etiqueta: 'Año, marca y modelo', tipo: 'texto', pregunta: 'Indíqueme año, marca y modelo. Ejemplo: 2019 Toyota Corolla.' },
      { campo: 'vin', etiqueta: 'VIN / serie', tipo: 'texto', pregunta: '¿Tiene el número de serie (VIN)? Escríbalo o ponga *no*.' },
      { campo: 'codigo_postal', etiqueta: 'Código postal', tipo: 'texto', pregunta: '¿En qué código postal se encuentra?' },
      { campo: 'fotos', etiqueta: 'Fotos', tipo: 'fotos', pregunta: 'Envíeme fotos del vehículo. Cuando termine toque *Listo*.' },
    ],
  },
  cita_doral: {
    tipo: 'cita_doral',
    motivo: 'Solicitud de cita en Doral',
    pasos: [
      { campo: 'nombre', etiqueta: 'Nombre', tipo: 'texto', pregunta: 'Con gusto le agendamos en Doral. ¿Cuál es su nombre?' },
      { campo: 'dia_hora', etiqueta: 'Día y hora preferidos', tipo: 'texto', pregunta: '¿Qué día y hora prefiere? (lunes a sábado, 9:00 a 18:30)' },
      { campo: 'motivo', etiqueta: 'Motivo', tipo: 'texto', pregunta: '¿Qué trámite desea hacer? (vender, empeñar, cambio de divisas…)' },
    ],
  },
};

export type ResultadoPaso =
  | { estado: 'sigue'; mensajes: Saliente[] }
  | { estado: 'completo'; mensajes: Saliente[]; nota?: string }
  | { estado: 'cancelado' };

export function preguntaDe(f: EstadoFormulario): Saliente {
  const def = FORMULARIOS[f.tipo];
  const paso = def?.pasos[f.paso];
  if (!def || !paso) return { clase: 'texto', texto: '…' };
  const salida = f.paso === 0 ? `${paso.pregunta}\n\n(Escriba *cancelar* para salir.)` : paso.pregunta;
  if (paso.tipo === 'si_no') {
    return { clase: 'botones', texto: salida, botones: [{ id: ID.SI, titulo: 'Sí' }, { id: ID.NO, titulo: 'No' }] };
  }
  if (paso.tipo === 'fotos') {
    return { clase: 'botones', texto: salida, botones: [{ id: ID.LISTO, titulo: 'Listo' }] };
  }
  return { clase: 'texto', texto: salida };
}

export function nuevoFormulario(tipo: string, fotos: string[] = []): EstadoFormulario {
  if (!FORMULARIOS[tipo]) throw new Error(`Formulario desconocido: ${tipo}`);
  return { tipo, paso: 0, datos: {}, fotos };
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

function siNo(c: Contenido): boolean | null {
  if (c.clase === 'opcion') return c.id === ID.SI ? true : c.id === ID.NO ? false : null;
  if (c.clase === 'texto') {
    const t = norm(c.texto);
    if (/^(si|sí|s|yes|y|claro|correcto)\b/.test(t)) return true;
    if (/^(no|n)\b/.test(t)) return false;
  }
  return null;
}

/** Avanza el formulario con lo que respondió el cliente. Muta `f`. */
export function avanzar(f: EstadoFormulario, c: Contenido): ResultadoPaso {
  const def = FORMULARIOS[f.tipo];
  const paso = def?.pasos[f.paso];
  if (!def || !paso) return { estado: 'cancelado' };

  const cancelar =
    (c.clase === 'opcion' && c.id === ID.CANCELAR) || (c.clase === 'texto' && /^(cancelar|salir|menu|menú)$/.test(norm(c.texto)));
  if (cancelar) return { estado: 'cancelado' };

  // Una foto se guarda en cualquier paso.
  if (c.clase === 'imagen') {
    if (c.mediaId) f.fotos.push(c.mediaId);
    if (paso.tipo === 'fotos') {
      return {
        estado: 'sigue',
        mensajes: [{ clase: 'botones', texto: `Foto recibida ✅ (${f.fotos.length}). Envíe otra o toque *Listo*.`, botones: [{ id: ID.LISTO, titulo: 'Listo' }] }],
      };
    }
    return { estado: 'sigue', mensajes: [{ clase: 'texto', texto: 'Foto guardada ✅' }, preguntaDe(f)] };
  }

  switch (paso.tipo) {
    case 'si_no': {
      const v = siNo(c);
      if (v === null) return { estado: 'sigue', mensajes: [preguntaDe(f)] };
      f.datos[paso.campo] = v ? 'Sí' : 'No';
      if (!v && paso.siNoCorta) return { estado: 'completo', mensajes: [], nota: paso.siNoCorta };
      break;
    }
    case 'fotos': {
      const listo = (c.clase === 'opcion' && c.id === ID.LISTO) || (c.clase === 'texto' && /^(listo|ya|termine|terminé|no|ninguna)$/.test(norm(c.texto)));
      if (!listo) return { estado: 'sigue', mensajes: [preguntaDe(f)] };
      f.datos[paso.campo] = `${f.fotos.length} foto(s)`;
      break;
    }
    case 'texto': {
      const texto = c.clase === 'texto' ? c.texto.trim() : c.clase === 'opcion' ? c.titulo : '';
      if (!texto) return { estado: 'sigue', mensajes: [preguntaDe(f)] };
      f.datos[paso.campo] = texto.slice(0, 300);
      break;
    }
  }

  f.paso++;
  if (f.paso >= def.pasos.length) return { estado: 'completo', mensajes: [] };
  return { estado: 'sigue', mensajes: [preguntaDe(f)] };
}

/** Datos con etiquetas legibles para la ficha del asesor. */
export function datosEtiquetados(f: EstadoFormulario): Record<string, string> {
  const def = FORMULARIOS[f.tipo];
  const salida: Record<string, string> = {};
  for (const p of def?.pasos ?? []) {
    const v = f.datos[p.campo];
    if (v !== undefined) salida[p.etiqueta] = v;
  }
  return salida;
}
