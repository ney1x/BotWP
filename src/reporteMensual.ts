import { DateTime } from 'luxon';
import type { DatosReporte } from './almacen/tipos.js';

export interface OpcionesReporte {
  mes: string; // YYYY-MM
  zona: string;
  ahora: Date;
  gratisMes: number;
  usdPorMensaje: number;
}

export interface Reporte {
  mes: string;
  parcial: boolean; // el mes todavía no terminó
  diasMes: number;
  diasMedidos: number; // desde el primer mensaje (o el 1.º) hasta fin de mes (o ahora)
  chats: number; // clientes distintos que escribieron
  entrantes: number;
  salientes: number; // respuestas del bot
  avisos: number; // fichas enviadas a ASESOR_WHATSAPP
  delAsesor: number; // escritos desde la app (no pasan por la API)
  cobrables: number; // salientes + avisos: los que cuenta YCloud
  promedioDiario: number;
  porChat: number;
  proyeccionMes: number;
  gratisMes: number;
  usoGratisPct: number;
  costoYCloudUsd: number; // sobre la proyección
  fichas: number;
  fichasPorTipo: [string, number][];
  fichasFueraDeHorario: number;
  gastoIAUsd: number;
  horasPico: [number, number][]; // [hora local, mensajes entrantes]
  temas: [string, number][]; // botones más tocados
}

/** Inicio y fin (exclusivo) del mes en la zona del negocio. */
export function rangoMes(mes: string, zona: string) {
  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error(`Mes inválido: "${mes}" (formato YYYY-MM)`);
  const inicio = DateTime.fromISO(`${mes}-01`, { zone: zona });
  if (!inicio.isValid) throw new Error(`Mes inválido: "${mes}"`);
  const fin = inicio.plus({ months: 1 });
  return { inicio, fin };
}

const NO_TEMA = new Set(['[imagen]', '[audio]', '[otro]']);

const top = (m: Map<string, number>, n: number) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
const contar = <K>(m: Map<K, number>, k: K) => m.set(k, (m.get(k) ?? 0) + 1);
const redondear = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d;

export function armarReporte(datos: DatosReporte, o: OpcionesReporte): Reporte {
  const { inicio, fin } = rangoMes(o.mes, o.zona);
  const ahora = DateTime.fromJSDate(o.ahora, { zone: o.zona });
  const diasMes = Math.round(fin.diff(inicio, 'days').days);

  const por = (d: string) => datos.mensajes.filter((m) => m.direccion === d);
  const entrantes = por('entrante');
  const salientes = por('saliente').length;
  const avisos = por('aviso').length;
  const cobrables = salientes + avisos;

  // Si el bot arrancó a mitad de mes, el promedio se mide desde el primer mensaje.
  const primero = datos.mensajes.reduce<Date | undefined>((min, m) => (!min || m.creado < min ? m.creado : min), undefined);
  const desde = primero ? DateTime.max(inicio, DateTime.fromJSDate(primero, { zone: o.zona }).startOf('day')) : inicio;
  const hasta = DateTime.min(fin, ahora);
  const diasMedidos = Math.max(1, Math.ceil(hasta.diff(desde, 'days').days));

  const chats = new Set(entrantes.map((m) => m.telefono)).size;
  const promedioDiario = cobrables / diasMedidos;
  const proyeccionMes = Math.round(promedioDiario * diasMes);

  const horas = new Map<number, number>();
  const temas = new Map<string, number>();
  for (const m of entrantes) {
    contar(horas, DateTime.fromJSDate(m.creado, { zone: o.zona }).hour);
    if (/^\[.+\]$/.test(m.texto) && !NO_TEMA.has(m.texto)) contar(temas, m.texto.slice(1, -1));
  }
  const tipos = new Map<string, number>();
  for (const f of datos.fichas) contar(tipos, f.tipo);

  return {
    mes: o.mes,
    parcial: ahora < fin,
    diasMes,
    diasMedidos,
    chats,
    entrantes: entrantes.length,
    salientes,
    avisos,
    delAsesor: por('asesor').length,
    cobrables,
    promedioDiario: redondear(promedioDiario),
    porChat: chats ? redondear(salientes / chats) : 0,
    proyeccionMes,
    gratisMes: o.gratisMes,
    usoGratisPct: o.gratisMes ? Math.round((proyeccionMes / o.gratisMes) * 100) : 0,
    costoYCloudUsd: redondear(Math.max(0, proyeccionMes - o.gratisMes) * o.usdPorMensaje, 2),
    fichas: datos.fichas.length,
    fichasPorTipo: top(tipos, 10),
    fichasFueraDeHorario: datos.fichas.filter((f) => f.fueraDeHorario).length,
    gastoIAUsd: redondear(
      datos.gastosIA.reduce((s, g) => s + g.usd, 0),
      2,
    ),
    horasPico: [...horas].sort((a, b) => b[1] - a[1]).slice(0, 3),
    temas: top(temas, 5),
  };
}

const usd = (x: number) => `$${x.toFixed(2)}`;

export function formatearReporte(r: Reporte): string {
  const lista = (xs: [string | number, number][], fmt = (k: string | number) => String(k)) =>
    xs.length ? xs.map(([k, v]) => `  - ${fmt(k)}: ${v}`).join('\n') : '  (sin datos)';
  return [
    `Reporte ${r.mes}${r.parcial ? ' (parcial, mes en curso)' : ''}`,
    `Días medidos: ${r.diasMedidos} de ${r.diasMes}`,
    '',
    'Mensajes',
    `  Chats distintos: ${r.chats}`,
    `  Del cliente: ${r.entrantes}`,
    `  Del bot: ${r.salientes} (${r.porChat} por chat)`,
    `  Avisos al asesor (ASESOR_WHATSAPP): ${r.avisos}`,
    `  Del asesor desde la app: ${r.delAsesor} (no cobrables)`,
    '',
    'Cuenta de YCloud',
    `  Cobrables: ${r.cobrables} (bot + avisos)`,
    `  Promedio diario: ${r.promedioDiario}`,
    `  Proyección del mes: ${r.proyeccionMes} de ${r.gratisMes} gratis (${r.usoGratisPct} %)`,
    `  Costo estimado sobre los gratis: ${usd(r.costoYCloudUsd)}`,
    '',
    `IA: ${usd(r.gastoIAUsd)}`,
    '',
    `Fichas para asesor: ${r.fichas} (${r.fichasFueraDeHorario} fuera de horario)`,
    lista(r.fichasPorTipo),
    '',
    'Horas pico (mensajes del cliente)',
    lista(r.horasPico, (h) => `${String(h).padStart(2, '0')}:00`),
    '',
    'Botones más tocados',
    lista(r.temas),
  ].join('\n');
}
