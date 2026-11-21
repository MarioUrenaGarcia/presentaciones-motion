"""Vista en vivo del deck: se reconstruye sola cuando cambia una parte y el navegador recarga en la misma slide.
Trae un editor tipo PowerPoint (tecla E): seleccionar, mover, escalar, rotar, alinear, copiar y pegar, insertar
texto, formas e imagenes, y exportar. Al guardar escribe en parts/ y las imagenes quedan en <deck>/media.

Uso:
  python -I vivo.py <carpeta-deck> [--puerto 4610] [--respaldos <carpeta>]

Abre la URL que imprime (http://127.0.0.1:<puerto>/). Solo escucha en esta computadora. Para guardar, subir o
exportar, el navegador manda un token que solo conoce la pagina servida, asi otra web no puede escribir nada.
Antes de cada guardado copia las partes tocadas a la carpeta de respaldos; "Deshacer guardado" las restaura.
GET /__vivo/estado devuelve version, avisos, slides pendientes y el avance de una exportacion.
"""
import argparse
import hashlib
import html as htmlmod
import json
import re
import secrets
import shutil
import subprocess
import sys
import tempfile
import threading
import time
from html.parser import HTMLParser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
sys.dont_write_bytecode = True  # no deja __pycache__ dentro de la carpeta de la skill
import build  # noqa: E402  (el import va despues de ajustar sys.path para correr con python -I)

CLIENTE = AQUI.parent / "assets" / "vivo" / "cliente.js"
EXPORTAR = AQUI / "exportar.py"
NOMBRE_PARTE = re.compile(r"^[\w.-]+\.html$")
NOMBRE_MEDIA = re.compile(r"^[\w.-]+\.(?:png|jpe?g|webp|gif)$", re.I)
MARCA = re.compile(r"^([\w.-]+\.html):(\d+)$")
ID_SLIDE = re.compile(r"^[\w-]+$")
CLASE = re.compile(r"^[\w -]*$")
EN_LINEA = {"b", "strong", "em", "i", "u", "span", "br", "small", "sup", "sub"}
BLOQUE = EN_LINEA | {"div", "p", "img"}
SALTAR = {"script", "style", "iframe", "object", "embed", "svg", "math", "template"}
MAX_CUERPO = 2_000_000
MAX_IMAGEN = 15_000_000
TIPOS_IMAGEN = {b"\x89PNG": "png", b"\xff\xd8\xff": "jpg", b"GIF8": "gif"}
MIME = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "webp": "image/webp",
        "pdf": "application/pdf", "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}

_COLOR = r"(?:var\(--(?:ground|ink|muted|accent|panel|bar|line|dim)\)|#[0-9a-fA-F]{3,8}|transparent)"
_LARGO = r"^(?:auto|-?\d{1,5}(?:\.\d+)?(?:px|%))$"
# Propiedades que el editor puede escribir en un atributo style, con el formato exacto que aceptan
ESTILO_OK = {
    "position": r"^(?:absolute|relative)$",
    "left": _LARGO, "top": _LARGO, "width": _LARGO, "height": _LARGO,
    "translate": r"^-?\d{1,5}(?:\.\d+)?px(?: -?\d{1,5}(?:\.\d+)?px)?$",
    "scale": r"^\d{1,2}(?:\.\d{1,3})?$",
    "rotate": r"^-?\d{1,4}(?:\.\d+)?deg$",
    "opacity": r"^(?:0|1|0?\.\d{1,3})$",
    "z-index": r"^-?\d{1,4}$",
    "color": "^" + _COLOR + "$", "background": "^" + _COLOR + "$", "background-color": "^" + _COLOR + "$",
    "border": r"^\d{1,2}px (?:solid|dashed) " + _COLOR + "$",
    "border-radius": r"^\d{1,4}(?:px|%)$",
    "font-size": r"^\d{1,3}(?:\.\d+)?px$",
    "font-weight": r"^(?:400|500|600|700|normal|bold)$",
    "font-style": r"^(?:normal|italic)$",
    "text-align": r"^(?:left|center|right)$",
    "line-height": r"^\d(?:\.\d{1,2})?$",
    "object-fit": r"^(?:cover|contain)$",
}
ESTILO_OK = {k: re.compile(v) for k, v in ESTILO_OK.items()}


