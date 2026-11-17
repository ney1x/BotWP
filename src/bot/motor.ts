import { DateTime } from 'luxon';
import type { Almacen, Conversacion, EstadoComercial, Ficha } from '../almacen/tipos.js';
import { conversacionNueva } from '../almacen/tipos.js';
import type { Config } from '../config.js';
import { estimarOro, interpretarPeso, tablaOro, type FuenteOro } from '../datos/oro.js';
import { formatoUsd, PIEZAS_POR_VISTA, type FiltroTienda, type FuenteTienda } from '../datos/tienda.js';
import { ahoraLegible, describirApertura, diaLocal, estaAbierto, siguienteApertura, type OpcionesHorario } from '../horario.js';
import { errorATexto, log } from '../log.js';
import type { Contenido, Entrante, ProveedorWhatsApp, Saliente } from '../whatsapp/tipos.js';
import { avanzar, datosEtiquetados, FORMULARIOS, nuevoFormulario, preguntaDe } from './formularios.js';
import { crearEjecutor, HERRAMIENTAS, type Accion } from './herramientas.js';
import type { ProveedorIA } from './ia.js';
import { contextoTurno, promptSistema } from './sistema.js';
import { botonesMenu, contactoKendall, ID, menuInformativo, menuPrincipal, PREFIJO, T } from './textos.js';

export interface Dependencias {
  config: Config;
  wa: ProveedorWhatsApp;
  almacen: Almacen;
  oro: FuenteOro;
  tienda: FuenteTienda;
  ia?: ProveedorIA;
  conocimiento: string;
  reloj?: () => Date;
}

