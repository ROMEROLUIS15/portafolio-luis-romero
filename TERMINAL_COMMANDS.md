# Terminal Interactiva — Comandos

Referencia rápida de todos los comandos disponibles en la terminal del portafolio.
La terminal detecta el idioma automáticamente (`lang="en"` o `lang="es"`).

---

## Comandos

| Comando | Descripción EN | Descripción ES |
|---|---|---|
| `help` | Lists all available commands | Lista todos los comandos disponibles |
| `ls` | Alias for `help` — lists commands | Alias de `help` — lista comandos |
| `dir` | Alias for `help` — lists commands | Alias de `help` — lista comandos |
| `whoami` | Profile: name, role, location, summary | Perfil: nombre, rol, ciudad, resumen |
| `skills` | Tech stack grouped by category | Stack técnico agrupado por categoría |
| `experience` | Work experience (IBIME + Kiura) | Experiencia laboral (IBIME + Kiura) |
| `projects` | 4 projects with status and 1-line description | 4 proyectos con estado y descripción |
| `cronix` | Deep dive: architecture, stats, full stack | Deep dive: arquitectura, stats, stack completo |
| `contact` | Email, WhatsApp, LinkedIn, GitHub | Correo, WhatsApp, LinkedIn, GitHub |
| `open [name]` | Opens a link in a new tab | Abre un enlace en nueva pestaña |
| `clear` | Clears the terminal output | Limpia la pantalla de la terminal |
| `exit` | Shows goodbye message and hides terminal | Muestra mensaje de despedida y oculta la terminal |

---

## Comando `open` — links disponibles

```
open github     → https://github.com/ROMEROLUIS15
open linkedin   → https://www.linkedin.com/in/luis-romero-dev15
open cronix     → https://cronix-app.vercel.app
open whatsapp   → https://wa.me/573244926589
```

---

## UX / Atajos de teclado

| Tecla | Acción |
|---|---|
| `Enter` | Ejecuta el comando escrito |
| `↑` Arrow Up | Navega al comando anterior en el historial |
| `↓` Arrow Down | Navega al comando siguiente en el historial |
| Click en la terminal | Foca el input automáticamente |

---

## Archivos

```
assets/css/terminal.css   → Estilos de la terminal (usa variables CSS del proyecto)
assets/js/terminal.js     → Lógica completa, contenido EN/ES, comandos
```

## Cómo agregar un nuevo comando

1. Abre `assets/js/terminal.js`
2. En el objeto `content.en` agrega una nueva key con array de líneas:
```js
micomando: [
  { t: 'accent', v: 'Título' },
  { t: 'output', v: '  Contenido...' },
  { t: 'empty' },
],
```
3. Haz lo mismo en `content.es` con la traducción
4. En el `switch(cmd)` agrega el case:
```js
case 'micomando': printLines(c.micomando); break;
```
5. Agrega la entrada en los arrays `help` de EN y ES

## Tipos de línea disponibles

| Tipo | Color | Uso |
|---|---|---|
| `output` | Blanco suave | Contenido principal |
| `accent` | Amber (#e8944a) | Títulos y destacados |
| `muted` | Gris | Metadatos, fechas, notas |
| `error` | Rojo (#f87171) | Errores y advertencias |
| `success` | Verde (#4ade80) | Estados positivos (LIVE) |
| `cmd` | Amber | Eco del comando escrito |
| `empty` | — | Línea vacía (espaciado) |
