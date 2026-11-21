# Motor del deck (assets/shell.html)

El shell dibuja cada slide a 1920 x 1080 y lo escala al tamaño de la pantalla, así que el layout se escribe en px
absolutos y se ve igual en cualquier proyector. `build.py` mete las partes dentro de `#deck`, inyecta el tema
(variables CSS) y embebe las fuentes en base64: el resultado es un único `.html` que funciona sin internet.

## Contrato de una parte (`parts/NN-nombre.html`)

```html
<style>
  /* todo selector empieza por el id de su slide; todo @keyframes lleva ese id como prefijo */
  #burbuja .globo { ... }
  #burbuja.is-active .globo { animation: burbuja-inflar 1.2s var(--out) both; }
  @keyframes burbuja-inflar { ... }
</style>
<section class="slide" id="burbuja"> ... </section>
<section class="slide interstitial" id="i-barras" data-auto="2.6"> ... </section>
<script>
(function () {
  Deck.on("burbuja", { enter: function (s, dir) { ... }, leave: function (s) { ... } });
})();
</script>
```

- Cada `<section>` es hija directa del deck. El orden de los archivos (por nombre) y dentro de cada archivo es el
  orden de las slides. Para insertar un bloque entre dos existentes usa un nombre intermedio (`03b-...`).
- Orden de clase distinto al de los archivos: si existe `<deck>/orden.txt` (un id por línea, `#` para comentarios),
  `build.py` y la vista en vivo ponen las slides en ese orden; los estilos quedan antes y los scripts después de
  todas las slides. Una slide que falte en la lista va al final y genera aviso. Sirve para colocar una definición
  justo antes de su primer uso sin partir archivos.
- Marcas de práctica: `<deck>/marcas.txt` con líneas `id | TEXTO` agrega a esas slides una barra de acento a la
  izquierda y una etiqueta arriba al centro (por ejemplo `EJERCICIO EN PAREJAS`), para que el presentador no se salte
  las partes donde la audiencia trabaja. Deja libre la franja superior central de esas slides.
- Las slides con `class="interstitial"` y `data-auto="2.6"` avanzan solas al llegar hacia adelante; al retroceder
  el motor las salta. No muestran contador.

## Clases compartidas

- Texto: `.kicker` (etiqueta superior, ya posicionada: left 140, top 96), `.h-xl` 180px, `.h-l` 128px,
  `.h-m` 96px, `.h-s` 68px (fuente display), `.txt-l` 46px, `.txt` 38px, `.txt-s` 30px (fuente body),
  `.tag` (24px mayúscula espaciada), `.num` (número display tabular), `.mono`, `.accent`, `.ink`, `.dim`,
  `.foot` (fuente de las cifras, abajo a la izquierda).
- Entradas, se disparan al entrar a la slide; el retraso va en `--d` (ej. `style="--d:.4s"`): `.in` (blur a
  nítido), `.in-left`, `.in-up`, `.fade`, `.stamp` (sello), `.wipe` (barra que crece en X), `.wipe-y`.
- Variables: `--ground` fondo, `--ink` texto, `--muted`, `--accent`, `--panel`, `--bar`, `--line`, `--dim`,
  `--display`, `--body`, `--mono`, curvas `--ease` y `--out`.
- Animar solo con la slide activa: `#mi-slide.is-active .cosa { animation: ... }`. Al salir y volver a entrar
  las animaciones CSS se reinician solas.
- Transparencias con el tema: `color-mix(in srgb, var(--ink) 45%, transparent)` en vez de un rgba fijo, para
  que la slide siga funcionando si cambia la paleta.

## Galería (incluida en el shell)

