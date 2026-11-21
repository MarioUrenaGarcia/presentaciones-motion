"""Crea slides pendientes a partir de GUION.md para que la vista en vivo muestre el deck completo desde el inicio.

Uso:
  python -I esqueleto.py <carpeta-deck>

Formato de GUION.md (lo demas del archivo se ignora):
  ## 01-apertura                  <- bloque: sera parts/01-apertura.html
  ### portada                     <- id de la slide
  Etiqueta: Ciencia en la cocina
  Titulo: Del grano a la taza
  Visual: taza en line-art con vapor que sube en loop
  ### i-granos [interstitial]     <- marca opcional: [interstitial] o [pasos]
  Visual: granos de cafe que caen en espiral

Solo escribe los bloques cuyo archivo no existe: nunca toca trabajo ya hecho. Quien construye el bloque
reemplaza las slides manteniendo los mismos ids.

Al terminar escribe el entregable ("salida" de deck.json) con todas las slides como pendientes: desde ese
momento el archivo que se va a entregar existe y build.py o vivo.py lo actualizan en cada avance.
"""
import html
import re
import sys
import unicodedata
from pathlib import Path

sys.dont_write_bytecode = True  # no deja __pycache__ dentro de la carpeta de la skill
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build  # noqa: E402  (el import va despues de ajustar sys.path para correr con python -I)

BLOQUE = re.compile(r"^##\s+([\w.-]+)\s*$")
SLIDE = re.compile(r"^###\s+([a-z0-9][a-z0-9-]*)\s*(?:\[([^\]]+)\])?\s*$", re.I)
CAMPO = re.compile(r"^([^:]{2,20}):\s*(.+)$")


def normal(s):
    s = unicodedata.normalize("NFD", s.strip().lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def leer_guion(texto):
    bloques = []
    slide = None
    for linea in texto.splitlines():
        m = BLOQUE.match(linea)
        if m:
            bloques.append({"archivo": m.group(1), "slides": []})
            slide = None
            continue
        m = SLIDE.match(linea)
        if m and bloques:
            marca = normal(m.group(2) or "")
            slide = {"id": m.group(1).lower(), "interstitial": "interstitial" in marca, "pasos": "paso" in marca, "campos": {}}
            bloques[-1]["slides"].append(slide)
            continue
        m = CAMPO.match(linea.strip())
        if m and slide is not None:
            slide["campos"][normal(m.group(1))] = m.group(2).strip()
    return bloques


def seccion(s):
    c = s["campos"]
    esc = lambda t: html.escape(t, quote=False)
    clase = "slide pendiente interstitial" if s["interstitial"] else "slide pendiente"
    titulo = c.get("titulo") or ("Transición" if s["interstitial"] else s["id"])
    visual = c.get("visual", "")
    if s["pasos"]:
        visual = (visual + " " if visual else "") + "(Avanza paso a paso.)"
    lineas = [f'<section class="{clase}" id="{s["id"]}">']
    if c.get("etiqueta"):
        lineas.append(f'  <div class="kicker">{esc(c["etiqueta"])}</div>')
    lineas.append('  <div class="pend-tag">EN CONSTRUCCIÓN</div>')
    lineas.append(f'  <div class="pend-titulo">{esc(titulo)}</div>')
    if visual:
        lineas.append(f'  <div class="pend-visual">Visual: {esc(visual)}</div>')
    lineas.append("</section>")
    return "\n".join(lineas)


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    deck = Path(sys.argv[1]).resolve()
    guion = deck / "GUION.md"
    if not guion.is_file():
        sys.exit(f"Falta {guion}")
    bloques = leer_guion(guion.read_text(encoding="utf-8"))
    if not bloques:
        sys.exit("GUION.md no tiene bloques con el formato '## NN-nombre' y '### id-de-slide'")
    (deck / "parts").mkdir(exist_ok=True)
    ids = set()
    for b in bloques:
        for s in b["slides"]:
            if s["id"] in ids:
                print(f"AVISO id repetido en el guion: {s['id']}")
            ids.add(s["id"])
        destino = deck / "parts" / f"{b['archivo']}.html"
        if destino.exists():
            print(f"existe, no se toca: {destino.name}")
            continue
        if not b["slides"]:
            print(f"AVISO bloque sin slides: {b['archivo']}")
            continue
        destino.write_text("\n\n".join(seccion(s) for s in b["slides"]) + "\n", encoding="utf-8")
        print(f"OK {destino.name}: {len(b['slides'])} slides pendientes")

    try:
        res = build.construir(deck)
        ruta, _ = build.escribir_entregable(deck, res["cfg"], res["html"])
    except (OSError, ValueError) as e:
        sys.exit(f"No pude escribir el entregable: {e}")
    print(f"ENTREGABLE {ruta} ({len(res['ids']) - len(res['pendientes'])} de {len(res['ids'])} slides listas)")


if __name__ == "__main__":
    main()
