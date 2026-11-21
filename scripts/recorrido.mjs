// Recorre el deck en orden, como el presentador, y guarda una captura por pagina para exportar
// (PDF, PowerPoint) o generar las miniaturas de la galeria.
//
// Uso:
//   node recorrido.mjs <deck.html> <carpeta-salida> [--pasos | --primer-paso] [--interstitials]
//                      [--espera ms] [--espera-paso ms] [--ids id1,id2]
//
// Con --ids solo recorre esas slides (miniaturas.py lo usa para rehacer solo las que cambiaron).
//
// Genera <carpeta-salida>/001.png, 002.png... (1920 x 1080) y manifiesto.json con, por pagina: archivo, id,
// slide (posicion en el deck, desde 1), paso (texto de la etiqueta PASO o vacio), titulo e interstitial.
//
// Por defecto:
//   - sin interstitials (con --interstitials se incluyen);
//   - una pagina por slide; en las slides con pasos, la del ULTIMO paso, nunca el estado REPASO;
//   - con --pasos, una pagina por paso; con --primer-paso, la primera vista de cada slide (para miniaturas).
// --espera es lo que se espera tras entrar a cada slide (3000 por defecto); --espera-paso, tras cada paso (2200).
//
// Imprime "PROGRESO n/total" tras cada slide recorrida (total = slides a recorrer) para que otro proceso
// muestre el avance. Codigos de salida: 0 bien, 1 hubo errores de JavaScript (las capturas y el manifiesto
// quedan escritos), 2 argumentos invalidos, 3 fallo el recorrido (sin manifiesto).
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { abrirDeck, sleep } from "./cdp.mjs";

const USO =
  "Uso: node recorrido.mjs <deck.html> <carpeta-salida> [--pasos | --primer-paso] [--interstitials] [--espera ms] [--espera-paso ms] [--ids id1,id2]";

function leerArgs(argv) {
  const opc = { pasos: false, primerPaso: false, interstitials: false, espera: 3000, esperaPaso: 2200, ids: null };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pasos") opc.pasos = true;
    else if (a === "--primer-paso") opc.primerPaso = true;
    else if (a === "--interstitials") opc.interstitials = true;
    else if (a === "--ids") {
      const lista = String(argv[++i] || "").split(",").map((s) => s.trim()).filter(Boolean);
      if (!lista.length) throw new Error("--ids necesita una lista de ids separados por coma");
      opc.ids = new Set(lista);
    } else if (a === "--espera" || a === "--espera-paso") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v < 0) throw new Error(`${a} necesita un numero de milisegundos mayor o igual a 0`);
      if (a === "--espera") opc.espera = v;
      else opc.esperaPaso = v;
    } else if (a.startsWith("--")) throw new Error(`opcion desconocida: ${a}`);
    else pos.push(a);
  }
  if (pos.length !== 2) throw new Error("faltan o sobran argumentos");
  if (opc.pasos && opc.primerPaso) throw new Error("--pasos y --primer-paso no se pueden combinar");
  return { file: pos[0], outDir: pos[1], opc };
}

let args;
try {
  args = leerArgs(process.argv.slice(2));
} catch (e) {
  console.error(`${e.message}\n${USO}`);
  process.exit(2);
}
const { file, opc } = args;
const outDir = path.resolve(args.outDir);

// Etiqueta "PASO 03 / 15": numero de paso y total (el total puede faltar si la slide no lo muestra)
const esPaso = (txt) => /^PASO\b/i.test(txt || "");
function leerPaso(txt) {
  const m = /^PASO\D*(\d+)(?:\D+(\d+))?/i.exec(txt || "");
  return m ? { k: Number(m[1]), total: m[2] ? Number(m[2]) : 0 } : null;
}
const limpio = (txt) => (txt || "").replace(/\s+/g, " ").trim();

// Titulo legible: los textos grandes de la slide (64 px o mas) en orden de lectura, sin los que estan dentro de
// otro ya tomado; si no hay, el kicker. Entre elementos se deja un espacio para que "1" y "LA IA" no queden pegados.
const tituloJs = (n) => `(() => {
  const s = document.querySelectorAll('#deck > .slide')[${n - 1}];
  if (!s) return '';
  const texto = (el) => {
    const partes = [];
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    while (w.nextNode()) partes.push(w.currentNode.textContent);
    return partes.join(' ').replace(/\\s+/g, ' ').replace(/\\s+([.,:;!?])/g, '$1').trim();
  };
  const propio = (el) => Array.from(el.childNodes).some((c) => c.nodeType === 3 && c.textContent.trim());
  const grandes = Array.from(s.querySelectorAll('*')).filter((el) =>
    !el.closest('svg, .kicker, .foot, .tag') && propio(el) && parseFloat(getComputedStyle(el).fontSize) >= 64);
  const tope = grandes.filter((el) => !grandes.some((o) => o !== el && o.contains(el)));
  const t = tope.map(texto).filter(Boolean).join(' ').slice(0, 180);
  const k = s.querySelector('.kicker');
  return t || (k ? texto(k) : '');
})()`;

