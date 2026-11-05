# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

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

### Changed
- Validador de tarifa migrado a TypeScript (`src/precios/validarTarifa.ts`), tests en Vitest.
