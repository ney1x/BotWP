import { AlmacenMemoria } from './almacen/memoria.js';
import { AlmacenPostgres } from './almacen/postgres.js';
import type { Almacen } from './almacen/tipos.js';
import { IAAnthropic } from './bot/ia.js';
import { Motor } from './bot/motor.js';
import { cargarConocimiento } from './conocimiento.js';
import type { Config } from './config.js';
import { FuenteDivisas } from './datos/divisas.js';
import { FuenteDivisasWix } from './datos/divisasWix.js';
import { FuenteOro } from './datos/oro.js';
import { FuenteTienda } from './datos/tienda.js';
import { log } from './log.js';
import type { ProveedorWhatsApp } from './whatsapp/tipos.js';

/** Arma el motor con sus dependencias reales a partir de la configuración. */
export function armarMotor(config: Config, wa: ProveedorWhatsApp) {
  const almacen: Almacen = config.DATABASE_URL ? new AlmacenPostgres(config.DATABASE_URL) : new AlmacenMemoria();
  if (!config.DATABASE_URL) log.warn('sin DATABASE_URL: conversaciones solo en memoria (se pierden al reiniciar)');

  const ia = !config.MODO_INFORMATIVO && config.ANTHROPIC_API_KEY
    ? new IAAnthropic(config.IA_MODELO, config.ANTHROPIC_API_KEY)
    : undefined;
  if (!config.MODO_INFORMATIVO && !ia) log.warn('sin ANTHROPIC_API_KEY: el texto libre responde con el menú');

  const motor = new Motor({
    config,
    wa,
    almacen,
    ia,
    oro: new FuenteOro(config.ORO_URL),
    tienda: new FuenteTienda(config.TIENDA_API_URL),
    divisas: config.DIVISAS_CSV_URL
      ? new FuenteDivisas(config.DIVISAS_CSV_URL, { zona: config.ZONA_HORARIA, feriados: config.FERIADOS })
      : new FuenteDivisasWix(),
    conocimiento: config.MODO_INFORMATIVO ? '' : cargarConocimiento(),
  });
  return { motor, almacen };
}
