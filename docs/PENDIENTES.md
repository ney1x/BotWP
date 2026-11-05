# Pendientes y decisiones

## Decisiones de cuentas

| Cuenta | A nombre de | Nota |
|---|---|---|
| Meta Business (portafolio donde vive el número de WhatsApp) | Nosotros | El número del cliente (+1 786-878-2085) se conecta a nuestro portafolio. El cliente escanea el QR desde su app WhatsApp Business. |
| YCloud | Nosotros | Plan Free (1 usuario, 2 números). Los mensajes de Meta se pagan desde nuestra billetera de YCloud y se cobran dentro de la mensualidad. |
| Railway, Anthropic | Nosotros | Hosting e IA, incluidos en la mensualidad. |

Si el cliente deja el servicio, desconecta el número desde su app (Configuración → Cuenta → Plataforma para empresas → Desconectar) y conserva su número y su historial.

## Migrar a Tech Provider propio (después de producción)

Objetivo: conectarnos directo a la WhatsApp Cloud API de Meta, sin YCloud, y reutilizarlo para todos los clientes.

1. Verificar el negocio en Meta Business (non-human.co).
2. Crear la app de Meta y pasar App Review con acceso avanzado a `whatsapp_business_messaging` y `whatsapp_business_management`. Meta pide un video de la app enviando mensajes y gestionando plantillas: sirve el MVP actual.
3. Implementar Embedded Signup v4 o v5 con `featureType: whatsapp_business_app_onboarding` (Coexistence).
4. Usar el adaptador `src/whatsapp/cloudApi.ts` (ya existe y está probado).
5. Migrar cada número: desconectar de YCloud desde la app del cliente y repetir el alta con nuestra app. El historial solo se puede importar una vez y dentro de las 24 h siguientes.

Gana: sin intermediario ni límites de planes. Costo: semanas de verificación y revisión de Meta.

## Código

- [ ] Adaptador YCloud para producción.
- [ ] Reporte mensual para el cliente (consultas por tema, fichas, horas pico, gasto de Meta e IA).
- [ ] Evaluación con ~50 preguntas reales: Haiku 5.5 vs. gpt-5-nano.
- [ ] Menús y textos fijos en inglés.

## Con el cliente

- [ ] Respuestas al cuestionario → actualizar `kb/*.md` y quitar los `[PENDIENTE]`.
- [ ] Planilla de divisas (`DIVISAS_CSV_URL`).
- [ ] Feriados (`FERIADOS`).
- [ ] Precio de instalación y mensualidad.
- [ ] Confirmar con YCloud que el plan Free permite Coexistence.
