"""Ensambla un deck: shell.html + <deck>/parts/*.html (en orden de nombre) + tema y fuentes embebidas.

Uso:
  python -I build.py <carpeta-deck>                          -> actualiza el entregable ("salida" de deck.json)
  python -I build.py <carpeta-deck> --out <TMP>/deck.html    -> lo mismo y una copia para revisar con capturas
  python -I build.py <carpeta-deck> --only 03 --out t03.html -> solo las partes que empiezan por 03 (no toca el entregable)
  python -I build.py <carpeta-deck> --final                  -> ademas comprueba que el entregable este terminado

El entregable se reescribe en cada ensamblado completo, aunque queden slides pendientes: asi el archivo que se
va a entregar muestra el avance real desde el primer minuto. --final no copia nada extra: revisa que no queden
avisos ni pendientes y que las miniaturas esten al dia, e imprime FINAL solo si todo esta bien.

Con --out tambien escribe <out sin .html>.huellas.json (posicion, id y huella de cada slide) para que
shot.mjs capture solo las slides que cambiaron (lista "cambiadas").

<carpeta-deck>/deck.json define titulo, tema (variables CSS), fuentes y salida. "salida" es relativa a la
carpeta del deck (ej. "../Mi-Presentacion.html") para no guardar rutas personales. Las fuentes se buscan
primero en <carpeta-deck>/fonts y luego en assets/fonts de la skill.

vivo.py usa construir(..., anotar=True): cada elemento de una slide lleva data-e="<parte>:<posicion>" para que
el editor visual sepa en que punto del archivo fuente guardar un cambio. El HTML final nunca lleva esas marcas.
"""
import argparse
import base64
import hashlib
import json
import os
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

SKILL = Path(__file__).resolve().parent.parent
SHELL = SKILL / "assets" / "shell.html"
SKILL_FONTS = SKILL / "assets" / "fonts"

# Guion largo, guion medio, punto medio y rangos de emoji: no se permiten en el contenido
BANNED = re.compile("[" + chr(0x2013) + chr(0x2014) + chr(0xB7) + chr(0x1F300) + "-" + chr(0x1FAFF) + chr(0x2600) + "-" + chr(0x27BF) + chr(0xFE0F) + "]")
# Recursos remotos rompen el uso sin internet; el texto visible con URLs de ejemplo si se permite
REMOTE = re.compile(r"""(?:src|href)\s*=\s*["']https?://|url\(\s*["']?https?://|@import""", re.I)
TEMA_KEYS = ["ground", "ink", "muted", "accent", "panel", "bar", "line", "dim", "display", "body", "mono"]
FONT_FORMAT = {".woff2": ("woff2", "font/woff2"), ".woff": ("woff", "font/woff"), ".ttf": ("truetype", "font/ttf"), ".otf": ("opentype", "font/otf")}
VACIOS = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}


def carpetas_sistema():
    """Fuentes instaladas en el equipo. Bahnschrift viene con Windows 10 y 11 y no se redistribuye con la skill
    compartida, asi que se toma de aqui cuando no esta en el deck ni en la skill."""
    rutas = []
    if os.environ.get("WINDIR"):
        rutas.append(Path(os.environ["WINDIR"]) / "Fonts")
    if os.environ.get("LOCALAPPDATA"):
        rutas.append(Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "Windows" / "Fonts")
    rutas += [Path.home() / "Library" / "Fonts", Path("/Library/Fonts"), Path("/System/Library/Fonts")]
    return rutas


def find_font(deck_dir, name):
    for base in [deck_dir / "fonts", SKILL_FONTS] + carpetas_sistema():
        f = base / name
        if f.is_file():
            return f
    return None


def font_css(deck_dir, fuentes, problems):
    rules = []
    for fu in fuentes:
        f = find_font(deck_dir, fu["archivo"])
        if not f:
            problems.append(f"fuente no encontrada: {fu['archivo']} (ponla en {deck_dir / 'fonts'})")
            continue
        fmt, mime = FONT_FORMAT.get(f.suffix.lower(), ("truetype", "font/ttf"))
        data = base64.b64encode(f.read_bytes()).decode()
        src = f'url(data:{mime};base64,{data}) format("{fmt}")'
        if fu.get("local"):
            src = f'local("{fu["local"]}"),' + src
        style = f'font-style:{fu["estilo"]};' if fu.get("estilo") else ""
        rules.append(f'@font-face{{font-family:"{fu["familia"]}";font-weight:{fu.get("peso", "400")};{style}font-display:block;src:{src};}}')
    return "\n".join(rules)


