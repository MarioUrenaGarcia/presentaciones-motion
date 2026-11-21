// Recorre el deck como lo haria el presentador y muestra slide, paso y errores en cada pulsacion.
// Sirve para probar lo que las capturas no ven: slides con pasos, retroceder (llegar con dir = -1) y que
// ninguna pulsacion se quede atascada.
//
// Uso:
//   node nav.mjs deck.html                 recorre todo hacia adelante y luego todo hacia atras
//   node nav.mjs deck.html "3 n n n p p"   empieza en el slide 3 y aplica n (siguiente) / p (anterior)
//   node nav.mjs deck.html --detalle       imprime ademas cada pulsacion (por defecto solo lo que falla)
// Por defecto imprime solo las pulsaciones atascadas, con la anterior como contexto, y un resumen: en un deck
// con muchos pasos el detalle completo son cientos de lineas que nadie necesita leer si todo anda bien.
// Sale con codigo 1 si hubo errores de JavaScript o si una pulsacion no cambio nada (salvo en los extremos).
import { abrirDeck, sleep } from "./cdp.mjs";

const args = process.argv.slice(2);
const detalle = args.includes("--detalle");
const [file, seqArg] = args.filter((a) => a !== "--detalle");
if (!file) {
  console.error('Uso: node nav.mjs <deck.html> ["<slide> n n p ..."] [--detalle]');
  process.exit(2);
}
const PAUSE = Number(process.env.NAVGAP || 350);

let deck;
let atascos = 0;
let pulsaciones = 0;
let previa = "";
try {
  deck = await abrirDeck(file);
  const fmt = (e) => `${String(e.n).padStart(2, "0")}/${deck.total} ${e.id}${e.paso ? "  [" + e.paso + "]" : ""}`;
  const press = async (k) => {
    const antes = await deck.estado();
    await deck.evaluate(k === "n" ? "Deck.next()" : "Deck.prev()");
    await sleep(PAUSE);
    const despues = await deck.estado();
    pulsaciones++;
    const igual = antes.n === despues.n && antes.paso === despues.paso;
    const extremo = (k === "n" && despues.n === deck.total) || (k === "p" && despues.n === 1);
    const linea = `${k === "n" ? "->" : "<-"} ${fmt(despues)}${igual ? (extremo ? "  (extremo)" : "  ATASCADO") : ""}`;
    if (igual && !extremo) {
      atascos++;
      if (!detalle) console.log(`   antes: ${previa}`);
    }
    if (detalle || (igual && !extremo)) console.log(linea);
    previa = linea;
    return { igual, extremo };
  };

  if (seqArg) {
    const [inicio, ...teclas] = seqArg.trim().split(/\s+/);
    await deck.evaluate(`Deck.go(${Number(inicio) - 1}, 0)`);
    await sleep(PAUSE);
    previa = `.. ${fmt(await deck.estado())}`;
    if (detalle) console.log(previa);
    for (const k of teclas) await press(k);
  } else {
    previa = `.. ${fmt(await deck.estado())}`;
    if (detalle) console.log(previa);
    for (let i = 0; i < 2000; i++) {
      const r = await press("n");
      if (r.igual && r.extremo) break;
    }
    for (let i = 0; i < 2000; i++) {
      const r = await press("p");
      if (r.igual && r.extremo) break;
    }
  }
} catch (e) {
  console.error("Fallo el recorrido:", e.message);
  process.exitCode = 1;
} finally {
  if (deck) {
    console.log(`Pulsaciones: ${pulsaciones}  Errores JS: ${deck.errores.length}  Pulsaciones atascadas: ${atascos}`);
    if (deck.errores.length || atascos) process.exitCode = 1;
    await deck.close();
  }
}
