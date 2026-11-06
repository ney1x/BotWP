import type { Almacen, Conversacion, Ficha } from '../almacen/tipos.js';
import { conversacionNueva } from '../almacen/tipos.js';
import type { Config } from '../config.js';
import type { FuenteDivisas } from '../datos/divisas.js';
import { estimarOro, interpretarPeso, tablaOro, type FuenteOro } from '../datos/oro.js';
import { formatoUsd, PIEZAS_POR_VISTA, type FiltroTienda, type FuenteTienda } from '../datos/tienda.js';
import { ahoraLegible, describirApertura, diaLocal, estaAbierto, type OpcionesHorario } from '../horario.js';
import { errorATexto, log } from '../log.js';
import type { Contenido, Entrante, ProveedorWhatsApp, Saliente } from '../whatsapp/tipos.js';
import { avanzar, datosEtiquetados, FORMULARIOS, nuevoFormulario, preguntaDe } from './formularios.js';
import { crearEjecutor, HERRAMIENTAS, type Accion } from './herramientas.js';
import type { ProveedorIA } from './ia.js';
import { contextoTurno, promptSistema } from './sistema.js';
import { botonesMenu, ID, menuPrincipal, PREFIJO, T } from './textos.js';

export interface Dependencias {
  config: Config;
  wa: ProveedorWhatsApp;
  almacen: Almacen;
  oro: FuenteOro;
  tienda: FuenteTienda;
  divisas: FuenteDivisas;
  ia?: ProveedorIA;
  conocimiento: string;
  reloj?: () => Date;
}

const HISTORIAL_MAX = 12;
const HISTORIAL_IA = 6;
const TEXTO_MAX = 1000;
const HORA = 60 * 60 * 1000;

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const RE_MENU = /^(menu|inicio|opciones|volver|start)$/;
const RE_SALUDO = /^(hola+|buenas|buenos dias|buenas tardes|buenas noches|hi|hello|hey|saludos)\b/;
const RE_ASESOR =
  /^(asesor|humano|representante|agente|operador)$|\b(hablar|comunicar|pasar|contactar|quiero|necesito)\b.*\b(asesor|humano|persona|representante|agente|alguien)\b/;
const RE_CODIGO_BOT = /#bot\b/i;

