"""Exporta un deck a PDF y/o PowerPoint: una página por slide, con la captura de cómo se ve al presentar.

Uso (necesita Pillow; por eso va sin -I):
  python exportar.py <carpeta-deck> --formato pdf|pptx|ambos [--salida <ruta-sin-extension>] [--pasos] [--interstitials]

Ensambla el deck con build.construir en una carpeta temporal, lo recorre con recorrido.mjs (Edge o Chrome
headless) y arma los archivos con las capturas:
  - PDF: una página de 1920 x 1080 px a 96 dpi por captura, en JPEG de buena calidad para que pese poco.
  - PPTX: presentación 16:9 con una imagen a sangre completa por slide; texto alternativo = título de la slide.
Por defecto sale junto al HTML final ("salida" de deck.json) con el mismo nombre base. Sin interstitials y,
en las slides con pasos, solo el último paso; --pasos da una página por paso y --interstitials los incluye.

Imprime "PROGRESO n/total" mientras recorre y "LISTO <ruta>" por cada archivo escrito. Los avisos de build.py
(caracteres prohibidos, slides pendientes) se muestran como AVISO pero no detienen la exportación.
"""
import argparse
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # no deja __pycache__ dentro de la carpeta de la skill
if str(AQUI) not in sys.path:
    sys.path.insert(0, str(AQUI))
import build  # noqa: E402  (va después de asegurar la carpeta de scripts en sys.path)

RECORRIDO = AQUI / "recorrido.mjs"
JPEG = {"quality": 85, "subsampling": 0, "optimize": True}  # 4:4:4 conserva nítidos los bordes del texto de color
EMU_ANCHO, EMU_ALTO = 12192000, 6858000  # 16:9 panorámica de PowerPoint
EXTENSIONES = {".pdf", ".pptx", ".html", ".htm"}


class ErrorExportar(Exception):
    """Falla que impide terminar; el mensaje se muestra tal cual al usuario."""


def salida_utf8():
    # Otro proceso lee esta salida por una tubería; en Windows la codificación por defecto no es UTF-8
    for flujo in (sys.stdout, sys.stderr):
        if hasattr(flujo, "reconfigure"):
            flujo.reconfigure(encoding="utf-8", errors="replace")


# --------------------------------------------------------------------------- ensamblar y recorrer

def ensamblar(deck_dir, destino_html):
    """Arma el deck con build.construir y lo escribe en destino_html. Devuelve el resultado de construir."""
    try:
        res = build.construir(deck_dir)
    except FileNotFoundError as e:
        raise ErrorExportar(str(e)) from e
    except json.JSONDecodeError as e:
        raise ErrorExportar(f"deck.json no es JSON válido: {e}") from e
    if not res["partes"]:
        raise ErrorExportar(f"No hay partes en {Path(deck_dir) / 'parts'}")
    for problema in res["problemas"]:
        print("AVISO", problema, flush=True)
    if res["pendientes"]:
        print(f"AVISO {len(res['pendientes'])} slides siguen pendientes y salen como EN CONSTRUCCIÓN", flush=True)
    destino_html.write_text(res["html"], encoding="utf-8")
    return res


def recorrer(html, carpeta, pasos=False, interstitials=False, primer_paso=False, ids=None):
    """Corre recorrido.mjs, reenvía su progreso y devuelve el manifiesto (dict) con las páginas capturadas.
    Con ids (lista) solo recorre esas slides."""
    node = shutil.which("node")
    if not node:
        raise ErrorExportar("No encontré Node.js (el comando node); hace falta para recorrer el deck.")
    cmd = [node, str(RECORRIDO), str(html), str(carpeta)]
    if pasos:
        cmd.append("--pasos")
    if primer_paso:
        cmd.append("--primer-paso")
    if interstitials:
        cmd.append("--interstitials")
    if ids:
        cmd += ["--ids", ",".join(ids)]
    try:
        proc = subprocess.Popen(cmd, cwd=str(AQUI), stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                text=True, encoding="utf-8", errors="replace", bufsize=1)
    except OSError as e:
        raise ErrorExportar(f"No pude ejecutar recorrido.mjs: {e}") from e
    with proc.stdout:
        for linea in proc.stdout:
            linea = linea.rstrip()
            if linea:
                print(linea, flush=True)
    codigo = proc.wait()

    manifiesto_path = Path(carpeta) / "manifiesto.json"
    if codigo not in (0, 1) or not manifiesto_path.is_file():
        raise ErrorExportar(f"El recorrido del deck falló (código {codigo}).")
    try:
        manifiesto = json.loads(manifiesto_path.read_text(encoding="utf-8"))
    except ValueError as e:
        raise ErrorExportar(f"El manifiesto del recorrido no se pudo leer: {e}") from e
    if codigo == 1:
        print(f"AVISO el deck tuvo {len(manifiesto.get('errores', []))} errores de JavaScript; "
              "revisa que las capturas se vean bien", flush=True)
    if not manifiesto.get("paginas"):
        raise ErrorExportar("El recorrido no produjo ninguna captura.")
    return manifiesto


