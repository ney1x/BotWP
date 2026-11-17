import type { Saliente } from '../whatsapp/tipos.js';

/** Identificadores de botones y filas de lista. */
export const ID = {
  MENU: 'MENU',
  ORO: 'MENU_ORO',
  ORO_CALC: 'ORO_CALC',
  DIVISAS: 'MENU_DIVISAS',
  TIENDA: 'MENU_TIENDA',
  TIENDA_MAS: 'TIENDA_MAS',
  EMPENO: 'MENU_EMPENO',
  COTIZAR: 'MENU_COTIZAR',
  VEHICULO: 'MENU_VEHICULO',
  DOMICILIO: 'MENU_DOMICILIO',
  CORREO: 'MENU_CORREO',
  SEDES: 'MENU_SEDES',
  ASESOR: 'MENU_ASESOR',
  SI: 'SI',
  NO: 'NO',
  LISTO: 'LISTO',
  CANCELAR: 'CANCELAR',
  FOTO_OTRA: 'FOTO_OTRA',
  SEG_NO: 'SEG_NO',
  SEG_RETOMAR: 'SEG_RETOMAR',
  SEG_FIN: 'SEG_FIN',
} as const;

export const PREFIJO = { CATEGORIA: 'CAT:', PRODUCTO: 'PROD:', FORMULARIO: 'FORM:' } as const;

const maps = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

export const SEDES = {
  kendall: {
    nombre: 'Kendall',
    direccion: '12344 SW 127th Ave, Miami, FL 33186',
    telefono: '+1 786-606-8511',
  },
  doral: {
    nombre: 'Doral (con cita previa)',
    direccion: '3399 NW 72nd Ave, Suite 225A, Miami, FL 33122',
  },
};

export const contactoKendall = `Para hablar con nuestro equipo, llame a Kendall al *${SEDES.kendall.telefono}*.`;

export function menuInformativo(): Saliente {
  return {
    clase: 'botones',
    texto: 'Hola, soy el asistente virtual de *Franky’s Efectivo*. Puedo compartir nuestras sedes, horarios y teléfono de atención.',
    botones: [
      { id: ID.SEDES, titulo: 'Sedes y horarios' },
      { id: ID.ASESOR, titulo: 'Teléfono de atención' },
    ],
  };
}

export const botonesMenu = (texto: string, extra: { id: string; titulo: string }[] = []): Saliente => ({
  clase: 'botones',
  texto,
  botones: [...extra, { id: ID.MENU, titulo: 'Ver menú' }].slice(0, 3),
});

export function menuPrincipal(texto = '¿En qué le puedo ayudar? Elija una opción o escríbame su pregunta.'): Saliente {
  return {
    clase: 'lista',
    texto,
    boton: 'Ver opciones',
    secciones: [
      {
        titulo: 'Consultas',
        filas: [
          { id: ID.ORO, titulo: 'Precio del oro', descripcion: 'Precio por gramo y cálculo de su pieza' },
          { id: ID.TIENDA, titulo: 'Joyas disponibles', descripcion: 'Anillos, cadenas, relojes y más' },
        ],
      },
      {
        titulo: 'Servicios',
        filas: [
          { id: ID.EMPENO, titulo: 'Empeño y préstamos', descripcion: 'Con garantía de sus joyas' },
          { id: ID.COTIZAR, titulo: 'Cotizar reloj o joya', descripcion: 'Envíe fotos y un asesor le cotiza' },
          { id: ID.VEHICULO, titulo: 'Préstamo con vehículo', descripcion: 'Autos, motos, camiones y botes' },
          { id: ID.DOMICILIO, titulo: 'Préstamo a domicilio', descripcion: 'Evaluación en su casa u oficina' },
        ],
      },
      {
        titulo: 'Contacto',
        filas: [
          { id: ID.SEDES, titulo: 'Sedes y horarios', descripcion: 'Kendall y Doral' },
          { id: ID.ASESOR, titulo: 'Hablar con un asesor' },
        ],
      },
    ],
  };
}

