# Hilo

Editor visual tipo Figma para diseñar **apps y webs**, ver sus **flujos** en un lienzo infinito,
**probar** cualquier pantalla como prototipo y comparar cómo cambia el producto en distintos
**modos** (por ejemplo, los planes Esencial, Plus y Premium de una plataforma de psicología).

## Qué puedes hacer

- **Lienzo infinito**: desplázate con la rueda, el trackpad, la barra espaciadora o la herramienta Mano;
  haz zoom con `Ctrl`/`⌘` + rueda o pellizcando. `⇧1` encuadra todo.
- **Pantallas y elementos**: crea pantallas (`F`) con tamaños de móvil, tablet o escritorio y dibuja
  rectángulos, elipses, textos, botones, campos, imágenes e iconos. Guías magnéticas al mover y
  redimensionar, alinear, copiar/pegar, duplicar (`Alt` + arrastrar), deshacer/rehacer. Cada capa
  admite sombras, desenfoque de fondo, modos de fusión, filtros y máscaras degradadas; los textos,
  espaciado entre letras, cursiva y una sola línea. Las fuentes de Google que use un proyecto se
  cargan solas al abrirlo.
- **Flujos**: selecciona un elemento y arrastra el círculo azul hasta otra pantalla. Las flechas
  muestran cómo se conecta todo; las de trazo discontinuo abren un modal, las punteadas son pantallas
  que avanzan solas tras un tiempo (cargas, escaneos) y las rojas apuntan a una pantalla que no
  existe en el modo activo.
- **Secciones**: agrupa pantallas en zonas con título (clic derecho → «Crear sección con la
  selección»). Arrastrando el título se mueve la sección con sus pantallas.
- **Probar (play)**: pulsa ▶ junto al nombre de cualquier pantalla, «Probar aquí» en el panel o
  `Ctrl`/`⌘` + `Intro`. El prototipo se muestra en un marco de móvil o de navegador, con
  transiciones, modales, scroll y elementos fijos. Puedes cambiar de modo sin salir.
- **Modos**: cada proyecto puede tener varios modos (planes, roles, idiomas…). En cada modo un
  elemento puede cambiar cualquier propiedad (texto, color, posición, visibilidad o a dónde lleva) y
  una pantalla puede no existir. Con «Editando solo …» (`E`) tus cambios afectan únicamente al modo
  activo; los campos que cambian en ese modo se marcan con su color y se pueden restablecer.
  «Comparar modos» (`C`) muestra una pantalla en todos los modos lado a lado.
- **Guardado automático** en el navegador (IndexedDB, con copia en localStorage cuando cabe),
  exportación e importación en JSON.
- **Plantillas publicadas aparte**: si junto a la app hay un `templates/index.json`, sus proyectos
  aparecen en «Plantillas». Sirve para ofrecer proyectos grandes con imágenes (por ejemplo, flujos
  capturados de otra app) sin incluirlos en el código.

El proyecto de ejemplo **Sereno · Terapia online** muestra los tres planes: en Esencial el chat abre
un modal para mejorar el plan, en Plus lleva al chat y en Premium además aparecen la videollamada y
el resumen con IA.

## Desarrollo

```bash
npm install
npm run dev      # servidor de desarrollo
npm test         # pruebas del modelo (modos, flujos, geometría, importación)
npm run lint
npm run build    # compila en dist/
```

Hecho con React, TypeScript, Zustand e Immer. El modelo (`src/model`) es independiente de la
interfaz: `modes.ts` resuelve las propiedades de cada modo, `flows.ts` calcula los flujos y la
navegación del prototipo y `templates.ts` contiene los proyectos de ejemplo.
