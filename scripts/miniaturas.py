"""Genera las miniaturas de la galería (tecla G): <deck>/miniaturas/<id>.jpg de 384 x 216.

Uso (necesita Pillow; por eso va sin -I):
  python miniaturas.py <carpeta-deck> [--todas]
      Rehace solo las miniaturas que faltan o cuya slide cambió desde la última vez (lo sabe por
      <deck>/miniaturas/huellas.json). Si todas están al día no abre el navegador. Con --todas las rehace todas.
      Borra los jpg de ids que ya no existen. Imprime "PROGRESO n/total" mientras captura.
  python miniaturas.py <deck.html> <carpeta-capturas> <carpeta-deck>
      Desde capturas ya hechas con shot.mjs (s-1.png, s-2.png... en el orden del deck).

En el siguiente build.py la galería las incrusta.
"""
import json
import sys
import tempfile
from pathlib import Path

from PIL import Image

AQUI = Path(__file__).resolve().parent
sys.dont_write_bytecode = True  # no deja __pycache__ dentro de la carpeta de la skill
if str(AQUI) not in sys.path:
    sys.path.insert(0, str(AQUI))
import build  # noqa: E402  (va después de asegurar la carpeta de scripts en sys.path)

TAM = (384, 216)
CALIDAD = 72


def guardar_miniatura(origen, destino):
    with Image.open(origen) as im:
        im.convert("RGB").resize(TAM, Image.LANCZOS).save(destino, quality=CALIDAD)


def guardar_huellas(deck_dir, huellas, hechas):
    """Anota con qué versión de cada slide se hizo su miniatura; quita las de slides que ya no existen."""
    previas = build.leer_huellas_mini(deck_dir)
    nuevas = {sid: previas[sid] for sid in huellas if sid in previas}
    nuevas.update({sid: huellas[sid] for sid in hechas if sid in huellas})
    destino = deck_dir / "miniaturas" / build.HUELLAS_MINI
    destino.write_text(json.dumps(nuevas, indent=1, sort_keys=True), encoding="utf-8")


def borrar_sobrantes(destino, vigentes):
    for jpg in sorted(destino.glob("*.jpg")):
        if jpg.stem not in vigentes:
            jpg.unlink()
            print(f"BORRADA {jpg.name} (la slide ya no existe)", flush=True)


def desde_capturas(html, capturas, deck_dir):
    """Modo de 3 argumentos: capturas de shot.mjs numeradas por posición en el deck."""
    huellas = build.huellas_slides(deck_dir)
    ids = build.orden_en_html(html.read_text(encoding="utf-8"))
    destino = deck_dir / "miniaturas"
    destino.mkdir(exist_ok=True)
    faltan, hechas = [], []
    for n, sid in enumerate(ids, 1):
        origen = capturas / f"s-{n}.png"
        if not origen.exists():
            faltan.append(sid)
            continue
        guardar_miniatura(origen, destino / f"{sid}.jpg")
        hechas.append(sid)
    guardar_huellas(deck_dir, huellas, hechas)
    print(f"OK {len(hechas)} miniaturas en {destino}")
    if faltan:
        print("Sin captura:", ", ".join(faltan))


def desde_deck(deck_dir, todas):
    """Modo de carpeta: ensambla, recorre solo lo que cambió y escribe las miniaturas. Devuelve el código de salida."""
    import exportar  # comparte el ensamblado y el recorrido; va aquí para no cargarlo en el otro modo

    exportar.salida_utf8()
    destino = deck_dir / "miniaturas"
    destino.mkdir(exist_ok=True)
    # La huella se toma antes de ensamblar: si una parte cambia durante la captura, la próxima vez se rehace
    huellas = build.huellas_slides(deck_dir)
    borrar_sobrantes(destino, set(huellas))
    viejas = list(huellas) if todas else build.miniaturas_viejas(deck_dir, huellas)
    if not viejas:
        guardar_huellas(deck_dir, huellas, [])
        print(f"OK las {len(huellas)} miniaturas están al día; no hay nada que capturar", flush=True)
        return 0
    print(f"Rehago {len(viejas)} de {len(huellas)} miniaturas: {', '.join(viejas)}", flush=True)

    tmp = Path(tempfile.mkdtemp(prefix="deck-miniaturas-"))
    try:
        exportar.ensamblar(deck_dir, tmp / "deck.html")
        capturas = tmp / "capturas"
        manifiesto = exportar.recorrer(tmp / "deck.html", capturas, interstitials=True, primer_paso=True, ids=viejas)
        hechas = []
        for pag in manifiesto["paginas"]:
            if pag["id"] in hechas:
                continue
            guardar_miniatura(capturas / pag["archivo"], destino / f"{pag['id']}.jpg")
            hechas.append(pag["id"])
        guardar_huellas(deck_dir, huellas, hechas)
        print(f"OK {len(hechas)} miniaturas nuevas en {destino}", flush=True)
        faltan = [sid for sid in viejas if sid not in hechas]
        if faltan:
            print("Sin captura:", ", ".join(faltan), flush=True)
            return 1
        return 0
    except exportar.ErrorExportar as e:
        print(f"ERROR {e}", file=sys.stderr, flush=True)
        return 1
    except OSError as e:
        print(f"ERROR no pude leer o escribir un archivo: {e}", file=sys.stderr, flush=True)
        return 1
    finally:
        exportar.borrar_temporal(tmp)


def main():
    args = [a for a in sys.argv[1:] if a != "--todas"]
    todas = len(args) != len(sys.argv) - 1
    if len(args) == 1:
        deck_dir = Path(args[0]).resolve()
        if not (deck_dir / "deck.json").is_file():
            sys.exit(f"{deck_dir} no es la carpeta de un deck (falta deck.json)\n\n{__doc__}")
        sys.exit(desde_deck(deck_dir, todas))
    if len(args) == 3 and not todas:
        desde_capturas(Path(args[0]), Path(args[1]), Path(args[2]).resolve())
        return
    sys.exit(__doc__)


if __name__ == "__main__":
    main()
