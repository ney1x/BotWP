import { z } from 'zod';
import type { LecturaDivisas } from '../datos/divisas.js';
import { estimarOro, tablaOro, type LecturaOro } from '../datos/oro.js';
import { formatoUsd, PIEZAS_POR_VISTA, type FiltroTienda, type FuenteTienda } from '../datos/tienda.js';
import type { DefHerramienta } from './ia.js';
import { FORMULARIOS } from './formularios.js';

/** Efectos que la IA pide y el motor ejecuta después de enviar su texto. */
export type Accion =
  | { tipo: 'mostrar_joyas'; filtro: FiltroTienda }
  | { tipo: 'formulario'; formulario: string }
  | { tipo: 'asesor'; motivo: string }
  | { tipo: 'menu' }
  | { tipo: 'fuera_de_tema' };

export const HERRAMIENTAS: DefHerramienta[] = [
  {
    nombre: 'precio_oro',
    descripcion: 'Precio de compra de oro por gramo y quilate publicado hoy por Franky\'s (USD). Única fuente válida de precios de oro.',
    esquema: { type: 'object', properties: {} },
  },
  {
    nombre: 'estimar_oro',
    descripcion: 'Calcula un estimado referencial: gramos × precio por gramo del quilate indicado.',
    esquema: {
      type: 'object',
      properties: {
        gramos: { type: 'number', description: 'Peso en gramos' },
        quilates: { type: 'integer', description: 'Quilates, por ejemplo 10, 14, 18, 22 o 24' },
      },
      required: ['gramos', 'quilates'],
    },
  },
  {
    nombre: 'tasas_divisas',
    descripcion: 'Tasas de cambio confirmadas hoy (compra y venta en USD). Si no están confirmadas devuelve CONSULTAR.',
    esquema: { type: 'object', properties: {} },
  },
  {
    nombre: 'buscar_joyas',
    descripcion:
      'Busca piezas disponibles en la tienda y se las muestra al cliente con foto, precio y link (se envían solas; no las repitas en tu texto).',
    esquema: {
      type: 'object',
      properties: {
        categoria: { type: 'string', description: 'Categoría, por ejemplo anillos, cadenas, dijes, brazaletes, relojes, zarcillos' },
        texto: { type: 'string', description: 'Palabras a buscar en el nombre, por ejemplo "cubana 14k" o "rolex"' },
        precio_maximo: { type: 'number', description: 'Precio máximo en USD' },
      },
    },
  },
  {
    nombre: 'iniciar_formulario',
    descripcion:
      'Inicia la toma de datos para que un asesor atienda: reloj (cotizar reloj o joya con piedras/marca), domicilio (préstamo a domicilio), vehiculo (préstamo con vehículo), cita_doral (cita en sede Doral).',
    esquema: {
      type: 'object',
      properties: { tipo: { type: 'string', enum: Object.keys(FORMULARIOS) } },
      required: ['tipo'],
    },
  },
  {
    nombre: 'pasar_a_asesor',
    descripcion: 'Avisa a un asesor humano para que continúe por este chat. Úsalo cuando el cliente lo pida o la respuesta requiera un asesor.',
    esquema: {
      type: 'object',
      properties: { motivo: { type: 'string', description: 'Resumen breve de lo que necesita el cliente' } },
      required: ['motivo'],
    },
  },
  {
    nombre: 'mostrar_menu',
    descripcion: 'Envía al cliente el menú de opciones.',
    esquema: { type: 'object', properties: {} },
  },
  {
    nombre: 'fuera_de_tema',
    descripcion: 'Marca que el mensaje no tiene relación con los servicios de Franky\'s (charla, chistes, tareas, otros temas).',
    esquema: { type: 'object', properties: {} },
  },
];

const EstimarIn = z.object({ gramos: z.coerce.number(), quilates: z.coerce.number().int() });
const BuscarIn = z.object({
  categoria: z.string().max(60).optional(),
  texto: z.string().max(80).optional(),
  precio_maximo: z.coerce.number().positive().optional(),
});
const FormIn = z.object({ tipo: z.enum(Object.keys(FORMULARIOS) as [string, ...string[]]) });
const AsesorIn = z.object({ motivo: z.string().max(300).default('El cliente pidió un asesor') });

export interface FuentesHerramientas {
  oro: () => Promise<LecturaOro>;
  divisas: () => Promise<LecturaDivisas>;
  tienda: FuenteTienda;
}

/** Crea el ejecutor para un turno: devuelve el texto para la IA y acumula acciones. */
export function crearEjecutor(fuentes: FuentesHerramientas, acciones: Accion[]) {
  return async (nombre: string, entrada: unknown): Promise<string> => {
    switch (nombre) {
      case 'precio_oro': {
        const o = await fuentes.oro();
        return o.ok ? tablaOro(o.tarifa) : 'NO_DISPONIBLE: no se puede confirmar el precio; ofrece un asesor.';
      }
      case 'estimar_oro': {
        const e = EstimarIn.parse(entrada);
        const o = await fuentes.oro();
        if (!o.ok) return 'NO_DISPONIBLE: no se puede confirmar el precio; ofrece un asesor.';
        const r = estimarOro(o.tarifa, e.gramos, e.quilates);
        return r.ok
          ? `${e.gramos} g de ${e.quilates}k a $${r.precioGramo}/g = ${formatoUsd(r.usd)} (estimado referencial)`
          : `NO_DISPONIBLE: ${r.motivo}`;
      }
      case 'tasas_divisas': {
        const d = await fuentes.divisas();
        if (d.estado === 'consultar') return 'CONSULTAR: las tasas se confirman con un asesor.';
        return d.tasas.map((t) => `${t.moneda}: compra ${t.compra}, venta ${t.venta}`).join('\n');
      }
      case 'buscar_joyas': {
        const b = BuscarIn.parse(entrada ?? {});
        const filtro: FiltroTienda = {
          categoria: b.categoria,
          texto: b.texto,
          precioMaximo: b.precio_maximo,
          desde: 0,
          limite: PIEZAS_POR_VISTA,
        };
        const { piezas, total } = await fuentes.tienda.buscar(filtro);
        acciones.push({ tipo: 'mostrar_joyas', filtro });
        if (total === 0) return 'Sin resultados: se le mostrará al cliente el link de la tienda.';
        return `Se le muestran ${piezas.length} de ${total} piezas: ${piezas
          .map((p) => `${p.nombre}${p.precioUsd ? ` (${formatoUsd(p.precioUsd)})` : ''}`)
          .join('; ')}`;
      }
      case 'iniciar_formulario': {
        const f = FormIn.parse(entrada);
        acciones.push({ tipo: 'formulario', formulario: f.tipo });
        return 'Formulario iniciado: la primera pregunta se envía sola. No la repitas.';
      }
      case 'pasar_a_asesor': {
        const a = AsesorIn.parse(entrada ?? {});
        acciones.push({ tipo: 'asesor', motivo: a.motivo });
        return 'Asesor avisado: el sistema le confirma al cliente. No digas horarios de respuesta.';
      }
      case 'mostrar_menu':
        acciones.push({ tipo: 'menu' });
        return 'Menú enviado.';
      case 'fuera_de_tema':
        acciones.push({ tipo: 'fuera_de_tema' });
        return 'Anotado. Responde en una línea y ofrece el menú.';
      default:
        throw new Error(`Herramienta desconocida: ${nombre}`);
    }
  };
}
