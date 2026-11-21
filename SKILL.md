---
name: presentaciones-motion
description: Crea presentaciones de diapositivas en un solo archivo HTML, navegables con flechas, con motion graphics de verdad (ilustraciones y diagramas animados en SVG, CSS y canvas), interstitials de puro movimiento y slides que se explican paso a paso, con una vista en vivo que muestra el avance mientras se construye, un editor tipo PowerPoint (alinear, copiar y pegar, insertar texto, formas e imágenes, rotar, capas) y exportación a PDF y PowerPoint; el resultado es un solo archivo fácil de compartir. Úsala siempre que el usuario pida una presentación, clase, charla, exposición, deck, diapositivas o slides para presentar en vivo, pida motion graphics o animaciones para sus slides, o quiera agregar, cambiar, animar, retocar a mano, exportar o compartir slides de una presentación hecha con esta skill, aunque no diga "HTML".
---

# Presentaciones con motion graphics

Producto: un único `.html` autocontenido (fuentes embebidas, sin internet) que el presentador pasa con las flechas,
espacio o clic; F pone pantalla completa, B la pone en negro y G abre la galería de miniaturas para saltar a
cualquier slide. Cada slide de contenido tiene una ilustración animada
que explica la idea; entre secciones hay interstitials de puro movimiento; las slides complejas avanzan paso a paso.

El `.html` entregable existe desde el primer minuto y se reescribe solo con cada avance: al principio con todas
las slides como pendientes y después con cada slide que queda lista. Nunca se espera al final para escribirlo.

Mientras se construye, el usuario ve el deck en una vista en vivo que se actualiza sola (sin capturas en el chat):
primero aparecen todas las slides como pendientes y cada una se reemplaza en cuanto su bloque queda listo. En esa
misma vista puede pulsar E y se abre un editor tipo PowerPoint: panel de slides con miniaturas, cinta de
herramientas y panel de propiedades. Selecciona uno o varios elementos, los mueve con guías, escala y rota con manijas,
alinea y distribuye, copia, corta, pega y duplica (también entre slides), inserta texto, rectángulos, círculos,
líneas e imágenes (desde archivo, pegadas o arrastradas), cambia colores del tema, tamaño de letra, negrita, cursiva,
opacidad y capas, deshace y rehace, y exporta. Al guardar, todo queda en los archivos fuente.

Para compartir basta el `.html`: es un solo archivo con fuentes e imágenes adentro, funciona sin internet y abre en
cualquier navegador. Si piden PDF o PowerPoint, `scripts/exportar.py` (o Exportar en el editor) los genera junto al HTML.

La skill trae el motor (`assets/shell.html`), los scripts (`scripts/build.py`, `scripts/esqueleto.py`, `scripts/vivo.py`,
`scripts/shot.mjs`, `scripts/hoja.py`, `scripts/nav.mjs`, `scripts/miniaturas.py`, `scripts/recorrido.mjs`,
`scripts/exportar.py`), el cliente de la vista en vivo y del editor
(`assets/vivo/cliente.js`),
el brief para quien construye slides (`references/brief.md`), la API del motor (`references/motor.md`), los estilos
por tema (`references/estilos.md`) y ejemplos reales (`assets/ejemplos/`).

## Flujo

### 1. Entender el encargo

Saca de la conversación o pregunta lo que falte de verdad: tema y puntos a cubrir, público (técnico o no), duración
o número de slides, tono y dónde se va a presentar. Si el usuario ya dio una lista de temas, no la reinterpretes:
cúbrela completa y en su orden, y avisa si propones mover algo.

### 2. Datos

Toda cifra que vaya a pantalla se verifica en la web y se anota en `DATOS.md` (cifra, fuente, año). Si no se puede
verificar, no entra. Preferir fuentes primarias (informes originales) y decir en la slide de dónde sale. Si la
presentación no lleva cifras, no hace falta `DATOS.md`. La etiqueta "PASO 03 / 06" de una slide con pasos es
navegación, no una cifra.

### 3. Estilo

