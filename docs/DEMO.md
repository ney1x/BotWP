# Demo con el número de prueba de Meta

Meta da un número de prueba gratis para la Cloud API. Solo puede escribir a un máximo de 5 números registrados como destinatarios.

## 1. Probar sin WhatsApp (2 minutos)

```bash
npm install
npm run simular
```

Escriba `hola`. Para tocar un botón o una fila escriba su número. Comandos: `/foto`, `/audio`, `/eco <texto>` (simula al asesor escribiendo desde la app), `/salir`. Con `ANTHROPIC_API_KEY` en el entorno, el texto libre lo responde la IA; sin ella, responde con el menú.

## 2. App de Meta y número de prueba

1. En [developers.facebook.com](https://developers.facebook.com/apps) cree una app tipo **Business** y agregue el producto **WhatsApp**.
2. En *WhatsApp → API Setup* copie el **Phone number ID** y genere un token. El token temporal dura 24 h; para la demo alcanza. Para algo estable, cree un *System User* con token permanente.
3. En *To*, agregue los números que van a probar (el suyo, el del asesor de la demo). Cada uno confirma con un código.
4. En *App settings → Basic* copie el **App Secret**.

## 3. Desplegar en Railway

1. Nuevo proyecto → *Deploy from GitHub repo* → este repositorio.
2. Agregue el plugin **PostgreSQL** y pase su `DATABASE_URL` al servicio.
3. Variables del servicio: las de `.env.example` (`WA_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET`, `WA_VERIFY_TOKEN`, `ANTHROPIC_API_KEY`, `ASESOR_WHATSAPP`…).
4. Railway detecta Node: compila con `npm run build` y arranca con `npm start`. En *Settings → Networking* genere un dominio público.
5. Verifique `https://<dominio>/salud` → `{"ok":true}`.

## 4. Conectar el webhook

1. En Meta: *WhatsApp → Configuration → Webhook → Edit*.
2. Callback URL: `https://<dominio>/webhook`. Verify token: el mismo valor de `WA_VERIFY_TOKEN`.
3. En *Webhook fields* suscriba **messages**.
4. Desde uno de los números registrados escriba "hola" al número de prueba.

## Qué mostrar en la demo

| Probar | Qué debe pasar |
|---|---|
| "hola" | Bienvenida + menú |
| Menú → Precio del oro | Tabla por quilate leída en vivo de la calculadora del sitio |
| "tengo 5 g de 18k" | Estimado referencial |
| Menú → Joyas disponibles → una categoría | 5 piezas con foto, precio y link + "Me interesa" |
| Menú → Cotizar reloj o joya | Preguntas + fotos → ficha al asesor |
| Menú → Préstamo con vehículo → "No" a la deuda | Pasa a asesor con la nota |
| Una nota de voz | Aviso de que no escucha audios + botones |
| "quiero hablar con un asesor" | Ficha al número de `ASESOR_WHATSAPP` |
| Pregunta libre ("¿aceptan Cartier rotos?") | Respuesta de la IA con la información del sitio |

Notas:
- La ficha al asesor es un mensaje iniciado por el negocio. Fuera de la ventana de 24 h, Meta exige plantilla: para la demo, que el número del asesor escriba primero al número de prueba.
- La pausa por asesor (Coexistence) no se puede probar con el número de prueba: allí no hay app Business. Se prueba con `/eco` en el simulador y en los tests.
- Divisas responde "Consultar" hasta que exista la planilla (`DIVISAS_CSV_URL`).