El shell trae una galería para saltar a cualquier slide: tecla G o botón DIAPOSITIVAS (aparece al mover el mouse).
Arma las tarjetas al abrirse con el número, el `.kicker` y el título (`.h-xl`, `.h-l`, `.h-m`, `.h-s`; si no hay,
el texto más grande de la slide). Agrupa por secciones: una slide cuyo kicker empieza con "Parte", "Sección",
"Módulo", "Bloque", "Capítulo" o "Parada" seguido de un número abre un grupo nuevo. Muestra la miniatura de
`<deck>/miniaturas/<id>.jpg` si existe (ver `scripts/miniaturas.py`). Si una slide tiene la clase `es-practica`,
su tarjeta lleva un cuadrito de acento. Mientras está abierta, las teclas no mueven el deck. Para que la galería
nombre bien cada slide, usa `.kicker` y una clase de título en todas.

## API `window.Deck`

- `Deck.on(id, { enter(slide, dir), leave(slide), next(slide), prev(slide) })`.
  `dir` vale `-1` cuando el presentador llega retrocediendo desde la slide siguiente.
- `Deck.loop(slide, (t, dt) => {...})`: corre cada frame mientras la slide está activa (t en segundos desde
  que entró). Devuelve `{ stop() }`. Se detiene solo al salir.
- `Deck.after(slide, ms, fn)`: temporizador que se cancela al salir. Nunca `setInterval` ni `setTimeout` sueltos.
- `Deck.countUp(el, hasta, { from, duration, decimals, delay })`: contador con formato es-CO (1.900,5).
  Pon "0" en el HTML para que no parpadee el valor final.
- `Deck.type(el, texto, { cps, delay })`: tipeo.
- `Deck.fmt(n, decimales)`: número es-CO. `Deck.rand(semilla)`: aleatorio con semilla, para que los patrones se
  vean igual en cada pasada.
- `Deck.go(n)`, `Deck.next()`, `Deck.prev()`.

## Slides con pasos (para explicar paso a paso)

Si `next(slide)` devuelve `true`, la tecla se consume y la slide avanza un paso interno; si devuelve `false`, el
motor pasa a la siguiente slide. Igual con `prev`. Patrón probado (ver la slide `proceso` de `assets/ejemplos/cafe.html`):

1. Escribe toda la animación como una función pura del tiempo de un ciclo: `frame(c)` pinta el estado en el
   instante `c`. Así avanzar, retroceder y el repaso en loop salen gratis.
2. Define `STOPS`, los instantes donde se detiene cada paso.
3. En `Deck.loop`, mueve `c` hacia `STOPS[paso]` a velocidad normal (acelera si el presentador pulsa varias veces
   seguidas) y llama `frame(c)`.
4. Muestra una `.tag` "PASO 03 / 15" arriba a la derecha. Debe empezar por "PASO" (o "REPASO" en el loop final):
   `scripts/nav.mjs` la lee para comprobar la navegación.
5. Tras el último paso, un `next` más puede activar un repaso en loop; el siguiente ya cambia de slide.

Para estados discretos (un medidor que baja de nivel, una escena que cambia por etapas) sirve el patrón de la
slide `tension` de `assets/ejemplos/electricidad.html` o `entrenamiento` de `assets/ejemplos/vacuna.html`: una
función que deja el DOM en el estado del paso n, con animación al avanzar y sin ella al llegar retrocediendo.

## Ejemplos incluidos (`assets/ejemplos/`)

Cada archivo es un bloque completo en un estilo distinto; usan solo variables del tema, así que se ven bien con
cualquier paleta. Sirven para calibrar el nivel de acabado, no para copiar su tema.

- `cafe.html` (estilo Papel): portada con ilustración en line-art y granos que caen, slide `proceso` con 5 pasos
  sobre un ciclo temporal y repaso en loop, e interstitial de granos en espiral.
- `electricidad.html` (estilo Plano técnico): diagrama a lo ancho con pulsos de energía en loop, slide `tension`
  con 4 estados discretos y un medidor, e interstitial de un circuito que se enciende.
- `vacuna.html` (estilo Clínico): slide `entrenamiento` con 4 pasos de una ilustración conceptual, gráfica
  `respuesta` cuyas curvas se dibujan al entrar, e interstitial de células que se dividen.