def borrar_temporal(carpeta):
    """Borra la carpeta temporal. En Windows el navegador puede tardar en soltar archivos: se reintenta."""
    ultimo = None
    for _ in range(6):
        try:
            shutil.rmtree(carpeta)
            return
        except FileNotFoundError:
            return
        except OSError as e:
            ultimo = e
            time.sleep(0.5)
    print(f"AVISO no pude borrar la carpeta temporal {carpeta}: {ultimo}", flush=True)


# --------------------------------------------------------------------------- escritura segura

def escribir_seguro(destino, escribir):
    """Escribe en un archivo parcial junto al destino y lo renombra al final, así un fallo no deja un
    archivo a medias. escribir(ruta) hace el trabajo sobre la ruta parcial."""
    destino.parent.mkdir(parents=True, exist_ok=True)
    parcial = destino.with_name(destino.name + ".parcial")
    try:
        escribir(parcial)
        os.replace(parcial, destino)
    except PermissionError as e:
        raise ErrorExportar(f"No pude escribir {destino}: ¿está abierto en otro programa? ({e})") from e
    finally:
        if parcial.exists():
            try:
                parcial.unlink()
            except OSError as e:
                print(f"AVISO no pude borrar el archivo parcial {parcial}: {e}", flush=True)


# --------------------------------------------------------------------------- PDF

def pdf_texto(s):
    """Cadena PDF en UTF-16BE con marca de orden, para que tildes y eñes del título se lean bien."""
    return b"<" + (b"\xfe\xff" + s.encode("utf-16-be")).hex().upper().encode("ascii") + b">"


def escribir_pdf(capturas, destino, titulo):
    """Una página por captura, del tamaño de la slide (1920 x 1080 px a 96 dpi = 1440 x 810 pt).

    Pillow comprime cada captura en JPEG y el contenedor PDF se escribe aquí, página por página: así solo hay
    una imagen en memoria a la vez (guardar todas juntas con Pillow las retiene todas, y su modo append falla
    tras varias tandas)."""
    def escribir(ruta):
        n = len(capturas)
        offsets = {}
        with open(ruta, "wb") as f:
            def objeto(num, dic, flujo=None):
                offsets[num] = f.tell()
                f.write(b"%d 0 obj\n" % num + dic)
                if flujo is not None:
                    f.write(b"\nstream\n" + flujo + b"\nendstream")
                f.write(b"\nendobj\n")

            f.write(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
            # 1 catálogo, 2 árbol de páginas, 3 información; luego página, contenido e imagen de cada captura
            hijos = " ".join(f"{4 + 3 * i} 0 R" for i in range(n))
            objeto(1, b"<< /Type /Catalog /Pages 2 0 R >>")
            objeto(2, f"<< /Type /Pages /Kids [{hijos}] /Count {n} >>".encode("ascii"))
            objeto(3, b"<< /Title " + pdf_texto(titulo) + b" >>" if titulo else b"<< >>")
            for i, captura in enumerate(capturas):
                pagina, contenido, imagen = 4 + 3 * i, 5 + 3 * i, 6 + 3 * i
                jpg = io.BytesIO()
                with Image.open(captura) as im:
                    ancho, alto = im.size
                    im.convert("RGB").save(jpg, "JPEG", **JPEG)
                pw, ph = f"{ancho * 72 / 96:g}", f"{alto * 72 / 96:g}"
                objeto(pagina, (f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {pw} {ph}] "
                                f"/Resources << /XObject << /Im0 {imagen} 0 R >> /ProcSet [/PDF /ImageC] >> "
                                f"/Contents {contenido} 0 R >>").encode("ascii"))
                dibujo = f"q {pw} 0 0 {ph} 0 0 cm /Im0 Do Q".encode("ascii")
                objeto(contenido, b"<< /Length %d >>" % len(dibujo), dibujo)
                objeto(imagen, (f"<< /Type /XObject /Subtype /Image /Width {ancho} /Height {alto} "
                                f"/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode "
                                f"/Length {jpg.tell()} >>").encode("ascii"), jpg.getvalue())
            inicio_xref = f.tell()
            total = 3 + 3 * n
            f.write(b"xref\n0 %d\n0000000000 65535 f \n" % (total + 1))
            for num in range(1, total + 1):
                f.write(b"%010d 00000 n \n" % offsets[num])
            f.write(b"trailer\n<< /Size %d /Root 1 0 R /Info 3 0 R >>\nstartxref\n%d\n%%%%EOF\n"
                    % (total + 1, inicio_xref))
    escribir_seguro(destino, escribir)


