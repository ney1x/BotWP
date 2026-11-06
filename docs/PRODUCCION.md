# Producción con YCloud (Coexistence)

El bot responde por la API de YCloud y el asesor sigue usando la app WhatsApp Business en el mismo número. Lo que el asesor escribe llega como eco y pausa el bot en ese chat por 4 h (`#bot` lo reactiva).

## 1. Servidor (Railway)

1. Plan Hobby ($5/mes). Proyecto desde el repo, rama `main`, y plugin PostgreSQL.
2. Variables del servicio:

| Variable | Valor |
|---|---|
| `WA_PROVEEDOR` | `ycloud` |
| `YCLOUD_API_KEY` | Clave de API de YCloud (paso 2) |
| `YCLOUD_WEBHOOK_SECRET` | Secreto del webhook (paso 3) |
| `YCLOUD_NUMERO` | `+17868782085` (número del negocio, formato internacional) |
| `ANTHROPIC_API_KEY` | Key de producción (`botwp-frankys`) |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `ASESOR_WHATSAPP` | **Vacío** (ver abajo) |
| `FERIADOS`, `DIVISAS_CSV_URL` | Según el cliente |

`ASESOR_WHATSAPP` vacío: con Coexistence el asesor ya ve cada chat en su app, así que la ficha no se manda además como mensaje aparte. Ahorra un mensaje cobrable por cada pedido de asesor. Llenarlo solo si el asesor atiende desde otro número.

3. *Settings → Networking → Generate Domain*. Verificar `https://<dominio>/salud` → `{"ok":true,"proveedor":"ycloud"}`.

## 2. Clave de API de YCloud

Consola de YCloud → *Developers* → *API Keys* → crear o copiar la clave. Va en `YCLOUD_API_KEY`.

## 3. Webhook en YCloud

*Developers* → *Webhooks* → crear endpoint:
- URL: `https://<dominio>/webhook`
- Eventos: `whatsapp.inbound_message.received` y `whatsapp.smb.message.echoes`
- Copiar el **secreto de firma** que muestra al crearlo → `YCLOUD_WEBHOOK_SECRET`. Sin él, el servidor no verifica la firma `YCloud-Signature`.

## 4. Alta del número (con el cliente presente)

Seguir el checklist de [PENDIENTES.md](PENDIENTES.md#el-día-del-alta-con-el-cliente):
1. Desactivar en la app el mensaje de bienvenida y el de ausencia.
2. YCloud → *WhatsApp accounts* → *WhatsApp Business APP Coexistence* → *Get started*.
3. Elegir el portfolio de Meta **del cliente**, escanear el QR con su celular, no compartir el historial de chats.
4. Cargar saldo en la billetera de YCloud (los primeros 1.000 mensajes del mes son gratis; luego $0.0034 c/u).

## 5. Prueba

Desde un celular que no sea el del negocio, escribir "hola" al número. Luego, desde la app del negocio, responder a mano en ese chat y confirmar que el bot deja de contestar.

## 6. Reporte mensual

Muestra el uso real de Franky's para ajustar la cuenta: mensajes cobrables (respuestas del bot + avisos a `ASESOR_WHATSAPP`), promedio diario desde el primer mensaje, proyección del mes contra los 1.000 gratis, fichas por tipo, horas pico, botones más tocados y gasto de IA. Los mensajes que el asesor escribe desde la app no cuentan.

Desde la PC, con la URL **pública** de Postgres (Railway → Postgres → *Variables* → `DATABASE_PUBLIC_URL`):

```powershell
$env:DATABASE_URL = "<DATABASE_PUBLIC_URL>"
npm run reporte
npm run reporte -- 2026-11
```

Sin mes, toma el mes en curso (marcado como parcial). Solo hay datos de los últimos `RETENCION_DIAS` (90). Los gratis y el precio por mensaje se ajustan con `YCLOUD_GRATIS_MES` y `YCLOUD_USD_MENSAJE`.
