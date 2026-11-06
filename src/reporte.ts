/**
 * Reporte mensual: mensajes cobrables, promedio diario, proyección contra los gratis de YCloud, fichas y gasto de IA.
 *   npm run reporte            → mes en curso
 *   npm run reporte -- 2026-11 → un mes puntual (máximo RETENCION_DIAS hacia atrás)
 * Lee DATABASE_URL (en Railway: la URL pública de Postgres, DATABASE_PUBLIC_URL).
 */
import { DateTime } from 'luxon';
import { AlmacenPostgres } from './almacen/postgres.js';
import { cargarConfig } from './config.js';
import { armarReporte, formatearReporte, rangoMes } from './reporteMensual.js';

const config = cargarConfig();
if (!config.DATABASE_URL) {
  console.error('Falta DATABASE_URL: sin base de datos no hay historial que reportar.');
  process.exit(1);
}

const ahora = new Date();
const mes = process.argv[2] ?? DateTime.fromJSDate(ahora, { zone: config.ZONA_HORARIA }).toFormat('yyyy-MM');
let rango;
try {
  rango = rangoMes(mes, config.ZONA_HORARIA);
} catch (e) {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
}
const { inicio, fin } = rango;

const almacen = new AlmacenPostgres(config.DATABASE_URL);
try {
  const datos = await almacen.datosReporte(inicio.toJSDate(), fin.toJSDate(), inicio.toISODate()!, fin.toISODate()!);
  const r = armarReporte(datos, {
    mes,
    zona: config.ZONA_HORARIA,
    ahora,
    gratisMes: config.YCLOUD_GRATIS_MES,
    usdPorMensaje: config.YCLOUD_USD_MENSAJE,
  });
  console.log(formatearReporte(r));
} finally {
  await almacen.cerrar();
}