def tema_css(tema, problems):
    unknown = [k for k in tema if k not in TEMA_KEYS]
    if unknown:
        problems.append(f"claves de tema desconocidas: {', '.join(unknown)} (validas: {', '.join(TEMA_KEYS)})")
    return ":root{" + "".join(f"--{k}:{v};" for k, v in tema.items() if k in TEMA_KEYS) + "}"


def miniaturas_js(deck_dir):
    """Objeto JS {id: data URI} con las miniaturas de <deck>/miniaturas/<id>.jpg para la galería.
    Si la carpeta no existe, la galería muestra solo número y título."""
    datos = {}
    carpeta = deck_dir / "miniaturas"
    if carpeta.is_dir():
        for jpg in sorted(carpeta.glob("*.jpg")):
            datos[jpg.stem] = "data:image/jpeg;base64," + base64.b64encode(jpg.read_bytes()).decode("ascii")
    return json.dumps(datos)


class Mapa(HTMLParser):
    """Ubica cada elemento de una parte: donde empieza su etiqueta, donde termina y donde va su contenido.

    spans[inicio] = {tag, fin_apertura, fin_contenido, fin, anotable}. fin_contenido y fin valen None en
    elementos sin cierre. anotable marca lo que el editor puede tocar: elementos dentro de una slide, sin
    la section misma y sin el interior de los SVG (el svg completo si se puede mover)."""

    def __init__(self, texto):
        super().__init__(convert_charrefs=False)
        self.texto = texto
        self.lineas = [0] + [m.end() for m in re.finditer("\n", texto)]
        self.pila = []
        self.spans = {}
        self.svg = 0
        self.feed(texto)
        self.close()

    def _pos(self):
        linea, col = self.getpos()
        return self.lineas[linea - 1] + col

    def _apertura(self, tag, cierra_sola):
        ini = self._pos()
        fin = ini + len(self.get_starttag_text() or "")
        en_slide = any(t == "section" for t, _ in self.pila)
        anotable = en_slide and tag != "section" and self.svg == 0
        self.spans[ini] = {"tag": tag, "fin_apertura": fin, "fin_contenido": None, "fin": None, "anotable": anotable}
        if cierra_sola or tag in VACIOS:
            self.spans[ini]["fin"] = fin
            return
        if tag == "svg":
            self.svg += 1
        self.pila.append((tag, ini))

    def handle_starttag(self, tag, attrs):
        self._apertura(tag, False)

    def handle_startendtag(self, tag, attrs):
        self._apertura(tag, True)

    def handle_endtag(self, tag):
        pos = self._pos()
        cierre = self.texto.find(">", pos)
        fin = len(self.texto) if cierre < 0 else cierre + 1
        for k in range(len(self.pila) - 1, -1, -1):
            if self.pila[k][0] == tag:
                for t, ini in self.pila[k:]:
                    if t == "svg":
                        self.svg -= 1
                    if t == tag and ini == self.pila[k][1]:
                        self.spans[ini]["fin_contenido"] = pos
                        self.spans[ini]["fin"] = fin
                del self.pila[k:]
                break


def anotar_parte(nombre, texto):
    """Inserta data-e="<parte>:<inicio>" en la etiqueta de apertura de cada elemento anotable."""
    mapa = Mapa(texto)
    salida = texto
    for ini in sorted(mapa.spans, reverse=True):
        sp = mapa.spans[ini]
        if not sp["anotable"]:
            continue
        fin = sp["fin_apertura"]
        corte = fin - 2 if salida[fin - 2:fin] == "/>" else fin - 1
        salida = salida[:corte] + f' data-e="{nombre}:{ini}"' + salida[corte:]
    return salida


MEDIA_SRC = re.compile(r'src="media/([\w.-]+)"')
MEDIA_MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp"}


def incrustar_media(deck_dir, texto, nombre, problems):
    """Las imagenes insertadas viven en <deck>/media; en el HTML van como data URI para que sea un solo archivo."""
    def poner(m):
        f = deck_dir / "media" / m.group(1)
        ext = f.suffix.lstrip(".").lower()
        if not f.is_file() or ext not in MEDIA_MIME:
            problems.append(f"{nombre}: falta la imagen media/{m.group(1)}")
            return m.group(0)
        return f'src="data:{MEDIA_MIME[ext]};base64,{base64.b64encode(f.read_bytes()).decode("ascii")}"'
    return MEDIA_SRC.sub(poner, texto)


