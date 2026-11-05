# Flujo de trabajo

Aunque es un proyecto individual, se sigue un flujo de equipo para dejar historial limpio y trazable.

## Ramas

| Rama | Uso |
|------|-----|
| `main` | Siempre estable. Solo recibe merges vía Pull Request. Nunca commit directo (salvo el commit inicial). |
| `develop` | Integración. Las ramas de trabajo salen de aquí y vuelven aquí. |
| `feat/<nombre>` | Funcionalidad nueva. Ej: `feat/conexion-whatsapp`. |
| `fix/<nombre>` | Corrección de bug. Ej: `fix/reconexion-qr`. |
| `docs/<nombre>` | Solo documentación. |
| `chore/<nombre>` | Config, dependencias, tooling. |
| `refactor/<nombre>` | Cambios internos sin cambiar comportamiento. |

Ciclo:

```
develop ──► feat/x ──► (commits) ──► PR a develop ──► merge
develop ──► PR a main ──► merge + tag vX.Y.Z  (al cerrar una versión)
```

## Commits — Conventional Commits

```
<tipo>(<ámbito opcional>): <descripción en imperativo, minúscula, sin punto>
```

Tipos: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `style`, `perf`, `ci`.

Ejemplos:

```
feat(mensajes): responder a comando !ayuda
fix(sesion): evitar pedir QR en cada reinicio
docs: agregar pasos de instalación
chore: configurar eslint y prettier
```

Reglas:
- Un commit = un cambio lógico. No mezclar feature + formato + docs.
- Asunto ≤ 50 caracteres. Cuerpo opcional explicando el **por qué**.
- Revisar antes de commitear: `git status` y `git diff --staged`.

## Pull Requests

- Título = mismo formato que un commit.
- Descripción: qué cambia, por qué, cómo probarlo.
- `feat/*` → `develop`: **merge commit** (conserva los commits ordenados de la rama).
- Arreglos de un solo commit: **squash** permitido.
- Rebase merge deshabilitado en el repo.
- La rama se borra sola tras el merge (configurado en GitHub).

## Protección de ramas (GitHub Rulesets)

`main` y `develop`: sin push directo (solo vía PR), sin force push, sin borrado.

## Versiones

Tags semánticos en `main`: `v0.1.0`, `v0.2.0`… Cada versión se registra en `CHANGELOG.md`.

## Seguridad

- Nunca subir `.env` ni tokens de la API de WhatsApp. `.env` ya está en `.gitignore`; las claves se cargan como variables de entorno en el hosting.
- Si algo sensible se sube por error: revocar/regenerar primero, limpiar historial después.
