type Nivel = 'debug' | 'info' | 'warn' | 'error';

function escribir(nivel: Nivel, msg: string, datos?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'test' && nivel !== 'error') return;
  const linea = JSON.stringify({ t: new Date().toISOString(), nivel, msg, ...datos });
  if (nivel === 'error' || nivel === 'warn') console.error(linea);
  else console.log(linea);
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => escribir('debug', m, d),
  info: (m: string, d?: Record<string, unknown>) => escribir('info', m, d),
  warn: (m: string, d?: Record<string, unknown>) => escribir('warn', m, d),
  error: (m: string, d?: Record<string, unknown>) => escribir('error', m, d),
};

export function errorATexto(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