SECCION = re.compile(r"<section\b.*?</section>", re.S)


def huellas_slides(deck_dir, cfg=None):
    """{id: sha256} de cada slide con todo lo que cambia su aspecto: su <section>, los estilos y scripts de su
    parte, el tema y las fuentes de deck.json y su marca de practica. Si una slide no cambio, su huella tampoco,
    asi miniaturas y capturas se rehacen solo donde hace falta."""
    deck_dir = Path(deck_dir).resolve()
    if cfg is None:
        cfg = json.loads((deck_dir / "deck.json").read_text(encoding="utf-8"))
    base = json.dumps([cfg.get("tema", {}), cfg.get("fuentes", [])], sort_keys=True)
    marcas = dict(f.split("|", 1) for f in leer_lista(deck_dir / "marcas.txt") if "|" in f)
    marcas = {k.strip(): v.strip() for k, v in marcas.items()}
    huellas = {}
    for p in sorted((deck_dir / "parts").glob("*.html")):
        texto = p.read_text(encoding="utf-8")
        comun = SECCION.sub("", texto)
        for m in SECCION.finditer(texto):
            sid = ID_SECCION.match(m.group(0))
            if not sid:
                continue
            datos = "\0".join([base, comun, m.group(0), marcas.get(sid.group(1), "")])
            huellas[sid.group(1)] = hashlib.sha256(datos.encode("utf-8")).hexdigest()[:16]
    return huellas


HUELLAS_MINI = "huellas.json"


def leer_huellas_mini(deck_dir):
    """Huellas con las que se hizo cada miniatura. Si el indice falta o esta dañado, la respuesta vacia hace que
    miniaturas.py las rehaga todas: es lo correcto cuando no se sabe de que version es cada imagen."""
    f = Path(deck_dir) / "miniaturas" / HUELLAS_MINI
    if not f.is_file():
        return {}
    try:
        datos = json.loads(f.read_text(encoding="utf-8"))
    except ValueError:
        return {}
    return datos if isinstance(datos, dict) else {}


def miniaturas_viejas(deck_dir, huellas):
    """Ids cuya miniatura falta o se capturo de otra version de la slide."""
    previas = leer_huellas_mini(deck_dir)
    carpeta = Path(deck_dir) / "miniaturas"
    return [sid for sid, h in huellas.items() if previas.get(sid) != h or not (carpeta / f"{sid}.jpg").is_file()]


def miniaturas_vigentes(deck_dir, huellas):
    """Para dar por terminado el deck, cada slide necesita su miniatura hecha con su version actual."""
    viejas = miniaturas_viejas(deck_dir, huellas)
    if not viejas:
        return []
    return [f"{len(viejas)} miniaturas faltan o no estan al dia: {', '.join(viejas[:8])}"
            f"{'...' if len(viejas) > 8 else ''} (corre miniaturas.py; solo rehace esas)"]


def escribir_entregable(deck_dir, cfg, html):
    """Escribe el HTML en la ruta 'salida' de deck.json. Va primero a un archivo .parcial y luego lo reemplaza,
    para que quien lo abra a mitad de una escritura nunca vea un archivo cortado. Si el contenido no cambio, no
    toca el archivo. Devuelve (ruta, cambio)."""
    salida = cfg.get("salida")
    if not salida:
        raise ValueError("deck.json no tiene 'salida': no hay entregable que actualizar")
    final = (Path(deck_dir) / salida).resolve()
    datos = html.encode("utf-8")
    if final.is_file() and final.stat().st_size == len(datos) and final.read_bytes() == datos:
        return final, False
    final.parent.mkdir(parents=True, exist_ok=True)
    parcial = final.with_name(final.name + ".parcial")
    parcial.write_bytes(datos)
    os.replace(parcial, final)
    return final, True


def orden_en_html(html):
    """Ids de las slides en el orden en que quedaron en el HTML armado (orden.txt puede cambiarlo)."""
    ini = html.find('<div id="deck">')
    return re.findall(r'<section\b[^>]*\bid="([^"]+)"', html[ini if ini >= 0 else 0:])


TOKEN_DECK = re.compile(r"<!--.*?-->|<style\b.*?</style>|<script\b.*?</script>|<section\b.*?</section>", re.S)
ID_SECCION = re.compile(r'<section\b[^>]*\bid="([^"]+)"')

