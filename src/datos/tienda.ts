import { log, errorATexto } from '../log.js';

/** Piezas por vista: cada una es un mensaje cobrado por Meta. */
export const PIEZAS_POR_VISTA = 3;

export interface Producto {
  id: number;
  nombre: string;
  precioUsd: number | null;
  link: string;
  imagen?: string;
  categorias: { slug: string; nombre: string }[];
}

export interface Categoria {
  slug: string;
  nombre: string;
  cantidad: number;
}

export interface FiltroTienda {
  categoria?: string;
  texto?: string;
  precioMaximo?: number;
  desde?: number;
  limite?: number;
}

type Fetch = typeof fetch;

interface ProductoWc {
  id: number;
  name: string;
  permalink: string;
  is_in_stock?: boolean;
  prices?: { price?: string; currency_minor_unit?: number };
  images?: { src?: string; thumbnail?: string }[];
  categories?: { slug: string; name: string }[];
}

const decodificar = (s: string) =>
  s
    .replace(/&#8217;|&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#8211;/g, '–')
    .replace(/<[^>]+>/g, '');

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Convierte un producto de la Store API de WooCommerce. Devuelve null si no se debe mostrar. */
export function convertirProducto(p: ProductoWc): Producto | null {
  if (p.is_in_stock === false) return null;
  // El sitio duplica cada pieza en inglés (Polylang): se muestran solo las de español.
  if (/\/en\//.test(p.permalink)) return null;
  const unidad = p.prices?.currency_minor_unit ?? 2;
  const bruto = p.prices?.price ? Number(p.prices.price) : NaN;
  return {
    id: p.id,
    nombre: decodificar(p.name),
    precioUsd: Number.isFinite(bruto) && bruto > 0 ? bruto / 10 ** unidad : null,
    link: p.permalink,
    imagen: p.images?.[0]?.src,
    categorias: (p.categories ?? []).map((c) => ({ slug: c.slug, nombre: decodificar(c.name) })),
  };
}

/** Inventario público de la tienda. Se refresca cada 90 min; si falla, se mantiene el anterior. */
export class FuenteTienda {
  private productos: Producto[] = [];
  private leidoEn = 0;
  private cargando?: Promise<void>;

  constructor(
    private readonly apiUrl: string,
    private readonly f: Fetch = fetch,
    private readonly ttlMs = 90 * 60 * 1000,
  ) {}

  async todos(ahora = Date.now()): Promise<Producto[]> {
    if (ahora - this.leidoEn > this.ttlMs) {
      this.cargando ??= this.cargar(ahora).finally(() => (this.cargando = undefined));
      // Si ya hay datos, no se bloquea la respuesta esperando la recarga.
      if (this.productos.length === 0) await this.cargando;
    }
    return this.productos;
  }

  private async cargar(ahora: number) {
    try {
      const todos: Producto[] = [];
      for (let pagina = 1; pagina <= 20; pagina++) {
        const url = `${this.apiUrl}?per_page=100&page=${pagina}`;
        const res = await this.f(url, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status} en página ${pagina}`);
        const lote = (await res.json()) as ProductoWc[];
        for (const p of lote) {
          const c = convertirProducto(p);
          if (c) todos.push(c);
        }
        if (lote.length < 100) break;
      }
      this.productos = todos;
      this.leidoEn = ahora;
      log.info('tienda: inventario cargado', { piezas: todos.length });
    } catch (e) {
      log.warn('tienda: error de carga', { error: errorATexto(e) });
      this.leidoEn = ahora - this.ttlMs + 5 * 60 * 1000; // reintentar en 5 min
    }
  }

  async categorias(): Promise<Categoria[]> {
    const mapa = new Map<string, Categoria>();
    for (const p of await this.todos()) {
      for (const c of p.categorias) {
        const actual = mapa.get(c.slug) ?? { ...c, cantidad: 0 };
        actual.cantidad++;
        mapa.set(c.slug, actual);
      }
    }
    return [...mapa.values()].sort((a, b) => b.cantidad - a.cantidad);
  }

  async buscar(f: FiltroTienda): Promise<{ piezas: Producto[]; total: number }> {
    const texto = f.texto ? normalizar(f.texto) : undefined;
    const cat = f.categoria ? normalizar(f.categoria) : undefined;
    const filtrados = (await this.todos()).filter((p) => {
      if (cat && !p.categorias.some((c) => normalizar(c.slug) === cat || normalizar(c.nombre).includes(cat)))
        return false;
      if (f.precioMaximo !== undefined && (p.precioUsd === null || p.precioUsd > f.precioMaximo)) return false;
      if (texto && !texto.split(/\s+/).every((w) => normalizar(p.nombre).includes(w))) return false;
      return true;
    });
    const desde = f.desde ?? 0;
    return { piezas: filtrados.slice(desde, desde + (f.limite ?? PIEZAS_POR_VISTA)), total: filtrados.length };
  }

  async porId(id: number): Promise<Producto | undefined> {
    return (await this.todos()).find((p) => p.id === id);
  }
}

export function formatoUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}