def validar_props(props):
    """Devuelve (props validas, error). Un valor vacio significa quitar la propiedad."""
    limpias = {}
    for k, v in (props or {}).items():
        k, v = str(k).strip().lower(), str(v).strip()
        if k not in ESTILO_OK:
            return None, f"propiedad no permitida: {k}"
        if v and not ESTILO_OK[k].match(v):
            return None, f"valor no permitido para {k}: {v}"
        limpias[k] = v
    return limpias, None


def mezclar_estilo(apertura, props):
    """Reemplaza las propiedades dadas dentro del atributo style de una etiqueta de apertura."""
    m = re.search(r'\sstyle\s*=\s*"([^"]*)"', apertura)
    previas = [d.strip() for d in m.group(1).split(";") if d.strip()] if m else []
    previas = [d for d in previas if d.split(":")[0].strip().lower() not in props]
    nuevas = [f"{k}: {v}" for k, v in props.items() if v]
    valor = "; ".join(previas + nuevas)
    if m:
        return apertura[:m.start()] + (f' style="{valor}"' if valor else "") + apertura[m.end():]
    if not valor:
        return apertura
    corte = len(apertura) - 2 if apertura.endswith("/>") else len(apertura) - 1
    return apertura[:corte] + f' style="{valor}"' + apertura[corte:]


class Limpio(HTMLParser):
    """Reescribe HTML dejando solo etiquetas y atributos permitidos. Lo demas queda como texto plano."""

    def __init__(self, permitidas, media):
        super().__init__(convert_charrefs=True)
        self.permitidas = permitidas
        self.media = media
        self.out = []
        self.saltar = 0
        self.error = None

    def _atributos(self, tag, attrs):
        a = dict(attrs)
        partes = []
        clase = a.get("class") or ""
        if clase and CLASE.match(clase):
            partes.append(f'class="{clase}"')
        if a.get("style"):
            decl = {}
            for d in a["style"].split(";"):
                if ":" in d:
                    k, v = d.split(":", 1)
                    decl[k.strip().lower()] = v.strip()
            props, err = validar_props({k: v for k, v in decl.items() if k in ESTILO_OK})
            if err:
                self.error = err
            elif props:
                partes.append('style="' + "; ".join(f"{k}: {v}" for k, v in props.items() if v) + '"')
        if tag == "img":
            src = a.get("src") or ""
            nombre = src[6:] if src.startswith("media/") else ""
            if not NOMBRE_MEDIA.match(nombre) or not (self.media / nombre).is_file():
                self.error = f"imagen no encontrada: {src}"
            partes.append(f'src="media/{nombre}"')
            partes.append('alt="' + htmlmod.escape(a.get("alt") or "", quote=True) + '"')
        return (" " + " ".join(partes)) if partes else ""

    def handle_starttag(self, tag, attrs):
        if tag in SALTAR:
            self.saltar += 1
            return
        if self.saltar or tag not in self.permitidas:
            return
        if tag in ("br", "img"):
            self.out.append(f"<{tag}{self._atributos(tag, attrs)}>")
            return
        self.out.append(f"<{tag}{self._atributos(tag, attrs)}>")

    def handle_startendtag(self, tag, attrs):
        if not self.saltar and tag in ("br", "img") and tag in self.permitidas:
            self.out.append(f"<{tag}{self._atributos(tag, attrs)}>")

    def handle_endtag(self, tag):
        if tag in SALTAR:
            self.saltar = max(0, self.saltar - 1)
            return
        if not self.saltar and tag in self.permitidas and tag not in ("br", "img"):
            self.out.append(f"</{tag}>")

    def handle_data(self, data):
        if not self.saltar:
            self.out.append(htmlmod.escape(data, quote=False))


def limpiar(fragmento, permitidas, media):
    p = Limpio(permitidas, media)
    p.feed(fragmento)
    p.close()
    return "".join(p.out), p.error


def recortar_borrado(texto, a, b):
    """Al borrar un elemento que ocupa su propia linea, se lleva tambien la sangria y el salto."""
    s = a
    while s > 0 and texto[s - 1] in " \t":
        s -= 1
    if s == 0 or texto[s - 1] == "\n":
        e = b
        while e < len(texto) and texto[e] in " \t":
            e += 1
        if e < len(texto) and texto[e] == "\n":
            return s, e + 1
    return a, b


