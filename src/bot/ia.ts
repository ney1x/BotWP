import Anthropic from '@anthropic-ai/sdk';
import type { Turno } from '../almacen/tipos.js';
import { log } from '../log.js';

/** Contrato neutral para poder cambiar de proveedor (LLM_PROVIDER) sin tocar el motor. */
export interface DefHerramienta {
  nombre: string;
  descripcion: string;
  esquema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}

export interface PeticionIA {
  sistema: string; // estable: reglas + base de conocimiento (se cachea)
  contexto: string; // cambia en cada turno: hora, estado de la tienda…
  historial: Turno[];
  mensaje: string;
  herramientas: DefHerramienta[];
  ejecutar: (nombre: string, entrada: unknown) => Promise<string>;
}

export interface RespuestaIA {
  texto: string;
  costoUsd: number;
  rechazo: boolean;
}

export interface ProveedorIA {
  responder(p: PeticionIA): Promise<RespuestaIA>;
}

/** USD por millón de tokens. */
const PRECIOS: Record<string, { entrada: number; salida: number }> = {
  'claude-haiku-5-5': { entrada: 0.1, salida: 0.5 },
  'claude-sonnet-5-5': { entrada: 2, salida: 10 },
};

export class IAAnthropic implements ProveedorIA {
  private readonly cliente: Anthropic;

  constructor(
    private readonly modelo: string,
    apiKey?: string,
    cliente?: Anthropic,
    private readonly maxIteraciones = 4,
  ) {
    this.cliente = cliente ?? new Anthropic(apiKey ? { apiKey } : {});
  }

  async responder(p: PeticionIA): Promise<RespuestaIA> {
    const tools: Anthropic.Tool[] = p.herramientas.map((h) => ({
      name: h.nombre,
      description: h.descripcion,
      input_schema: h.esquema,
    }));

    const messages: Anthropic.MessageParam[] = [];
    for (const t of p.historial) {
      if (messages.length === 0 && t.rol !== 'usuario') continue; // el primer mensaje debe ser del usuario
      messages.push({ role: t.rol === 'usuario' ? 'user' : 'assistant', content: t.texto });
    }
    messages.push({ role: 'user', content: p.mensaje });
    // Contexto volátil como mensaje de sistema intermedio: no invalida el caché del prompt estable.
    messages.push({ role: 'system', content: p.contexto });

    let costo = 0;
    let texto = '';
    for (let i = 0; i < this.maxIteraciones; i++) {
      const r = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: 2048,
        system: [{ type: 'text', text: p.sistema, cache_control: { type: 'ephemeral' } }],
        tools,
        messages,
        output_config: { effort: 'low' },
      });
      costo += this.costo(r.usage);

      if (r.stop_reason === 'refusal') {
        log.warn('ia: rechazo', { categoria: r.stop_details?.category ?? null });
        return { texto: '', costoUsd: costo, rechazo: true };
      }

      const parcial = r.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('\n')
        .trim();
      if (parcial) texto = parcial;

      const usos = r.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
      if (r.stop_reason !== 'tool_use' || usos.length === 0) break;

      messages.push({ role: 'assistant', content: r.content });
      const resultados: Anthropic.ToolResultBlockParam[] = [];
      for (const u of usos) {
        try {
          resultados.push({ type: 'tool_result', tool_use_id: u.id, content: await p.ejecutar(u.name, u.input) });
        } catch (e) {
          resultados.push({
            type: 'tool_result',
            tool_use_id: u.id,
            is_error: true,
            content: e instanceof Error ? e.message : String(e),
          });
        }
      }
      messages.push({ role: 'user', content: resultados });
    }
    return { texto, costoUsd: costo, rechazo: false };
  }

  private costo(u: Anthropic.Usage): number {
    const pr = PRECIOS[this.modelo] ?? PRECIOS['claude-haiku-5-5']!;
    const m = 1_000_000;
    return (
      (u.input_tokens * pr.entrada +
        (u.cache_creation_input_tokens ?? 0) * pr.entrada * 1.25 +
        (u.cache_read_input_tokens ?? 0) * pr.entrada * 0.1 +
        u.output_tokens * pr.salida) /
      m
    );
  }
}