## Slides pendientes

`scripts/esqueleto.py` crea, desde `GUION.md`, una `<section class="slide pendiente">` por slide con su kicker,
`.pend-tag` ("EN CONSTRUCCIÓN"), `.pend-titulo` y `.pend-visual`. El shell las dibuja con marco punteado. Quien
construye el bloque escribe una vez la primera versión completa con los mismos ids y después la mejora con ediciones
puntuales. El entregable lleva las pendientes mientras existan; `build.py` avisa cuántas quedan y `--final` no da el
deck por terminado mientras haya alguna.

## Vista en vivo y editor (scripts/vivo.py)

`vivo.py` sirve el deck en `http://127.0.0.1:<puerto>/`, vigila `deck.json`, `parts/`, `media/`, `miniaturas/`, el
shell y el cliente, y reconstruye cuando un archivo cambia y deja de cambiar. En cada reconstrucción también reescribe
el HTML entregable (`salida` de deck.json, sin marcas ni editor) si su contenido cambió; la barra en vivo muestra la
hora de la última actualización y `/__vivo/estado` la devuelve en `entregable`. El navegador recarga en la misma slide y
conserva el modo edición. Solo el HTML de la vista lleva `data-e="<parte>:<posicion>"` en cada elemento de las slides
y el cliente `assets/vivo/cliente.js`; el HTML final no.

Con E se abre el editor tipo PowerPoint. Lo que guarda en `parts/`:

- Mover, escalar, rotar, opacidad, capa, color, tamaño de letra, negrita, cursiva y alineación del texto: propiedades
  en el atributo `style` del elemento (`translate`, `scale`, `rotate`, `opacity`, `z-index`, `color`, `font-size`...).
  Por eso las animaciones de las slides usan `transform` y no esas propiedades sueltas.
- Reescribir: el texto con marcado en línea (b, strong, em, i, span con clase, br).
- Eliminar: borra el elemento del archivo, con su línea.
- Insertar: texto (`div.vv-obj.vv-texto`), formas (`div.vv-obj.vv-forma`) e imágenes (`img.vv-obj.vv-img`) al
  final de la slide, con posición absoluta y estilo en línea. Las imágenes se guardan en `<deck>/media/` con un
  nombre por su contenido y `build.py` las incrusta como data URI, así el HTML sigue siendo un solo archivo.
- Copiar y pegar un elemento que ya existía: se copia su marcado del archivo fuente (no del navegador), con sus clases.
  En la misma slide queda junto al original; en otra slide va al final y puede perder estilos propios de su slide.

El editor toca elementos HTML de las slides y SVG completos; el interior de un SVG o un canvas no se edita a mano.
Los textos que llena un script (`Deck.countUp`, `Deck.type`) se cambian en el script. Antes de escribir, `vivo.py`
comprueba que cada archivo no cambió desde que se cargó la vista, valida cada propiedad y cada etiqueta contra una
lista permitida y copia la parte a la carpeta de respaldos; "Deshacer guardado" restaura la última copia.

## Miniaturas y exportar

- La galería y el panel de slides del editor usan `window.DeckMini(slide, vivo)`: la imagen de
  `<deck>/miniaturas/<id>.jpg` si existe, o una copia congelada de la slide en su estado final.
- `scripts/miniaturas.py <DECK>` captura solo las slides nuevas o cambiadas y escribe sus miniaturas; sabe cuáles
  por las huellas de `<DECK>/miniaturas/huellas.json` (la huella de una slide cubre su `<section>`, los estilos y
  scripts de su parte, el tema y su marca de práctica). `build.py --final` las exige al día.
- `scripts/exportar.py <DECK> --formato pdf|pptx|ambos [--pasos] [--interstitials]` recorre el deck con
  `scripts/recorrido.mjs`, captura cada slide y arma el PDF o el PowerPoint junto al HTML final. Cada slide es una
  imagen a sangre completa; sin animaciones.