/** Evita que el nombre de perfil inyecte instrucciones en el contexto de la IA. */
const limpiarNombre = (n?: string) =>
  n
    ?.replace(/[^\p{L}\p{M} .'-]/gu, '')
    .trim()
    .slice(0, 40) || undefined;

/** Antepone `prefijo` al texto del primer mensaje que tenga texto, sin agregar mensajes. */
export function anteponer(salida: Saliente[], prefijo?: string): Saliente[] {
  if (!prefijo) return salida;
  const [primero, ...resto] = salida;
  if (primero && primero.clase !== 'imagen') return [{ ...primero, texto: `${prefijo}\n\n${primero.texto}` }, ...resto];
  return [{ clase: 'texto', texto: prefijo }, ...salida];
}

/** Orquesta un mensaje entrante → respuestas. Un mensaje a la vez por teléfono. */
export class Motor {
  private readonly colas = new Map<string, Promise<void>>();
  private readonly sistema: string;
  private readonly horario: OpcionesHorario;

  constructor(private readonly d: Dependencias) {
    this.sistema = promptSistema(d.conocimiento);
    this.horario = { zona: d.config.ZONA_HORARIA, feriados: d.config.FERIADOS };
  }

  private ahora() {
    return this.d.reloj?.() ?? new Date();
  }

  /** Encola por teléfono para no procesar dos mensajes del mismo cliente a la vez. */
  procesar(e: Entrante): Promise<void> {
    const tel = e.tipo === 'mensaje' ? e.de : e.para;
    const previa = this.colas.get(tel) ?? Promise.resolve();
    const siguiente = previa
      .then(() => this.manejar(e))
      .catch((err) => log.error('motor: error', { tel, error: errorATexto(err) }));
    this.colas.set(tel, siguiente);
    void siguiente.finally(() => {
      if (this.colas.get(tel) === siguiente) this.colas.delete(tel);
    });
    return siguiente;
  }

  private async manejar(e: Entrante) {
    if (await this.d.almacen.yaProcesado(e.id)) return;
    if (e.tipo === 'eco') return this.manejarEco(e.para, e.texto);

    const tel = e.de;
    if (this.d.config.BLOQUEADOS.includes(tel)) return;
    const ahora = this.ahora();
    const previa = await this.d.almacen.obtenerConversacion(tel);
    const conv = previa ?? conversacionNueva(tel, ahora);
    conv.nombre = limpiarNombre(e.nombre) ?? conv.nombre;

    const textoLog =
      e.contenido.clase === 'texto' ? e.contenido.texto : e.contenido.clase === 'opcion' ? `[${e.contenido.titulo}]` : `[${e.contenido.clase}]`;
    await this.d.almacen.registrarMensaje(tel, 'entrante', textoLog);
    this.agregarTurno(conv, 'usuario', textoLog.slice(0, TEXTO_MAX));

    try {
      // Un asesor está atendiendo: el bot calla salvo que pidan el menú.
      if (conv.pausadoHasta && new Date(conv.pausadoHasta) > ahora) {
        const pideMenu =
          (e.contenido.clase === 'texto' && RE_MENU.test(norm(e.contenido.texto))) ||
          (e.contenido.clase === 'opcion' && e.contenido.id === ID.MENU);
        if (!pideMenu) return;
        conv.pausadoHasta = undefined;
        conv.esperandoAsesor = undefined;
      }

      const salida = await this.decidir(conv, e.contenido, !previa);
      if (salida.length === 0) return;

      const respuestas = await this.d.almacen.incrementar(tel, 'respuestas', diaLocal(ahora, this.horario.zona));
      const limite = this.d.config.LIMITE_RESPUESTAS_DIA;
      if (respuestas > limite + 1) return;
      if (respuestas === limite + 1) return await this.enviar(conv, [{ clase: 'texto', texto: T.limiteRespuestas }]);
      await this.enviar(conv, salida);
    } finally {
      conv.actualizado = ahora.toISOString();
      await this.d.almacen.guardarConversacion(conv);
    }
  }

  /** Mensaje del asesor desde la app: pausa el bot; "#bot" lo devuelve. */
  private async manejarEco(tel: string, texto?: string) {
    const ahora = this.ahora();
    const conv = (await this.d.almacen.obtenerConversacion(tel)) ?? conversacionNueva(tel, ahora);
    if (texto) {
      await this.d.almacen.registrarMensaje(tel, 'asesor', texto);
      this.agregarTurno(conv, 'bot', `[Asesor] ${texto}`);
    }
    if (texto && RE_CODIGO_BOT.test(texto)) {
      conv.pausadoHasta = undefined;
      conv.esperandoAsesor = undefined;
    } else {
      conv.pausadoHasta = new Date(ahora.getTime() + this.d.config.PAUSA_ASESOR_HORAS * HORA).toISOString();
    }
    conv.formulario = undefined;
    conv.actualizado = ahora.toISOString();
    await this.d.almacen.guardarConversacion(conv);
  }

  private async decidir(conv: Conversacion, c: Contenido, esNueva: boolean): Promise<Saliente[]> {
    const ahora = this.ahora();

    if (c.clase === 'audio') {
      return [{ clase: 'botones', texto: T.audio, botones: [{ id: ID.ASESOR, titulo: 'Hablar con asesor' }, { id: ID.MENU, titulo: 'Ver menú' }] }];
    }

    // Formulario en curso.
    if (conv.formulario) {
      const r = avanzar(conv.formulario, c);
      if (r.estado === 'cancelado') {
        conv.formulario = undefined;
        return [menuPrincipal('Listo, lo dejamos aquí. ¿En qué más le ayudo?')];
      }
      if (r.estado === 'sigue') return r.mensajes;
      const f = conv.formulario;
      conv.formulario = undefined;
      const def = FORMULARIOS[f.tipo]!;
      return this.pasarAAsesor(conv, def.motivo, f.tipo, datosEtiquetados(f), f.fotos, r.nota);
    }

    if (c.clase === 'imagen') {
      conv.fotosSueltas = [...(conv.fotosSueltas ?? []), c.mediaId].slice(-10);
      return [{ clase: 'botones', texto: T.fotoSuelta, botones: [{ id: `${PREFIJO.FORMULARIO}reloj`, titulo: 'Sí, cotizar' }, { id: ID.MENU, titulo: 'Ver menú' }] }];
    }
    if (c.clase === 'otro') return [menuPrincipal(T.otroTipo)];
    if (c.clase === 'opcion') return this.opcion(conv, c.id);

    // Texto libre.
    const texto = c.texto.slice(0, TEXTO_MAX);
    const t = norm(texto);
    if (RE_MENU.test(t)) return [menuPrincipal()];
    if (RE_SALUDO.test(t) && t.length <= 30) return [menuPrincipal(T.bienvenidaConMenu(conv.nombre))];
    if (t.length <= 80 && RE_ASESOR.test(t)) return this.pasarAAsesor(conv, 'El cliente pidió hablar con un asesor');

    const peso = interpretarPeso(texto);
    if (peso) return this.estimar(peso.gramos, peso.quilates);

    if (conv.soloMenuHasta && new Date(conv.soloMenuHasta) > ahora) return [menuPrincipal(T.soloMenu)];

    // En un chat nuevo la bienvenida va dentro del primer mensaje, no aparte (Meta cobra cada mensaje).
    const saludo = esNueva ? T.bienvenida(conv.nombre) : undefined;
    if (!this.d.ia) return anteponer([menuPrincipal(T.noEntendi)], saludo);

    const usosIA = await this.d.almacen.incrementar(conv.telefono, 'ia', diaLocal(ahora, this.horario.zona));
    if (usosIA > this.d.config.LIMITE_IA_DIA) return anteponer([menuPrincipal(T.soloMenu)], saludo);

    return anteponer(await this.conIA(conv, texto), saludo);
  }

  private async conIA(conv: Conversacion, texto: string): Promise<Saliente[]> {
    const ahora = this.ahora();
    const acciones: Accion[] = [];
    const ejecutar = crearEjecutor(
      { oro: () => this.d.oro.obtener(), divisas: () => this.d.divisas.obtener(), tienda: this.d.tienda },
      acciones,
    );
    let r;
    try {
      r = await this.d.ia!.responder({
        sistema: this.sistema,
        contexto: contextoTurno({
          ahora: ahoraLegible(ahora, this.horario.zona),
          abierto: estaAbierto(ahora, this.horario),
          proximaApertura: describirApertura(ahora, this.horario),
          nombre: conv.nombre,
          asesorAvisado: Boolean(conv.esperandoAsesor),
        }),
        // El último turno es el mensaje actual: se manda aparte.
        historial: conv.historial.slice(-HISTORIAL_IA - 1, -1),
        mensaje: texto,
        herramientas: HERRAMIENTAS,
        ejecutar,
      });
    } catch (e) {
      log.error('ia: fallo', { error: errorATexto(e) });
      return [menuPrincipal(T.errorTecnico)];
    }
    await this.registrarGasto(r.costoUsd);
    if (r.rechazo) return [menuPrincipal(T.noEntendi)];

    const salida: Saliente[] = [];
    if (r.texto) salida.push({ clase: 'texto', texto: r.texto });

    if (acciones.some((a) => a.tipo === 'fuera_de_tema')) {
      conv.fueraDeTemaSeguidos++;
      if (conv.fueraDeTemaSeguidos >= 3) {
        conv.soloMenuHasta = new Date(ahora.getTime() + 24 * HORA).toISOString();
        conv.fueraDeTemaSeguidos = 0;
        return [menuPrincipal(T.pasaASoloMenu)];
      }
    } else conv.fueraDeTemaSeguidos = 0;

    for (const a of acciones) {
      if (a.tipo === 'mostrar_joyas') salida.push(...(await this.mostrarJoyas(conv, a.filtro)));
      else if (a.tipo === 'formulario') salida.push(this.iniciarFormulario(conv, a.formulario));
      else if (a.tipo === 'asesor') salida.push(...(await this.pasarAAsesor(conv, a.motivo)));
      else if (a.tipo === 'menu') salida.push(menuPrincipal('Opciones:'));
    }
    if (salida.length === 0) salida.push(menuPrincipal(T.noEntendi));
    return salida;
  }

  private async opcion(conv: Conversacion, id: string): Promise<Saliente[]> {
    if (id.startsWith(PREFIJO.CATEGORIA)) return this.mostrarJoyas(conv, { categoria: id.slice(PREFIJO.CATEGORIA.length), desde: 0 });
    if (id.startsWith(PREFIJO.FORMULARIO)) {
      const tipo = id.slice(PREFIJO.FORMULARIO.length);
      if (!FORMULARIOS[tipo]) return [menuPrincipal()];
      return [this.iniciarFormulario(conv, tipo)];
    }
    if (id.startsWith(PREFIJO.PRODUCTO)) {
      const p = await this.d.tienda.porId(Number(id.slice(PREFIJO.PRODUCTO.length)));
      const datos: Record<string, string> = p
        ? { Pieza: p.nombre, Precio: p.precioUsd ? formatoUsd(p.precioUsd) : 'sin precio', Link: p.link }
        : { Pieza: id };
      return this.pasarAAsesor(conv, 'Interés en una pieza de la tienda', 'tienda', datos);
    }

    switch (id) {
      case ID.MENU:
        return [menuPrincipal()];
      case ID.ORO: {
        const o = await this.d.oro.obtener();
        if (!o.ok) return [botonesMenu(T.oroNoDisponible, [{ id: ID.ASESOR, titulo: 'Hablar con asesor' }])];
        return [
          {
            clase: 'botones',
            texto: T.oroTabla(tablaOro(o.tarifa)),
            botones: [
              { id: ID.ORO_CALC, titulo: 'Calcular mi pieza' },
              { id: `${PREFIJO.FORMULARIO}reloj`, titulo: 'Cotizar con asesor' },
              { id: ID.MENU, titulo: 'Ver menú' },
            ],
          },
        ];
      }
      case ID.ORO_CALC:
        return [{ clase: 'texto', texto: T.oroPedirPeso }];
      case ID.DIVISAS: {
        const dv = await this.d.divisas.obtener(this.ahora());
        if (dv.estado === 'consultar') return [botonesMenu(T.divisasConsultar, [{ id: ID.ASESOR, titulo: 'Sí, un asesor' }])];
        const lineas = dv.tasas.map((x) => `• ${x.moneda}: compra $${x.compra} · venta $${x.venta}`).join('\n');
        return [botonesMenu(T.divisasVigentes(lineas), [{ id: ID.ASESOR, titulo: 'Hablar con asesor' }])];
      }
      case ID.TIENDA: {
        const cats = await this.d.tienda.categorias();
        if (cats.length === 0) return [{ clase: 'texto', texto: `${T.tiendaVacia}\n${this.d.config.TIENDA_URL}` }];
        return [
          {
            clase: 'lista',
            texto: T.tiendaCategorias,
            boton: 'Ver categorías',
            secciones: [{ titulo: 'Categorías', filas: cats.slice(0, 10).map((c) => ({ id: `${PREFIJO.CATEGORIA}${c.slug}`, titulo: c.nombre, descripcion: `${c.cantidad} piezas` })) }],
          },
        ];
      }
      case ID.TIENDA_MAS:
        if (!conv.tienda) return [menuPrincipal()];
        return this.mostrarJoyas(conv, { ...conv.tienda });
      case ID.EMPENO:
        return [{ clase: 'botones', texto: T.empeno, botones: [{ id: `${PREFIJO.FORMULARIO}reloj`, titulo: 'Cotizar mi pieza' }, { id: ID.ASESOR, titulo: 'Hablar con asesor' }, { id: ID.MENU, titulo: 'Ver menú' }] }];
      case ID.COTIZAR:
        return [this.iniciarFormulario(conv, 'reloj')];
      case ID.VEHICULO:
        return [{ clase: 'botones', texto: T.vehiculo, botones: [{ id: `${PREFIJO.FORMULARIO}vehiculo`, titulo: 'Aplicar' }, { id: ID.ASESOR, titulo: 'Hablar con asesor' }, { id: ID.MENU, titulo: 'Ver menú' }] }];
      case ID.DOMICILIO:
        return [{ clase: 'botones', texto: T.domicilio, botones: [{ id: `${PREFIJO.FORMULARIO}domicilio`, titulo: 'Agendar visita' }, { id: ID.ASESOR, titulo: 'Hablar con asesor' }, { id: ID.MENU, titulo: 'Ver menú' }] }];
      case ID.CORREO:
        return [botonesMenu(T.correo, [{ id: ID.ASESOR, titulo: 'Pedir dirección' }])];
      case ID.SEDES:
        return [botonesMenu(T.sedes(), [{ id: `${PREFIJO.FORMULARIO}cita_doral`, titulo: 'Cita en Doral' }])];
      case ID.ASESOR:
        return this.pasarAAsesor(conv, 'El cliente pidió hablar con un asesor');
      default:
        // Botones de un formulario que ya terminó, o ids viejos.
        return [menuPrincipal()];
    }
  }

  private estimar(gramos: number, quilates: number): Promise<Saliente[]> {
    return this.d.oro.obtener().then((o) => {
      if (!o.ok) return [botonesMenu(T.oroNoDisponible, [{ id: ID.ASESOR, titulo: 'Hablar con asesor' }])];
      const r = estimarOro(o.tarifa, gramos, quilates);
      if (!r.ok) return [botonesMenu(T.oroSinQuilate(quilates), [{ id: `${PREFIJO.FORMULARIO}reloj`, titulo: 'Cotizar con asesor' }])];
      return [
        botonesMenu(T.oroEstimado(gramos, quilates, formatoUsd(r.usd), r.precioGramo), [
          { id: `${PREFIJO.FORMULARIO}reloj`, titulo: 'Cotizar con asesor' },
          { id: ID.SEDES, titulo: 'Ver sedes' },
        ]),
      ];
    });
  }

  private iniciarFormulario(conv: Conversacion, tipo: string): Saliente {
    const fotos = tipo === 'reloj' ? (conv.fotosSueltas ?? []) : [];
    conv.fotosSueltas = undefined;
    conv.formulario = nuevoFormulario(tipo, fotos);
    return preguntaDe(conv.formulario);
  }

  private async mostrarJoyas(conv: Conversacion, filtro: FiltroTienda): Promise<Saliente[]> {
    const desde = filtro.desde ?? 0;
    const { piezas, total } = await this.d.tienda.buscar({ ...filtro, desde, limite: PIEZAS_POR_VISTA });
    if (piezas.length === 0) {
      conv.tienda = undefined;
      return [botonesMenu(`${T.tiendaVacia}\n${this.d.config.TIENDA_URL}`)];
    }
    conv.tienda = { categoria: filtro.categoria, texto: filtro.texto, precioMaximo: filtro.precioMaximo, desde: desde + piezas.length };
    const salida: Saliente[] = piezas.map((p) => {
      const caption = `*${p.nombre}*\n${p.precioUsd ? formatoUsd(p.precioUsd) : 'Consultar precio'}\n${p.link}`;
      return p.imagen ? { clase: 'imagen', url: p.imagen, caption } : { clase: 'texto', texto: caption };
    });
    const filas = piezas.map((p) => ({
      id: `${PREFIJO.PRODUCTO}${p.id}`,
      titulo: p.nombre,
      descripcion: p.precioUsd ? `${formatoUsd(p.precioUsd)} · Me interesa` : 'Me interesa',
    }));
    const extra = [];
    if (desde + piezas.length < total) extra.push({ id: ID.TIENDA_MAS, titulo: 'Ver más piezas', descripcion: `Quedan ${total - desde - piezas.length}` });
    extra.push({ id: ID.MENU, titulo: 'Volver al menú' });
    salida.push({
      clase: 'lista',
      texto: T.tiendaInteres,
      boton: 'Elegir',
      secciones: [
        { titulo: 'Piezas', filas },
        { titulo: 'Más', filas: extra },
      ],
    });
    return salida;
  }

  private async pasarAAsesor(
    conv: Conversacion,
    motivo: string,
    tipo = 'asesor',
    datos: Record<string, string> = {},
    fotos: string[] = [],
    nota?: string,
  ): Promise<Saliente[]> {
    const ahora = this.ahora();
    const abierto = estaAbierto(ahora, this.horario);

    if (tipo === 'asesor' && conv.esperandoAsesor && ahora.getTime() - new Date(conv.esperandoAsesor).getTime() < 12 * HORA) {
      return [botonesMenu(T.asesorYaPedido)];
    }

    const ficha: Ficha = {
      telefono: conv.telefono,
      nombre: conv.nombre,
      tipo,
      motivo,
      datos: nota ? { ...datos, Nota: nota } : datos,
      fotos,
      fueraDeHorario: !abierto,
      creada: ahora.toISOString(),
    };
    await this.d.almacen.guardarFicha(ficha);
    conv.esperandoAsesor = ahora.toISOString();
    await this.avisarAsesor(ficha);

    const texto = abierto ? T.asesorAbierto : T.asesorCerrado(describirApertura(ahora, this.horario));
    return [abierto ? { clase: 'texto', texto } : botonesMenu(texto)];
  }

  private async avisarAsesor(f: Ficha) {
    const destino = this.d.config.ASESOR_WHATSAPP;
    const lineas = [
      `🔔 *Nueva solicitud* (${f.motivo})`,
      `Cliente: ${f.nombre ?? 'sin nombre'} · +${f.telefono}`,
      ...Object.entries(f.datos).map(([k, v]) => `${k}: ${v}`),
      f.fotos.length ? `Fotos: ${f.fotos.length} (ver en el chat del cliente)` : '',
      f.fueraDeHorario ? '⏰ Llegó fuera de horario' : '',
      `Chat: https://wa.me/${f.telefono}`,
    ].filter(Boolean);
    log.info('asesor: ficha', { telefono: f.telefono, tipo: f.tipo });
    if (!destino) return;
    try {
      await this.d.wa.enviar(destino, { clase: 'texto', texto: lineas.join('\n') });
    } catch (e) {
      log.error('asesor: no se pudo avisar', { error: errorATexto(e) });
    }
  }

  private async registrarGasto(usd: number) {
    if (usd <= 0) return;
    const dia = diaLocal(this.ahora(), this.horario.zona);
    const total = await this.d.almacen.sumarGasto(dia, usd);
    const limite = this.d.config.GASTO_ALERTA_USD_DIA;
    if (total >= limite && total - usd < limite) log.warn('gasto: superó el umbral diario de IA', { dia, total, limite });
  }

  private async enviar(conv: Conversacion, mensajes: Saliente[]) {
    for (const m of mensajes) {
      try {
        await this.d.wa.enviar(conv.telefono, m);
      } catch (e) {
        log.error('wa: envío falló', { tel: conv.telefono, error: errorATexto(e) });
        continue;
      }
      const texto = m.clase === 'texto' || m.clase === 'botones' || m.clase === 'lista' ? m.texto : (m.caption ?? '[imagen]');
      await this.d.almacen.registrarMensaje(conv.telefono, 'saliente', texto);
      if (m.clase !== 'imagen') this.agregarTurno(conv, 'bot', texto);
    }
  }

  private agregarTurno(conv: Conversacion, rol: 'usuario' | 'bot', texto: string) {
    conv.historial.push({ rol, texto, ts: this.ahora().toISOString() });
    if (conv.historial.length > HISTORIAL_MAX) conv.historial.splice(0, conv.historial.length - HISTORIAL_MAX);
  }
}