Lee `references/estilos.md`, elige paleta y fuentes según el tema, el público y el lugar, dilo en una línea y
sigue. Si el usuario nombra un estilo o trae su propia paleta (colores de su marca, de su escuela), úsala. No hay un
estilo por defecto: una charla de negocios, una clase para niños y un taller técnico no deben verse iguales.

### 4. Carpeta del deck y guion

En el proyecto del usuario crea `fuente-presentacion/` con:

- `deck.json`: copia `assets/deck.ejemplo.json` y ajusta `titulo`, `tema`, `fuentes` y `salida`. `salida` es
  obligatoria: es el HTML entregable, relativo a `fuente-presentacion/` (por ejemplo `../Titulo-Corto.html`), así
  el archivo no guarda rutas personales.
- `GUION.md`: la lista de slides en orden, agrupadas en bloques de 4 a 6 slides contiguas; cada bloque será
  `parts/NN-nombre.html`. Un deck de 6 slides o menos es un solo bloque. Usa este formato, porque `esqueleto.py`
  lo lee para crear las slides pendientes:

  ```
  ## 01-apertura
  ### portada
  Etiqueta: Ciencia en la cocina
  Título: Del grano a la taza
  Texto: frase de apoyo o puntos, si los hay
  Visual: taza en line-art con vapor que sube en loop
  Datos: cifra (fuente, año), si la slide lleva alguna
  ### i-granos [interstitial]
  Visual: granos que caen en espiral
  ### proceso [pasos]
  ```
- Interstitials: no cuentan como slides. Ponlos entre secciones en decks de unas 10 slides o más. Si el usuario
  fija un número corto de slides, no los agregues salvo que los pida.
- `parts/`, vacía, y `fonts/` solo si usas fuentes que no trae la skill.

Builds de prueba y capturas van al scratchpad de la sesión, no al proyecto. En `fuente-presentacion/` no van
conversaciones, prompts ni el brief: solo el contenido de la presentación.

Muéstrale al usuario el guion resumido (títulos y visuales) en el chat y arranca sin esperar, salvo que haya una
decisión que de verdad sea suya.

### 4b. Entregable y vista en vivo, antes de construir (obligatorio)

```bash
python -I "<SKILL>/scripts/esqueleto.py" "<DECK>"                                   # pendientes + primer entregable
python -I "<SKILL>/scripts/vivo.py" "<DECK>" --respaldos "<TMP>/respaldos"          # en segundo plano
```

`esqueleto.py` crea una slide pendiente por cada slide del guion y escribe el HTML entregable en la ruta `salida`
(imprime `ENTREGABLE <ruta> (0 de N slides listas)`). Desde ese momento el entregable existe y va al día:

- `vivo.py` lo reescribe cada vez que cambia una parte (lo hace un subagente, tú o el usuario con el editor).
- `build.py` también lo reescribe en cada ensamblado completo, aunque `vivo.py` no esté corriendo.
- Las slides que faltan salen como "EN CONSTRUCCIÓN"; nunca se espera al final para escribir el archivo.

Lanza `vivo.py` en segundo plano (no lo esperes) y lee la URL que imprime (`http://127.0.0.1:4610/` o el siguiente
puerto libre). Ábrela en el navegador integrado de la app si está disponible y dale al usuario dos cosas: la URL de la
vista en vivo y la ruta del HTML entregable, que puede abrir cuando quiera y siempre tiene lo último. Explícale en dos
líneas: la vista se actualiza sola mientras se construye; con E se abre el editor tipo PowerPoint (clic selecciona,
doble clic reescribe, Ctrl+S guarda; el resto está en la cinta de arriba). Desde ahí el avance se ve en vivo: no
mandes capturas al chat. Las capturas de `shot.mjs` son para tu revisión interna. Para saber cuántas slides faltan y
cuándo se actualizó el entregable: `curl -s http://127.0.0.1:<puerto>/__vivo/estado` (campo `entregable`).

### 5. Construir en paralelo

