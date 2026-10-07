// Reto en grupo de punta a punta con tres «aparatos»: Prueba crea el reto, Zeta acepta y Yeta rechaza.
// Zeta y Yeta son temporales y se borran al final desde la administración (hace falta su contraseña).
// Uso: node reto-en-grupo.js <contraseña de admin>      (con la web servida en http://127.0.0.1:8765)
const puppeteer = require("puppeteer-core");
const BASE = "http://127.0.0.1:8765/", ADMIN = process.argv[2];
const API = "https://test-oposicion.fermentolactico.workers.dev/";
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const err = [], log = {};
  const abrir = async url => {
    const p = await (await browser.createBrowserContext()).newPage();
    p.on("pageerror", e => err.push(e.message)); p.on("console", m => { if (m.type() === "error") err.push(m.text()); });
    p.on("dialog", d => { err.push("dialog " + d.message()); d.dismiss(); });
    await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
    await p.goto(url, { waitUntil: "domcontentloaded" }); await p.waitForSelector(".perfil", { timeout: 20000 }); return p;
  };
  const esperar = async (p, fn, ms = 25000, arg) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn, arg)) return true; await sleep(200); } return false; };
  const boton = (p, texto) => p.evaluate(t => { const b = [...document.querySelectorAll("button")].filter(b => b.textContent.trim() === t && !b.disabled).pop(); if (!b) throw new Error("no hay botón " + t); b.click(); }, texto);
  const teclea = async (p, pin) => { for (const d of pin) await p.evaluate(d => [...document.querySelectorAll(".key")].find(k => k.textContent === d).click(), d); };
  const entrarComo = async (p, nombre, pin, nueva) => {
    if (nueva) { await p.evaluate(() => document.querySelector(".perfil.add").click()); await p.type(".nombre", nombre); await boton(p, "Continuar");
      await esperar(p, () => !!document.querySelector(".pinbox")); await teclea(p, pin); await sleep(300); }
    else await p.evaluate(n => [...document.querySelectorAll(".perfil")].find(x => x.textContent.includes(n)).click(), nombre);
    await teclea(p, pin); await esperar(p, () => !!document.querySelector(".choice"));
  };
  try {
    // personas temporales
    const B = await abrir(BASE); await entrarComo(B, "Zeta", "1357", true);
    const C = await abrir(BASE); await entrarComo(C, "Yeta", "2468", true);
    // Prueba crea el reto: test de 5 preguntas del tema 26, invita a Zeta y Yeta
    const A = await abrir(BASE + "?prueba"); await entrarComo(A, "Prueba", "2468");
    await A.evaluate(() => document.querySelector(".choice.reto").click());
    await A.evaluate(() => { for (const b of document.querySelectorAll(".perfil.mini")) if (/Zeta|Yeta/.test(b.textContent)) b.click(); });
    await boton(A, "Test por temas");
    await A.evaluate(() => { [...document.querySelectorAll(".tema")].find(b => b.querySelector("b").textContent === "26").click(); const i = document.querySelector(".num input"); i.value = "5"; i.dispatchEvent(new Event("input")); });
    log.avisoConfig = await A.evaluate(() => document.querySelector(".card p.muted.small:last-of-type")?.textContent);
    await A.screenshot({ path: "descargas/reto-1-configurar.png" });
    await boton(A, "Enviar el reto");
    await esperar(A, () => document.querySelector("h1")?.textContent === "Sala del reto");
    // Zeta acepta, Yeta rechaza (las invitaciones llegan solas al inicio)
    await B.evaluate(() => document.getElementById("home").click()); await C.evaluate(() => document.getElementById("home").click());
    log.invitacionZeta = await esperar(B, () => !!document.querySelector(".invitacion"));
    log.textoInvitacion = await B.evaluate(() => document.querySelector(".invitacion .small")?.textContent);
    await B.screenshot({ path: "descargas/reto-2-invitacion.png" });
    await B.evaluate(() => [...document.querySelectorAll(".invitacion button")].find(b => b.textContent === "Aceptar").click());
    await esperar(B, () => document.querySelector("h1")?.textContent === "Sala del reto");
    await esperar(C, () => !!document.querySelector(".invitacion"));
    await C.evaluate(() => [...document.querySelectorAll(".invitacion button")].find(b => b.textContent === "Rechazar").click());
    // la sala de Prueba ve a Zeta dentro y a Yeta fuera
    log.salaCreadora = await esperar(A, () => /Zeta\s*Dentro/.test(document.querySelector(".sala").innerText) && /Yeta\s*No viene/.test(document.querySelector(".sala").innerText));
    await A.screenshot({ path: "descargas/reto-3-sala.png" });
    await boton(A, "Empezar ahora");
    // cuenta atrás en las dos y empieza a la vez
    log.cuentaAtrasB = await esperar(B, () => !!document.querySelector(".cuenta"), 10000);
    await B.screenshot({ path: "descargas/reto-4-cuenta.png" });
    await esperar(A, () => !!document.querySelector(".bar")); await esperar(B, () => !!document.querySelector(".bar"));
    const exA = await A.evaluate(() => JSON.parse(localStorage.getItem("oposicion.Prueba.actual")));
    const exB = await B.evaluate(() => JSON.parse(localStorage.getItem("oposicion.Zeta.actual")));
    log.mismasPreguntas = JSON.stringify(exA.preguntas) === JSON.stringify(exB.preguntas);
    log.mismoInicio_ms = Math.abs(exA.inicio - exB.inicio);
    // Prueba contesta 3; Zeta debe verlo en su franja
    await A.evaluate(() => [...document.querySelectorAll(".q")].slice(0, 3).forEach(q => q.querySelectorAll(".opt")[0].click()));
    log.avanceVistoPorZeta = await esperar(B, () => /Prueba\s*3\/5/.test(document.querySelector(".avance")?.innerText || ""), 15000);
    await B.screenshot({ path: "descargas/reto-5-avance.png" });
    // Prueba termina (todo bien) y Zeta después (todo a la primera opción)
    await A.evaluate(() => { const ex = JSON.parse(localStorage.getItem("oposicion.Prueba.actual")); document.querySelectorAll(".q").forEach((q, k) => { const o = q.querySelectorAll(".opt"), c = DATA.preguntas[ex.preguntas[k]].c; if (o[c].getAttribute("aria-pressed") !== "true") o[c].click(); }); });
    await boton(A, "Corregir");
    log.clasifTrasPrueba = await esperar(A, () => /Haciéndolo/.test(document.querySelector(".tablero")?.innerText || "") && /Prueba/.test(document.querySelector(".tablero")?.innerText || ""));
    log.zetaVeQuePruebaTermino = await esperar(B, () => /Prueba\s*✓ Ha terminado/.test(document.querySelector(".avance")?.innerText || ""), 15000);
    await B.evaluate(() => document.querySelectorAll(".q").forEach(q => q.querySelectorAll(".opt")[0].click()));
    await boton(B, "Corregir");
    log.clasificacionFinalA = await esperar(A, () => !/Haciéndolo/.test(document.querySelector(".tablero")?.innerText || "x") && /Zeta/.test(document.querySelector(".tablero")?.innerText || ""), 20000);
    log.tablaFinal = await A.evaluate(() => [...document.querySelectorAll(".tablero tbody tr")].map(tr => tr.innerText.replace(/\s+/g, " ")));
    await A.screenshot({ path: "descargas/reto-6-clasificacion.png" });
    // limpieza: resultados de Prueba
    await A.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Nuevo test").click());
    await esperar(A, () => (localStorage.getItem("oposicion.Prueba.pendientes") || "x") === "[]");
    await A.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.startsWith("Borrar los resultados")).click());
    await A.evaluate(() => document.querySelector(".btn.danger").click());
    log.pruebaLimpia = await esperar(A, () => document.querySelectorAll(".hist li").length === 0);
  } finally {
    // limpieza: borrar a las personas temporales
    if (ADMIN) for (const n of ["Zeta", "Yeta"])
      await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain", "Origin": "http://127.0.0.1:8765", "User-Agent": "Mozilla/5.0 Chrome/140" },
        body: JSON.stringify({ accion: "admin", token: ADMIN, op: "borrarUsuaria", nombre: n }) }).catch(() => {});
    log.err = err;
    console.log(JSON.stringify(log, null, 1));
    await browser.close();
  }
})();
