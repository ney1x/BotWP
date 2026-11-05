import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raizProyecto = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Concatena kb/*.md en orden alfabético (texto estable → aprovecha el caché de prompts). */
export function cargarConocimiento(dir = path.join(raizProyecto, 'kb')): string {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => readFileSync(path.join(dir, f), 'utf8').trim())
    .join('\n\n---\n\n');
}
