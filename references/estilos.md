# Elegir el estilo según el tema

El motor, las reglas y el nivel de motion graphics no cambian. Lo que cambia por presentación es la paleta y las
fuentes, que viven en `deck.json` (`tema` y `fuentes`). Las partes usan solo variables, así que cambiar el tema
no obliga a reescribirlas.

## Qué significa cada variable

| Variable | Uso |
| --- | --- |
| `ground` | fondo de todas las slides |
| `ink` | texto principal y contornos principales de las ilustraciones |
| `muted` | etiquetas, fuentes, texto secundario |
| `accent` | el único foco de cada slide: una palabra, una cifra, el elemento que importa |
| `panel` | rellenos de cajas, pantallas, tarjetas |
| `bar` | acento profundo para barras, bloques sólidos, túneles |
| `line`, `dim` | estructura secundaria: rejillas, separadores, cables apagados |
| `display`, `body`, `mono` | pilas de fuentes para títulos, cuerpo y código o datos |

## Reglas para cualquier paleta

- Un solo color de acento. El resto son neutros del mismo tono.
- Texto `ink` sobre `ground` con contraste de al menos 7:1; `muted` sobre `ground` de al menos 4,5:1; `accent`
  de al menos 3:1, porque se usa en tamaños grandes. La sala y el proyector se comen el contraste.
- Nada de degradados, glow ni sombras: separación por tamaño, por color plano y por espacio.
- Revisa con capturas: si el acento se pierde en el proyector, súbele saturación, no le pongas brillo.

## Presets

Elige el que encaje con el tema, el público y el lugar, dilo en una línea al usuario y sigue. No hay preset por
defecto. Si el usuario trae su paleta (marca, escuela, evento), úsala con las mismas reglas de contraste. Si
encajan dos, decide por lo que se va a dibujar y no por la materia: una máquina o un proceso pide Plano técnico
aunque la clase sea de sostenibilidad; personas y sociedad piden Papel. En salas muy iluminadas o con proyector
débil, mejor un fondo claro (Papel, Clínico, Corporativo).

**Cartel** (tecnología, seguridad, temas con tensión). Bebas Neue + Bahnschrift, incluidas en la skill.
`ground #0d0d0f, ink #f2f0ec, muted #7c7c83, accent #ff2d2d, panel #17171a, bar #b31217, line #2a2a30, dim #3a3a40`

**Plano técnico** (ingeniería, energía, ciencia de datos). Bebas Neue + Bahnschrift.
`ground #0b1416, ink #e9f1ef, muted #7d9391, accent #ffb020, panel #122024, bar #c47d00, line #1d3035, dim #2b4248`

**Papel** (humanidades, sociales, historia, educación). Fondo claro tipo papel.
`ground #f3efe6, ink #1b1a17, muted #6f685d, accent #d2412a, panel #e8e2d4, bar #a8321f, line #d9d2c2, dim #c4bba8`
Display con serifa (Georgia está en Windows; o Fraunces descargada), cuerpo Bahnschrift.

**Clínico** (salud, biología, sostenibilidad). Claro y frío.
`ground #f5f7f6, ink #10201c, muted #5f716c, accent #0a7f5d, panel #e7eeeb, bar #086549, line #d6e0dc, dim #b9c8c3`
Bahnschrift para todo, en pesos distintos.

**Corporativo** (negocios, resultados, estrategia, propuestas). Claro y sobrio, acento azul.
`ground #f7f7f5, ink #121417, muted #5a6069, accent #2353cc, panel #eceef1, bar #1b3f9c, line #dde1e6, dim #c3c9d1`
Bahnschrift para todo; títulos en peso 600.

**Pizarra** (escuela, talleres, divulgación para niños y jóvenes). Verde pizarra con acento amarillo tiza.
`ground #1f2b24, ink #f1efe6, muted #a7b1a2, accent #ffd23f, panel #26352d, bar #e0a800, line #2f4037, dim #3d5146`
Display Bebas Neue o una manuscrita OFL descargada (por ejemplo Caveat), cuerpo Bahnschrift.

**Atardecer** (cultura, arte, eventos, charlas inspiracionales). Morado profundo con acento coral.
`ground #1d1530, ink #f6eef7, muted #a99bb5, accent #ff7a59, panel #271d3d, bar #d9532f, line #33284a, dim #463a5e`
Display con serifa (Georgia o Fraunces descargada), cuerpo Bahnschrift.

## Fuentes

- Incluidas en `assets/fonts`: Bebas Neue (display, solo mayúsculas, peso 400) y Bahnschrift (variable 300 a 700).
  Bahnschrift es de Microsoft y viene con Windows 10 y 11; si la skill no trae el archivo, `build.py` la toma de las
  fuentes del sistema. En un equipo sin Bahnschrift (Mac o Linux), usa en `body` una fuente OFL descargada a
  `<DECK>/fonts/` (por ejemplo Barlow, de trazo parecido) y avisa del cambio.
- Fuentes de Windows que se pueden nombrar sin archivo, aunque solo se verán en equipos que las tengan: Georgia,
  Cambria, Segoe UI, Consolas, Impact, Arial Narrow. Para que el HTML viaje a cualquier equipo, mejor embeber.
- Una Google Font: descarga el `.woff2` (licencia OFL) a `<DECK>/fonts/` y decláralo en `deck.json` con
  `familia`, `archivo` y `peso`. Para obtener la URL del archivo, pide
  `https://fonts.googleapis.com/css2?family=<Nombre>:wght@400;700&display=swap` con un User-Agent de navegador de
  escritorio y toma las URLs `fonts.gstatic.com` del subconjunto `latin`. Fija la versión que bajaste: el archivo
  queda copiado en el proyecto.
- Comprueba en las capturas que las tildes, la eñe y los signos ¿ ¡ salen con la fuente correcta.