const HISTORIAL_MAX = 12;
const HISTORIAL_IA = 6;
const TEXTO_MAX = 1000;
const HORA = 60 * 60 * 1000;
/** Meta permite mensajes libres hasta 24 h después del último mensaje del cliente. */
const VENTANA = 24 * HORA;
const MARGEN_VENTANA = 30 * 60 * 1000;
const RAFAGA_FOTOS = 2 * 60 * 1000;
const FOTOS_AVISO = 3;
/** Formulario a medias: se le escribe una vez pasadas estas horas sin respuesta (en horario de atención). */
const SEGUIMIENTO_FORMULARIO_HORAS = 2;

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
const RE_PENSAR =
  /\b(lo (voy a )?(pienso|pensar|pensare|consulto|consultar)|(dejame|dejeme|deja|deje) (pensar|pensarlo|ver|verlo|consultarlo)|voy a pensarlo|tengo que pensarlo|(despues|luego|mas tarde) (le|te) (escribo|aviso|confirmo)|ahorita no|i'?ll think|let me think)\b/;
/** Pedido de no recibir más mensajes (política de WhatsApp: toda baja se respeta). */
const RE_NO_ESCRIBIR =
  /^(stop|baja|unsubscribe)$|\bno (me|nos) (vuelva[ns]? a |sigan? )?(escriba|escriban|escribas|escribir|contacte|contacten|contactes|moleste|molesten|molestes)\b|\b(darme de baja|dar de baja|no quiero (recibir )?(mas )?mensajes)\b/;
/** Preguntas de cambio de divisas (sin "dólares" solo: aparece en preguntas de oro). */
const RE_DIVISAS =
  /\b(divisas?|tasas? de cambio|tipo de cambio|casa de cambio|moneda extranjera|euros?|pesos (colombianos|mexicanos|dominicanos|argentinos|chilenos)|bolivares|soles peruanos|reales brasilenos|reais|libras esterlinas|cambi\w* (de )?(dolares|moneda|monedas|billetes))\b/;
/** Preguntas de envío de joyas por correo. */
const RE_CORREO =
  /\b(por correo(?! electronico)|fedex|usps|por paqueteria|correo postal|(enviar|mandar|envio|envia|mando) (mis |las |sus |unas )?(joyas|prendas|piezas|oro|cadenas?|anillos?|relojes|reloj) por)\b/;
/** Preguntas por empeño de vehículos: solo se explica si el cliente lo pide (Meta Support, 17-nov-2026). */
const RE_VEHICULO =
  /\b(vehiculos?|carros?|autos?|motos?|motocicletas?|camion(es|eta|etas)?|botes?|lanchas?|title loan|titulo (de|del) (mi |su )?(carro|auto|vehiculo|moto))\b/;
const BOTONES_FUERA_DE_FORMULARIO = new Set<string>([ID.SEG_RETOMAR, ID.SEG_FIN, ID.SEG_NO, ID.ASESOR, ID.MENU]);
const RE_SEDES_HORARIOS = /\b(sedes?|sucursales?|horarios?|direccion(?:es)?|ubicacion(?:es)?|abren|abierto|abiertos|cierran|donde quedan|como llego)\b/;

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

function responderInformativo(c: Contenido): Saliente {
  const texto = c.clase === 'texto' ? norm(c.texto.slice(0, TEXTO_MAX)) : '';
  const id = c.clase === 'opcion' ? c.id : undefined;
  if (id === ID.SEDES || RE_SEDES_HORARIOS.test(texto)) return { clase: 'texto', texto: T.sedes() };
  if (id === ID.MENU || RE_MENU.test(texto) || (texto.length <= 30 && RE_SALUDO.test(texto))) return menuInformativo();
  if (id === ID.ASESOR || RE_ASESOR.test(texto)) return { clase: 'texto', texto: contactoKendall };
  return {
    clase: 'texto',
    texto: `Por este chat puedo compartir sedes y horarios. Escriba *menú* para ver las opciones.\n\n${contactoKendall}`,
  };
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
    return this.encolar(e.tipo === 'mensaje' ? e.de : e.para, () => this.manejar(e));
  }

  private encolar(tel: string, tarea: () => Promise<void>): Promise<void> {
    const previa = this.colas.get(tel) ?? Promise.resolve();
    const siguiente = previa
      .then(tarea)
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
    conv.crm ??= { estado: 'conversando', responsable: 'bot', actualizado: ahora.toISOString() };
    conv.ultimoEntrante = ahora.toISOString();
    // El cliente volvió a escribir: el seguimiento programado ya no hace falta.
    if (conv.seguimiento?.estado === 'programado') {
      conv.seguimiento.estado = 'cancelado';
      conv.crm.proximaAccion = undefined;
      conv.crm.proximaAccionCuando = undefined;
    }
    const informativo = this.d.config.MODO_INFORMATIVO;

    const textoLog =
      e.contenido.clase === 'texto' ? e.contenido.texto : e.contenido.clase === 'opcion' ? `[${e.contenido.titulo}]` : `[${e.contenido.clase}]`;
    await this.d.almacen.registrarMensaje(tel, 'entrante', textoLog);
    this.agregarTurno(conv, 'usuario', textoLog.slice(0, TEXTO_MAX));

    try {
      if (informativo) {
        conv.formulario = undefined;
        conv.fotosSueltas = undefined;
      }

      // Un asesor está atendiendo: el bot calla salvo que pidan el menú.
      if (conv.pausadoHasta && new Date(conv.pausadoHasta) > ahora) {
        const pideMenu =
          (e.contenido.clase === 'texto' && RE_MENU.test(norm(e.contenido.texto))) ||
          (e.contenido.clase === 'opcion' && e.contenido.id === ID.MENU);
        if (!pideMenu) return;
        conv.pausadoHasta = undefined;
        conv.esperandoAsesor = undefined;
      }

      const salida = informativo ? [responderInformativo(e.contenido)] : await this.decidir(conv, e.contenido, !previa);
      // Formulario a medias: si el cliente deja de responder, un único recordatorio dentro de la ventana.
      if (!informativo) this.recordarFormulario(conv);
      if (salida.length === 0) return;

      const respuestas = await this.d.almacen.incrementar(tel, 'respuestas', diaLocal(ahora, this.horario.zona));
      const limite = this.d.config.LIMITE_RESPUESTAS_DIA;
      if (respuestas > limite + 1) return;
      if (respuestas === limite + 1) {
        const texto = informativo ? contactoKendall : T.limiteRespuestas;
        await this.enviar(conv, [{ clase: 'texto', texto }]);
        return;
      }
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
    if (conv.seguimiento?.estado === 'programado') conv.seguimiento.estado = 'cancelado';
    if (texto && RE_CODIGO_BOT.test(texto)) {
      conv.pausadoHasta = undefined;
      conv.esperandoAsesor = undefined;
      this.marcar(conv, 'conversando', 'bot');
    } else {
      conv.pausadoHasta = new Date(ahora.getTime() + this.d.config.PAUSA_ASESOR_HORAS * HORA).toISOString();
      conv.avisoPendiente = undefined;
      this.marcar(conv, 'en_atencion', this.responsableAsesor(), 'Asesor: continuar la atención en la app');
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

    // "No me escriban": se respeta antes que cualquier otro flujo.
    if (c.clase === 'texto' && c.texto.length <= 80 && RE_NO_ESCRIBIR.test(norm(c.texto))) {
      conv.formulario = undefined;
      conv.formularioPausado = undefined;
      return this.opcion(conv, ID.SEG_NO);
    }

    // "Déjame lo pienso": no se guarda como respuesta; se ofrece un único seguimiento.
    if (c.clase === 'texto' && c.texto.length <= 60 && RE_PENSAR.test(norm(c.texto))) return this.pensarlo(conv);

    // Botones que no son respuestas del formulario (seguimiento, asesor, menú): no se guardan como dato.
    if (conv.formulario && c.clase === 'opcion' && BOTONES_FUERA_DE_FORMULARIO.has(c.id)) {
      const f = conv.formulario;
      if (c.id === ID.ASESOR) {
        conv.formulario = undefined;
        const def = FORMULARIOS[f.tipo]!;
        return this.pasarAAsesor(conv, `${def.motivo} (formulario incompleto)`, f.tipo, datosEtiquetados(f), f.fotos);
      }
      if (c.id === ID.MENU) {
        conv.formulario = undefined;
        this.marcar(conv, 'conversando', 'bot');
        return [menuPrincipal()];
      }
      return this.opcion(conv, c.id);
    }

    // Formulario en curso.
    if (conv.formulario) {
      const r = avanzar(conv.formulario, c);
      if (r.estado === 'cancelado') {
        conv.formulario = undefined;
        this.marcar(conv, 'conversando', 'bot');
        return [menuPrincipal('Listo, lo dejamos aquí. ¿En qué más le ayudo?')];
      }
      if (r.estado === 'sigue') return r.mensajes;
      const f = conv.formulario;
      conv.formulario = undefined;
      const def = FORMULARIOS[f.tipo]!;
      return this.pasarAAsesor(conv, def.motivo, f.tipo, datosEtiquetados(f), f.fotos, r.nota);
    }

    if (c.clase === 'imagen') {
      conv.fotosSueltas = [...(conv.fotosSueltas ?? []), c.url ?? c.mediaId].slice(-10);
      // Varias fotos seguidas: se pregunta una sola vez.
      const rafaga = conv.ultimaFotoSuelta && ahora.getTime() - new Date(conv.ultimaFotoSuelta).getTime() < RAFAGA_FOTOS;
      conv.ultimaFotoSuelta = ahora.toISOString();
      if (rafaga) return [];
      return [
        {
          clase: 'botones',
          texto: T.fotoSuelta,
          botones: [
            { id: `${PREFIJO.FORMULARIO}reloj`, titulo: 'Cotizar pieza' },
            { id: ID.FOTO_OTRA, titulo: 'Es otra cosa' },
            { id: ID.MENU, titulo: 'Ver menú' },
          ],
        },
      ];
    }
    if (c.clase === 'otro') return [menuPrincipal(T.otroTipo)];
    if (c.clase === 'opcion') return this.opcion(conv, c.id);

    // Texto libre.
    const texto = c.texto.slice(0, TEXTO_MAX);
    const t = norm(texto);
    if (RE_MENU.test(t)) {
      this.olvidarFotosSueltas(conv);
      return [menuPrincipal()];
    }
    if (RE_SALUDO.test(t) && t.length <= 30) {
      this.olvidarFotosSueltas(conv);
      return [menuPrincipal(T.bienvenidaConMenu(conv.nombre))];
    }
    if (t.length <= 80 && RE_ASESOR.test(t)) return this.pasarAAsesor(conv, 'El cliente pidió hablar con un asesor');

    // En un chat nuevo la bienvenida va dentro del primer mensaje, no aparte (Meta cobra cada mensaje).
    const saludo = esNueva ? T.bienvenida(conv.nombre) : undefined;
    // Divisas y envío por correo: respuesta fija, sin IA (política de WhatsApp).
    if (RE_DIVISAS.test(t)) return anteponer([this.divisasPresencial()], saludo);
    if (RE_CORREO.test(t)) return anteponer([this.correo()], saludo);
    if (RE_VEHICULO.test(t)) return anteponer([this.vehiculo()], saludo);

    const peso = interpretarPeso(texto);
    if (peso) return this.estimar(peso.gramos, peso.quilates);

    if (conv.soloMenuHasta && new Date(conv.soloMenuHasta) > ahora) return [menuPrincipal(T.soloMenu)];

    if (!this.d.ia) return anteponer([menuPrincipal(T.noEntendi)], saludo);

    const usosIA = await this.d.almacen.incrementar(conv.telefono, 'ia', diaLocal(ahora, this.horario.zona));
    if (usosIA > this.d.config.LIMITE_IA_DIA) return anteponer([menuPrincipal(T.soloMenu)], saludo);

    return anteponer(await this.conIA(conv, texto), saludo);
  }

  private async conIA(conv: Conversacion, texto: string): Promise<Saliente[]> {
    const ahora = this.ahora();
    const acciones: Accion[] = [];
    const ejecutar = crearEjecutor(
      { oro: () => this.d.oro.obtener(), tienda: this.d.tienda },
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
    // Otro botón = el cliente pasó a otra cosa: las fotos sueltas ya no son de esta consulta.
    if (id !== `${PREFIJO.FORMULARIO}reloj` && id !== ID.FOTO_OTRA) this.olvidarFotosSueltas(conv);
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
      case ID.DIVISAS:
        // Botón de menús viejos: el menú actual ya no ofrece divisas.
        return [this.divisasPresencial()];
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
        // Botón de menús viejos: el menú actual ya no ofrece vehículos.
        return [this.vehiculo()];
      case ID.DOMICILIO:
        return [{ clase: 'botones', texto: T.domicilio, botones: [{ id: `${PREFIJO.FORMULARIO}domicilio`, titulo: 'Agendar visita' }, { id: ID.ASESOR, titulo: 'Hablar con asesor' }, { id: ID.MENU, titulo: 'Ver menú' }] }];
      case ID.CORREO:
        // Solo desde botones de menús viejos o si el cliente pregunta: el menú actual no lo ofrece.
        return [this.correo()];
      case ID.SEDES:
        return [botonesMenu(T.sedes(), [{ id: `${PREFIJO.FORMULARIO}cita_doral`, titulo: 'Cita en Doral' }])];
      case ID.ASESOR:
        return this.pasarAAsesor(conv, 'El cliente pidió hablar con un asesor');
      case ID.FOTO_OTRA: {
        const fotos = conv.fotosSueltas ?? [];
        conv.fotosSueltas = undefined;
        conv.ultimaFotoSuelta = undefined;
        const r = await this.pasarAAsesor(conv, 'Envió foto(s) de un artículo que no es joya ni reloj', 'foto', {}, fotos);
        return anteponer(r, T.fotoOtra);
      }
      case ID.SEG_NO:
        // Pidió que no le escribamos: se respeta (política de WhatsApp) y no se vuelve a programar.
        conv.sinSeguimiento = true;
        if (conv.seguimiento?.estado === 'programado') conv.seguimiento.estado = 'cancelado';
        this.marcar(conv, 'pensandolo', 'bot', 'Esperar a que el cliente escriba');
        return [botonesMenu(T.sinSeguimiento)];
      case ID.SEG_RETOMAR: {
        if (conv.formulario) return anteponer([preguntaDe(conv.formulario)], T.retomar);
        const f = conv.formularioPausado;
        conv.formularioPausado = undefined;
        if (!f || !FORMULARIOS[f.tipo]) {
          this.marcar(conv, 'conversando', 'bot');
          return [menuPrincipal(`${T.retomar} ¿En qué le ayudo?`)];
        }
        conv.formulario = f;
        this.marcar(conv, 'en_formulario', 'bot', 'Bot: completar el formulario');
        return anteponer([preguntaDe(f)], T.retomar);
      }
      case ID.SEG_FIN:
        conv.formulario = undefined;
        conv.formularioPausado = undefined;
        conv.sinSeguimiento = true;
        this.marcar(conv, 'no_interesado', 'bot');
        return [{ clase: 'texto', texto: T.noInteresado }];
      default:
        // Botones de un formulario que ya terminó, o ids viejos.
        return [menuPrincipal()];
    }
  }

  private divisasPresencial(): Saliente {
    return botonesMenu(T.divisasPresencial(), [{ id: ID.SEDES, titulo: 'Ver sedes' }]);
  }

  private vehiculo(): Saliente {
    return {
      clase: 'botones',
      texto: T.vehiculo,
      botones: [
        { id: `${PREFIJO.FORMULARIO}vehiculo`, titulo: 'Dejar mis datos' },
        { id: ID.ASESOR, titulo: 'Hablar con asesor' },
        { id: ID.MENU, titulo: 'Ver menú' },
      ],
    };
  }

  private correo(): Saliente {
    return botonesMenu(T.correo, [{ id: ID.ASESOR, titulo: 'Pedir dirección' }]);
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
    conv.ultimaFotoSuelta = undefined;
    conv.formularioPausado = undefined;
    conv.formulario = nuevoFormulario(tipo, fotos);
    this.marcar(conv, 'en_formulario', 'bot', 'Bot: completar el formulario');
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

    const responsable = this.responsableAsesor();
    const proximaAccion = abierto ? 'Asesor: escribirle al cliente por este chat' : 'Asesor: escribirle al cliente al abrir';
    const cuando = abierto ? ahora : siguienteApertura(ahora, this.horario);
    const comun = { fueraDeHorario: !abierto, estado: 'pendiente_asesor' as const, responsable, proximaAccion };

    // Si un aviso anterior falló y el cliente vuelve a pedir asesor, se reintenta esa misma ficha (datos y fotos).
    const pendiente = tipo === 'asesor' ? conv.avisoPendiente : undefined;
    const ficha: Ficha = pendiente
      ? { ...pendiente, ...comun }
      : {
          telefono: conv.telefono,
          nombre: conv.nombre,
          tipo,
          motivo,
          datos: { ...(tipo === 'asesor' ? this.ultimosMensajes(conv) : {}), ...datos, ...(nota ? { Nota: nota } : {}) },
          fotos,
          creada: ahora.toISOString(),
          ...comun,
        };

    const avisado = await this.avisarAsesor(ficha);
    if (!avisado) {
      ficha.estado = 'aviso_fallido';
      ficha.proximaAccion = 'Revisar el chat en la app: el aviso al asesor no salió';
    }
    ficha.avisado = avisado;
    if (ficha.id) {
      const { estado, proximaAccion: pa, fotosReenviadas, fotosFallidas } = ficha;
      await this.d.almacen.actualizarFicha(ficha.id, { avisado, estado, proximaAccion: pa, fotosReenviadas, fotosFallidas });
    }
    else ficha.id = await this.d.almacen.guardarFicha(ficha);

    if (!avisado) {
      conv.esperandoAsesor = undefined;
      conv.avisoPendiente = ficha;
      this.marcar(conv, 'aviso_fallido', responsable, ficha.proximaAccion, ahora);
      return [botonesMenu(T.asesorFallo, [{ id: ID.ASESOR, titulo: 'Reintentar' }])];
    }

    conv.avisoPendiente = undefined;
    conv.esperandoAsesor = ahora.toISOString();
    this.marcar(conv, 'pendiente_asesor', responsable, ficha.proximaAccion, cuando);
    const texto = abierto ? T.asesorAbierto : T.asesorCerrado(describirApertura(ahora, this.horario));
    return [abierto ? { clase: 'texto', texto } : botonesMenu(texto)];
  }

  /** Últimos mensajes del cliente: dan contexto cuando el motivo es genérico. */
  private ultimosMensajes(conv: Conversacion): Record<string, string> {
    const ultimos = conv.historial
      .filter((t) => t.rol === 'usuario')
      .slice(-3)
      .map((t) => `“${t.texto.slice(0, 120)}”`);
    return ultimos.length ? { 'Últimos mensajes': ultimos.join(' · ') } : {};
  }

  private responsableAsesor(): string {
    const destino = this.d.config.ASESOR_WHATSAPP;
    return destino ? `asesor (+${destino})` : 'asesor';
  }

  /** true si el aviso salió (o si no hay número configurado: el equipo ve el chat en la app). */
  private async avisarAsesor(f: Ficha): Promise<boolean> {
    f.fotosReenviadas = undefined;
    f.fotosFallidas = undefined;
    const destino = this.d.config.ASESOR_WHATSAPP;
    const reenvia = Boolean(this.d.wa.reenviarImagen) && f.fotos.length > 0;
    const lineas = [
      `🔔 *Nueva solicitud* (${f.motivo})`,
      `Cliente: ${f.nombre ?? 'sin nombre'} · +${f.telefono}`,
      ...Object.entries(f.datos).map(([k, v]) => `${k}: ${v}`),
      f.fotos.length
        ? `Fotos: ${f.fotos.length}${reenvia ? ` (abajo van hasta ${Math.min(f.fotos.length, FOTOS_AVISO)}; si alguna no llega, le aviso)` : ' (ver en el chat del cliente)'}`
        : '',
      f.fueraDeHorario ? '⏰ Llegó fuera de horario' : '',
      f.proximaAccion ? `Próxima acción: ${f.proximaAccion}` : '',
      `Chat: https://wa.me/${f.telefono}`,
    ].filter(Boolean);
    log.info('asesor: ficha', { telefono: f.telefono, tipo: f.tipo });
    if (!destino) return true;

    let enviado = false;
    for (let intento = 1; intento <= 2 && !enviado; intento++) {
      try {
        await this.d.wa.enviar(destino, { clase: 'texto', texto: lineas.join('\n') });
        enviado = true;
      } catch (e) {
        log.error('asesor: no se pudo avisar', { intento, error: errorATexto(e) });
      }
    }
    if (!enviado) return false;
    await this.d.almacen.registrarMensaje(destino, 'aviso', `[ficha ${f.tipo}]`);

    if (reenvia) {
      const intento = f.fotos.slice(0, FOTOS_AVISO);
      let ok = 0;
      for (const ref of intento) {
        try {
          await this.d.wa.reenviarImagen!(destino, ref, `Foto de +${f.telefono}`);
          await this.d.almacen.registrarMensaje(destino, 'aviso', `[foto ficha ${f.tipo}]`);
          ok++;
        } catch (e) {
          log.warn('asesor: no se pudo reenviar una foto', { error: errorATexto(e) });
        }
      }
      f.fotosReenviadas = ok;
      f.fotosFallidas = intento.length - ok;
      if (f.fotosFallidas > 0) {
        // El asesor tiene que saber que faltan fotos: un aviso corto (un mensaje cobrable solo cuando falla).
        f.proximaAccion = `${f.proximaAccion ?? 'Asesor: escribirle al cliente'}. Ver ${f.fotosFallidas} foto(s) en el chat: no se pudieron reenviar`;
        try {
          await this.d.wa.enviar(destino, {
            clase: 'texto',
            texto: `⚠️ No pude reenviar ${f.fotosFallidas} de ${intento.length} foto(s) de +${f.telefono}. Véalas en el chat: https://wa.me/${f.telefono}`,
          });
          await this.d.almacen.registrarMensaje(destino, 'aviso', `[fotos fallidas ${f.tipo}]`);
        } catch (e) {
          log.error('asesor: no se pudo avisar de las fotos fallidas', { error: errorATexto(e) });
        }
      }
    }
    return true;
  }

  /**
   * "Déjame lo pienso": pausa el formulario (si hay) y programa un único seguimiento.
   * Meta permite responder sin plantilla dentro de las 24 h desde el último mensaje del cliente;
   * no hace falta pedir permiso, pero sí respetar un "no me escriba".
   */
  private pensarlo(conv: Conversacion): Saliente[] {
    if (conv.formulario) conv.formularioPausado = conv.formulario;
    conv.formulario = undefined;
    const tema = conv.formularioPausado ? (FORMULARIOS[conv.formularioPausado.tipo]?.tema ?? 'su consulta') : 'su consulta';
    const cuando = this.programarSeguimiento(conv, 'pensarlo', tema);
    if (!cuando) {
      this.marcar(conv, 'pensandolo', 'bot', 'Esperar a que el cliente escriba');
      return [botonesMenu(T.pensarlo)];
    }
    return [botonesMenu(T.pensarloAgendado(this.describirCuando(cuando, this.ahora())), [{ id: ID.SEG_NO, titulo: 'No me escriba' }])];
  }

  /** Programa un único seguimiento dentro de la ventana de 24 h. Devuelve cuándo, o undefined si no corresponde. */
  private programarSeguimiento(conv: Conversacion, motivo: 'pensarlo' | 'formulario', tema: string): Date | undefined {
    const ahora = this.ahora();
    if (conv.sinSeguimiento || this.d.config.BLOQUEADOS.includes(conv.telefono)) return undefined;
    if (conv.ultimoSeguimiento && ahora.getTime() - new Date(conv.ultimoSeguimiento).getTime() < VENTANA) return undefined;
    const cuando = this.horaSeguimiento(ahora, motivo === 'pensarlo' ? 'tarde' : 'pronto');
    if (!cuando) return undefined;
    conv.seguimiento = { motivo, cuando: cuando.toISOString(), tema, creado: ahora.toISOString(), estado: 'programado' };
    if (motivo === 'pensarlo') this.marcar(conv, 'seguimiento_programado', 'bot', 'Bot: enviar un único seguimiento', cuando);
    return cuando;
  }

  private recordarFormulario(conv: Conversacion) {
    if (!conv.formulario || conv.seguimiento?.estado === 'programado') return;
    this.programarSeguimiento(conv, 'formulario', FORMULARIOS[conv.formulario.tipo]?.tema ?? 'su consulta');
  }

  /**
   * Hora de atención dentro de la ventana (a partir del último mensaje del cliente = ahora).
   * tarde: lo más tarde posible (hasta 22 h, deja margen) · pronto: desde SEGUIMIENTO_FORMULARIO_HORAS.
   * Si no hay ninguna hora de atención en la ventana, no se programa: no se escribe de noche ni en días cerrados.
   */
  private horaSeguimiento(ahora: Date, preferencia: 'tarde' | 'pronto'): Date | undefined {
    const horas = Array.from({ length: 22 - SEGUIMIENTO_FORMULARIO_HORAS + 1 }, (_, i) => i + SEGUIMIENTO_FORMULARIO_HORAS);
    if (preferencia === 'tarde') horas.reverse();
    for (const h of horas) {
      const t = new Date(ahora.getTime() + h * HORA);
      if (estaAbierto(t, this.horario)) return t;
    }
    return undefined;
  }

  private describirCuando(t: Date, ahora: Date): string {
    const zona = this.horario.zona;
    const dt = DateTime.fromJSDate(t, { zone: zona });
    const dia = dt.hasSame(DateTime.fromJSDate(ahora, { zone: zona }), 'day') ? 'hoy' : 'mañana';
    return `${dia} a las ${dt.toFormat('H:mm')}`;
  }

  /** Envía los seguimientos que vencieron. Lo llama un temporizador. */
  async enviarSeguimientos(): Promise<void> {
    if (this.d.config.MODO_INFORMATIVO) return;
    const tels = await this.d.almacen.seguimientosVencidos(this.ahora());
    for (const tel of tels) await this.encolar(tel, () => this.enviarSeguimiento(tel));
  }

  private async enviarSeguimiento(tel: string) {
    const ahora = this.ahora();
    const conv = await this.d.almacen.obtenerConversacion(tel);
    const s = conv?.seguimiento;
    if (!conv || !s || s.estado !== 'programado' || new Date(s.cuando) > ahora) return;

    const ultimo = conv.ultimoEntrante ? new Date(conv.ultimoEntrante).getTime() : 0;
    const pausado = conv.pausadoHasta && new Date(conv.pausadoHasta) > ahora;
    const formularioVivo = s.motivo !== 'formulario' || Boolean(conv.formulario);
    if (pausado || conv.sinSeguimiento || !formularioVivo || this.d.config.BLOQUEADOS.includes(tel)) {
      s.estado = 'cancelado';
    } else if (ahora.getTime() - ultimo > VENTANA - MARGEN_VENTANA) {
      // Fuera de la ventana solo se puede con plantilla aprobada: no se envía.
      s.estado = 'vencido';
      this.marcar(conv, 'sin_respuesta', 'bot', 'Ventana de 24 h cerrada: solo con plantilla aprobada o llamada');
    } else {
      const ok = await this.enviar(conv, [
        {
          clase: 'botones',
          texto: s.motivo === 'formulario' ? T.seguimientoFormulario(s.tema, conv.nombre) : T.seguimientoPensarlo(s.tema, conv.nombre),
          botones: [
            { id: ID.SEG_RETOMAR, titulo: 'Retomar' },
            { id: ID.ASESOR, titulo: 'Hablar con asesor' },
            { id: ID.SEG_FIN, titulo: 'No, gracias' },
          ],
        },
      ]);
      s.estado = ok ? 'enviado' : 'cancelado';
      if (ok) conv.ultimoSeguimiento = ahora.toISOString();
      if (ok) this.marcar(conv, 'seguimiento_enviado', 'bot', 'Esperar respuesta del cliente');
      else this.marcar(conv, 'pensandolo', 'bot', 'El seguimiento no se pudo enviar: revisar el chat');
    }
    conv.actualizado = ahora.toISOString();
    await this.d.almacen.guardarConversacion(conv);
  }

  private olvidarFotosSueltas(conv: Conversacion) {
    conv.fotosSueltas = undefined;
    conv.ultimaFotoSuelta = undefined;
  }

  private marcar(conv: Conversacion, estado: EstadoComercial, responsable?: string, proximaAccion?: string, cuando?: Date) {
    conv.crm = {
      estado,
      responsable: responsable ?? conv.crm?.responsable ?? 'bot',
      proximaAccion,
      proximaAccionCuando: cuando?.toISOString(),
      actualizado: this.ahora().toISOString(),
    };
  }

  private async registrarGasto(usd: number) {
    if (usd <= 0) return;
    const dia = diaLocal(this.ahora(), this.horario.zona);
    const total = await this.d.almacen.sumarGasto(dia, usd);
    const limite = this.d.config.GASTO_ALERTA_USD_DIA;
    if (total >= limite && total - usd < limite) log.warn('gasto: superó el umbral diario de IA', { dia, total, limite });
  }

  /** Devuelve false si algún mensaje no salió. */
  private async enviar(conv: Conversacion, mensajes: Saliente[]): Promise<boolean> {
    let todos = true;
    for (const m of mensajes) {
      try {
        await this.d.wa.enviar(conv.telefono, m);
      } catch (e) {
        log.error('wa: envío falló', { tel: conv.telefono, error: errorATexto(e) });
        todos = false;
        continue;
      }
      const texto = m.clase === 'texto' || m.clase === 'botones' || m.clase === 'lista' ? m.texto : (m.caption ?? '[imagen]');
      await this.d.almacen.registrarMensaje(conv.telefono, 'saliente', texto);
      if (m.clase !== 'imagen') this.agregarTurno(conv, 'bot', texto);
    }
    return todos;
  }

  private agregarTurno(conv: Conversacion, rol: 'usuario' | 'bot', texto: string) {
    conv.historial.push({ rol, texto, ts: this.ahora().toISOString() });
    if (conv.historial.length > HISTORIAL_MAX) conv.historial.splice(0, conv.historial.length - HISTORIAL_MAX);
  }
}