# --------------------------------------------------------------------------- PPTX

NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_REL = "http://schemas.openxmlformats.org/package/2006/relationships"
REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/"
CT = "application/vnd.openxmlformats-officedocument.presentationml."
CABECERA = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
RAIZ_P = f'xmlns:a="{NS_A}" xmlns:r="{NS_R}" xmlns:p="{NS_P}"'
GRUPO = ('<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
         '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
         '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>')
NO_XML = re.compile("[\x00-\x08\x0b\x0c\x0e-\x1f￾￿]")


def xml_texto(s):
    return escape(NO_XML.sub("", s or ""))


def xml_attr(s):
    return escape(NO_XML.sub("", s or ""), {'"': "&quot;", "\n": "&#10;", "\r": "&#13;", "\t": "&#9;"})


def rels(lista):
    filas = "".join(f'<Relationship Id="{i}" Type="{t}" Target="{d}"/>' for i, t, d in lista)
    return f'{CABECERA}<Relationships xmlns="{NS_REL}">{filas}</Relationships>'


def tema_xml():
    colores = [("dk1", "000000"), ("lt1", "FFFFFF"), ("dk2", "1F1F1F"), ("lt2", "EEEEEE"),
               ("accent1", "C00000"), ("accent2", "7F7F7F"), ("accent3", "A5A5A5"), ("accent4", "404040"),
               ("accent5", "595959"), ("accent6", "D9D9D9"), ("hlink", "C00000"), ("folHlink", "7F7F7F")]
    clr = "".join(f'<a:{n}><a:srgbClr val="{v}"/></a:{n}>' for n, v in colores)
    fuente = '<a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/>'
    relleno = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
    linea = f'<a:ln w="6350">{relleno}</a:ln>'
    efecto = "<a:effectStyle><a:effectLst/></a:effectStyle>"
    return (f'{CABECERA}<a:theme xmlns:a="{NS_A}" name="Deck"><a:themeElements>'
            f'<a:clrScheme name="Deck">{clr}</a:clrScheme>'
            f'<a:fontScheme name="Deck"><a:majorFont>{fuente}</a:majorFont><a:minorFont>{fuente}</a:minorFont></a:fontScheme>'
            f'<a:fmtScheme name="Deck"><a:fillStyleLst>{relleno * 3}</a:fillStyleLst>'
            f'<a:lnStyleLst>{linea * 3}</a:lnStyleLst><a:effectStyleLst>{efecto * 3}</a:effectStyleLst>'
            f'<a:bgFillStyleLst>{relleno * 3}</a:bgFillStyleLst></a:fmtScheme>'
            '</a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>')


def master_xml():
    estilo = '<a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr>'
    return (f'{CABECERA}<p:sldMaster {RAIZ_P}><p:cSld>'
            '<p:bg><p:bgPr><a:solidFill><a:srgbClr val="000000"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
            f'<p:spTree>{GRUPO}</p:spTree></p:cSld>'
            '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
            'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
            '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
            f'<p:txStyles><p:titleStyle>{estilo}</p:titleStyle><p:bodyStyle>{estilo}</p:bodyStyle>'
            f'<p:otherStyle>{estilo}</p:otherStyle></p:txStyles></p:sldMaster>')


def layout_xml():
    return (f'{CABECERA}<p:sldLayout {RAIZ_P} type="blank" preserve="1"><p:cSld name="En blanco">'
            f'<p:spTree>{GRUPO}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')


