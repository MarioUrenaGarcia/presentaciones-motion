# Brief para quien construye un bloque de slides

Lo lee cada subagente antes de escribir su parte. Quien orquesta le pasa en el prompt: la carpeta del deck
(`<DECK>`), la carpeta de la skill (`<SKILL>`), su archivo y prefijo de build, una carpeta temporal para pruebas
(`<TMP>`), la lista de slides con el texto exacto y las cifras permitidas con su fuente.

## Antes de escribir

Lee `<SKILL>/references/motor.md` (contrato, clases y API) y `<DECK>/deck.json` (paleta y fuentes de esta
presentación). Abre el ejemplo de `<SKILL>/assets/ejemplos/` que te indiquen (uno solo) para calibrar el nivel de
acabado. No leas `shell.html` ni `cliente.js`: son largos y `motor.md` ya documenta lo que necesitas. Si tu bloque
continúa una slide de otro bloque, lee solo la `<section>` de esa slide en su parte.

## Lo que entregas

Un archivo `<DECK>/parts/<tu-archivo>.html` con sus `<style>`, `<section>` y `<script>` según el contrato. No
toques el shell, los scripts ni las partes de otros. Si te falta algo del motor, resuélvelo dentro de tu parte.
Nada de recursos externos (CDN, imágenes de internet, Google Fonts): todo es SVG, CSS y JS en línea.

## Vista en vivo

El usuario está mirando el deck en vivo mientras trabajas: cada vez que guardas tu archivo, la vista se reconstruye
y se recarga, y el HTML entregable se reescribe con tu avance. Tu archivo ya existe con slides pendientes (marco
punteado y "EN CONSTRUCCIÓN"), creadas desde el guion.

- En los primeros minutos reemplázalo por una primera versión completa, con los mismos ids: es la única vez que
  escribes el archivo entero. Si una slide es muy compleja, puede quedar sencilla en esa versión y mejorar después.
- Después, cada mejora es una edición puntual (Edit) del fragmento que cambia: el SVG de una slide, una regla de
  estilo, una función del script. No reescribas el archivo completo para cambiar un detalle: cuesta mucho y puede
  pisar los retoques del usuario.
- Guarda cada mejora en cuanto quede: así el usuario y el entregable ven el avance slide por slide. Nunca dejes el
  archivo roto ni a medias.
- Si el usuario ya retocó tu bloque con el editor visual, verás `translate:` o `scale:` en el atributo style de algunos
  elementos o textos cambiados: son decisiones suyas, consérvalas.
- Para animar movimiento y tamaño usa `transform` y no las propiedades sueltas `translate` ni `scale`: el editor las
  usa para los retoques a mano y así ambos se suman sin pisarse.

## El escenario

- 1920 x 1080 en px absolutos. Zona segura: x 120 a 1800, y 80 a 1010.
- La esquina inferior derecha (x > 1640, y > 990) es del contador.
- `.kicker` arriba a la izquierda con el tema de la sección en pocas palabras, sin numeración ni separadores
  tipo "//". Si el título va en otra columna, muévelo en tu slide (`#mi-slide .kicker { left: 1000px; }`).
  `.foot` abajo a la izquierda para las fuentes de las cifras.

## Dirección visual: lo más importante

Los motion graphics son ELEMENTOS VISUALES, no animación de texto. Cada slide de contenido lleva una ilustración
o diagrama animado (SVG, CSS o canvas) que ocupa entre el 35% y el 50% del cuadro y explica la idea sin palabras:
objetos, redes, flujos, contadores, mapas abstractos, máquinas, personas en line-art.

- El texto entra una vez, rápido, y se queda quieto. Lo que se mueve es la ilustración.
- La ilustración tiene una entrada (se dibuja o se arma) y después un loop sutil y continuo (LEDs, paquetes que
  circulan, un barrido) para que la slide siga viva mientras el presentador habla.
- Estilo cartel impreso: line-art plano, trazos de 3 a 4 px. `--ink` en los contornos principales, `--dim` y
  `--line` en la estructura secundaria, `--panel` en los rellenos, `--accent` y `--bar` para el ÚNICO foco de
  acento de la slide (el elemento peligroso, el número clave, lo que cambia).
- Usa solo las variables del tema; para transparencias, `color-mix` sobre esas variables. Nunca colores fijos:
  la misma parte tiene que verse bien si la presentación cambia de paleta. La única excepción son las máscaras
  SVG, que necesitan `#fff` y `#000` y no se ven.
