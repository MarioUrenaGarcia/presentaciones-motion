// Abre un deck en Edge o Chrome headless y lo controla por el DevTools Protocol.
// Lo usan shot.mjs (capturas) y nav.mjs (recorrido de navegacion).
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CANDIDATES = [
  process.env.BROWSER,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].filter(Boolean);

// live = false agrega ?shot: sin avance automatico de interstitials ni aviso de teclas, para capturas estables
export async function abrirDeck(file, { live = false } = {}) {
  const browser = CANDIDATES.find((p) => existsSync(p));
  if (!browser) throw new Error("No encontre Edge ni Chrome. Define BROWSER con la ruta del ejecutable.");
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = path.join(os.tmpdir(), `deck-cdp-${process.pid}-${port}`);
  mkdirSync(profile, { recursive: true });
  const proc = spawn(
    browser,
    [
      "--headless=new",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      "--window-size=1920,1080",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      "--no-first-run",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  const errores = [];
  let ws = null;
  const close = async () => {
    try {
      ws?.close();
    } catch {
      // el socket puede estar cerrado si el navegador ya salio
    }
    proc.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      // el navegador puede tardar en soltar el perfil; queda en la carpeta temporal del sistema
    }
  };

  try {
    let wsUrl = null;
    for (let i = 0; i < 75 && !wsUrl; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/json/list`);
        wsUrl = (await r.json()).find((t) => t.type === "page")?.webSocketDebuggerUrl || null;
      } catch {
        // el navegador todavia no abre el puerto de depuracion
      }
      if (!wsUrl) await sleep(200);
    }
    if (!wsUrl) throw new Error("El navegador no expuso el puerto de depuracion");

    ws = new WebSocket(wsUrl);
    await new Promise((r, j) => {
      ws.addEventListener("open", r);
      ws.addEventListener("error", j);
    });
    let seq = 0;
    const pending = new Map();
    ws.addEventListener("message", (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      } else if (m.method === "Runtime.exceptionThrown") {
        const d = m.params.exceptionDetails;
        const msg = `${d.exception?.description || d.text} (linea ${d.lineNumber + 1})`;
        errores.push(msg);
        console.log("ERROR JS:", msg);
      } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
        const msg = m.params.args.map((a) => a.value ?? a.description).join(" ");
        errores.push(msg);
        console.log("console.error:", msg);
      }
    });
    const send = (method, params = {}) =>
      new Promise((res) => {
        const id = ++seq;
        pending.set(id, res);
        ws.send(JSON.stringify({ id, method, params }));
      });
    const evaluate = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true })).result?.result?.value;

    await send("Runtime.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false });
    await send("Page.navigate", { url: pathToFileURL(path.resolve(file)).href + (live ? "#1" : "?shot#1") });
    // Decks grandes (varios MB) tardan en cargar: espera a que el documento termine y el número de slides se estabilice
    let total = 0;
    for (let i = 0, previo = -1; i < 60; i++) {
      await sleep(500);
      const listo = await evaluate("document.readyState === 'complete'");
      total = (await evaluate("document.querySelectorAll('#deck > .slide').length")) || 0;
      if (listo && total > 0 && total === previo) break;
      previo = total;
    }

    // Estado visible: slide activa, contador y la etiqueta de paso si la slide tiene pasos
    const estado = () =>
      evaluate(`(() => {
        const s = document.querySelector('#deck > .slide.is-active');
        const all = Array.from(document.querySelectorAll('#deck > .slide'));
        const paso = s ? Array.from(s.querySelectorAll('.tag')).map((e) => e.textContent.trim()).find((x) => /^(PASO|REPASO)/i.test(x)) : '';
        return { n: all.indexOf(s) + 1, id: s ? s.id : '', paso: paso || '' };
      })()`);

    return { send, evaluate, estado, total, errores, close };
  } catch (e) {
    await close();
    throw e;
  }
}
