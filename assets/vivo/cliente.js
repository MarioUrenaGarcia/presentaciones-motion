// Cliente de la vista en vivo. Lo inyecta vivo.py; nunca va en el HTML final.
// Fuera del editor: recarga la pagina (en la misma slide) cuando hay una version nueva del deck.
// Con la tecla E abre un editor tipo PowerPoint: panel de slides, cinta de herramientas y propiedades.
(function () {
  "use strict";
  var V = window.__VIVO || { v: 0, token: "" };
  var deck = document.getElementById("deck");
  if (!deck) return;
  var rafReal = window.requestAnimationFrame.bind(window);
  var IZQ = 214, DER = 276, ARR = 112, ABA = 36;
  var TOKENS = ["ink", "accent", "muted", "ground", "panel", "bar", "dim"];
  var NOMBRES = { ink: "Texto", accent: "Acento", muted: "Gris", ground: "Fondo", panel: "Panel", bar: "Acento oscuro", dim: "Linea" };
  // Propiedades que el servidor acepta en el atributo style (ver ESTILO_OK en vivo.py)
  var GESTIONADAS = ["position", "left", "top", "width", "height", "translate", "scale", "rotate", "opacity", "z-index", "color",
    "background", "background-color", "border", "border-radius", "font-size", "font-weight", "font-style", "text-align", "line-height", "object-fit"];

  // ================= estilos de la interfaz =================
  var css = document.createElement("style");
  css.textContent = [
    "#vv-ui,#vv-barra,#vv-toast{font:500 13px/1.35 system-ui,'Segoe UI',sans-serif;color:#e9e7e3;letter-spacing:.01em}",
    "#vv-ui button,#vv-barra button{font:inherit;color:inherit;background:#26262c;border:1px solid #3d3d45;border-radius:4px;padding:4px 8px;cursor:pointer;white-space:nowrap}",
    "#vv-ui button:hover,#vv-barra button:hover{border-color:#8f8f99}",
    "#vv-ui button:disabled{opacity:.4;cursor:default}",
    "#vv-ui input,#vv-ui select{font:inherit;color:#e9e7e3;background:#1d1d22;border:1px solid #3d3d45;border-radius:4px;padding:3px 5px;width:100%;min-width:0}",
    "#vv-barra{position:fixed;left:14px;top:14px;z-index:90;display:flex;align-items:center;gap:10px;padding:8px 12px;background:rgba(12,12,14,.9);border:1px solid #3a3a40;border-radius:6px;user-select:none;font-weight:600}",
    "#vv-barra .pt{width:9px;height:9px;border-radius:50%;background:#7a7a80}",
    "#vv-barra.on .pt{background:#35d07f}",
    "#vv-barra .av{background:#5a1d1d;border-color:#a33}",
    "#vv-barra .ent{color:#9d9da6;font-weight:500}",
    "#vv-barra .ent.mal{color:#ff8f8f;font-weight:600}",
    "#vv-avisos{position:fixed;left:14px;top:58px;z-index:95;max-width:min(720px,92vw);max-height:50vh;overflow:auto;padding:10px 12px;background:rgba(12,12,14,.96);border:1px solid #a33;border-radius:6px;display:none;font:500 13px/1.4 system-ui,sans-serif;color:#e9e7e3}",
    "#vv-avisos.abierto{display:block}",
    "body.vv-editor #vv-barra,body.vv-editor #gal-btn,body.vv-editor #hint,#gal.abierta~#vv-barra{display:none!important}",
    "#vv-ui{display:none}",
    "body.vv-editor #vv-ui{display:block}",
    "body.vv-editor{background:#101013!important;cursor:default}",
    "body.vv-editor.idle{cursor:default}",
    "#vv-cinta{position:fixed;left:0;right:0;top:0;height:" + (ARR - 8) + "px;z-index:93;background:#17171b;border-bottom:1px solid #2c2c33;display:flex;gap:4px;padding:8px 10px;overflow-x:auto}",
    ".vv-grupo{display:flex;flex-direction:column;justify-content:space-between;padding:0 8px;border-right:1px solid #2c2c33}",
    ".vv-grupo:last-child{border-right:0}",
    ".vv-grupo .fila{display:flex;gap:4px;flex-wrap:wrap;max-width:330px}",
    ".vv-grupo h6{margin:4px 0 0;font:600 10px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8d8d97;text-align:center}",
    "#vv-ui button.ic{padding:4px 6px;line-height:0}",
    "#vv-ui button.ic svg{width:16px;height:16px}",
    "#vv-ui button.primario{background:#164a7a;border-color:#2f9bff}",
    "#vv-izq{position:fixed;left:0;top:" + (ARR - 8) + "px;bottom:" + ABA + "px;width:" + (IZQ - 14) + "px;z-index:92;background:#141418;border-right:1px solid #2c2c33;overflow-y:auto;padding:10px 10px 30px}",
    ".vv-diapo{display:flex;gap:6px;align-items:flex-start;margin-bottom:10px;cursor:pointer}",
    ".vv-diapo b{width:20px;text-align:right;color:#8d8d97;font-size:11px;padding-top:2px}",
    ".vv-diapo .deck-mini{flex:1;border:2px solid #2c2c33;border-radius:3px}",
    ".vv-diapo.actual .deck-mini{border-color:#2f9bff}",
    ".vv-diapo.pend .deck-mini{opacity:.55}",
    "#vv-der{position:fixed;right:0;top:" + (ARR - 8) + "px;bottom:" + ABA + "px;width:" + (DER - 14) + "px;z-index:92;background:#141418;border-left:1px solid #2c2c33;overflow-y:auto;padding:12px}",
    "#vv-der h5{margin:14px 0 8px;font:600 11px/1 system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#8d8d97}",
    "#vv-der h5:first-child{margin-top:0}",
    "#vv-der .rej{display:grid;grid-template-columns:1fr 1fr;gap:6px 8px}",
    "#vv-der label{display:flex;flex-direction:column;gap:3px;font-size:11px;color:#a9a9b2}",
    "#vv-der .nombre{color:#cfcfd6;word-break:break-word;font-size:12px}",
    "#vv-der .muestras{display:flex;flex-wrap:wrap;gap:6px}",
    "#vv-der .muestras button{width:26px;height:26px;padding:0;border-radius:50%;border:2px solid #3d3d45}",
    "#vv-der .fila{display:flex;gap:4px;flex-wrap:wrap}",
    "#vv-der .vacio{color:#7d7d86;font-size:12px}",
    "#vv-estado{position:fixed;left:0;right:0;bottom:0;height:" + ABA + "px;z-index:93;background:#17171b;border-top:1px solid #2c2c33;display:flex;align-items:center;gap:16px;padding:0 14px;font-size:12px;color:#b9b9c2}",
    "#vv-estado .der{margin-left:auto;display:flex;gap:10px;align-items:center}",
    "#vv-estado a{color:#7cc4ff}",
    "#vv-estado .alerta{color:#ffd166}",
    ".vv-caja{position:fixed;z-index:91;pointer-events:none;display:none;box-sizing:border-box}",
    ".vv-caja.sel{outline:2px solid #2f9bff}",
    ".vv-caja.hov{outline:1px dashed #2f9bff}",
    ".vv-caja.grupo{outline:1px dashed #8fc8ff}",
    ".vv-manija{position:fixed;z-index:94;width:10px;height:10px;background:#fff;border:2px solid #2f9bff;display:none;box-sizing:border-box}",
    ".vv-manija.rot{border-radius:50%;cursor:grab}",
    ".vv-guia{position:fixed;z-index:91;pointer-events:none;background:#ff4fa3;display:none}",
    "#vv-marco{position:fixed;z-index:91;pointer-events:none;border:1px solid #2f9bff;background:rgba(47,155,255,.12);display:none}",
    ".vv-escribe{outline:2px solid #ffd166!important;outline-offset:4px;cursor:text!important}",
    "#vv-menu-exp{position:fixed;z-index:96;background:#17171b;border:1px solid #3d3d45;border-radius:6px;padding:10px;display:none;flex-direction:column;gap:6px;min-width:220px}",
    "#vv-menu-exp.abierto{display:flex}",
    "#vv-menu-exp label{display:flex;gap:6px;align-items:center;font-size:12px;color:#c9c9d1}",
    "#vv-menu-exp input{width:auto}",
    "#vv-toast{position:fixed;left:50%;top:" + (ARR + 6) + "px;transform:translateX(-50%);z-index:97;padding:9px 14px;background:rgba(12,12,14,.96);border:1px solid #45454c;border-radius:6px;display:none;max-width:80vw}",
    "body:not(.vv-editor) #vv-toast{top:14px}",
    "#vv-toast.ver{display:block}"
  ].join("\n");
  document.head.appendChild(css);

  // ================= utilidades =================
  function el(tag, attrs, html) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  var tToast = null;
  function aviso(msg, ms) {
    toast.textContent = msg;
    toast.classList.add("ver");
    clearTimeout(tToast);
    tToast = setTimeout(function () { toast.classList.remove("ver"); }, ms || 4500);
  }
  function slides() { return Array.prototype.slice.call(document.querySelectorAll("#deck > .slide")); }
  function slideActiva() { return document.querySelector("#deck > .slide.is-active"); }
  function slideDe(n) { return n && n.closest ? n.closest("#deck > .slide") : null; }
  function escala() { return deck.getBoundingClientRect().width / 1920 || 1; }
  function cajaDeck(n) {
    var d = deck.getBoundingClientRect(), r = n.getBoundingClientRect(), s = d.width / 1920 || 1;
    return { x: (r.left - d.left) / s, y: (r.top - d.top) / s, w: r.width / s, h: r.height / s };
  }
  function unir(cajas) {
    var x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    cajas.forEach(function (c) { x1 = Math.min(x1, c.x); y1 = Math.min(y1, c.y); x2 = Math.max(x2, c.x + c.w); y2 = Math.max(y2, c.y + c.h); });
    return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
  }
  function puntoDeck(cx, cy) { var d = deck.getBoundingClientRect(), s = d.width / 1920 || 1; return { x: (cx - d.left) / s, y: (cy - d.top) / s }; }
  function esSeleccionable(n) { return n && n.nodeType === 1 && (n.hasAttribute("data-e") || n.hasAttribute("data-vv-nuevo")); }
  function cadena(n) {
    var c = [];
    if (n && n.nodeType !== 1) n = n.parentElement;
    while (n && n !== deck && !(n.classList && n.classList.contains("slide"))) {
      if (esSeleccionable(n)) c.unshift(n);
      n = n.parentElement;
    }
    return n && n.classList && n.classList.contains("is-active") ? c : [];
  }
  function deNivelSuperior(s) {
    return Array.prototype.filter.call(s.querySelectorAll("[data-e],[data-vv-nuevo]"), function (n) {
      var p = n.parentElement;
      while (p && p !== s) { if (esSeleccionable(p)) return false; p = p.parentElement; }
      return true;
    });
  }
  function enUI(n) { return n && n.closest ? n.closest("#vv-ui,#vv-barra,#vv-avisos,#vv-toast,#gal,#gal-btn") : null; }
  function leerT(n) {
    var t = (n.style.translate || "").trim();
    if (!t || t === "none") return [0, 0];
    var p = t.split(/\s+/);
    return [parseFloat(p[0]) || 0, parseFloat(p[1] || "0") || 0];
  }
  function leerNum(n, prop, def) { var v = parseFloat(n.style.getPropertyValue(prop)); return isNaN(v) ? def : v; }
  function esObjeto(n) { return n.hasAttribute("data-vv-nuevo") && n.classList.contains("vv-obj"); }
  function nombreDe(n) {
    var cls = (n.getAttribute("class") || "").split(/\s+/).filter(function (c) { return c && c.indexOf("vv-") !== 0; })[0];
    var txt = n.textContent.replace(/\s+/g, " ").trim().slice(0, 36);
    if (n.tagName === "IMG") return "Imagen";
    return n.tagName.toLowerCase() + (cls ? "." + cls : "") + (txt ? ": " + txt : "");
  }

  // ================= estado del editor =================
  var ED = { activo: false, sel: [], escribiendo: null, textoAntes: null, deshacer: [], rehacer: [], tocados: new Map(), clip: [], cuenta: 0 };
  var conectado = false, recargaPendiente = false, ultimo = { v: V.v, avisos: [], total: 0, pendientes: 0, exportacion: {} };

  // Registro de lo que cambio en elementos que ya existen en los archivos (por su marca data-e)
  // Guarda el valor original la primera vez, para no contar como cambio lo que se deshizo
  function tocar(n, prop, original) {
    var k = n.getAttribute("data-e");
    if (!k) return;
    var t = ED.tocados.get(k);
    if (!t) { t = { tag: n.tagName.toLowerCase(), props: new Map(), html: null }; ED.tocados.set(k, t); }
    if (prop === "html") { if (t.html === null) t.html = original; }
    else if (prop && !t.props.has(prop)) t.props.set(prop, original);
  }
  function ponerProp(n, prop, valor) {
    tocar(n, prop, n.style.getPropertyValue(prop).trim());
    if (valor === "" || valor === null || valor === undefined) n.style.removeProperty(prop);
    else n.style.setProperty(prop, valor);
  }
  function ponerT(n, x, y) { ponerProp(n, "translate", Math.round(x) + "px " + Math.round(y) + "px"); }
  function moverPor(n, dx, dy) { var t = leerT(n); ponerT(n, t[0] + dx, t[1] + dy); }

  // ---------- deshacer y rehacer: fotos del estado de cada elemento ----------
  function foto(lista) {
    return lista.map(function (n) {
      return { n: n, padre: n.parentNode, sig: n.nextSibling, estilo: n.getAttribute("style"), html: n.innerHTML, dentro: deck.contains(n) };
    });
  }
  function aplicarFoto(fotos) {
    fotos.forEach(function (f) {
      if (f.dentro && !deck.contains(f.n) && f.padre) f.padre.insertBefore(f.n, f.sig && f.sig.parentNode === f.padre ? f.sig : null);
      if (!f.dentro && f.n.parentNode) f.n.parentNode.removeChild(f.n);
      if (f.estilo === null) f.n.removeAttribute("style"); else f.n.setAttribute("style", f.estilo);
      if (f.n.innerHTML !== f.html) f.n.innerHTML = f.html;
    });
  }
  function igual(a, b) {
    return a.every(function (x, i) { var y = b[i]; return x.estilo === y.estilo && x.html === y.html && x.dentro === y.dentro; });
  }
  function registrar(antes, despues) {
    if (igual(antes, despues)) return;
    ED.deshacer.push({ antes: antes, despues: despues });
    if (ED.deshacer.length > 200) ED.deshacer.shift();
    ED.rehacer = [];
    cambio();
  }
  function accion(lista, fn) {
    var antes = foto(lista);
    fn();
    registrar(antes, foto(lista));
  }
  function deshacer() {
    terminarTexto();
    var h = ED.deshacer.pop();
    if (!h) { aviso("No hay nada para deshacer."); return; }
    aplicarFoto(h.antes);
    ED.rehacer.push(h);
    ED.sel = ED.sel.filter(function (n) { return deck.contains(n); });
    cambio();
  }
  function rehacer() {
    terminarTexto();
    var h = ED.rehacer.pop();
    if (!h) { aviso("No hay nada para rehacer."); return; }
    aplicarFoto(h.despues);
    ED.deshacer.push(h);
    ED.sel = ED.sel.filter(function (n) { return deck.contains(n); });
    cambio();
  }

  // ================= interfaz =================
  var barra = el("div", { id: "vv-barra" }, '<span class="pt"></span><span class="est">CONECTANDO</span><span class="prog"></span><span class="ent" hidden></span>' +
    '<button type="button" class="av" hidden></button><button type="button" class="ed">Editar (E)</button>');
  var panelAvisos = el("div", { id: "vv-avisos" });
  var toast = el("div", { id: "vv-toast" });
  var ui = el("div", { id: "vv-ui" });
  document.body.appendChild(barra);
  document.body.appendChild(panelAvisos);
  document.body.appendChild(toast);
  document.body.appendChild(ui);

  var IC = {
    izq: '<path d="M2 1v14M4 4h9M4 10h6"/>', cenh: '<path d="M8 1v14M3 4h10M5 10h6"/>', der: '<path d="M14 1v14M3 4h9M6 10h6"/>',
    arr: '<path d="M1 2h14M4 4v9M10 4v6"/>', medv: '<path d="M1 8h14M4 3v10M10 5v6"/>', aba: '<path d="M1 14h14M4 3v9M10 6v6"/>',
    disth: '<path d="M1 1v14M15 1v14M5 5h2v6H5zM9 5h2v6H9z"/>', distv: '<path d="M1 1h14M1 15h14M5 5v2h6V5zM5 9v2h6V9z"/>'
  };
  function ic(n) { return '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6">' + IC[n] + "</svg>"; }
  function boton(accionId, texto, titulo, clase) {
    return '<button type="button" data-a="' + accionId + '" title="' + titulo + '"' + (clase ? ' class="' + clase + '"' : "") + ">" + texto + "</button>";
  }
  ui.innerHTML =
    '<div id="vv-cinta">' +
      '<div class="vv-grupo"><div class="fila">' + boton("guardar", "Guardar", "Guardar en los archivos (Ctrl+S)", "primario") +
        boton("deshacerGuardado", "Deshacer guardado", "Volver al archivo antes del último guardado") +
        boton("exportar", "Exportar...", "Exportar a PDF o PowerPoint") + boton("salir", "Salir", "Salir del editor (E)") +
      '</div><h6>Archivo</h6></div>' +
      '<div class="vv-grupo"><div class="fila">' + boton("deshacer", "Deshacer", "Ctrl+Z") + boton("rehacer", "Rehacer", "Ctrl+Y") +
        boton("cortar", "Cortar", "Ctrl+X") + boton("copiar", "Copiar", "Ctrl+C") + boton("pegar", "Pegar", "Ctrl+V") +
        boton("duplicar", "Duplicar", "Ctrl+D") + boton("borrar", "Eliminar", "Supr") +
      '</div><h6>Edición</h6></div>' +
      '<div class="vv-grupo"><div class="fila">' + boton("insTexto", "Texto", "Cuadro de texto") + boton("insImagen", "Imagen", "Desde un archivo; también puedes pegar o arrastrar una imagen") +
        boton("insRect", "Rectángulo", "Rectángulo") + boton("insCirculo", "Círculo", "Círculo") + boton("insLinea", "Línea", "Línea") +
      '</div><h6>Insertar</h6></div>' +
      '<div class="vv-grupo"><div class="fila">' + boton("al-izq", ic("izq"), "Alinear a la izquierda", "ic") + boton("al-cenh", ic("cenh"), "Centrar horizontal", "ic") +
        boton("al-der", ic("der"), "Alinear a la derecha", "ic") + boton("al-arr", ic("arr"), "Alinear arriba", "ic") +
        boton("al-medv", ic("medv"), "Centrar vertical", "ic") + boton("al-aba", ic("aba"), "Alinear abajo", "ic") +
        boton("dist-h", ic("disth"), "Distribuir horizontal (3 o más)", "ic") + boton("dist-v", ic("distv"), "Distribuir vertical (3 o más)", "ic") +
        boton("frente", "Al frente", "Traer al frente") + boton("fondo", "Al fondo", "Enviar al fondo") +
      '</div><h6>Organizar (con 1 elemento alinea a la slide)</h6></div>' +
      '<div class="vv-grupo"><div class="fila">' + boton("negrita", "<b>N</b>", "Negrita (Ctrl+B)") + boton("cursiva", "<i>K</i>", "Cursiva (Ctrl+I)") +
        boton("acento", "Acento", "Color de acento (en el texto seleccionado si estás escribiendo)") +
        boton("menos", "A-", "Letra más chica") + boton("mas", "A+", "Letra más grande") +
        boton("tx-izq", "Izq", "Texto a la izquierda") + boton("tx-cen", "Centro", "Texto centrado") + boton("tx-der", "Der", "Texto a la derecha") +
      '</div><h6>Texto</h6></div>' +
    "</div>" +
    '<div id="vv-izq"></div>' +
    '<div id="vv-der"></div>' +
    '<div id="vv-estado"><span class="pos"></span><span class="cambios"></span><span class="nuevo alerta" hidden>Hay una versión nueva. <a href="#" data-a="recargar">Recargar</a></span>' +
      '<span class="der"><span class="exp"></span><span class="con"></span></span></div>' +
    '<div id="vv-menu-exp"><b>Exportar</b><button type="button" data-exp="pdf">PDF</button><button type="button" data-exp="pptx">PowerPoint</button>' +
      '<button type="button" data-exp="ambos">PDF y PowerPoint</button><label><input type="checkbox" class="pasos"> Una página por cada paso</label>' +
      '<span style="font-size:11px;color:#8d8d97">Se exporta lo guardado. Cada slide sale como imagen, sin animación.</span></div>' +
    '<div id="vv-marco"></div>' +
    '<input type="file" id="vv-archivo" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden>';
  var izq = ui.querySelector("#vv-izq"), der = ui.querySelector("#vv-der"), estado = ui.querySelector("#vv-estado");
  var menuExp = ui.querySelector("#vv-menu-exp"), marco = ui.querySelector("#vv-marco"), entradaArchivo = ui.querySelector("#vv-archivo");

  var cajasSel = [], cajaHover = el("div", { class: "vv-caja hov" }), cajaGrupo = el("div", { class: "vv-caja grupo" });
  ui.appendChild(cajaHover);
  ui.appendChild(cajaGrupo);
  var manijas = ["nw", "ne", "sw", "se", "rot"].map(function (k) {
    var m = el("div", { class: "vv-manija" + (k === "rot" ? " rot" : ""), "data-h": k });
    m.style.cursor = k === "rot" ? "grab" : (k === "nw" || k === "se" ? "nwse-resize" : "nesw-resize");
    ui.appendChild(m);
    return m;
  });
  var guias = [0, 1, 2, 3].map(function () { var g = el("div", { class: "vv-guia" }); ui.appendChild(g); return g; });
  var hover = null;

  // ================= barra en vivo (fuera del editor) =================
  function actualizarBarra() {
    barra.classList.toggle("on", conectado);
    barra.querySelector(".est").textContent = conectado ? "EN VIVO" : "SIN CONEXIÓN";
    var total = ultimo.total || slides().length, pend = ultimo.pendientes || 0;
    barra.querySelector(".prog").textContent = pend ? (total - pend) + " de " + total + " listas" : total + " slides";
    // El HTML que se entrega se reescribe en cada cambio; la hora confirma que el archivo va al día
    var ent = ultimo.entregable || {}, spanEnt = barra.querySelector(".ent");
    spanEnt.hidden = !(ent.ruta || ent.error);
    spanEnt.classList.toggle("mal", !!ent.error);
    spanEnt.textContent = ent.error ? "Entregable sin actualizar" : "Entregable al día " + String(ent.hora || "").slice(0, 5);
    spanEnt.title = ent.error || ("Se actualiza solo en cada cambio: " + String(ent.ruta || "").split(/[\\/]/).pop());
    var av = barra.querySelector(".av"), n = (ultimo.avisos || []).length;
    av.hidden = !n;
    av.textContent = n + (n === 1 ? " aviso" : " avisos");
    panelAvisos.textContent = "";
    (ultimo.avisos || []).forEach(function (a) { var l = document.createElement("div"); l.textContent = a; panelAvisos.appendChild(l); });
  }
  barra.querySelector(".av").addEventListener("click", function () { panelAvisos.classList.toggle("abierto"); });
  barra.querySelector(".ed").addEventListener("click", function () { entrar(); });
  [barra, panelAvisos, toast, ui].forEach(function (n) { n.addEventListener("click", function (e) { e.stopPropagation(); }); });

  // ================= recarga en vivo =================
  function recargar() {
    try { sessionStorage.setItem("vv-editar", ED.activo ? "1" : ""); } catch (err) { /* sin almacenamiento solo se pierde el modo edicion */ }
    location.reload();
  }
  function hayCambios() { return construirOps().length > 0; }
  function conectar() {
    var es = new EventSource("/__vivo/eventos");
    es.addEventListener("version", function (ev) {
      ultimo = JSON.parse(ev.data);
      conectado = true;
      if (ultimo.v !== V.v) {
        if (hayCambios() || ED.escribiendo) recargaPendiente = true;
        else { recargar(); return; }
      }
      actualizarBarra();
      actualizarEstado();
    });
    es.onerror = function () { conectado = false; actualizarBarra(); actualizarEstado(); };
  }

  // ================= pausar animaciones mientras se edita =================
  var colaRaf = [], rafPausado = false, tReanudar = null;
  function pausarJS() {
    if (rafPausado) return;
    rafPausado = true;
    window.requestAnimationFrame = function (cb) { colaRaf.push(cb); return 0; };
  }
  function reanudarJS() {
    if (!rafPausado) return;
    rafPausado = false;
    window.requestAnimationFrame = rafReal;
    var cola = colaRaf;
    colaRaf = [];
    cola.forEach(function (cb) { rafReal(cb); });
  }
  function congelar() {
    // Las entradas quedan en su estado final y los loops quietos, para apuntar con precision
    document.getAnimations().forEach(function (a) {
      var t = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : null;
      if (!t) return;
      if (t.iterations === Infinity || t.activeDuration === Infinity) a.pause();
      else a.finish();
    });
  }
  function asentarSlide() {
    // Al cambiar de slide se deja correr su entrada (contadores, canvas) y luego se congela
    reanudarJS();
    clearTimeout(tReanudar);
    tReanudar = setTimeout(function () { if (ED.activo) { congelar(); pausarJS(); refrescarMini(slideActiva()); } }, 1700);
  }
  var observador = new MutationObserver(function (lista) {
    lista.forEach(function (m) {
      if (!ED.activo || !m.target.classList.contains("is-active")) return;
      terminarTexto();
      seleccionar([]);
      asentarSlide();
      marcarDiapoActual();
      actualizarEstado();
    });
  });
  slides().forEach(function (s) { observador.observe(s, { attributes: true, attributeFilter: ["class"] }); });

  // ================= entrar y salir =================
  function layout() {
    if (!ED.activo) return;
    var w = window.innerWidth - IZQ - DER, h = window.innerHeight - ARR - ABA;
    var s = Math.min(w / 1920, h / 1080) * 0.94;
    deck.style.left = (IZQ + w / 2) + "px";
    deck.style.top = (ARR + h / 2) + "px";
    deck.style.transform = "translate(-50%, -50%) scale(" + s + ")";
  }
  // El motor tambien escucha resize y se registra despues; se acomoda en la vuelta siguiente para quedar encima
  window.addEventListener("resize", function () { if (ED.activo) setTimeout(layout, 0); });

  function entrar() {
    if (ED.activo) return;
    ED.activo = true;
    document.body.classList.add("vv-editor");
    layout();
    congelar();
    pausarJS();
    construirDiapos();
    actualizarPaneles();
    rafReal(pintar);
    aviso("Editor abierto. Clic selecciona, doble clic edita el texto, Ctrl+S guarda. E o Salir para volver.", 6000);
  }
  function salir() {
    terminarTexto();
    if (hayCambios()) { aviso("Guarda o deshaz los cambios antes de salir."); return; }
    ED.activo = false;
    seleccionar([]);
    menuExp.classList.remove("abierto");
    document.body.classList.remove("vv-editor");
    deck.style.left = "";
    deck.style.top = "";
    window.dispatchEvent(new Event("resize"));
    reanudarJS();
    document.getAnimations().forEach(function (a) { if (a.playState === "paused") a.play(); });
    if (recargaPendiente) recargar();
  }

  // ================= panel de slides =================
  function construirDiapos() {
    izq.textContent = "";
    slides().forEach(function (s, i) {
      var d = el("div", { class: "vv-diapo" + (s.classList.contains("pendiente") ? " pend" : ""), "data-i": String(i) });
      d.appendChild(el("b", {}, String(i + 1)));
      d.appendChild(window.DeckMini ? window.DeckMini(s, true) : el("div", { class: "deck-mini" }));
      d.addEventListener("click", function () { if (window.Deck) Deck.go(i, 0); });
      izq.appendChild(d);
    });
    marcarDiapoActual();
  }
  function marcarDiapoActual() {
    var i = slides().indexOf(slideActiva());
    izq.querySelectorAll(".vv-diapo").forEach(function (d) {
      var act = Number(d.getAttribute("data-i")) === i;
      d.classList.toggle("actual", act);
      if (act) d.scrollIntoView({ block: "nearest" });
    });
  }
  var tMini = null;
  function refrescarMini(s) {
    if (!s || !window.DeckMini) return;
    clearTimeout(tMini);
    tMini = setTimeout(function () {
      var i = slides().indexOf(s), d = izq.querySelector('.vv-diapo[data-i="' + i + '"]');
      if (!d) return;
      var vieja = d.querySelector(".deck-mini");
      if (vieja) d.replaceChild(window.DeckMini(s, true), vieja);
    }, 450);
  }

  // ================= seleccion =================
  function seleccionar(lista) {
    ED.sel = lista.filter(function (n, i) { return n && lista.indexOf(n) === i; });
    actualizarPaneles();
  }
  function cambio() {
    actualizarPaneles();
    refrescarMini(slideActiva());
  }

  function pintarCaja(c, n) {
    if (!n || !document.contains(n)) { c.style.display = "none"; return null; }
    var r = n.getBoundingClientRect();
    c.style.display = "block";
    c.style.left = r.left + "px";
    c.style.top = r.top + "px";
    c.style.width = r.width + "px";
    c.style.height = r.height + "px";
    return r;
  }
  function pintar() {
    if (!ED.activo) {
      [cajaHover, cajaGrupo].concat(cajasSel, manijas, guias).forEach(function (n) { n.style.display = "none"; });
      return;
    }
    while (cajasSel.length < ED.sel.length) { var c = el("div", { class: "vv-caja sel" }); ui.appendChild(c); cajasSel.push(c); }
    cajasSel.forEach(function (c, i) { pintarCaja(c, ED.sel[i] || null); });
    pintarCaja(cajaHover, hover && ED.sel.indexOf(hover) < 0 ? hover : null);
    if (ED.sel.length > 1) {
      var d = deck.getBoundingClientRect(), s = d.width / 1920, u = unir(ED.sel.map(cajaDeck));
      cajaGrupo.style.display = "block";
      cajaGrupo.style.left = (d.left + u.x * s - 4) + "px";
      cajaGrupo.style.top = (d.top + u.y * s - 4) + "px";
      cajaGrupo.style.width = (u.w * s + 8) + "px";
      cajaGrupo.style.height = (u.h * s + 8) + "px";
    } else cajaGrupo.style.display = "none";
    var uno = ED.sel.length === 1 && !ED.escribiendo ? ED.sel[0].getBoundingClientRect() : null;
    manijas.forEach(function (m) {
      if (!uno) { m.style.display = "none"; return; }
      var k = m.getAttribute("data-h"), x, y;
      if (k === "rot") { x = uno.left + uno.width / 2; y = uno.top - 22; }
      else { x = k.indexOf("w") >= 0 ? uno.left : uno.right; y = k.indexOf("n") >= 0 ? uno.top : uno.bottom; }
      m.style.display = "block";
      m.style.left = (x - 5) + "px";
      m.style.top = (y - 5) + "px";
    });
    rafReal(pintar);
  }

  // ================= arrastre, marco, manijas y guias =================
  var arr = null;
  function objetivosGuia(excluir) {
    var xs = [0, 960, 1920], ys = [0, 540, 1080], s = slideActiva();
    if (s) deNivelSuperior(s).forEach(function (n) {
      if (excluir.indexOf(n) >= 0) return;
      var c = cajaDeck(n);
      if (!c.w && !c.h) return;
      xs.push(c.x, c.x + c.w / 2, c.x + c.w);
      ys.push(c.y, c.y + c.h / 2, c.y + c.h);
    });
    return { xs: xs, ys: ys };
  }
  function ajustar(valores, objetivos) {
    var mejor = null;
    valores.forEach(function (v) {
      objetivos.forEach(function (o) {
        var d = o - v;
        if (Math.abs(d) <= 8 && (!mejor || Math.abs(d) < Math.abs(mejor.d))) mejor = { d: d, o: o };
      });
    });
    return mejor;
  }
  function mostrarGuias(gx, gy) {
    var d = deck.getBoundingClientRect(), s = d.width / 1920;
    guias.forEach(function (g) { g.style.display = "none"; });
    if (gx) { var a = guias[0]; a.style.display = "block"; a.style.left = (d.left + gx.o * s) + "px"; a.style.top = d.top + "px"; a.style.width = "1px"; a.style.height = d.height + "px"; }
    if (gy) { var b = guias[1]; b.style.display = "block"; b.style.top = (d.top + gy.o * s) + "px"; b.style.left = d.left + "px"; b.style.height = "1px"; b.style.width = d.width + "px"; }
  }

  window.addEventListener("mousedown", function (e) {
    if (!ED.activo || e.button !== 0) return;
    var h = e.target.getAttribute && e.target.getAttribute("data-h");
    if (h && ED.sel.length === 1) { e.preventDefault(); e.stopPropagation(); empezarManija(h, e); return; }
    if (enUI(e.target)) return;
    if (ED.escribiendo && ED.escribiendo.contains(e.target)) return;
    terminarTexto();
    e.preventDefault();
    e.stopPropagation();
    menuExp.classList.remove("abierto");
    var c = cadena(e.target);
    if (!c.length) {
      if (!e.shiftKey) seleccionar([]);
      if (deck.contains(e.target)) arr = { tipo: "marco", x: e.clientX, y: e.clientY, base: ED.sel.slice() };
      return;
    }
    var actual = c.filter(function (n) { return ED.sel.indexOf(n) >= 0; }).pop();
    var obj = actual || c[0];
    if (e.shiftKey) {
      seleccionar(ED.sel.indexOf(obj) >= 0 ? ED.sel.filter(function (n) { return n !== obj; }) : ED.sel.concat([obj]));
      return;
    }
    if (ED.sel.indexOf(obj) < 0) seleccionar([obj]);
    var caja = unir(ED.sel.map(cajaDeck));
    arr = { tipo: "mover", x: e.clientX, y: e.clientY, s: escala(), ini: ED.sel.map(leerT), caja: caja, antes: foto(ED.sel),
      movido: false, cadena: c, actual: actual, guias: objetivosGuia(ED.sel) };
  }, true);

  function empezarManija(h, e) {
    var n = ED.sel[0], r = n.getBoundingClientRect();
    arr = { tipo: h === "rot" ? "rotar" : "escalar", n: n, antes: foto([n]), cx: r.left + r.width / 2, cy: r.top + r.height / 2,
      x: e.clientX, y: e.clientY, s0: leerNum(n, "scale", 1), r0: leerNum(n, "rotate", 0),
      w0: n.offsetWidth, h0: n.offsetHeight, alto: !!n.style.height, movido: false };
  }

  window.addEventListener("mousemove", function (e) {
    if (!ED.activo) return;
    if (!arr) { hover = enUI(e.target) ? null : (cadena(e.target)[0] || null); return; }
    var dx = e.clientX - arr.x, dy = e.clientY - arr.y;
    if (!arr.movido && Math.abs(dx) + Math.abs(dy) < 3) return;
    arr.movido = true;
    if (arr.tipo === "mover") {
      var ddx = dx / arr.s, ddy = dy / arr.s, gx = null, gy = null;
      if (!e.altKey) {
        var c = arr.caja;
        gx = ajustar([c.x + ddx, c.x + c.w / 2 + ddx, c.x + c.w + ddx], arr.guias.xs);
        gy = ajustar([c.y + ddy, c.y + c.h / 2 + ddy, c.y + c.h + ddy], arr.guias.ys);
        if (gx) ddx += gx.d;
        if (gy) ddy += gy.d;
      }
      mostrarGuias(gx, gy);
      ED.sel.forEach(function (n, i) { ponerT(n, arr.ini[i][0] + ddx, arr.ini[i][1] + ddy); });
      actualizarPropiedades();
    } else if (arr.tipo === "escalar") {
      var d0 = Math.hypot(arr.x - arr.cx, arr.y - arr.cy) || 1, d1 = Math.hypot(e.clientX - arr.cx, e.clientY - arr.cy);
      var f = Math.max(0.05, d1 / d0);
      if (esObjeto(arr.n)) {
        ponerProp(arr.n, "width", Math.max(8, Math.round(arr.w0 * f)) + "px");
        if (arr.alto) ponerProp(arr.n, "height", Math.max(4, Math.round(arr.h0 * f)) + "px");
      } else {
        ponerProp(arr.n, "scale", String(Number((arr.s0 * f).toFixed(3))));
      }
      actualizarPropiedades();
    } else if (arr.tipo === "rotar") {
      var a0 = Math.atan2(arr.y - arr.cy, arr.x - arr.cx), a1 = Math.atan2(e.clientY - arr.cy, e.clientX - arr.cx);
      var ang = arr.r0 + (a1 - a0) * 180 / Math.PI;
      if (e.shiftKey) ang = Math.round(ang / 15) * 15;
      ang = Math.round(((ang % 360) + 540) % 360 - 180);
      ponerProp(arr.n, "rotate", ang ? ang + "deg" : "");
      actualizarPropiedades();
    } else if (arr.tipo === "marco") {
      var x1 = Math.min(arr.x, e.clientX), y1 = Math.min(arr.y, e.clientY);
      marco.style.display = "block";
      marco.style.left = x1 + "px";
      marco.style.top = y1 + "px";
      marco.style.width = Math.abs(dx) + "px";
      marco.style.height = Math.abs(dy) + "px";
      var r = { l: x1, t: y1, r: x1 + Math.abs(dx), b: y1 + Math.abs(dy) }, s = slideActiva();
      var dentro = s ? deNivelSuperior(s).filter(function (n) {
        var b = n.getBoundingClientRect();
        return b.width && b.left >= r.l && b.right <= r.r && b.top >= r.t && b.bottom <= r.b;
      }) : [];
      seleccionar(arr.base.concat(dentro));
    }
  }, true);

  window.addEventListener("mouseup", function () {
    if (!arr) return;
    var a = arr;
    arr = null;
    marco.style.display = "none";
    mostrarGuias(null, null);
    if (a.tipo === "marco") return;
    if (a.movido) {
      registrar(a.antes, foto(a.tipo === "mover" ? ED.sel : [a.n]));
      return;
    }
    // Un clic sin mover sobre lo ya seleccionado entra un nivel, como en los grupos de PowerPoint
    if (a.tipo === "mover" && a.actual) {
      var i = a.cadena.indexOf(a.actual);
      if (a.cadena[i + 1]) seleccionar([a.cadena[i + 1]]);
    }
  }, true);

  window.addEventListener("click", function (e) {
    if (!ED.activo || enUI(e.target)) return;
    e.stopPropagation();
    if (!(ED.escribiendo && ED.escribiendo.contains(e.target))) e.preventDefault();
  }, true);
  window.addEventListener("dblclick", function (e) {
    if (!ED.activo || enUI(e.target)) return;
    var c = cadena(e.target);
    var t = c.slice().reverse().filter(tieneTexto)[0];
    if (!t) return;
    e.preventDefault();
    seleccionar([t]);
    editarTexto(t, false);
  }, true);

  // ================= texto =================
  function tieneTexto(n) {
    if (!n.textContent.trim() && !n.classList.contains("vv-texto")) return false;
    return !n.querySelector("div,p,section,svg,canvas,img,ul,ol,table,h1,h2,h3,video");
  }
  function editarTexto(n, todo) {
    if (!n) return;
    if (!tieneTexto(n)) { aviso("Ese elemento agrupa otros. Haz doble clic directamente sobre la línea de texto."); return; }
    terminarTexto();
    ED.escribiendo = n;
    ED.textoAntes = foto([n]);
    n.contentEditable = "true";
    n.classList.add("vv-escribe");
    n.focus();
    var r = document.createRange();
    r.selectNodeContents(n);
    if (!todo) r.collapse(false);
    var s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
    actualizarPaneles();
  }
  function terminarTexto() {
    var n = ED.escribiendo;
    if (!n) return;
    ED.escribiendo = null;
    n.removeAttribute("contenteditable");
    n.classList.remove("vv-escribe");
    var antes = ED.textoAntes, despues = foto([n]);
    if (antes[0].html !== despues[0].html) {
      tocar(n, "html", antes[0].html);
      if (n.hasAttribute("data-vv-origen")) n.setAttribute("data-vv-texto", "1");
    }
    registrar(antes, despues);
    actualizarPaneles();
  }
  var PERMITIDAS = { B: 1, STRONG: 1, EM: 1, I: 1, U: 1, SPAN: 1, SMALL: 1, SUP: 1, SUB: 1 };
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function clasesLimpias(n) {
    return (n.getAttribute("class") || "").split(/\s+/).filter(function (x) {
      return x && /^[\w-]+$/.test(x) && (x.indexOf("vv-") !== 0 || /^vv-(obj|texto|forma|img)$/.test(x));
    }).join(" ");
  }
  function limpiarHtml(n) {
    var out = "";
    n.childNodes.forEach(function (c) {
      if (c.nodeType === 3) { out += esc(c.textContent); return; }
      if (c.nodeType !== 1) return;
      var t = c.tagName;
      if (t === "BR") out += "<br>";
      else if (PERMITIDAS[t]) {
        var cl = clasesLimpias(c);
        out += "<" + t.toLowerCase() + (cl ? ' class="' + cl + '"' : "") + ">" + limpiarHtml(c) + "</" + t.toLowerCase() + ">";
      } else if (t === "DIV" || t === "P") out += (out ? "<br>" : "") + limpiarHtml(c);
      else out += limpiarHtml(c);
    });
    return out;
  }
  function envolverAcento() {
    var s = window.getSelection();
    if (!s.rangeCount || s.isCollapsed) { aviso("Selecciona primero las palabras que van en acento."); return; }
    var r = s.getRangeAt(0), sp = document.createElement("span");
    sp.className = "accent";
    sp.appendChild(r.extractContents());
    r.insertNode(sp);
  }

  // ================= insertar =================
  function nuevoObjeto(tag, clases, estilo, contenido) {
    var n = document.createElement(tag);
    n.className = "vv-obj " + clases;
    n.setAttribute("data-vv-nuevo", String(++ED.cuenta));
    Object.keys(estilo).forEach(function (k) { n.style.setProperty(k, estilo[k]); });
    if (contenido) n.innerHTML = contenido;
    return n;
  }
  function colocar(nuevos, s) {
    s = s || slideActiva();
    if (!s) return;
    accion(nuevos, function () { nuevos.forEach(function (n) { s.appendChild(n); }); });
    seleccionar(nuevos);
  }
  function insertarTexto(texto) {
    var n = nuevoObjeto("div", "vv-texto txt", { position: "absolute", left: "660px", top: "470px", width: "600px", color: "var(--ink)" }, esc(texto || "Escribe aquí"));
    colocar([n]);
    if (!texto) editarTexto(n, true);
  }
  function insertarForma(tipo) {
    var e = { position: "absolute", left: "810px", top: "390px", width: "300px", height: "300px", background: "var(--accent)" };
    if (tipo === "circulo") e["border-radius"] = "50%";
    if (tipo === "linea") { e.left = "660px"; e.top = "537px"; e.width = "600px"; e.height = "6px"; e.background = "var(--ink)"; }
    colocar([nuevoObjeto("div", "vv-forma", e)]);
  }
  function subirImagen(archivo, punto) {
    if (!/^image\/(png|jpeg|webp|gif)$/.test(archivo.type)) { aviso("Solo PNG, JPG, WEBP o GIF."); return; }
    aviso("Subiendo imagen...");
    fetch("/__vivo/subir", { method: "POST", headers: { "X-Vivo-Token": V.token, "Content-Type": archivo.type }, body: archivo })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (!res.ok) { aviso("No se pudo subir: " + res.motivo); return; }
        var s = slideActiva(), img = nuevoObjeto("img", "vv-img", { position: "absolute" });
        img.alt = "";
        img.setAttribute("data-vv-src", res.ruta);
        img.onload = function () {
          var w = Math.min(img.naturalWidth || 800, 900), h = w * (img.naturalHeight || 1) / (img.naturalWidth || 1);
          var p = punto || { x: 960, y: 540 };
          img.style.width = Math.round(w) + "px";
          img.style.left = Math.round(p.x - w / 2) + "px";
          img.style.top = Math.round(p.y - h / 2) + "px";
          img.onload = null;
          colocar([img], s);
          aviso("Imagen insertada. Queda guardada dentro del HTML final.");
        };
        img.src = res.ruta;
      })
      .catch(function (err) { aviso("No se pudo subir: " + err.message); });
  }
  entradaArchivo.addEventListener("change", function () {
    Array.prototype.forEach.call(entradaArchivo.files, function (f, i) { subirImagen(f, { x: 960 + i * 40, y: 540 + i * 40 }); });
    entradaArchivo.value = "";
  });
  window.addEventListener("dragover", function (e) { if (ED.activo && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types, "Files") >= 0) e.preventDefault(); });
  window.addEventListener("drop", function (e) {
    if (!ED.activo || !e.dataTransfer) return;
    var fs = Array.prototype.filter.call(e.dataTransfer.files || [], function (f) { return /^image\//.test(f.type); });
    if (!fs.length) return;
    e.preventDefault();
    var p = puntoDeck(e.clientX, e.clientY);
    fs.forEach(function (f, i) { subirImagen(f, { x: p.x + i * 40, y: p.y + i * 40 }); });
  });

  // ================= portapapeles =================
  function limpiarMarcas(c) {
    [c].concat(Array.prototype.slice.call(c.querySelectorAll("*"))).forEach(function (n) {
      n.removeAttribute("data-e");
      n.removeAttribute("data-vv-nuevo");
      n.removeAttribute("data-vv-origen");
      n.removeAttribute("data-vv-junto");
      n.removeAttribute("data-vv-texto");
      n.removeAttribute("contenteditable");
      if (n.classList) n.classList.remove("vv-escribe");
    });
  }
  function aClip(lista) {
    return lista.map(function (n) {
      var c = n.cloneNode(true);
      var origen = n.getAttribute("data-e") || n.getAttribute("data-vv-origen") || "";
      limpiarMarcas(c);
      return { html: c.outerHTML, origen: origen, slide: slideDe(n).id, texto: n.getAttribute("data-vv-texto") || "", objeto: esObjeto(n) && !n.getAttribute("data-vv-origen") };
    });
  }
  function copiar() {
    if (!ED.sel.length) { aviso("Selecciona algo para copiar."); return; }
    ED.clip = aClip(ED.sel);
    aviso(ED.sel.length === 1 ? "Copiado." : ED.sel.length + " elementos copiados.");
  }
  function pegarItems(items) {
    var s = slideActiva();
    if (!s || !items.length) return;
    var otraSlide = false, nuevos = [], destinos = [];
    items.forEach(function (it) {
      var tmp = document.createElement("div");
      tmp.innerHTML = it.html;
      var n = tmp.firstElementChild;
      if (!n) return;
      n.setAttribute("data-vv-nuevo", String(++ED.cuenta));
      if (!it.objeto && it.origen) n.setAttribute("data-vv-origen", it.origen);
      else if (!n.classList.contains("vv-obj")) n.classList.add("vv-obj");
      if (it.texto) n.setAttribute("data-vv-texto", "1");
      var junto = null;
      if (it.slide === s.id) {
        var t = leerT(n);
        n.style.translate = (t[0] + 24) + "px " + (t[1] + 24) + "px";
        if (it.origen && !it.objeto) junto = deck.querySelector('[data-e="' + it.origen + '"]');
      } else if (!it.objeto) otraSlide = true;
      if (junto) n.setAttribute("data-vv-junto", "1");
      nuevos.push(n);
      destinos.push(junto);
    });
    accion(nuevos, function () {
      nuevos.forEach(function (n, i) {
        if (destinos[i] && destinos[i].parentNode) destinos[i].parentNode.insertBefore(n, destinos[i].nextSibling);
        else s.appendChild(n);
      });
    });
    seleccionar(nuevos);
    if (otraSlide) aviso("Pegado en otra slide: puede perder estilos que eran propios de su slide original.", 6000);
  }
  function borrarSel() {
    if (!ED.sel.length) return;
    var lista = ED.sel.slice();
    lista.forEach(function (n) { tocar(n, null); });
    accion(lista, function () { lista.forEach(function (n) { n.parentNode.removeChild(n); }); });
    seleccionar([]);
  }
  var tPegar = null;
  document.addEventListener("paste", function (e) {
    if (!ED.activo) return;
    clearTimeout(tPegar);
    tPegar = null;
    var cd = e.clipboardData;
    if (ED.escribiendo) {
      e.preventDefault();
      document.execCommand("insertText", false, cd ? cd.getData("text/plain") : "");
      return;
    }
    var fs = cd ? Array.prototype.filter.call(cd.files || [], function (f) { return /^image\//.test(f.type); }) : [];
    e.preventDefault();
    if (fs.length) { fs.forEach(function (f) { subirImagen(f); }); return; }
    if (ED.clip.length) { pegarItems(ED.clip); return; }
    var txt = cd ? cd.getData("text/plain") : "";
    if (txt) insertarTexto(txt);
  });

  // ================= organizar =================
  function alinear(modo) {
    var lista = ED.sel;
    if (!lista.length) { aviso("Selecciona lo que quieres alinear."); return; }
    var ref = lista.length === 1 ? { x: 0, y: 0, w: 1920, h: 1080 } : unir(lista.map(cajaDeck));
    accion(lista, function () {
      lista.forEach(function (n) {
        var c = cajaDeck(n), dx = 0, dy = 0;
        if (modo === "izq") dx = ref.x - c.x;
        else if (modo === "cenh") dx = ref.x + ref.w / 2 - (c.x + c.w / 2);
        else if (modo === "der") dx = ref.x + ref.w - (c.x + c.w);
        else if (modo === "arr") dy = ref.y - c.y;
        else if (modo === "medv") dy = ref.y + ref.h / 2 - (c.y + c.h / 2);
        else if (modo === "aba") dy = ref.y + ref.h - (c.y + c.h);
        if (Math.abs(dx) > 0.4 || Math.abs(dy) > 0.4) moverPor(n, dx, dy);
      });
    });
  }
  function distribuir(eje) {
    var lista = ED.sel.slice();
    if (lista.length < 3) { aviso("Selecciona 3 o más elementos para distribuir."); return; }
    var cajas = lista.map(cajaDeck), x = eje === "h";
    var orden = lista.map(function (n, i) { return i; }).sort(function (a, b) { return x ? cajas[a].x - cajas[b].x : cajas[a].y - cajas[b].y; });
    var primero = cajas[orden[0]], ultimoC = cajas[orden[orden.length - 1]];
    var total = orden.reduce(function (s, i) { return s + (x ? cajas[i].w : cajas[i].h); }, 0);
    var hueco = ((x ? ultimoC.x + ultimoC.w - primero.x : ultimoC.y + ultimoC.h - primero.y) - total) / (orden.length - 1);
    accion(lista, function () {
      var pos = x ? primero.x : primero.y;
      orden.forEach(function (i) {
        var c = cajas[i], d = pos - (x ? c.x : c.y);
        if (Math.abs(d) > 0.4) moverPor(lista[i], x ? d : 0, x ? 0 : d);
        pos += (x ? c.w : c.h) + hueco;
      });
    });
  }
  function capa(alFrente) {
    var lista = ED.sel;
    if (!lista.length) return;
    accion(lista, function () {
      lista.forEach(function (n) {
        var zs = Array.prototype.map.call(n.parentElement.children, function (h) { return parseInt(getComputedStyle(h).zIndex, 10) || 0; });
        var z = alFrente ? Math.max.apply(null, zs) + 1 : Math.min.apply(null, zs) - 1;
        if (getComputedStyle(n).position === "static") ponerProp(n, "position", "relative");
        ponerProp(n, "z-index", String(z));
      });
    });
  }

  // ================= formato =================
  function conTexto(fn) {
    var lista = ED.sel;
    if (!lista.length) { aviso("Selecciona un texto."); return; }
    accion(lista, function () { lista.forEach(fn); });
  }
  function formato(a) {
    if (ED.escribiendo) {
      if (a === "negrita") document.execCommand("bold");
      else if (a === "cursiva") document.execCommand("italic");
      else if (a === "acento") envolverAcento();
      else { var n0 = ED.escribiendo; terminarTexto(); seleccionar([n0]); formato(a); }
      return;
    }
    if (a === "negrita") conTexto(function (n) { var b = parseInt(getComputedStyle(n).fontWeight, 10) >= 600; ponerProp(n, "font-weight", b ? "400" : "700"); });
    else if (a === "cursiva") conTexto(function (n) { ponerProp(n, "font-style", getComputedStyle(n).fontStyle === "italic" ? "normal" : "italic"); });
    else if (a === "acento") conTexto(function (n) { ponerProp(n, "color", "var(--accent)"); });
    else if (a === "mas" || a === "menos") conTexto(function (n) {
      var f = parseFloat(getComputedStyle(n).fontSize) || 30;
      ponerProp(n, "font-size", Math.max(8, Math.round(f + (a === "mas" ? 4 : -4))) + "px");
    });
    else if (a.indexOf("tx-") === 0) conTexto(function (n) { ponerProp(n, "text-align", { "tx-izq": "left", "tx-cen": "center", "tx-der": "right" }[a]); });
  }

  // ================= panel de propiedades =================
  function campo(etq, clave, valor, extra) {
    return '<label>' + etq + '<input data-p="' + clave + '" value="' + valor + '"' + (extra || "") + "></label>";
  }
  function actualizarPropiedades() {
    if (!ED.activo) return;
    var n = ED.sel.length === 1 ? ED.sel[0] : null;
    der.querySelectorAll("input[data-p]").forEach(function (inp) {
      if (!n || document.activeElement === inp) return;
      inp.value = valorProp(n, inp.getAttribute("data-p"));
    });
  }
  function valorProp(n, p) {
    var c = cajaDeck(n);
    if (p === "x") return Math.round(c.x);
    if (p === "y") return Math.round(c.y);
    if (p === "w") return Math.round(esObjeto(n) ? n.offsetWidth : c.w);
    if (p === "h") return Math.round(esObjeto(n) ? n.offsetHeight : c.h);
    if (p === "escala") return Math.round(leerNum(n, "scale", 1) * 100);
    if (p === "rot") return Math.round(leerNum(n, "rotate", 0));
    if (p === "opa") return Math.round(leerNum(n, "opacity", 1) * 100);
    if (p === "z") return n.style.zIndex || "";
    if (p === "fs") return Math.round(parseFloat(getComputedStyle(n).fontSize) || 0);
    return "";
  }
  function aplicarProp(n, p, v) {
    var num = parseFloat(v), c = cajaDeck(n);
    if (p === "x" && !isNaN(num)) moverPor(n, num - c.x, 0);
    else if (p === "y" && !isNaN(num)) moverPor(n, 0, num - c.y);
    else if (p === "w" && !isNaN(num)) { if (esObjeto(n)) ponerProp(n, "width", Math.max(4, Math.round(num)) + "px"); else ponerProp(n, "scale", String(Number((leerNum(n, "scale", 1) * num / (c.w || 1)).toFixed(3)))); }
    else if (p === "h" && !isNaN(num)) { if (esObjeto(n)) ponerProp(n, "height", Math.max(2, Math.round(num)) + "px"); else ponerProp(n, "scale", String(Number((leerNum(n, "scale", 1) * num / (c.h || 1)).toFixed(3)))); }
    else if (p === "escala" && !isNaN(num)) ponerProp(n, "scale", num === 100 ? "" : String(Number((num / 100).toFixed(3))));
    else if (p === "rot" && !isNaN(num)) ponerProp(n, "rotate", num ? Math.round(num) + "deg" : "");
    else if (p === "opa" && !isNaN(num)) ponerProp(n, "opacity", num >= 100 ? "" : String(Math.max(0, num) / 100));
    else if (p === "z") { if (v !== "" && getComputedStyle(n).position === "static") ponerProp(n, "position", "relative"); ponerProp(n, "z-index", v === "" || isNaN(num) ? "" : String(Math.round(num))); }
    else if (p === "fs" && !isNaN(num)) ponerProp(n, "font-size", Math.max(6, Math.round(num)) + "px");
  }
  function actualizarPaneles() {
    if (!ED.activo) { actualizarEstado(); return; }
    var n = ED.sel.length === 1 ? ED.sel[0] : null, html = "";
    if (!ED.sel.length) {
      html = '<h5>Slide</h5><div class="vacio">Haz clic en un elemento para seleccionarlo. Arrastra sobre un espacio vacío para seleccionar varios. ' +
        'Shift+clic suma o quita. Un segundo clic sobre lo seleccionado entra al elemento de adentro.</div>' +
        '<h5>Atajos</h5><div class="vacio">Flechas mueven 1 px (Shift: 10). + y - escalan. Alt al arrastrar desactiva las guías. ' +
        'Enter o doble clic edita el texto. Ctrl+A selecciona todo.</div>';
    } else if (!n) {
      html = "<h5>Selección</h5><div class=\"nombre\">" + ED.sel.length + " elementos</div>" +
        '<div class="vacio">Usa Organizar para alinear o distribuir. Puedes moverlos juntos, copiarlos o eliminarlos.</div>';
    } else {
      var obj = esObjeto(n);
      html = "<h5>Selección</h5><div class=\"nombre\"></div>" +
        '<h5>Posición y tamaño</h5><div class="rej">' + campo("X", "x", "") + campo("Y", "y", "") +
        campo("Ancho", "w", "") + campo("Alto", "h", "") + campo("Escala %", "escala", "") + campo("Rotación °", "rot", "") +
        campo("Opacidad %", "opa", "") + campo("Capa", "z", "") + "</div>" +
        '<h5>' + (n.classList.contains("vv-forma") ? "Relleno" : "Color") + '</h5><div class="muestras">' +
        TOKENS.map(function (t) { return '<button type="button" data-color="var(--' + t + ')" title="' + NOMBRES[t] + '" style="background:var(--' + t + ')"></button>'; }).join("") +
        '<input type="color" data-colorlibre title="Otro color" style="width:34px;height:26px;padding:0"></div>' +
        (tieneTexto(n) || obj ? '<h5>Texto</h5><div class="rej">' + campo("Tamaño de letra", "fs", "") + "</div>" : "") +
        '<h5>Acciones</h5><div class="fila"><button type="button" data-a="restablecer">Restablecer posición y tamaño</button>' +
        (tieneTexto(n) ? '<button type="button" data-a="editarTexto">Editar texto</button>' : "") + "</div>";
    }
    der.innerHTML = html;
    if (n) {
      der.querySelector(".nombre").textContent = nombreDe(n) + (n.getAttribute("data-e") ? "  (" + n.getAttribute("data-e").split(":")[0] + ")" : "  (nuevo)");
      actualizarPropiedades();
    }
    actualizarEstado();
  }
  der.addEventListener("change", function (e) {
    var inp = e.target, n = ED.sel.length === 1 ? ED.sel[0] : null;
    if (!n) return;
    if (inp.hasAttribute("data-p")) accion([n], function () { aplicarProp(n, inp.getAttribute("data-p"), inp.value.trim()); });
    else if (inp.hasAttribute("data-colorlibre")) accion([n], function () { ponerColor(n, inp.value); });
    actualizarPropiedades();
  });
  der.addEventListener("keydown", function (e) { if (e.key === "Enter" && e.target.tagName === "INPUT") e.target.blur(); });
  function ponerColor(n, c) {
    if (n.classList.contains("vv-forma")) { ponerProp(n, "background", c); return; }
    ponerProp(n, "color", c);
  }
  der.addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    var lista = ED.sel;
    if (b.hasAttribute("data-color") && lista.length) accion(lista, function () { lista.forEach(function (n) { ponerColor(n, b.getAttribute("data-color")); }); });
    else if (b.getAttribute("data-a") === "restablecer" && lista.length) accion(lista, function () {
      lista.forEach(function (n) { ["translate", "scale", "rotate"].forEach(function (p) { ponerProp(n, p, ""); }); });
    });
    else if (b.getAttribute("data-a") === "editarTexto") editarTexto(lista[0], false);
  });

  // ================= barra de estado y exportar =================
  function actualizarEstado() {
    if (!ED.activo) return;
    var ss = slides(), i = ss.indexOf(slideActiva());
    estado.querySelector(".pos").textContent = "Slide " + (i + 1) + " de " + ss.length;
    var n = construirOps().length;
    estado.querySelector(".cambios").textContent = n ? n + (n === 1 ? " cambio sin guardar" : " cambios sin guardar") : "Todo guardado";
    estado.querySelector(".nuevo").hidden = !recargaPendiente;
    estado.querySelector(".con").textContent = conectado ? "En vivo" : "Sin conexión con vivo.py";
    var ex = ultimo.exportacion || {}, spanExp = estado.querySelector(".exp");
    spanExp.textContent = "";
    if (ex.activa) spanExp.textContent = "Exportando " + (ex.progreso || 0) + " de " + (ex.total || "?") + "...";
    else if (ex.error) spanExp.textContent = "Exportación: " + ex.error;
    else if (ex.archivos && ex.archivos.length) {
      spanExp.appendChild(document.createTextNode("Listo: "));
      ex.archivos.forEach(function (a, k) {
        var nombre = a.split(/[\\/]/).pop();
        var link = el("a", { href: "/__vivo/descarga?archivo=" + encodeURIComponent(nombre), download: nombre });
        link.textContent = nombre;
        if (k) spanExp.appendChild(document.createTextNode("  "));
        spanExp.appendChild(link);
      });
    }
  }
  menuExp.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-exp]");
    if (!b) return;
    menuExp.classList.remove("abierto");
    if (hayCambios()) aviso("Ojo: tienes cambios sin guardar; la exportación usa lo guardado.", 6000);
    fetch("/__vivo/exportar", { method: "POST", headers: { "Content-Type": "application/json", "X-Vivo-Token": V.token },
      body: JSON.stringify({ formato: b.getAttribute("data-exp"), pasos: menuExp.querySelector(".pasos").checked }) })
      .then(function (r) { return r.json(); })
      .then(function (res) { aviso(res.ok ? "Exportando. El avance aparece abajo a la derecha." : "No se pudo exportar: " + res.motivo); })
      .catch(function (err) { aviso("No se pudo exportar: " + err.message); });
  });

  // ================= guardar =================
  function propsDe(n) {
    var p = {};
    GESTIONADAS.forEach(function (k) { var v = n.style.getPropertyValue(k).trim(); if (v) p[k] = v; });
    return p;
  }
  // Los scripts de una slide pueden dejar opacidades con muchos decimales; el servidor acepta hasta 3
  function redondear(v) { var x = parseFloat(v); return isNaN(x) ? "" : String(Number(Math.min(1, Math.max(0, x)).toFixed(3))); }
  function serializar(n) {
    var tag = n.tagName.toLowerCase(), cl = clasesLimpias(n), p = propsDe(n);
    var st = Object.keys(p).map(function (k) { return k + ": " + p[k]; }).join("; ");
    var attrs = (cl ? ' class="' + cl + '"' : "") + (st ? ' style="' + st + '"' : "");
    if (tag === "img") return "<img" + attrs + ' src="' + (n.getAttribute("data-vv-src") || "") + '" alt="">';
    return "<" + tag + attrs + ">" + limpiarHtml(n) + "</" + tag + ">";
  }
  function construirOps() {
    var ops = [];
    ED.tocados.forEach(function (t, k) {
      var n = deck.querySelector('[data-e="' + k + '"]');
      if (!n) { ops.push({ op: "borrar", e: k, tag: t.tag }); return; }
      var props = {}, hay = false;
      t.props.forEach(function (orig, p) {
        var v = n.style.getPropertyValue(p).trim();
        if (v !== orig) { props[p] = v; hay = true; }
      });
      if (hay) ops.push({ op: "estilo", e: k, tag: t.tag, props: props });
      if (t.html !== null && n.innerHTML !== t.html) ops.push({ op: "html", e: k, tag: t.tag, html: limpiarHtml(n) });
    });
    deck.querySelectorAll("[data-vv-nuevo]").forEach(function (n) {
      var s = slideDe(n);
      if (!s || (n.parentElement && n.parentElement.closest("[data-vv-nuevo]"))) return;
      if (n.hasAttribute("data-vv-origen")) {
        var op = { op: "copia", origen: n.getAttribute("data-vv-origen"), tag: n.tagName.toLowerCase(), destino: s.id,
          props: { translate: n.style.getPropertyValue("translate").trim(), scale: n.style.getPropertyValue("scale").trim(),
            rotate: n.style.getPropertyValue("rotate").trim(), opacity: redondear(n.style.getPropertyValue("opacity")) } };
        if (n.hasAttribute("data-vv-texto")) op.html = limpiarHtml(n);
        if (n.hasAttribute("data-vv-junto")) op.junto = true;
        ops.push(op);
      } else ops.push({ op: "insertar", destino: s.id, html: serializar(n) });
    });
    return ops;
  }
  function guardar() {
    terminarTexto();
    var ops = construirOps();
    if (!ops.length) { aviso("No hay cambios para guardar."); return; }
    aviso("Guardando...");
    fetch("/__vivo/guardar", { method: "POST", headers: { "Content-Type": "application/json", "X-Vivo-Token": V.token }, body: JSON.stringify({ ops: ops }) })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok === false) {
          aviso(/token/.test(res.motivo || "") ? "vivo.py se reinició y esta página quedó desconectada. Recárgala (F5) para seguir; lo no guardado se pierde."
            : "No se guardó: " + res.motivo, 10000);
          return;
        }
        var malos = res.rechazados || [];
        if (malos.length) {
          aviso("Se guardaron " + res.aplicadas + " cambios. No se pudieron guardar " + malos.length + ": " +
            malos.map(function (m) { return m.motivo; }).join("; "), 12000);
          return;
        }
        // Todo quedo en los archivos: la recarga trae la version nueva y vuelve al editor
        ED.tocados.clear();
        deck.querySelectorAll("[data-vv-nuevo]").forEach(function (n) { n.removeAttribute("data-vv-nuevo"); });
        ED.deshacer = [];
        ED.rehacer = [];
        aviso("Guardado. Recargando...");
        recargaPendiente = true;
        setTimeout(function () { if (recargaPendiente) recargar(); }, 4000);
      })
      .catch(function (err) { aviso("No se pudo guardar: " + err.message, 8000); });
  }
  function deshacerGuardado() {
    if (hayCambios()) { aviso("Primero guarda o deshaz los cambios actuales."); return; }
    fetch("/__vivo/deshacer", { method: "POST", headers: { "X-Vivo-Token": V.token } })
      .then(function (r) { return r.json(); })
      .then(function (res) { aviso(res.ok ? "Se restauró el guardado anterior. Recargando..." : "No se pudo deshacer: " + res.motivo); })
      .catch(function (err) { aviso("No se pudo deshacer: " + err.message); });
  }

  // ================= botones de la cinta =================
  ui.addEventListener("mousedown", function (e) {
    // Los botones no deben quitar el foco del texto que se esta escribiendo
    if (e.target.closest("#vv-cinta button")) e.preventDefault();
  });
  function hacer(a) {
    if (a === "guardar") guardar();
    else if (a === "deshacerGuardado") deshacerGuardado();
    else if (a === "exportar") {
      var b = ui.querySelector('[data-a="exportar"]').getBoundingClientRect();
      menuExp.style.left = b.left + "px";
      menuExp.style.top = (b.bottom + 6) + "px";
      menuExp.classList.toggle("abierto");
    }
    else if (a === "salir") salir();
    else if (a === "recargar") recargar();
    else if (a === "deshacer") deshacer();
    else if (a === "rehacer") rehacer();
    else if (a === "copiar") copiar();
    else if (a === "cortar") { copiar(); borrarSel(); }
    else if (a === "pegar") { if (ED.clip.length) pegarItems(ED.clip); else aviso("No hay nada copiado. Para pegar una imagen de otra app usa Ctrl+V."); }
    else if (a === "duplicar") { if (ED.sel.length) pegarItems(aClip(ED.sel)); }
    else if (a === "borrar") borrarSel();
    else if (a === "insTexto") insertarTexto("");
    else if (a === "insImagen") entradaArchivo.click();
    else if (a === "insRect") insertarForma("rect");
    else if (a === "insCirculo") insertarForma("circulo");
    else if (a === "insLinea") insertarForma("linea");
    else if (a.indexOf("al-") === 0) alinear(a.slice(3));
    else if (a === "dist-h") distribuir("h");
    else if (a === "dist-v") distribuir("v");
    else if (a === "frente") capa(true);
    else if (a === "fondo") capa(false);
    else formato(a);
  }
  ui.addEventListener("click", function (e) {
    var b = e.target.closest("[data-a]");
    if (!b || b.closest("#vv-der")) return;
    e.preventDefault();
    hacer(b.getAttribute("data-a"));
  });

  // ================= teclado =================
  window.addEventListener("keydown", function (e) {
    var gal = document.getElementById("gal");
    if (gal && gal.classList.contains("abierta")) return;
    var k = e.key, mod = e.ctrlKey || e.metaKey;
    if (ED.escribiendo) {
      if (k === "Escape" || (k === "Enter" && !e.shiftKey)) { e.preventDefault(); terminarTexto(); }
      else if (mod && (k === "s" || k === "S")) { e.preventDefault(); guardar(); }
      e.stopImmediatePropagation();
      return;
    }
    if (e.target.tagName && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (!ED.activo) {
      if ((k === "e" || k === "E") && !mod && !e.altKey) { e.preventDefault(); e.stopImmediatePropagation(); entrar(); }
      return;
    }
    var hecho = true, paso = e.shiftKey ? 10 : 1;
    if (mod) {
      var t = k.toLowerCase();
      if (t === "s") guardar();
      else if (t === "z" && e.shiftKey) rehacer();
      else if (t === "z") deshacer();
      else if (t === "y") rehacer();
      else if (t === "c") copiar();
      else if (t === "x") { copiar(); borrarSel(); }
      else if (t === "d") { if (ED.sel.length) pegarItems(aClip(ED.sel)); }
      else if (t === "a") { var s = slideActiva(); if (s) seleccionar(deNivelSuperior(s)); }
      else if (t === "b") formato("negrita");
      else if (t === "i") formato("cursiva");
      else if (t === "v") {
        // El evento paste trae imagenes o texto de otras apps; si no llega, se pega lo copiado en el editor
        clearTimeout(tPegar);
        tPegar = setTimeout(function () { tPegar = null; if (ED.clip.length) pegarItems(ED.clip); }, 80);
        e.stopImmediatePropagation();
        return;
      }
      else hecho = false;
    }
    else if (k === "e" || k === "E") salir();
    else if (k === "Escape") { if (ED.sel.length) seleccionar([]); else salir(); }
    else if (ED.sel.length && (k === "ArrowLeft" || k === "ArrowRight" || k === "ArrowUp" || k === "ArrowDown")) {
      var dx = k === "ArrowLeft" ? -paso : k === "ArrowRight" ? paso : 0, dy = k === "ArrowUp" ? -paso : k === "ArrowDown" ? paso : 0;
      var lista = ED.sel;
      accion(lista, function () { lista.forEach(function (n) { moverPor(n, dx, dy); }); });
    }
    else if (ED.sel.length && (k === "+" || k === "=" || k === "-")) {
      var lst = ED.sel, f = k === "-" ? 1 / 1.05 : 1.05;
      accion(lst, function () { lst.forEach(function (n) { ponerProp(n, "scale", String(Number((leerNum(n, "scale", 1) * f).toFixed(3)))); }); });
    }
    else if (ED.sel.length === 1 && (k === "Enter" || k === "F2")) editarTexto(ED.sel[0], false);
    else if (ED.sel.length && (k === "Delete" || k === "Backspace")) borrarSel();
    else if (/^[a-z.]$/i.test(k) && k !== "f" && k !== "F" && k !== "g" && k !== "G") hecho = true;
    else hecho = false;
    if (hecho) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  // ================= inicio =================
  function inicio() {
    actualizarBarra();
    conectar();
    var volver = "";
    try { volver = sessionStorage.getItem("vv-editar") || ""; sessionStorage.removeItem("vv-editar"); } catch (err) { volver = ""; }
    if (volver === "1") setTimeout(entrar, 400);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", inicio);
  else inicio();
})();