def slide_xml(n, descr):
    return (f'{CABECERA}<p:sld {RAIZ_P}><p:cSld><p:spTree>{GRUPO}'
            f'<p:pic><p:nvPicPr><p:cNvPr id="2" name="Diapositiva {n}" descr="{xml_attr(descr)}"/>'
            '<p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>'
            '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="{EMU_ANCHO}" cy="{EMU_ALTO}"/></a:xfrm>'
            '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>'
            '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>')


def presentacion_xml(n):
    ids = "".join(f'<p:sldId id="{255 + i}" r:id="rId{i + 1}"/>' for i in range(1, n + 1))
    return (f'{CABECERA}<p:presentation {RAIZ_P} saveSubsetFonts="1">'
            '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
            f'<p:sldIdLst>{ids}</p:sldIdLst>'
            f'<p:sldSz cx="{EMU_ANCHO}" cy="{EMU_ALTO}"/><p:notesSz cx="6858000" cy="9144000"/>'
            '</p:presentation>')


def tipos_xml(n):
    o = [("/ppt/presentation.xml", CT + "presentation.main+xml"),
         ("/ppt/slideMasters/slideMaster1.xml", CT + "slideMaster+xml"),
         ("/ppt/slideLayouts/slideLayout1.xml", CT + "slideLayout+xml"),
         ("/ppt/theme/theme1.xml", "application/vnd.openxmlformats-officedocument.theme+xml"),
         ("/ppt/presProps.xml", CT + "presProps+xml"),
         ("/ppt/viewProps.xml", CT + "viewProps+xml"),
         ("/ppt/tableStyles.xml", CT + "tableStyles+xml"),
         ("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
         ("/docProps/app.xml", "application/vnd.openxmlformats-officedocument.extended-properties+xml")]
    o += [(f"/ppt/slides/slide{i}.xml", CT + "slide+xml") for i in range(1, n + 1)]
    filas = "".join(f'<Override PartName="{p}" ContentType="{t}"/>' for p, t in o)
    return (f'{CABECERA}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            f'<Default Extension="jpg" ContentType="image/jpeg"/>{filas}</Types>')


def core_xml(titulo):
    ahora = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    return (f'{CABECERA}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
            'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
            'xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
            f'<dc:title>{xml_texto(titulo)}</dc:title><dc:creator></dc:creator>'
            '<cp:lastModifiedBy></cp:lastModifiedBy><cp:revision>1</cp:revision>'
            f'<dcterms:created xsi:type="dcterms:W3CDTF">{ahora}</dcterms:created>'
            f'<dcterms:modified xsi:type="dcterms:W3CDTF">{ahora}</dcterms:modified></cp:coreProperties>')


def app_xml(n):
    return (f'{CABECERA}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
            'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
            f'<TotalTime>0</TotalTime><Slides>{n}</Slides><Notes>0</Notes><HiddenSlides>0</HiddenSlides>'
            '</Properties>')


def texto_alternativo(pagina):
    if pagina.get("titulo"):
        return pagina["titulo"]
    if pagina.get("interstitial"):
        return "Transición entre secciones"
    return f"Diapositiva {pagina.get('slide', '')}".strip()


def escribir_pptx(paginas, carpeta, destino, titulo):
    """Paquete PresentationML mínimo escrito a mano: un patrón, un diseño en blanco y una imagen por slide."""
    n = len(paginas)

    def escribir(ruta):
        with zipfile.ZipFile(ruta, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("[Content_Types].xml", tipos_xml(n))
            z.writestr("_rels/.rels", rels([
                ("rId1", REL + "officeDocument", "ppt/presentation.xml"),
                ("rId2", "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", "docProps/core.xml"),
                ("rId3", REL + "extended-properties", "docProps/app.xml")]))
            z.writestr("docProps/core.xml", core_xml(titulo))
            z.writestr("docProps/app.xml", app_xml(n))
            z.writestr("ppt/presentation.xml", presentacion_xml(n))
            z.writestr("ppt/_rels/presentation.xml.rels", rels(
                [("rId1", REL + "slideMaster", "slideMasters/slideMaster1.xml")]
                + [(f"rId{i + 1}", REL + "slide", f"slides/slide{i}.xml") for i in range(1, n + 1)]
                + [(f"rId{n + 2}", REL + "theme", "theme/theme1.xml"),
                   (f"rId{n + 3}", REL + "presProps", "presProps.xml"),
                   (f"rId{n + 4}", REL + "viewProps", "viewProps.xml"),
                   (f"rId{n + 5}", REL + "tableStyles", "tableStyles.xml")]))
            z.writestr("ppt/presProps.xml", f"{CABECERA}<p:presentationPr {RAIZ_P}/>")
            z.writestr("ppt/viewProps.xml", f'{CABECERA}<p:viewPr {RAIZ_P}><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>')
            z.writestr("ppt/tableStyles.xml", f'{CABECERA}<a:tblStyleLst xmlns:a="{NS_A}" def="{{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}}"/>')
            z.writestr("ppt/theme/theme1.xml", tema_xml())
            z.writestr("ppt/slideMasters/slideMaster1.xml", master_xml())
            z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([
                ("rId1", REL + "slideLayout", "../slideLayouts/slideLayout1.xml"),
                ("rId2", REL + "theme", "../theme/theme1.xml")]))
            z.writestr("ppt/slideLayouts/slideLayout1.xml", layout_xml())
            z.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", rels([
                ("rId1", REL + "slideMaster", "../slideMasters/slideMaster1.xml")]))
            for i, pag in enumerate(paginas, 1):
                jpg = io.BytesIO()
                with Image.open(Path(carpeta) / pag["archivo"]) as im:
                    im.convert("RGB").save(jpg, "JPEG", **JPEG)
                # El JPEG ya viene comprimido: se guarda sin volver a comprimir
                z.writestr(f"ppt/media/image{i}.jpg", jpg.getvalue(), compress_type=zipfile.ZIP_STORED)
                z.writestr(f"ppt/slides/slide{i}.xml", slide_xml(i, texto_alternativo(pag)))
                z.writestr(f"ppt/slides/_rels/slide{i}.xml.rels", rels([
                    ("rId1", REL + "slideLayout", "../slideLayouts/slideLayout1.xml"),
                    ("rId2", REL + "image", f"../media/image{i}.jpg")]))
    escribir_seguro(destino, escribir)


