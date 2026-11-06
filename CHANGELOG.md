# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

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
