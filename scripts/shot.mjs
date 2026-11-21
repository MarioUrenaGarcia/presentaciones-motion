// Captura diapositivas del deck con Edge o Chrome headless, esperando tiempo real para que las
// animaciones CSS y los loops de requestAnimationFrame avancen de verdad.
//
// Uso:
//   node shot.mjs deck.html shots/s 1,2,3 [esperaMs]
//   node shot.mjs deck.html shots/s all [esperaMs]
//   node shot.mjs deck.html shots/s cambiadas [esperaMs]
// Genera shots/s-1.png, shots/s-2.png, ... (numero = posicion del slide en ese archivo, desde 1).
// "cambiadas" captura solo las slides que cambiaron desde la ultima captura con ese mismo prefijo: compara
// deck.huellas.json (lo escribe build.py --out junto al html) con shots/s.huellas.json (lo escribe esta captura).
// Imprime "CAPTURADAS 3,7" con las posiciones hechas; pasalas a hoja.py --solo para revisar solo esas.
// esperaMs (por defecto 3000) es cuanto se espera tras entrar a cada slide; ~600 muestra una entrada a medias.
// Imprime los errores de JavaScript de la pagina y sale con codigo 1 si hubo alguno.
//
// Variables de entorno:
//   LIVE=1      sin modo captura: los interstitials avanzan solos (sirve para probar data-auto)
//   STEPS=k     pulsa "siguiente" k veces dentro del slide y captura ese estado: shots/s-N.png
//   STEPS=a-b   captura cada estado de a a b en una sola corrida: shots/s-N-p<a>.png ... shots/s-N-p<b>.png
//   STEPGAP=ms  espera entre pulsaciones y capturas de pasos (por defecto 1600)
//   BROWSER     ruta del navegador si no esta en los lugares habituales
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { abrirDeck, sleep } from "./cdp.mjs";

const [, , file, outPrefix, list = "all", waitArg = "3000"] = process.argv;
if (!file || !outPrefix) {
  console.error("Uso: node shot.mjs <deck.html> <prefijo-salida> <1,2,3|all|cambiadas> [esperaMs]");
  process.exit(2);
}
const wait = Number(waitArg);
const gap = Number(process.env.STEPGAP || 1600);
const stepsArg = process.env.STEPS || "0";
const range = /^(\d+)-(\d+)$/.exec(stepsArg);
const stepFrom = range ? Number(range[1]) : Number(stepsArg);
const stepTo = range ? Number(range[2]) : Number(stepsArg);
const out = path.resolve(outPrefix);
mkdirSync(path.dirname(out), { recursive: true });

// Primer archivo que produce la captura de la slide n: si no existe, hay que hacerla aunque no haya cambiado
const primerArchivo = (n) => (range ? `${out}-${n}-p${stepFrom}.png` : `${out}-${n}.png`);
const leerJson = (ruta) => JSON.parse(readFileSync(ruta, "utf8"));

// Para "cambiadas": huellas del deck armado y huellas de lo que ya se capturo con este prefijo
let huellasDeck = null;
const estadoCapturas = `${out}${range ? "-pasos" : ""}.huellas.json`;
let capturadas = {};
if (list === "cambiadas") {
  const ruta = file.replace(/\.html?$/i, "") + ".huellas.json";
  if (!existsSync(ruta)) {
    console.error(`No encuentro ${ruta}: arma el deck con build.py --out para usar "cambiadas"`);
    process.exit(2);
  }
  huellasDeck = leerJson(ruta).slides;
  if (existsSync(estadoCapturas)) capturadas = leerJson(estadoCapturas);
}
const cambiadas = huellasDeck
  ? huellasDeck.filter(([n, id, h]) => capturadas[n] !== `${id}:${h}` || !existsSync(primerArchivo(n))).map(([n]) => n)
  : null;
if (cambiadas && !cambiadas.length) {
  // Nada que hacer: ni siquiera se abre el navegador
  console.log("SIN CAMBIOS: todas las capturas estan al dia");
  process.exit(0);
}

let deck;
const hechas = [];
try {
  deck = await abrirDeck(file, { live: Boolean(process.env.LIVE) });
  let nums;
  if (list === "all") nums = Array.from({ length: deck.total }, (_, i) => i + 1);
  else if (cambiadas) nums = cambiadas;
  else nums = list.split(",").map(Number);

  const capture = async (dest) => {
    const shot = await deck.send("Page.captureScreenshot", { format: "png" });
    writeFileSync(dest, Buffer.from(shot.result.data, "base64"));
    const e = await deck.estado();
    console.log(`OK ${dest} (slide ${e.n}/${deck.total}: ${e.id}${e.paso ? ", " + e.paso : ""})`);
  };

  for (const n of nums) {
    // Pasar por otro slide fuerza a que el destino reinicie sus animaciones de entrada
    await deck.evaluate(`Deck.go(${n === 1 ? 1 : 0}, 0); Deck.go(${n - 1}, 0)`);
    await sleep(wait);
    for (let k = 0; k <= stepTo; k++) {
      if (k >= stepFrom) await capture(range ? `${out}-${n}-p${k}.png` : `${out}-${n}.png`);
      if (k < stepTo) {
        await deck.evaluate("Deck.next()");
        await sleep(gap);
      }
    }
    hechas.push(n);
  }
  if (nums.length) console.log(`CAPTURADAS ${hechas.join(",")}`);
  if (huellasDeck) {
    // Solo se anotan las capturas hechas sin errores de JavaScript: si hubo errores, la proxima vez se repiten
    const vigentes = {};
    for (const [n, id, h] of huellasDeck) {
      const firma = `${id}:${h}`;
      if (hechas.includes(n) ? !deck.errores.length : capturadas[n] === firma) vigentes[n] = firma;
    }
    writeFileSync(estadoCapturas, JSON.stringify(vigentes), "utf8");
  }
} catch (e) {
  console.error("Fallo la captura:", e.message);
  process.exitCode = 1;
} finally {
  if (deck) {
    if (deck.errores.length) process.exitCode = 1;
    await deck.close();
  }
}
