"""Junta capturas de slides en hojas de contacto para revisar el deck completo de un vistazo.

Uso (necesita Pillow; correr sin -I para que encuentre los paquetes del usuario):
  python hoja.py <carpeta-con-capturas> [prefijo] [--cols 2 --rows 3] [--solo 3,7,8]
Lee <prefijo>-1.png, <prefijo>-2.png, ... (prefijo por defecto "s") y escribe hoja-<prefijo>-1.png, ...
en la misma carpeta, con el nombre de cada captura en la esquina. Con --solo junta solo esas posiciones (las
que shot.mjs imprime en "CAPTURADAS"), para revisar lo que cambio sin volver a mirar todo el deck. Borra las
hojas viejas del mismo prefijo para que no se confundan con las nuevas.
"""
import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("Falta Pillow (pip install pillow). Sin el, revisa las capturas una por una.")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("carpeta")
    ap.add_argument("prefijo", nargs="?", default="s")
    ap.add_argument("--cols", type=int, default=2)
    ap.add_argument("--rows", type=int, default=3)
    ap.add_argument("--solo", default=None, help="posiciones a incluir, separadas por coma")
    args = ap.parse_args()

    folder = Path(args.carpeta)
    pat = re.compile(rf"^{re.escape(args.prefijo)}-?(\d+)\.png$")
    files = sorted((f for f in folder.iterdir() if pat.match(f.name)), key=lambda f: int(pat.match(f.name).group(1)))
    if args.solo:
        try:
            solo = {int(x) for x in args.solo.split(",") if x.strip()}
        except ValueError:
            sys.exit("--solo espera posiciones separadas por coma, por ejemplo 3,7,8")
        files = [f for f in files if int(pat.match(f.name).group(1)) in solo]
    if not files:
        sys.exit(f"No hay capturas {args.prefijo}-N.png en {folder}")
    hoja_pat = re.compile(rf"^hoja-{re.escape(args.prefijo)}-\d+\.png$")
    for vieja in [f for f in folder.iterdir() if hoja_pat.match(f.name)]:
        vieja.unlink()

    w, h = 960, 540
    per = args.cols * args.rows
    for i in range(0, len(files), per):
        lote = files[i:i + per]
        # Una hoja con pocas capturas se recorta a lo que ocupan: menos pixeles en blanco, menos costo al mirarla
        cols = min(args.cols, len(lote))
        filas = -(-len(lote) // cols)
        sheet = Image.new("RGB", (w * cols, h * filas), "white")
        for k, f in enumerate(lote):
            with Image.open(f) as im:
                tile = im.convert("RGB").resize((w - 6, h - 6))
            x, y = (k % cols) * w, (k // cols) * h
            sheet.paste(tile, (x + 3, y + 3))
            ImageDraw.Draw(sheet).text((x + 10, y + 8), f.name, fill="yellow")
        out = folder / f"hoja-{args.prefijo}-{i // per + 1}.png"
        sheet.save(out)
        print(f"OK {out}")


if __name__ == "__main__":
    main()
