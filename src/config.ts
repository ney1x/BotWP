import { z } from 'zod';

const lista = z
  .string()
  .default('')
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
  );

const Esquema = z.object({
  PORT: z.coerce.number().int().default(3000),

  // WhatsApp
  WA_PROVEEDOR: z.enum(['cloud']).default('cloud'),
  WA_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_APP_SECRET: z.string().optional(),
  WA_VERIFY_TOKEN: z.string().optional(),
  WA_GRAPH_VERSION: z.string().default('v23.0'),

  // IA
  ANTHROPIC_API_KEY: z.string().optional(),
  IA_MODELO: z.string().default('claude-haiku-5-5'),

  // Datos
  DATABASE_URL: z.string().optional(),
  ORO_URL: z.string().url().default('https://www.frankysefectivo.com/calcV4/dist/data/goldRate.json'),
  TIENDA_API_URL: z.string().url().default('https://www.frankysefectivo.com/wp-json/wc/store/v1/products'),
  TIENDA_URL: z.string().url().default('https://www.frankysefectivo.com/tienda/'),
  DIVISAS_CSV_URL: z.string().url().optional(),

  // Negocio
  ZONA_HORARIA: z.string().default('America/New_York'),
  FERIADOS: lista, // YYYY-MM-DD separados por coma
  ASESOR_WHATSAPP: z.string().optional(), // número (solo dígitos) que recibe las fichas
  BLOQUEADOS: lista,

  // Límites
  LIMITE_IA_DIA: z.coerce.number().int().default(20),
  LIMITE_RESPUESTAS_DIA: z.coerce.number().int().default(40),
  PAUSA_ASESOR_HORAS: z.coerce.number().default(4),
  GASTO_ALERTA_USD_DIA: z.coerce.number().default(2),
  RETENCION_DIAS: z.coerce.number().int().default(90),
});

export type Config = z.infer<typeof Esquema>;

export function cargarConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const r = Esquema.safeParse(env);
  if (!r.success) {
    const detalle = r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Configuración inválida: ${detalle}`);
  }
  return r.data;
}

/** Config con valores por defecto, útil en tests y simulador. */
export function configPorDefecto(extra: Record<string, string> = {}): Config {
  return cargarConfig(extra as NodeJS.ProcessEnv);
}
