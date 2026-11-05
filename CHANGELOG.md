# Changelog

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Added
- Estructura inicial del repositorio: README, .gitignore, .gitattributes, CHANGELOG y guía de flujo de trabajo.
- Validador de tarifa de oro (`src/precios/validarTarifa.js`): formato, quilates requeridos, orden por quilate, coherencia de pureza, rango 24k y salto máximo contra la última lectura. Tests con `node --test`.