# Marca visible para slides donde la audiencia trabaja (practicas, ejercicios): barra de acento y etiqueta arriba
CSS_MARCA = """<style>
.slide.es-practica::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 14px; background: var(--accent); z-index: 5; }
.marca-practica { position: absolute; top: 26px; left: 50%; transform: translateX(-50%); z-index: 6;
  display: flex; align-items: center; gap: 12px; padding: 8px 20px 8px 14px; background: var(--ink); color: var(--ground);
  font: 700 22px/1 var(--body); letter-spacing: .14em; white-space: nowrap; border-radius: 4px; }
.marca-practica i { width: 14px; height: 14px; background: var(--accent); display: block; }
</style>"""


def leer_lista(ruta):
    """Lineas no vacias de un archivo de texto, sin comentarios (#)."""
    if not ruta.is_file():
        return []
    filas = []
    for linea in ruta.read_text(encoding="utf-8").splitlines():
        linea = linea.split("#", 1)[0].strip()
        if linea:
            filas.append(linea)
    return filas


def ordenar_y_marcar(deck_dir, slides, problems):
    """Con <deck>/orden.txt (un id por linea) las slides siguen ese orden y no el de los archivos; asi una
    definicion puede ir justo antes de su primer uso sin partir partes. Con <deck>/marcas.txt (lineas
    'id | TEXTO') esas slides llevan la marca de practica. Los estilos quedan antes y los scripts despues de todas
    las slides, para que cada script encuentre su slide aunque haya cambiado de lugar."""
    orden = leer_lista(deck_dir / "orden.txt")
    marcas = {}
    for fila in leer_lista(deck_dir / "marcas.txt"):
        sid, _, texto = fila.partition("|")
        if sid.strip() and texto.strip():
            marcas[sid.strip()] = texto.strip()
        else:
            problems.append(f"marcas.txt: linea sin formato 'id | TEXTO': {fila}")
    if not orden and not marcas:
        return slides

    estilos, scripts, secciones, sueltas = [], [], {}, []
    pos = 0
    for m in TOKEN_DECK.finditer(slides):
        if slides[pos:m.start()].strip():
            problems.append(f"orden.txt: contenido fuera de bloque reconocido: {slides[pos:m.start()].strip()[:60]!r}")
        bloque = m.group(0)
        if bloque.startswith("<section"):
            sid = ID_SECCION.match(bloque).group(1)
            secciones[sid] = bloque
            sueltas.append(sid)
        elif bloque.startswith("<script"):
            scripts.append(bloque)
        else:
            estilos.append(bloque)
        pos = m.end()

    if orden:
        repetidos = sorted({i for i in orden if orden.count(i) > 1})
        faltan = [i for i in sueltas if i not in orden]
        sobran = [i for i in orden if i not in secciones]
        if repetidos:
            problems.append(f"orden.txt: ids repetidos {repetidos}")
        if sobran:
            problems.append(f"orden.txt: ids sin slide {sobran}")
        if faltan:
            # Las slides nuevas que todavia no estan en orden.txt van al final, para que se vean mientras se construyen
            problems.append(f"orden.txt: slides que no estan en la lista (van al final) {faltan}")
        secuencia = [i for i in dict.fromkeys(orden) if i in secciones] + faltan
    else:
        secuencia = sueltas

    for sid, texto in marcas.items():
        if sid not in secciones:
            problems.append(f"marcas.txt: id sin slide '{sid}'")
            continue
        bloque = secciones[sid]
        apertura = re.match(r"<section\b[^>]*>", bloque).group(0)
        nueva = re.sub(r'class="slide', 'class="slide es-practica', apertura, count=1)
        secciones[sid] = nueva + f'<div class="marca-practica"><i></i>{texto}</div>' + bloque[len(apertura):]

    return "\n".join(estilos + ([CSS_MARCA] if marcas else []) + [secciones[i] for i in secuencia] + scripts)


