# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Fixed
- Si el aviso a `ASESOR_WHATSAPP` falla (por ejemplo, YCloud lo rechaza), el bot ya no le promete un asesor al cliente: le ofrece *Reintentar* y el teléfono de Kendall. El siguiente pedido reenvía la misma ficha en vez de responder «Ya avisé». Antes de rendirse, el envío se reintenta una vez.
- «Déjame lo pienso» a mitad de un formulario ya no se guarda como respuesta (por ejemplo, como nombre de la pieza).
- Los botones *Retomar*, *Hablar con asesor* y *Ver menú* tocados con un formulario abierto ya no se guardan como respuesta. *Hablar con asesor* pasa los datos parciales.
- La descarga de fotos solo manda la API key (YCloud) o el token (Cloud API) por HTTPS al dominio del proveedor, y no sigue redirecciones con credenciales.
- Las fotos de una consulta anterior ya no se mezclan con las nuevas: se descartan al tocar otro botón, «menú» o un saludo.
- Si fallan reenvíos de fotos al asesor, le llega un aviso corto con cuántas faltan, y la ficha guarda `fotosReenviadas` y `fotosFallidas`.

### Added
- Seguimiento único dentro de la ventana de 24 h de Meta (sin plantilla y sin pedir permiso, que la política no exige dentro de la ventana): si el cliente dice que lo va a pensar, el bot le avisa a qué hora le escribirá (botón *No me escriba*); si deja un formulario a medias, le recuerda 2 h después. Siempre en horario de atención; si no hay horario dentro de la ventana, no se programa. Máximo uno por ventana. Se cancela si el cliente vuelve a escribir o un asesor toma el chat. *No me escriba* y *No, gracias* desactivan los seguimientos de ese contacto.
- Con `WA_PROVEEDOR=ycloud` y el flujo completo, `YCLOUD_WEBHOOK_SECRET` es obligatorio.
- Fotos sueltas: la pregunta ofrece *Cotizar pieza* o *Es otra cosa* (pasa a asesor), y se hace una sola vez por ráfaga de fotos. El aviso al asesor reenvía hasta 3 fotos (descarga, subida y envío por id en YCloud y Cloud API).
- CRM mínimo en la conversación (`crm`): estado comercial, responsable, próxima acción y cuándo. Las fichas guardan `avisado`, `estado`, `responsable` y `proximaAccion`.
- Cuando el cliente pide un asesor directamente, la ficha incluye sus últimos 3 mensajes como contexto.

## [0.2.0] - 2026-11-06

Producción con YCloud (Coexistence) y reporte mensual.

### Added
- Adaptador de YCloud para producción con Coexistence (`WA_PROVEEDOR=ycloud`): envío por `sendDirectly`, webhooks `whatsapp.inbound_message.received` y `whatsapp.smb.message.echoes`, y verificación de la firma `YCloud-Signature`.
- Guía de producción con YCloud y Railway (`docs/PRODUCCION.md`).
- Reporte mensual (`npm run reporte -- YYYY-MM`): mensajes cobrables, promedio diario, proyección contra los gratis de YCloud (`YCLOUD_GRATIS_MES`, `YCLOUD_USD_MENSAJE`), fichas por tipo, horas pico, botones más tocados y gasto de IA.
- Los avisos de ficha a `ASESOR_WHATSAPP` quedan registrados como mensajes (`aviso`) para contarlos en el reporte.

### Changed
- Guía de demo con los pasos de Meta que faltaban: token de usuario del sistema, publicar la app y suscribirla a la cuenta de WhatsApp.
- Con YCloud, `ASESOR_WHATSAPP` se deja vacío: el asesor ve los chats en su app y se ahorra un mensaje cobrable por cada pedido de asesor.

## [0.1.0] - 2026-11-05

MVP para la demo con el número de prueba de Meta.

### Added
- Estructura inicial del repositorio: README, .gitignore, .gitattributes, CHANGELOG y guía de flujo de trabajo.
- Validador de tarifa de oro (`src/precios/validarTarifa.js`): formato, quilates requeridos, orden por quilate, coherencia de pureza, rango 24k y salto máximo contra la última lectura. Tests con `node --test`.
- Proyecto en TypeScript con Vitest, Hono, Anthropic SDK, luxon y pg.
- Lectura del precio del oro desde la calculadora del sitio (caché 15 min, última lectura buena hasta 2 h) y estimados por peso y quilate.
- Inventario de la tienda desde la Store API de WooCommerce: solo piezas en español y con stock, por categoría, texto y precio máximo.
- Tasas de cambio desde una planilla CSV; cada tasa vale hasta la siguiente apertura + 1 h, si no, "Consultar".
- Horario de atención (lunes a sábado 9:00–18:30, Miami) con feriados configurables.
- Adaptador de WhatsApp Cloud API: webhook con verificación de firma, botones, listas, imágenes y ecos del asesor (Coexistence).
- Motor del bot: menú, formularios (reloj o joya, domicilio, vehículo, cita en Doral), fichas para asesor, pausa cuando el asesor escribe (`#bot` la quita), audios y fotos.
- Texto libre con IA (`claude-haiku-5-5`) que solo usa datos de las herramientas; límites diarios, modo solo menú tras 3 mensajes fuera de tema y alerta de gasto.
- Almacenamiento en memoria o PostgreSQL con retención de 90 días.
- Simulador de chat por consola (`npm run simular`) y guía de demo (`docs/DEMO.md`).
- Pendientes y decisiones de cuentas, con el plan para migrar a Tech Provider propio (`docs/PENDIENTES.md`), la respuesta de YCloud y el checklist del alta con el cliente.

### Changed
- Validador de tarifa migrado a TypeScript (`src/precios/validarTarifa.ts`), tests en Vitest.
- Menos mensajes cobrados por Meta: la bienvenida va dentro del primer mensaje (menú o respuesta) y la tienda muestra 3 piezas por vista en vez de 5.
- WhatsApp Graph API v25.0 por defecto.
- La cuenta de WhatsApp de producción va en el portfolio de Meta del cliente; el nuestro queda para la demo.

### Fixed
- `npm run dev` y `npm run simular` cargan `.env`.
- Variables vacías en `.env` cuentan como no configuradas.