const bienvenida = (nombre?: string): string =>
  `¡Hola${nombre ? ` ${nombre}` : ''}! 👋 Soy el asistente virtual de *Franky's Efectivo*. Puedo darle información sobre el precio del oro, empeño, joyas disponibles y nuestras sedes.`;

export const T = {
  bienvenida,

  bienvenidaConMenu: (nombre?: string) =>
    `${bienvenida(nombre)}\n\n¿En qué le puedo ayudar? Elija una opción o escríbame su pregunta.`,

  oroNoDisponible:
    'En este momento no puedo consultar el precio del oro. Si desea, un asesor se lo confirma.',

  oroTabla: (tabla: string) =>
    `*Precio de compra de oro hoy* (USD por gramo):\n${tabla}\n\nEs un precio de referencia; la oferta final depende de la evaluación de la pieza. Si quiere, le ayudo a calcular un estimado.`,

  oroPedirPeso: 'Escríbame el peso y los quilates, por ejemplo: *5 g de 18k*.',

  oroEstimado: (gramos: number, quilates: number, usd: string, precio: number) =>
    `${gramos} g de ${quilates}k × $${precio}/g = *${usd}* aproximadamente.\n\nEs un estimado referencial: la oferta final se da al evaluar la pieza en tienda (peso real y pureza).`,

  oroSinQuilate: (quilates: number) =>
    `No tengo un precio publicado para ${quilates}k. Si desea, un asesor puede cotizarle esa pieza.`,

  /** Divisas: por política de WhatsApp (real currency) no se dan tasas ni se coordinan cambios por el chat. */
  divisasPresencial: () =>
    `El cambio de divisas se hace únicamente en persona en nuestras sedes; las tasas se confirman ahí, en horario de atención.\n\nSi tiene dudas, puede llamar a Kendall al *${SEDES.kendall.telefono}*.`,

  empeno:
    '*Empeño con garantía de joyas* 💍\nPuede traer su oro o su reloj fino a nuestra sede, aunque la pieza esté rota. La evaluamos frente a usted y le hacemos una oferta sin compromiso. Si la acepta, su joya queda resguardada hasta que la recupere.\n\nNo aceptamos bisutería ni piezas enchapadas. Las condiciones se las explica un asesor según su pieza.' +
    `\n\nSi tiene otra consulta, con gusto le atendemos en persona en nuestra oficina de *Kendall* (${SEDES.kendall.direccion}).`,

  vehiculo:
    '*Préstamo con garantía de vehículo* 🚗\nAceptamos autos, motos, camiones y botes como garantía.\n\nRequisitos: vehículo libre de deuda, título a su nombre e identificación oficial. El vehículo queda resguardado en nuestras instalaciones mientras dure el préstamo. Las condiciones las define un asesor después de evaluar el vehículo.',

  domicilio:
    '*Empeño a domicilio* 🏠\nCon cita previa, un especialista visita su casa u oficina y evalúa sus joyas frente a usted. Le hace una oferta sin compromiso y, si la acepta, sus joyas quedan resguardadas hasta que las recupere.',

  correo:
    '*Envío de joyas por correo* 📦 (solo EE.UU.)\n1. Ponga sus joyas en doble bolsa con cierre (tipo Ziplock) con una copia de su identificación y selle con cinta.\n2. Envíelas por FedEx o USPS y guarde el número de rastreo. Viajan aseguradas hasta $1.000.\n3. La evaluación y cualquier oferta se hacen al recibir la pieza en la tienda; le contactamos para que vea la evaluación en vivo. La oferta es sin compromiso.\n\nNunca le pediremos pagos por adelantado ni datos de tarjeta o cuenta bancaria. Antes de enviar nada, hable con un asesor: él le confirma la dirección oficial de envío.',

  sedes: () =>
    `*Nuestras sedes* 📍\n\n*${SEDES.kendall.nombre}*\n${SEDES.kendall.direccion}\nTel. ${SEDES.kendall.telefono}\n${maps(SEDES.kendall.direccion)}\n\n*${SEDES.doral.nombre}*\n${SEDES.doral.direccion}\n${maps(SEDES.doral.direccion)}\n\n🕘 Lunes a sábado de 9:00 a 18:30. Domingos y feriados cerrado.`,

  tiendaCategorias: 'Estas son las categorías de joyas disponibles:',
  tiendaVacia: 'No encontré piezas disponibles con ese criterio. Puede ver todas en nuestra tienda en línea:',
  tiendaInteres: '¿Le interesa alguna de estas piezas?',

  asesorAbierto: 'Listo ✅ Un asesor le escribirá por este mismo chat lo antes posible.',
  asesorCerrado: (cuando: string) =>
    `En este momento estamos cerrados. Abrimos ${cuando} y un asesor le escribirá en cuanto abramos. Mientras tanto, con gusto le ayudo con lo que necesite.`,
  asesorYaPedido: 'Ya avisé a un asesor y le escribirá por este chat. Mientras tanto, ¿le ayudo con algo más?',
  asesorFallo:
    `No pude avisar a un asesor en este momento, disculpe 🙏 Puede tocar *Reintentar* en unos minutos o llamar a Kendall al *${SEDES.kendall.telefono}*.`,

  audio: 'Disculpe, por ahora no puedo escuchar audios 🙏 ¿Me escribe su consulta? Si prefiere, le paso con un asesor.',
  fotoSuelta:
    'Gracias por su foto 📷 Trabajamos con oro, joyas y relojes. Si es una de esas piezas, toque *Cotizar pieza* y le pido unos datos. Si es otra cosa, un asesor la revisa.',
  fotoOtra: 'Le paso la foto a un asesor para que la revise.',
  otroTipo: 'Gracias por su mensaje. Por ahora solo puedo leer texto y fotos.',
  noEntendi: 'Disculpe, no estoy seguro de haberle entendido. Puede elegir una opción del menú o escribirme su pregunta de otra forma.',
  errorTecnico: 'Disculpe, tuve un problema técnico al responder. Puede elegir una opción del menú o pedir hablar con un asesor.',

  pensarlo: 'Claro, sin apuro 🙂 Cuando quiera retomarlo, escríbame aquí.',
  pensarloAgendado: (cuando: string) => `Claro, sin apuro 🙂 Le escribo ${cuando} por si desea retomarlo. Si prefiere que no le escriba, toque *No me escriba*.`,
  sinSeguimiento: 'Entendido, no le volveremos a escribir. Cuando quiera retomarlo, escríbame aquí.',
  seguimientoPensarlo: (tema: string, nombre?: string) =>
    `Hola${nombre ? ` ${nombre}` : ''} 👋 Como quedamos, le escribo sobre ${tema}. Si desea retomarlo, aquí estoy; si no, toque *No, gracias* y no le volveremos a escribir.`,
  seguimientoFormulario: (tema: string, nombre?: string) =>
    `Hola${nombre ? ` ${nombre}` : ''} 👋 Quedó pendiente ${tema}. Si desea, seguimos donde lo dejó; si ya no le interesa, toque *No, gracias* y no le volveremos a escribir.`,
  retomar: 'Perfecto, seguimos donde lo dejamos.',
  noInteresado: 'Entendido, gracias por avisarnos. No le volveremos a escribir; aquí estamos cuando nos necesite.',

  limiteRespuestas:
    `Por hoy llegamos al límite de respuestas automáticas. Si necesita ayuda, un asesor puede atenderle por este chat o puede llamar a Kendall al *${SEDES.kendall.telefono}*.`,
  soloMenu: 'Por ahora le puedo ayudar con las opciones del menú.',
  pasaASoloMenu:
    'Disculpe, solo puedo ayudarle con temas de Franky\'s Efectivo: oro, empeño, joyas y nuestras sedes. Por hoy le muestro solo el menú.',
} as const;