class Estado:
    def __init__(self, deck, respaldos):
        self.deck = deck
        self.media = deck / "media"
        self.respaldos = respaldos
        self.cond = threading.Condition()
        self.token = secrets.token_urlsafe(24)
        self.version = 0
        self.html = b""
        self.avisos = []
        self.total = 0
        self.pendientes = 0
        self.firmas = {}
        self.slides = {}
        self.guardados = []
        self.exportacion = {"activa": False, "progreso": 0, "total": 0, "archivos": [], "error": None}
        self.entregable = {"ruta": None, "hora": None, "listas": 0, "total": 0, "error": None}

    def huella(self):
        archivos = [self.deck / "deck.json", build.SHELL, CLIENTE]
        archivos += sorted((self.deck / "parts").glob("*.html"))
        for carpeta in (self.deck / "miniaturas", self.media):
            if carpeta.is_dir():
                archivos += sorted(carpeta.iterdir())
        firma = []
        for f in archivos:
            try:
                st = f.stat()
            except FileNotFoundError:
                continue
            firma.append((str(f), st.st_mtime_ns, st.st_size))
        return tuple(firma)

    def reconstruir(self):
        firmas = {}
        for p in sorted((self.deck / "parts").glob("*.html")):
            st = p.stat()
            firmas[p.name] = (st.st_mtime_ns, st.st_size)
        try:
            res = build.construir(self.deck, anotar=True)
            html, avisos = res["html"], list(res["problemas"])
            pendientes = len(res["pendientes"])
        except (OSError, ValueError, KeyError) as e:
            print(f"[vivo] no se pudo ensamblar: {e}", flush=True)
            with self.cond:
                self.avisos = [f"No se pudo ensamblar: {e}"]
                self.version += 1
                self.cond.notify_all()
            return
        with self.cond:
            self.version += 1
            datos = json.dumps({"v": self.version, "token": self.token})
            inyeccion = f'<script>window.__VIVO={datos};</script>\n<script src="/__vivo/cliente.js?v={self.version}"></script>\n</body>'
            self.html = html.replace("</body>", inyeccion, 1).encode("utf-8")
            self.avisos = avisos
            self.total = len(res["ids"])
            self.pendientes = pendientes
            self.firmas = firmas
            self.slides = dict(res["ids"])
            self.cond.notify_all()
        print(f"[vivo] version {self.version}: {self.total} slides, {pendientes} pendientes, {len(avisos)} avisos", flush=True)
        self.actualizar_entregable()

    def actualizar_entregable(self):
        """El archivo que se va a entregar sigue al deck en cada cambio, con las slides que falten como pendientes:
        quien lo abra a mitad de la construccion ve el avance real y no un archivo viejo o inexistente."""
        info = {"ruta": None, "hora": None, "listas": 0, "total": 0, "error": None}
        try:
            res = build.construir(self.deck)
            ruta, cambio = build.escribir_entregable(self.deck, res["cfg"], res["html"])
            info.update(ruta=str(ruta), hora=time.strftime("%H:%M:%S"), total=len(res["ids"]),
                        listas=len(res["ids"]) - len(res["pendientes"]))
            if cambio:
                print(f"[vivo] entregable al dia: {ruta} ({info['listas']} de {info['total']} listas)", flush=True)
            else:
                with self.cond:
                    info["hora"] = self.entregable.get("hora") or info["hora"]
        except (OSError, ValueError, KeyError) as e:
            info["error"] = f"no se pudo actualizar el entregable: {e}"
            print(f"[vivo] {info['error']}", flush=True)
        with self.cond:
            self.entregable = info
            self.cond.notify_all()

    def resumen(self):
        with self.cond:
            return {"v": self.version, "avisos": self.avisos, "total": self.total, "pendientes": self.pendientes,
                    "exportacion": dict(self.exportacion), "entregable": dict(self.entregable)}

    def vigilar(self):
        """Reconstruye cuando la huella cambia y se mantiene igual una vuelta: evita leer archivos a medio escribir."""
        ultima = self.huella()
        previa = ultima
        while True:
            time.sleep(0.35)
            actual = self.huella()
            if actual != ultima and actual == previa:
                self.reconstruir()
                ultima = actual
            previa = actual

    # ---------- guardar ----------
    def _parte_vigente(self, parte):
        ruta = self.deck / "parts" / parte
        if not NOMBRE_PARTE.match(parte) or not ruta.is_file():
            return None, "la parte no existe"
        st = ruta.stat()
        if (st.st_mtime_ns, st.st_size) != self.firmas.get(parte):
            return None, "el archivo cambio desde que cargaste la vista; espera la recarga"
        return ruta, None

    def guardar(self, ops):
        textos, mapas, rechazados = {}, {}, []
        ediciones = {}

        def cargar(parte):
            if parte not in textos:
                ruta, err = self._parte_vigente(parte)
                if err:
                    return err
                textos[parte] = ruta.read_text(encoding="utf-8")
                mapas[parte] = build.Mapa(textos[parte]).spans
            return None

        def seccion(parte, sid):
            texto = textos[parte]
            for ini, sp in mapas[parte].items():
                if sp["tag"] == "section" and re.search(rf'\bid="{re.escape(sid)}"', texto[ini:sp["fin_apertura"]]):
                    return sp
            return None

        for orden, op in enumerate(ops):
            tipo = op.get("op")
            ref = op.get("e") or op.get("origen") or op.get("destino")
            try:
                if tipo in ("estilo", "html", "borrar", "copia"):
                    m = MARCA.match(str(op.get("e") if tipo != "copia" else op.get("origen")))
                    if not m:
                        raise ValueError("marca invalida")
                    parte, ini = m.group(1), int(m.group(2))
                    err = cargar(parte)
                    if err:
                        raise ValueError(err)
                    sp = mapas[parte].get(ini)
                    if not sp or not sp["anotable"] or sp["tag"] != op.get("tag"):
                        raise ValueError("no se encontro el elemento en el archivo")
                    texto = textos[parte]
                if tipo == "estilo":
                    props, err = validar_props(op.get("props"))
                    if err:
                        raise ValueError(err)
                    apertura = texto[ini:sp["fin_apertura"]]
                    ediciones.setdefault(parte, []).append((ini, sp["fin_apertura"], mezclar_estilo(apertura, props), orden, "estilo", ref))
                elif tipo == "html":
                    if sp["fin_contenido"] is None:
                        raise ValueError("el elemento no tiene contenido de texto")
                    nuevo, err = limpiar(str(op.get("html", "")), EN_LINEA, self.media)
                    if err:
                        raise ValueError(err)
                    if build.BANNED.search(nuevo):
                        raise ValueError("el texto tiene guion largo o medio, punto medio o emoji")
                    ediciones.setdefault(parte, []).append((sp["fin_apertura"], sp["fin_contenido"], nuevo, orden, "html", ref))
                elif tipo == "borrar":
                    a, b = recortar_borrado(texto, ini, sp["fin"])
                    ediciones.setdefault(parte, []).append((a, b, "", orden, "borrar", ref))
                elif tipo in ("insertar", "copia"):
                    sid = str(op.get("destino", ""))
                    destino = self.slides.get(sid) if ID_SLIDE.match(sid) else None
                    if not destino:
                        raise ValueError("no se encontro la slide de destino")
                    err = cargar(destino)
                    if err:
                        raise ValueError(err)
                    sec = seccion(destino, sid)
                    if not sec or sec["fin_contenido"] is None:
                        raise ValueError("no se encontro la slide de destino en su archivo")
                    if tipo == "insertar":
                        nuevo, err = limpiar(str(op.get("html", "")), BLOQUE, self.media)
                    else:
                        # La copia sale del fuente original, no del DOM, para conservar su marcado y sus clases
                        fragmento = texto[ini:sp["fin"]]
                        props, err = validar_props(op.get("props"))
                        if not err and op.get("html") is not None and sp["fin_contenido"] is not None:
                            interior, err = limpiar(str(op["html"]), EN_LINEA, self.media)
                            a, b = sp["fin_apertura"] - ini, sp["fin_contenido"] - ini
                            fragmento = fragmento[:a] + interior + fragmento[b:]
                        if not err:
                            ap = sp["fin_apertura"] - ini
                            fragmento = mezclar_estilo(fragmento[:ap], props) + fragmento[ap:]
                        nuevo = fragmento
                    if err:
                        raise ValueError(err)
                    if build.BANNED.search(nuevo):
                        raise ValueError("el contenido tiene guion largo o medio, punto medio o emoji")
                    if tipo == "copia" and op.get("junto") and destino == parte:
                        # Pegada en la misma slide: queda justo despues del original, con su misma sangria
                        s = ini
                        while s > 0 and texto[s - 1] in " \t":
                            s -= 1
                        sangria = texto[s:ini] if s == 0 or texto[s - 1] == "\n" else ""
                        pos = sp["fin"]
                        ediciones.setdefault(destino, []).append((pos, pos, "\n" + sangria + nuevo, orden, tipo, sid))
                    else:
                        pos = sec["fin_contenido"]
                        ediciones.setdefault(destino, []).append((pos, pos, "  " + nuevo + "\n", orden, tipo, sid))
                elif tipo not in ("estilo", "html", "borrar"):
                    raise ValueError("operacion desconocida")
            except ValueError as e:
                rechazados.append({"op": tipo, "ref": ref, "motivo": str(e)})

        respaldo_dir = self.respaldos / time.strftime("%Y%m%d-%H%M%S")
        tanda, aplicadas = [], 0
        for parte, lista in ediciones.items():
            texto = textos[parte]
            borrados = [(a, b) for a, b, _, _, t, _ in lista if t == "borrar"]
            vigentes = []
            for e in lista:
                a, b, _, _, t, _ = e
                # Lo que queda dentro de un elemento borrado ya no importa
                if t != "borrar" and any(x <= a and b <= y and (x, y) != (a, b) for x, y in borrados):
                    continue
                vigentes.append(e)
            vigentes.sort(key=lambda x: (x[0], x[3]), reverse=True)
            limite = len(texto) + 1
            cambios = 0
            for a, b, nuevo, _, t, ref in vigentes:
                if b > limite:
                    rechazados.append({"op": t, "ref": ref, "motivo": "se cruza con otro cambio; guarda por partes"})
                    continue
                texto = texto[:a] + nuevo + texto[b:]
                limite = a
                cambios += 1
            if not cambios:
                continue
            ruta = self.deck / "parts" / parte
            respaldo_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ruta, respaldo_dir / parte)
            ruta.write_text(texto, encoding="utf-8")
            st = ruta.stat()
            tanda.append({"parte": parte, "respaldo": str(respaldo_dir / parte), "firma": (st.st_mtime_ns, st.st_size)})
            aplicadas += cambios
        if tanda:
            self.guardados.append(tanda)
            print(f"[vivo] guardado: {aplicadas} cambios en {', '.join(t['parte'] for t in tanda)}", flush=True)
        return {"ok": True, "aplicadas": aplicadas, "rechazados": rechazados}

    def deshacer(self):
        if not self.guardados:
            return {"ok": False, "motivo": "no hay guardados para deshacer"}
        tanda = self.guardados[-1]
        for t in tanda:
            st = (self.deck / "parts" / t["parte"]).stat()
            if (st.st_mtime_ns, st.st_size) != tuple(t["firma"]):
                return {"ok": False, "motivo": f"{t['parte']} cambio despues de guardar; no lo piso"}
        for t in tanda:
            shutil.copy2(t["respaldo"], self.deck / "parts" / t["parte"])
        self.guardados.pop()
        print(f"[vivo] deshecho el ultimo guardado ({', '.join(t['parte'] for t in tanda)})", flush=True)
        return {"ok": True, "partes": [t["parte"] for t in tanda]}

    # ---------- imagenes ----------
    def subir(self, datos):
        if not datos or len(datos) > MAX_IMAGEN:
            return {"ok": False, "motivo": "imagen vacia o de mas de 15 MB"}
        ext = next((e for firma, e in TIPOS_IMAGEN.items() if datos.startswith(firma)), None)
        if not ext and datos[:4] == b"RIFF" and datos[8:12] == b"WEBP":
            ext = "webp"
        if not ext:
            return {"ok": False, "motivo": "solo se aceptan PNG, JPG, GIF o WEBP"}
        nombre = hashlib.sha256(datos).hexdigest()[:16] + "." + ext
        self.media.mkdir(exist_ok=True)
        destino = self.media / nombre
        if not destino.exists():
            destino.write_bytes(datos)
        print(f"[vivo] imagen guardada: media/{nombre}", flush=True)
        return {"ok": True, "ruta": f"media/{nombre}"}

    # ---------- exportar ----------
    def exportar(self, formato, pasos):
        if formato not in ("pdf", "pptx", "ambos"):
            return {"ok": False, "motivo": "formato desconocido"}
        if not EXPORTAR.is_file():
            return {"ok": False, "motivo": "falta scripts/exportar.py"}
        with self.cond:
            if self.exportacion["activa"]:
                return {"ok": False, "motivo": "ya hay una exportacion en curso"}
            self.exportacion = {"activa": True, "progreso": 0, "total": 0, "archivos": [], "error": None}
        threading.Thread(target=self._exportar, args=(formato, pasos), daemon=True).start()
        return {"ok": True}

    def _exportar(self, formato, pasos):
        # Sin -I a proposito: exportar.py usa Pillow, que vive en los paquetes del usuario
        cmd = [sys.executable, str(EXPORTAR), str(self.deck), "--formato", formato] + (["--pasos"] if pasos else [])
        archivos, error = [], None
        try:
            proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
            ultimas = []
            for linea in proc.stdout:
                linea = linea.strip()
                ultimas = (ultimas + [linea])[-6:]
                m = re.match(r"PROGRESO (\d+)/(\d+)", linea)
                if m:
                    with self.cond:
                        self.exportacion["progreso"], self.exportacion["total"] = int(m.group(1)), int(m.group(2))
                        self.cond.notify_all()
                elif linea.startswith("LISTO "):
                    archivos.append(linea[6:].strip())
            if proc.wait() != 0 and not archivos:
                error = "la exportacion fallo: " + " | ".join(ultimas)
        except OSError as e:
            error = f"no se pudo lanzar la exportacion: {e}"
        with self.cond:
            self.exportacion = {"activa": False, "progreso": self.exportacion["progreso"], "total": self.exportacion["total"],
                                "archivos": archivos, "error": error}
            self.cond.notify_all()
        print(f"[vivo] exportacion terminada: {archivos or error}", flush=True)