# --------------------------------------------------------------------------- principal

def ruta_base(deck_dir, cfg, salida_arg):
    """Ruta sin extensión de los archivos a generar."""
    if salida_arg:
        base = Path(salida_arg).expanduser().resolve()
    else:
        salida = cfg.get("salida")
        if not salida:
            raise ErrorExportar("deck.json no define 'salida'; indica la ruta con --salida")
        base = (Path(deck_dir) / salida).resolve()
    return base.with_suffix("") if base.suffix.lower() in EXTENSIONES else base


def main():
    salida_utf8()
    ap = argparse.ArgumentParser(description="Exporta un deck a PDF y/o PowerPoint con una captura por página.")
    ap.add_argument("deck", help="carpeta con deck.json y parts/")
    ap.add_argument("--formato", required=True, choices=["pdf", "pptx", "ambos"])
    ap.add_argument("--salida", default=None, help="ruta sin extensión (por defecto, junto al HTML final)")
    ap.add_argument("--pasos", action="store_true", help="una página por paso en las slides con pasos")
    ap.add_argument("--interstitials", action="store_true", help="incluir los interstitials")
    args = ap.parse_args()

    deck_dir = Path(args.deck).resolve()
    tmp = Path(tempfile.mkdtemp(prefix="deck-exportar-"))
    try:
        res = ensamblar(deck_dir, tmp / "deck.html")
        base = ruta_base(deck_dir, res["cfg"], args.salida)
        titulo = res["cfg"].get("titulo", "")
        capturas = tmp / "capturas"
        manifiesto = recorrer(tmp / "deck.html", capturas, pasos=args.pasos, interstitials=args.interstitials)
        paginas = manifiesto["paginas"]
        formatos = ["pdf", "pptx"] if args.formato == "ambos" else [args.formato]
        for fmt in formatos:
            destino = base.with_name(base.name + "." + fmt)
            if fmt == "pdf":
                escribir_pdf([capturas / p["archivo"] for p in paginas], destino, titulo)
            else:
                escribir_pptx(paginas, capturas, destino, titulo)
            print(f"LISTO {destino}", flush=True)
    except ErrorExportar as e:
        print(f"ERROR {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    except OSError as e:
        print(f"ERROR no pude leer o escribir un archivo: {e}", file=sys.stderr, flush=True)
        sys.exit(1)
    finally:
        borrar_temporal(tmp)


if __name__ == "__main__":
    main()
