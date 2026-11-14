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
          { id: ID.DIVISAS, titulo: 'Cambio de divisas', descripcion: 'Tasas de compra y venta' },
          { id: ID.TIENDA, titulo: 'Joyas disponibles', descripcion: 'Anillos, cadenas, relojes y más' },
        ],
      },
      {
        titulo: 'Servicios',
        filas: [
          { id: ID.EMPENO, titulo: 'Empeño y préstamos', descripcion: 'Préstamo con garantía de sus joyas' },
          { id: ID.COTIZAR, titulo: 'Cotizar reloj o joya', descripcion: 'Envíe fotos y un asesor le cotiza' },
          { id: ID.VEHICULO, titulo: 'Préstamo con vehículo', descripcion: 'Hasta 50 % del valor, sin revisar crédito' },
          { id: ID.DOMICILIO, titulo: 'Préstamo a domicilio', descripcion: 'Vamos a su casa u oficina' },
          { id: ID.CORREO, titulo: 'Enviar por correo', descripcion: 'Venda o empeñe desde casa (solo EE.UU.)' },
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
  `¡Hola${nombre ? ` ${nombre}` : ''}! 👋 Soy el asistente virtual de *Franky's Efectivo*. Le ayudo con el precio del oro, empeño, préstamos, divisas y nuestras joyas disponibles.`;

export const T = {
  bienvenida,

  bienvenidaConMenu: (nombre?: string) =>
    `${bienvenida(nombre)}\n\n¿En qué le puedo ayudar? Elija una opción o escríbame su pregunta.`,

  oroNoDisponible:
    'En este momento no puedo confirmar el precio del oro. Un asesor se lo da enseguida.',

  oroTabla: (tabla: string) =>
    `*Precio de compra de oro hoy* (USD por gramo):\n${tabla}\n\nEs un precio referencial; la oferta final se da al evaluar la pieza. ¿Quiere calcular su pieza?`,

  oroPedirPeso: 'Escríbame el peso y los quilates, por ejemplo: *5 g de 18k*.',

  oroEstimado: (gramos: number, quilates: number, usd: string, precio: number) =>
    `${gramos} g de ${quilates}k × $${precio}/g = *${usd}* aproximadamente.\n\nEs un estimado referencial: la oferta final se da al evaluar la pieza en tienda (peso real y pureza).`,

  oroSinQuilate: (quilates: number) =>
    `No tengo precio publicado para ${quilates}k. Un asesor puede cotizarle esa pieza.`,

  divisasTasas: (lineas: string, referencial: boolean) =>
    `*${referencial ? 'Tasas de cambio referenciales publicadas' : 'Tasas de cambio de hoy'}* (USD por unidad)\n${lineas}\n\nLas tasas pueden variar. ¿Desea que un asesor le confirme la operación?`,

  divisasConsultar:
    'Las tasas de cambio se confirman en el momento con un asesor, porque varían durante el día. ¿Desea que le escriba uno?',

  empeno:
    '*Préstamo con garantía de joyas* 💍\nTraiga su oro o su reloj (Rolex, Cartier), también piezas rotas. Lo evaluamos frente a usted y, si acepta la oferta, recibe el dinero al instante. Su joya queda resguardada hasta que pague el préstamo.\n\nNo aceptamos bisutería ni enchapados. El monto, el interés y el plazo se los da un asesor según su pieza.' +
    `\n\nSi no tiene una joya o un vehículo para dejar en garantía, puede consultar en persona en nuestra oficina de *Kendall* (${SEDES.kendall.direccion}).`,

  vehiculo:
    '*Préstamo con garantía de vehículo* 🚗\nHasta el 50 % del valor comercial, sin revisar su crédito. Aceptamos autos, motos, camiones y botes.\n\nRequisitos: vehículo libre de deuda, título a su nombre e identificación oficial. El vehículo queda resguardado en nuestras instalaciones durante el préstamo.',

  domicilio:
    '*Préstamo a domicilio* 🏠\nUn especialista va a su casa u oficina, evalúa sus joyas frente a usted y, si acepta la oferta, le entrega el dinero en el momento. Sus joyas quedan resguardadas hasta que las recupere.',

  correo:
    '*Venda o empeñe por correo* 📦 (solo EE.UU.)\n1. Ponga sus joyas en doble bolsa con cierre (tipo Ziplock) con una copia de su identificación y selle con cinta.\n2. Envíelas por FedEx o USPS y guarde el número de rastreo. Viajan aseguradas hasta $1.000.\n3. Al recibirlas le contactamos para que vea la evaluación en vivo y le hacemos una oferta. Le pagamos por transferencia, PayPal, cheque o en efectivo.\n\nUn asesor le da la dirección de envío.',

  sedes: () =>
    `*Nuestras sedes* 📍\n\n*${SEDES.kendall.nombre}*\n${SEDES.kendall.direccion}\nTel. ${SEDES.kendall.telefono}\n${maps(SEDES.kendall.direccion)}\n\n*${SEDES.doral.nombre}*\n${SEDES.doral.direccion}\n${maps(SEDES.doral.direccion)}\n\n🕘 Lunes a sábado de 9:00 a 18:30. Domingos y feriados cerrado.`,

  tiendaCategorias: 'Estas son las categorías de joyas disponibles:',
  tiendaVacia: 'No encontré piezas disponibles con ese criterio. Puede ver todas en nuestra tienda en línea:',
  tiendaInteres: '¿Le interesa alguna de estas piezas?',

  asesorAbierto: 'Listo ✅ Un asesor le escribirá por este mismo chat en breve.',
  asesorCerrado: (cuando: string) =>
    `Ahora estamos cerrados. Abrimos ${cuando} y un asesor le escribirá apenas abramos. Mientras tanto, puedo ayudarle con lo que necesite.`,
  asesorYaPedido: 'Ya avisé a un asesor; le escribirá por este chat. Mientras tanto, ¿le ayudo con algo más?',

  audio: 'Por ahora no puedo escuchar audios 🙏 Escríbame su consulta o, si prefiere, le paso con un asesor.',
  fotoSuelta: 'Recibí su foto 📷 ¿Quiere que un asesor cotice esa pieza?',
  otroTipo: 'Recibí su mensaje, pero solo puedo leer texto y fotos.',
  noEntendi: 'No estoy seguro de haberle entendido. Elija una opción del menú o escriba su pregunta de otra forma.',
  errorTecnico: 'Tuve un problema técnico al responder. Por favor elija una opción del menú o pida hablar con un asesor.',

  limiteRespuestas:
    'Hemos llegado al límite de respuestas automáticas por hoy. Si necesita ayuda, un asesor puede atenderle por este chat.',
  soloMenu: 'Por ahora solo puedo ayudarle con las opciones del menú.',
  pasaASoloMenu:
    'Solo puedo ayudarle con temas de Franky\'s Efectivo: oro, empeño, préstamos, divisas y joyas. Por hoy le muestro solo el menú.',
} as const;