def construir(deck_dir, only=None, anotar=False):
    """Arma el HTML del deck. Devuelve {html, problemas, ids, partes}; no escribe nada en disco."""
    deck_dir = Path(deck_dir).resolve()
    cfg_path = deck_dir / "deck.json"
    if not cfg_path.is_file():
        raise FileNotFoundError(f"Falta {cfg_path}")
    cfg = json.loads(cfg_path.read_text(encoding="utf-8"))

    parts = sorted((deck_dir / "parts").glob("*.html"))
    if only:
        parts = [p for p in parts if any(p.name.startswith(o) for o in only)]

    problems = []
    chunks = []
    ids = {}
    pendientes = []
    for p in parts:
        text = p.read_text(encoding="utf-8")
        for n, line in enumerate(text.splitlines(), 1):
            if BANNED.search(line):
                problems.append(f"{p.name}:{n}: caracter prohibido (guion largo o medio, punto medio o emoji)")
            if REMOTE.search(line):
                problems.append(f"{p.name}:{n}: recurso remoto; todo debe ir embebido para funcionar sin internet")
        for m in re.finditer(r'<section[^>]*\bid="([^"]+)"', text):
            if m.group(1) in ids:
                problems.append(f"{p.name}: id de slide repetido '{m.group(1)}' (ya en {ids[m.group(1)]})")
            ids[m.group(1)] = p.name
            if re.search(r'\bclass="[^"]*\bpendiente\b', m.group(0)):
                pendientes.append(m.group(1))
        cuerpo = anotar_parte(p.name, text) if anotar else text
        cuerpo = incrustar_media(deck_dir, cuerpo, p.name, problems)
        chunks.append(f"<!-- {p.stem} -->\n{cuerpo.strip()}\n")

    shell = SHELL.read_text(encoding="utf-8")
    html = (shell.replace("<!--TITULO-->", cfg.get("titulo", "Presentacion"))
                 .replace("/*FONTS*/", font_css(deck_dir, cfg.get("fuentes", []), problems))
                 .replace("/*TEMA*/", tema_css(cfg.get("tema", {}), problems))
                 .replace("<!--SLIDES-->", ordenar_y_marcar(deck_dir, "\n".join(chunks), problems) if not only
                          else "\n".join(chunks))
                 .replace("/*MINIS*/", miniaturas_js(deck_dir)))
    return {"html": html, "problemas": problems, "ids": ids, "partes": parts, "cfg": cfg, "pendientes": pendientes}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("deck", help="carpeta con deck.json y parts/")
    ap.add_argument("--only", nargs="*", default=None, help="prefijos de archivo a incluir (no toca el entregable)")
    ap.add_argument("--out", default=None, help="copia del html para revisar, fuera del proyecto")
    ap.add_argument("--final", action="store_true", help="comprobar que el entregable quedo terminado")
    args = ap.parse_args()

    deck_dir = Path(args.deck).resolve()
    if args.only and not args.out:
        sys.exit("--only arma un deck parcial: indica --out (el entregable siempre lleva el deck completo)")
    if args.only and args.final:
        sys.exit("--final revisa el deck completo; no se combina con --only")
    try:
        res = construir(deck_dir, args.only)
    except FileNotFoundError as e:
        sys.exit(str(e))
    except ValueError as e:
        sys.exit(f"deck.json no es JSON valido: {e}")
    if not res["partes"]:
        sys.exit("No hay partes que incluir")
    problems, ids, pend = res["problemas"], res["ids"], res["pendientes"]
    listas = f"{len(ids) - len(pend)} de {len(ids)} slides listas"

    if args.out:
        dest = Path(args.out).resolve()
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(res["html"], encoding="utf-8")
        huellas = huellas_slides(deck_dir, res["cfg"])
        orden = [[n, sid, huellas.get(sid, "")] for n, sid in enumerate(orden_en_html(res["html"]), 1)]
        dest.with_suffix(".huellas.json").write_text(json.dumps({"slides": orden}), encoding="utf-8")
        print(f"OK {dest} ({len(res['partes'])} partes, {listas})")

    if not args.only:
        try:
            ruta, cambio = escribir_entregable(deck_dir, res["cfg"], res["html"])
            print(f"ENTREGABLE {ruta} ({listas}{'' if cambio else ', sin cambios'})")
        except ValueError as e:
            problems.append(str(e))
        except OSError as e:
            problems.append(f"no pude escribir el entregable: {e}")

    if pend:
        problems.append(f"{len(pend)} slides siguen pendientes: {', '.join(pend[:8])}{'...' if len(pend) > 8 else ''}")
    if args.final:
        problems += miniaturas_vigentes(deck_dir, huellas_slides(deck_dir, res["cfg"]))
        if problems:
            print("El entregable esta al dia pero no terminado: resuelve los avisos y vuelve a correr --final")
        else:
            print(f"FINAL {(deck_dir / res['cfg']['salida']).resolve()}")

    for pr in problems:
        print("AVISO", pr)
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