let deck;
const paginas = [];
try {
  mkdirSync(outDir, { recursive: true });
  deck = await abrirDeck(file);
  // Las fuentes van embebidas; se espera a que esten listas para que ningun texto salga con la de respaldo
  await deck.send("Runtime.evaluate", { expression: "document.fonts.ready.then(() => true)", awaitPromise: true });

  const slides = await deck.evaluate(`Array.from(document.querySelectorAll('#deck > .slide')).map((s, i) => ({
    n: i + 1, id: s.id, inter: s.classList.contains('interstitial'), auto: parseFloat(s.dataset.auto || '0') || 0
  }))`);
  if (!Array.isArray(slides) || !slides.length) throw new Error("el deck no tiene slides");
  const plan = slides.filter((s) => (opc.interstitials || !s.inter) && (!opc.ids || opc.ids.has(s.id)));
  if (opc.ids) {
    const hay = new Set(slides.map((s) => s.id));
    const faltan = [...opc.ids].filter((id) => !hay.has(id));
    if (faltan.length) console.log(`AVISO ids que no estan en el deck: ${faltan.join(", ")}`);
  }
  if (!plan.length) throw new Error("no hay slides que recorrer (todas son interstitials o ningun id coincide)");

  const estado = async () => {
    const e = await deck.estado();
    return { n: e.n, id: e.id, paso: limpio(e.paso) };
  };

  // Entra a la slide n como al avanzar (dir 1). Si ya es la activa, pasa antes por otra para reiniciar su entrada.
  const entrar = async (n) => {
    const actual = (await estado()).n;
    if (actual === n) await deck.evaluate(`Deck.go(${n === 1 ? 1 : n - 2}, 0)`);
    await deck.evaluate(`Deck.go(${n - 1}, 1)`);
  };

  const capturar = async (s, e) => {
    const archivo = `${String(paginas.length + 1).padStart(3, "0")}.png`;
    const shot = await deck.send("Page.captureScreenshot", { format: "png" });
    if (!shot.result?.data) throw new Error(`no se pudo capturar la slide ${s.id}: ${JSON.stringify(shot.error || {})}`);
    writeFileSync(path.join(outDir, archivo), Buffer.from(shot.result.data, "base64"));
    const titulo = limpio(await deck.evaluate(tituloJs(s.n)));
    paginas.push({ archivo, id: s.id, slide: s.n, paso: esPaso(e.paso) ? e.paso : "", titulo, interstitial: s.inter });
  };

  // Un paso adelante. Devuelve el estado nuevo y si la pulsacion salio del modo pasos (REPASO u otra slide).
  const avanzar = async (s, previo) => {
    await deck.evaluate("Deck.next()");
    await sleep(opc.esperaPaso);
    const e = await estado();
    const fuera = e.n !== s.n || !esPaso(e.paso);
    return { e, fuera, quieto: !fuera && e.paso === previo.paso };
  };

  // Vuelve un paso atras tras pasarse (desde REPASO o desde la slide siguiente, que entra en el ultimo paso)
  const volver = async () => {
    await deck.evaluate("Deck.prev()");
    await sleep(opc.espera);
    return estado();
  };

  for (let i = 0; i < plan.length; i++) {
    const s = plan[i];
    await entrar(s.n);
    // Un interstitial se captura poco antes de que avance solo en la presentacion
    const espera = s.inter && s.auto > 0 ? Math.min(opc.espera, Math.max(0, s.auto * 1000 - 200)) : opc.espera;
    await sleep(espera);
    let e = await estado();
    if (e.n !== s.n) console.log(`AVISO al capturar '${s.id}' la slide activa era '${e.id}'`);

    if (!esPaso(e.paso) || opc.primerPaso) {
      await capturar(s, e);
    } else if (opc.pasos) {
      await capturar(s, e);
      for (let g = 0; g < 500; g++) {
        const p = leerPaso(e.paso);
        if (p && p.total && p.k >= p.total) break;
        // Si se paso (REPASO o la slide siguiente) no se captura; entrar() reinicia la siguiente si ya quedo activa
        const r = await avanzar(s, e);
        if (r.fuera || r.quieto) break;
        e = r.e;
        await capturar(s, e);
      }
    } else {
      // Ultimo paso: se avanza al ritmo del presentador hasta el total de la etiqueta, o hasta pasarse y volver uno
      for (let g = 0; g < 500; g++) {
        const p = leerPaso(e.paso);
        if (p && p.total && p.k >= p.total) break;
        const r = await avanzar(s, e);
        if (r.fuera) {
          e = await volver();
          break;
        }
        e = r.e;
        if (r.quieto) break;
      }
      if (e.n !== s.n || !esPaso(e.paso)) console.log(`AVISO '${s.id}' no quedo en su ultimo paso (estado: ${e.id} ${e.paso})`);
      await capturar(s, e);
    }
    console.log(`PROGRESO ${i + 1}/${plan.length}`);
  }

  const manifiesto = {
    deck: path.basename(file),
    slides: slides.length,
    opciones: { pasos: opc.pasos, primerPaso: opc.primerPaso, interstitials: opc.interstitials, ids: opc.ids ? [...opc.ids] : null },
    errores: deck.errores.slice(),
    paginas,
  };
  writeFileSync(path.join(outDir, "manifiesto.json"), JSON.stringify(manifiesto, null, 2), "utf8");
  console.log(`OK ${paginas.length} paginas en ${outDir}`);
  if (deck.errores.length) {
    console.log(`Errores de JavaScript: ${deck.errores.length}`);
    process.exitCode = 1;
  }
} catch (e) {
  console.error("Fallo el recorrido:", e.message);
  process.exitCode = 3;
} finally {
  if (deck) await deck.close();
}