def manejador(estado, puerto):
    origenes = {f"http://127.0.0.1:{puerto}", f"http://localhost:{puerto}"}

    class Manejador(BaseHTTPRequestHandler):
        server_version = "vivo"

        def log_message(self, fmt, *args):
            # Cada recarga pide varias rutas; el registro util lo imprime Estado
            pass

        def _enviar(self, codigo, cuerpo, tipo, extra=None):
            self.send_response(codigo)
            self.send_header("Content-Type", tipo)
            self.send_header("Content-Length", str(len(cuerpo)))
            self.send_header("Cache-Control", "no-store")
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(cuerpo)

        def _json(self, codigo, datos):
            self._enviar(codigo, json.dumps(datos, ensure_ascii=False).encode("utf-8"), "application/json; charset=utf-8")

        def do_GET(self):
            ruta, _, consulta = self.path.partition("?")
            if ruta in ("/", "/index.html"):
                with estado.cond:
                    cuerpo = estado.html
                self._enviar(200, cuerpo, "text/html; charset=utf-8")
            elif ruta == "/__vivo/cliente.js":
                self._enviar(200, CLIENTE.read_bytes(), "text/javascript; charset=utf-8")
            elif ruta == "/__vivo/estado":
                self._json(200, estado.resumen())
            elif ruta == "/__vivo/eventos":
                self._eventos()
            elif ruta.startswith("/media/") and NOMBRE_MEDIA.match(ruta[7:]) and (estado.media / ruta[7:]).is_file():
                ext = ruta.rsplit(".", 1)[1].lower()
                self._enviar(200, (estado.media / ruta[7:]).read_bytes(), MIME.get(ext, "application/octet-stream"))
            elif ruta == "/__vivo/descarga":
                self._descarga(consulta)
            else:
                self._enviar(404, b"no encontrado", "text/plain; charset=utf-8")

        def _descarga(self, consulta):
            pedido = (parse_qs(consulta).get("archivo") or [""])[0]
            with estado.cond:
                listos = list(estado.exportacion["archivos"])
            # Solo se entregan archivos que acaba de producir la exportacion, nunca rutas arbitrarias
            elegido = next((a for a in listos if Path(a).name == Path(pedido).name), None)
            if not elegido or not Path(elegido).is_file():
                self._enviar(404, b"no encontrado", "text/plain; charset=utf-8")
                return
            ext = Path(elegido).suffix.lstrip(".").lower()
            nombre = Path(elegido).name
            self._enviar(200, Path(elegido).read_bytes(), MIME.get(ext, "application/octet-stream"),
                         {"Content-Disposition": f'attachment; filename="{nombre}"'})

        def _eventos(self):
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            vista, export_visto = -1, None
            try:
                while True:
                    with estado.cond:
                        # Solo espera si no hay nada nuevo que contar; la primera vuelta responde al instante
                        if estado.version == vista and json.dumps([estado.exportacion, estado.entregable]) == export_visto:
                            estado.cond.wait(timeout=15)
                        version = estado.version
                        exp = json.dumps([estado.exportacion, estado.entregable])
                    if version != vista or exp != export_visto:
                        datos = json.dumps(estado.resumen(), ensure_ascii=False)
                        self.wfile.write(f"event: version\ndata: {datos}\n\n".encode("utf-8"))
                        vista, export_visto = version, exp
                    else:
                        self.wfile.write(b": latido\n\n")
                    self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                return

        def do_POST(self):
            origen = self.headers.get("Origin")
            if self.headers.get("X-Vivo-Token") != estado.token or (origen and origen not in origenes):
                self._json(403, {"ok": False, "motivo": "token u origen invalido"})
                return
            largo = int(self.headers.get("Content-Length") or 0)
            ruta = self.path.split("?")[0]
            if largo > (MAX_IMAGEN if ruta == "/__vivo/subir" else MAX_CUERPO):
                self._json(413, {"ok": False, "motivo": "demasiado grande"})
                return
            cuerpo = self.rfile.read(largo) if largo else b""
            if ruta == "/__vivo/subir":
                self._json(200, estado.subir(cuerpo))
                return
            try:
                datos = json.loads(cuerpo or b"{}")
            except ValueError:
                self._json(400, {"ok": False, "motivo": "JSON invalido"})
                return
            if ruta == "/__vivo/guardar" and isinstance(datos.get("ops"), list):
                self._json(200, estado.guardar(datos["ops"]))
            elif ruta == "/__vivo/deshacer":
                self._json(200, estado.deshacer())
            elif ruta == "/__vivo/exportar":
                self._json(200, estado.exportar(str(datos.get("formato")), bool(datos.get("pasos"))))
            else:
                self._json(404, {"ok": False, "motivo": "ruta desconocida"})

    return Manejador


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("deck", help="carpeta con deck.json y parts/")
    ap.add_argument("--puerto", type=int, default=4610)
    ap.add_argument("--respaldos", default=None, help="carpeta para copias previas a cada guardado")
    args = ap.parse_args()

    deck = Path(args.deck).resolve()
    if not (deck / "deck.json").is_file():
        sys.exit(f"Falta {deck / 'deck.json'}")
    (deck / "parts").mkdir(exist_ok=True)
    respaldos = Path(args.respaldos).resolve() if args.respaldos else Path(tempfile.gettempdir()) / "vivo-respaldos" / deck.parent.name
    estado = Estado(deck, respaldos)
    estado.reconstruir()

    servidor = None
    for puerto in range(args.puerto, args.puerto + 20):
        try:
            servidor = ThreadingHTTPServer(("127.0.0.1", puerto), manejador(estado, puerto))
            break
        except OSError:
            continue
    if servidor is None:
        sys.exit(f"No hay puerto libre entre {args.puerto} y {args.puerto + 19}")
    servidor.daemon_threads = True
    threading.Thread(target=estado.vigilar, daemon=True).start()
    print(f"[vivo] Vista en vivo: http://127.0.0.1:{servidor.server_address[1]}/  (respaldos en {respaldos})", flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        print("[vivo] detenido", flush=True)
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