Si hay dos bloques o más y puedes lanzar subagentes, lanza uno por bloque en el mismo mensaje (hasta 6) y quédate
coordinando. Cada
prompt lleva: la ruta de `references/brief.md` para que lo lea completo; `<DECK>`, `<SKILL>` y su `<TMP>`; su
archivo y prefijo; cuál de `assets/ejemplos/` se parece más a su bloque (solo uno, para calibrar el acabado); el
texto exacto de sus slides; las cifras permitidas con fuente; y el vocabulario visual
compartido cuando dos bloques dibujan lo mismo (por ejemplo: "portátil = pantalla trapezoidal + base en línea;
paquete = rectángulo de 28 x 16"). Si no hay subagentes, construye los bloques tú mismo, uno tras otro, con el
mismo brief.

Como el usuario mira en vivo y el entregable sigue a las partes, cada bloque debe reemplazar sus pendientes pronto:
una primera versión completa del archivo en los primeros minutos (mismos ids del guion) y después mejoras, cada una
como edición puntual del fragmento que cambia. Si el usuario comenta una slide mientras se construye, reenvíale el
comentario al subagente de ese bloque. Si el usuario editó a mano con el editor, sus cambios ya están en `parts/`:
quien toque ese archivo después lo relee antes de escribir y no los pisa.

Comprueba el avance real, no lo supongas: cuando termine cada subagente (y si el usuario pregunta), consulta
`/__vivo/estado` y confirma que `entregable.listas` subió y que `entregable.hora` es reciente. Si `vivo.py` no está
corriendo, corre `build.py "<DECK>"` tras cada bloque terminado: también reescribe el entregable.

Un bloque tarda entre 15 y 25 minutos. Mientras tanto, cuando el usuario pregunte, responde con el estado real
de cada bloque (si su archivo ya existe o cuándo se modificó por última vez) y un estimado honesto.

### 6. Ensamblar y verificar

```bash
python -I "<SKILL>/scripts/build.py" "<DECK>" --out "<TMP>/deck.html"             # OK, ENTREGABLE y sin AVISO
node "<SKILL>/scripts/shot.mjs" "<TMP>/deck.html" "<TMP>/shots/s" cambiadas 3000  # solo slides nuevas o cambiadas
python "<SKILL>/scripts/hoja.py" "<TMP>/shots" s --solo <CAPTURADAS>              # hoja de solo esas, de 6 en 6
STEPS=0-5 node "<SKILL>/scripts/shot.mjs" "<TMP>/deck.html" "<TMP>/shots/s" <n>   # cada paso: s-<n>-p0..p5.png
python "<SKILL>/scripts/hoja.py" "<TMP>/shots" s-<n>-p                            # hoja de esos pasos
node "<SKILL>/scripts/nav.mjs" "<TMP>/deck.html"                                   # todo adelante y atrás
LIVE=1 node "<SKILL>/scripts/shot.mjs" "<TMP>/deck.html" "<TMP>/shots/live" <i> 3300  # i = un interstitial
```

`shot.mjs ... cambiadas` compara las huellas de cada slide con las de la última captura con ese prefijo: la primera
vez captura todas y después solo las que cambiaron; imprime `CAPTURADAS 3,7` (pásalo a `hoja.py --solo`) o
`SIN CAMBIOS`. Así una corrección se revisa mirando una hoja, no el deck entero otra vez. `nav.mjs` recorre todo y
solo imprime las pulsaciones atascadas y un resumen (`--detalle` para ver cada una); así se prueba lo que las capturas
no ven: retroceder dentro de una slide con pasos y llegar a ella desde la siguiente. Con `LIVE=1` la captura debe
mostrar ya la slide que sigue al interstitial.

Mira las hojas (6 slides por imagen) y abre a tamaño completo solo lo dudoso. Busca: textos encimados o cortados,
ilustraciones chicas que dejan media slide vacía, más de un foco de acento, viñetas que parecen guiones largos, cifras
sin fuente, y errores de JavaScript (deben ser cero). Corrige tú lo pequeño con ediciones puntuales; si un bloque
necesita rehacerse, devuélveselo a su subagente con la lista concreta.

### 7. Miniaturas de la galería

El motor trae una galería para saltar a cualquier slide, como el modo presentador de PowerPoint: tecla G o el botón
DIAPOSITIVAS que aparece abajo a la izquierda al mover el mouse; tiene buscador por título o número, se navega con
flechas y Enter, y Esc la cierra. La galería siempre muestra miniatura: si una slide no tiene imagen generada, dibuja
una copia viva de la slide en su estado final. En el HTML que se entrega las miniaturas deben ser imágenes reales
(son fieles con canvas y contadores): genéralas con un solo comando (sin -I, porque usa Pillow) y vuelve a ensamblar.

```bash
python "<SKILL>/scripts/miniaturas.py" "<DECK>"        # rehace solo las miniaturas de slides nuevas o cambiadas
```

`miniaturas.py` anota en `<DECK>/miniaturas/huellas.json` con qué versión de cada slide hizo su imagen; la siguiente
vez solo captura las que cambiaron y, si no cambió ninguna, ni abre el navegador (`--todas` las rehace todas).
`build.py --final` no da por terminado el deck si alguna miniatura falta o no está al día, así que córrelo de nuevo
cada vez que cambien slides (también después de que el usuario edite con el editor).

### 8. Entregar

El entregable ya está escrito y al día. `build.py "<DECK>" --final` lo vuelve a armar y comprueba que esté
terminado: sin avisos, sin slides pendientes y con las miniaturas al día. Solo entonces imprime `FINAL <ruta>`; si
no, lista lo que falta. El HTML entregable no lleva la barra en vivo ni el editor. Antes de cerrar, detén `vivo.py`
(la tarea en segundo plano) y comprueba que su puerto quedó libre. Entrégalo y resume en pocas líneas: cuántas
slides, qué tiene de especial, cómo se navega (incluida la galería con G), qué se verificó y qué no (por ejemplo,
que no se probó en el proyector).

Para compartir, el `.html` basta. Si el usuario quiere PDF o PowerPoint:

```bash
python "<SKILL>/scripts/exportar.py" "<DECK>" --formato ambos      # pdf | pptx | ambos; --pasos: una página por paso
```

Quedan junto al HTML con el mismo nombre. Cada slide sale como imagen fiel al diseño, en su estado final (las slides
con pasos, en su último paso). Las animaciones no viajan a PDF ni a PowerPoint, y los textos del PowerPoint no son
editables: dilo al entregar.

## Cambios después

Edita solo el fragmento que cambia en la parte que corresponda en `parts/` (no reescribas el archivo), vuelve a
ensamblar con `--out "<TMP>/deck.html"` (eso ya actualiza el entregable) y revisa con `shot.mjs ... cambiadas`, que
captura solo las slides tocadas. Para retoques de posición, tamaño o texto, levanta `vivo.py` y deja que el usuario
los haga con el editor; luego cierra con `miniaturas.py` y `--final`. Para
insertar slides entre bloques usa un prefijo intermedio (`03b-...`). Si la parte ya no existe porque la presentación
se hizo sin esta carpeta, reconstruye solo lo necesario y guarda las fuentes en `fuente-presentacion/`.

## Gasto de tokens: tocar y revisar solo lo que cambió

Ensamblar, reconstruir la vista en vivo, reescribir el entregable y capturar pasan en la computadora y no gastan
tokens. Lo que sí gasta es lo que el modelo escribe, lee y mira. Por eso:

- Cada parte se escribe completa una sola vez (la primera versión). Después, cada mejora o corrección es una edición
  puntual del fragmento que cambia; nunca se reescribe un archivo entero para cambiar una slide o un color.
- Leer solo lo necesario: `brief.md`, `motor.md`, `deck.json` y un ejemplo. Nadie lee `shell.html` ni
  `cliente.js` completos (`motor.md` documenta lo que hace falta) y quien orquesta no relee las partes de los
  subagentes: las revisa en las hojas de capturas.
- Revisar con `shot.mjs ... cambiadas` y `hoja.py --solo`: después de una corrección se mira una hoja con lo que
  cambió, no el deck entero. Las hojas (6 slides por imagen) cuestan mucho menos que abrir cada captura.
- `nav.mjs` sin `--detalle` y `build.py` imprimen solo resúmenes y problemas; no pidas más salida de la necesaria.
- Para saber el avance basta `/__vivo/estado`; no hace falta capturar ni leer archivos.
- Como máximo dos rondas de corrección por bloque, salvo que algo siga roto.

## Reglas de contenido (valen para toda la presentación)

- Español con tildes, eñes y signos de apertura. Si el público habla otro idioma, la presentación va en ese idioma;
  las respuestas al usuario, en el idioma en que escribe.
- Sin guion largo, guion medio ni punto medio (el guion normal sí) y sin emojis: se ven mal proyectados y en otras
  fuentes. `build.py` y el editor lo revisan.
- Solo cifras verificadas, cada una con su fuente en la slide. Formato numérico del público; por defecto es-CO
  (coma decimal y punto de miles), que es el que usa `Deck.fmt`.
- Poco texto: una idea por slide, título corto, 3 o 4 puntos como máximo.
- Etiqueta superior de cada slide sin numeración ni separadores tipo "//"; portada sin subtítulos de relleno.
- Los motion graphics son elementos visuales (ilustraciones que explican), no texto que se mueve. El texto entra
  una vez y se queda quieto.
- Los archivos de la presentación no mencionan cómo se hicieron: ni asistentes de IA ni esta skill.
- Temas delicados (seguridad informática, salud, finanzas): divulgación conceptual, nunca instructivo ni consejo
  personal. Las slides de ejemplos o datos inventados llevan una etiqueta visible "ILUSTRACIÓN" o "SIMULACIÓN".

## Lecciones aprendidas

- **Temas de ataques: conceptuales desde el principio.** Las ilustraciones conceptuales funcionan bien: un tubo
  transparente donde se lee un mensaje, un intermediario que lo desvía, un cursor que recorre etapas genéricas,
  todas con el nombre del ataque abajo. Las simulaciones de herramientas reales (listados de escaneo, capturas de
  tráfico con nombres de programas, comandos) se bloquean por seguridad. Si un subagente o una respuesta se
  bloquea, no lo reformules para reintentar: díselo al usuario y sigue con el resto.
- **PowerPoint no conserva estas animaciones.** Rehacer las slides con formas nativas de PowerPoint quedó pobre.
  Por eso `exportar.py` mete cada slide como imagen fiel. Si piden que el PowerPoint conserve el movimiento, la única
  forma fiel es grabar cada slide como video y meterlo con reproducción automática.
- **Explicar paso a paso** (un proceso, un mecanismo, cómo viaja algo de un lugar a otro) es lo que más ayuda al
  público: úsalo en las slides de proceso. Patrón en `references/motor.md` y ejemplos en `assets/ejemplos/`.
- **Cada tema pide su estilo.** El mismo deck oscuro y rojo para todo cansa y no le queda a una clase de cocina ni
  a una charla de salud. Elige el estilo por lo que se va a dibujar y por el público.
- **Las capturas mandan.** Varias fallas solo se vieron en las capturas: íconos diminutos que dejaban media slide
  vacía, una silueta que se salía de su recuadro, una palabra sola en una segunda línea.
- **Un solo servidor, y solo local.** `vivo.py` escucha únicamente en 127.0.0.1 y pide un token para guardar; nada
  más se levanta. Apágalo al terminar: una sesión anterior dejó un servidor abierto a la red sin que nadie lo
  notara. Nada de recursos remotos en el deck.
- **El usuario quiere ver el avance, no el resultado de golpe.** Por eso la vista en vivo arranca antes de construir
  y las slides pendientes muestran el plan completo desde el primer minuto.
- **El entregable también va al día.** En una presentación el HTML entregable no apareció hasta el final y el usuario
  no pudo revisar nada antes. Ahora `esqueleto.py` lo escribe al empezar y `vivo.py` y `build.py` lo reescriben en
  cada avance; `--final` solo comprueba que quedó terminado.
- **Reescribir todo gasta mucho.** Reescribir partes completas, releer archivos grandes y volver a mirar todas las
  capturas tras cada corrección disparó el consumo de tokens. Se edita y se revisa solo lo que cambió.
