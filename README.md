# BotWP

Bot de WhatsApp para Franky's Efectivo (Miami). Proyecto personal documentado paso a paso: cada funcionalidad se desarrolla en su propia rama y entra a `main` mediante Pull Request.

## Estado

🚧 MVP para demo. Ver [CHANGELOG](CHANGELOG.md) para el historial de cambios.

## Qué hace

- Precio de compra del oro por quilate, leído en vivo de la calculadora del sitio, y estimados ("5 g de 18k").
- Tasas de cambio desde una planilla que edita el negocio; si no están confirmadas, "Consultar" y asesor.
- Joyas disponibles de la tienda WooCommerce, con foto, precio y link.
- Información de empeño, préstamos (joyas, domicilio, vehículo) y envío por correo.
- Formularios que arman una ficha para el asesor: cotizar reloj o joya, visita a domicilio, vehículo, cita en Doral.
- Texto libre con IA (Claude Haiku 5.5) que solo usa datos de las herramientas: nunca inventa precios ni da intereses o plazos.
- Paso a asesor con horario (lunes a sábado 9:00–18:30), pausa del bot cuando el asesor escribe desde la app (Coexistence) y límites anti-spam.

## Stack

- Node.js 22+ y TypeScript
- [Hono](https://hono.dev) para el webhook
- WhatsApp: Cloud API de Meta (demo) o YCloud con Coexistence (producción), según `WA_PROVEEDOR`
- Anthropic SDK (`claude-haiku-5-5`)
- PostgreSQL (opcional: sin `DATABASE_URL` usa memoria)
- Vitest

## Requisitos

- Git
- Node.js 22 o superior

## Instalación

```bash
git clone https://github.com/ney1x/BotWP.git
cd BotWP
npm install
```

## Uso

| Comando | Qué hace |
|---|---|
| `npm run simular` | Chat de prueba por consola, sin WhatsApp |
| `npm run dev` | Servidor del webhook con recarga |
| `npm test` | Tests |
| `npm run typecheck` | Verificación de tipos |
| `npm run build` y `npm start` | Compilar y arrancar en producción |

Guía de la demo con el número de prueba de Meta: [docs/DEMO.md](docs/DEMO.md). Producción con YCloud y Railway: [docs/PRODUCCION.md](docs/PRODUCCION.md).

## Configuración

Las variables sensibles van en `.env` (nunca se sube). Plantilla en [.env.example](.env.example).

La información del negocio que usa la IA está en `kb/*.md`. Lo marcado `[PENDIENTE]` espera confirmación del cliente.

## Estructura

```
src/
  bot/        motor, menús, formularios, IA y herramientas
  datos/      oro, tienda y divisas
  whatsapp/   adaptador Cloud API y tipos internos
  almacen/    memoria y Postgres
  precios/    validador de la tarifa de oro
kb/           base de conocimiento
test/
```

## Flujo de trabajo

Ramas, convención de commits y proceso de PR: [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Licencia

_Por definir._