- Prohibido: glow, sombras, drop-shadow, neón, orbes, degradados, tarjetas de vidrio, emojis, logos de marcas,
  HUD decorativo con esquinas, rejilla de tres tarjetas KPI, todo centrado.
- Varía los layouts: texto a la izquierda e ilustración a la derecha, ilustración a lo ancho, número gigante con
  la ilustración detrás, dos columnas enfrentadas, título abajo.
- Interstitials (`class="slide interstitial" data-auto="2.6"`): pantalla completa de puro motion graphic, sin
  texto, que se vea bien desde el primer frame y pueda repetirse si el presentador espera.
- Rendimiento: anima transform y opacity; nada de filtros en loop; para cientos de partículas usa canvas
  dentro de `Deck.loop`.

## Texto

- Español con tildes, eñes y signos de apertura (¿ ¡), escritos directo en UTF-8.
- Prohibidos el guion largo, el guion medio, el punto medio (usa ":", ",", "." o el guion normal "-") y los emojis.
  `build.py` los detecta.
- Poco texto: título de unas 8 palabras como máximo; 3 o 4 puntos por slide, de 12 palabras como máximo cada uno.
  Mínimo 24px (solo fuentes); el cuerpo, 30px o más.
- Una idea por slide. El número clave es lo más grande. Acento en una sola palabra o cifra del texto.
- Títulos y párrafos ya traen `text-wrap: balance` y `pretty` en el shell; si un texto propio deja una palabra
  sola en la última línea, ponle lo mismo o ajusta el ancho.
- Nada de "como pediste", TODO, "próximamente" ni relleno.

## Cifras

Solo entran las cifras que te pasan, con su fuente en `.foot`. Formato es-CO: coma decimal y punto de miles
("99,2%", "USD 3.000 M"). Las simulaciones (datos de ejemplo) llevan una `.tag` visible "SIMULACIÓN" o
"ILUSTRACIÓN".

## Temas de seguridad y ataques

Divulgación, nunca instructivo. Ilustra el concepto (un tubo transparente por donde pasa un paquete legible, un
intermediario que desvía el mensaje, un cursor que encadena etapas genéricas) y nombra el ataque. No simules la
salida de herramientas reales, comandos, listados de escaneo, direcciones reales ni pasos reproducibles. Si algo
se bloquea, no lo reformules para reintentar: repórtalo a quien orquesta.

## Verificación (obligatoria antes de terminar)

```bash
python -I "<SKILL>/scripts/build.py" "<DECK>" --only <prefijo> --out "<TMP>/t<prefijo>.html"   # OK y sin AVISO
node "<SKILL>/scripts/shot.mjs" "<TMP>/t<prefijo>.html" "<TMP>/shots/t<prefijo>" cambiadas 3000 # solo lo que cambió
python "<SKILL>/scripts/hoja.py" "<TMP>/shots" t<prefijo> --solo <CAPTURADAS>                   # una hoja con esas
node "<SKILL>/scripts/shot.mjs" "<TMP>/t<prefijo>.html" "<TMP>/shots/t<prefijo>-mid" 1 600       # entrada a medias
STEPS=0-5 node "<SKILL>/scripts/shot.mjs" "<TMP>/t<prefijo>.html" "<TMP>/shots/t<prefijo>" <n>  # cada paso
python "<SKILL>/scripts/hoja.py" "<TMP>/shots" t<prefijo>-<n>-p                                 # hoja de los pasos
node "<SKILL>/scripts/nav.mjs" "<TMP>/t<prefijo>.html"                                            # adelante y atrás
```

`shot.mjs ... cambiadas` captura la primera vez todas tus slides y después solo las que cambiaron desde la última
captura; imprime `CAPTURADAS 2,4` (pásalo a `hoja.py --solo`) o `SIN CAMBIOS`. En una slide con pasos, la etiqueta
debe empezar por "PASO" (por ejemplo "PASO 02 / 06"): `nav.mjs` la lee para comprobar que cada pulsación avanza o
retrocede, también al llegar desde la slide siguiente; solo imprime lo que falla y un resumen.

Revisa las hojas (6 capturas por imagen) como las vería el público y abre a tamaño completo solo una captura dudosa:
nada se sale ni se encima, todo se lee, la ilustración se entiende, hay un solo foco de acento y el loop se ve vivo.
`shot.mjs` imprime los errores de JavaScript: deben ser cero. Haz una ronda de corrección, con ediciones puntuales, y
como máximo una más si algo sigue roto. No uses el navegador integrado de la app.

## Respuesta al terminar

Corta y en español: ruta del archivo, ids de slide en orden con una línea sobre su visual, y lo que no
pudiste resolver o verificar.
