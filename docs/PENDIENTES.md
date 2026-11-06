# Pendientes y decisiones

## Decisiones de cuentas

| Cuenta | A nombre de | Nota |
|---|---|---|
| Meta Business (portfolio donde vive el número de WhatsApp) | El cliente | Producción: en el portfolio de Franky's (el suyo, o uno nuevo con sus datos). Nuestro portfolio "NS" es solo para la demo y para Tech Provider. El cliente escanea el QR desde su app WhatsApp Business. |
| YCloud | Nosotros | Plan Free (1 usuario, 2 números). Los mensajes de Meta se pagan desde nuestra billetera de YCloud y se cobran dentro de la mensualidad. |
| Railway, Anthropic | Nosotros | Hosting e IA, incluidos en la mensualidad. |

Si el cliente deja el servicio, desconecta el número desde su app (Configuración → Cuenta → Plataforma para empresas → Desconectar) y conserva su número y su historial.

## YCloud (respuesta del soporte, 2026-11-05)

- Ecos del asesor: evento `whatsapp.smb.message.echoes`, payload `whatsappMessage` (`from`, `to`, `type`, contenido…). Validar el header `YCloud-Signature` antes de procesar. Referencia: https://newdocs.ycloud.com/en/api-reference/webhook-reference/whatsapp-smb-message-echoes
- Límite fijo de 5 mensajes por segundo en números Coexistence.
- Requisitos del número: app WhatsApp Business (no personal), versión 2.24.17 o superior, acceso al celular para el QR.
- Sin responder todavía: si el plan Free permite Coexistence, recargo sobre Meta y si piden método de pago antes de producción.

## El día del alta con el cliente

- [ ] Antes: preguntar si Franky's ya tiene portfolio de Meta Business. La cuenta de WhatsApp del número va en el portfolio **del cliente** (nombre, documento y website coinciden con su negocio). Si no tiene, se crea en el alta con sus datos y él como administrador principal; nosotros como segundo administrador. YCloud sigue siendo nuestro (soporte de YCloud no confirmó si un portfolio de agencia puede ser dueño; ticket #2271 cerrado sin respuesta).

- [ ] Desactivar en la app el **mensaje de bienvenida** y el **mensaje de ausencia** (si no, el cliente recibe esa respuesta y la del bot).
- [ ] Avisarles: las listas de difusión quedan de solo lectura, no se pueden editar ni borrar mensajes, se apagan los mensajes temporales.
- [ ] No importar el historial de chats; solo contactos.
- [ ] Abrir la app del celular al menos cada 14 días (si no, Meta desconecta el número).

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
- [ ] Confirmar con YCloud que el plan Free permite Coexistence (ticket abierto, pregunta repetida).
