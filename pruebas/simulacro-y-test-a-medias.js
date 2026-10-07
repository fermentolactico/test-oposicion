const puppeteer = require("puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const p = await (await browser.createBrowserContext()).newPage(); const err = [], log = {};
  p.on("pageerror", e => err.push(e.message)); p.on("console", m => { if (m.type() === "error") err.push(m.text()); });
  p.on("dialog", d => { err.push("dialog " + d.message()); d.dismiss(); });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  const esperar = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await sleep(150); } return false; };
  const btn = t => p.evaluate(t => [...document.querySelectorAll("button")].filter(b => b.textContent === t).pop().click(), t);
  const usadas = () => p.evaluate(() => JSON.parse(localStorage.getItem("oposicion.Prueba.usadas") || "[]").length);
  const actual = () => p.evaluate(() => { const a = JSON.parse(localStorage.getItem("oposicion.Prueba.actual") || "null"); return a && a.preguntas[0]; });
  await p.goto("http://127.0.0.1:8765/?prueba", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".perfil");
  await p.evaluate(() => [...document.querySelectorAll(".perfil")].find(x => x.textContent.includes("Prueba")).click());
  for (const d of "2468") await p.evaluate(d => [...document.querySelectorAll(".key")].find(k => k.textContent === d).click(), d);
  await esperar(() => !!document.querySelector(".choice"));
  log.usadasAlEntrar = await usadas();
  await p.evaluate(() => document.querySelectorAll(".choice")[0].click());
  const primera = await actual();
  log.usadasTrasGenerar = await usadas();
  // vuelve al inicio y pide otro simulacro: aviso
  await p.evaluate(() => document.getElementById("home").click());
  await p.evaluate(() => document.querySelectorAll(".choice")[0].click());
  log.aviso = await p.evaluate(() => document.querySelector(".modal h3")?.textContent);
  await p.screenshot({ path: "descargas/modal.png" });
  await btn("Continuar el anterior");
  log.continuaElMismo = (await actual()) === primera && await p.evaluate(() => !!document.querySelector(".bar"));
  // otra vez, ahora descartando
  await p.evaluate(() => document.getElementById("home").click());
  await p.evaluate(() => document.querySelectorAll(".choice")[0].click());
  await btn("Descartarlo y empezar");
  log.otroDistinto = (await actual()) !== primera;
  log.usadasTrasDescartar = await usadas();
  // corregir sin contestar nada
  await btn("Corregir"); await sleep(200); await btn("Corregir"); await sleep(200);
  log.sinRespuestas = await p.evaluate(() => document.querySelector(".center p").textContent);
  log.noSeCorrigio = await p.evaluate(() => !!document.querySelector(".bar"));
  // contesta una y corrige (dos pulsaciones por los blancos)
  await p.evaluate(() => document.querySelectorAll(".q")[0].querySelectorAll(".opt")[0].click());
  await btn("Corregir"); await sleep(200); await btn("Corregir");
  await esperar(() => (localStorage.getItem("oposicion.Prueba.pendientes") || "x") === "[]");
  log.corregido = await p.evaluate(() => document.querySelector("h1")?.textContent);
  log.usadasTrasCorregir = await usadas();
  // ¿llegaron al servidor? entrar de nuevo desde cero en otro contexto
  const q = await (await browser.createBrowserContext()).newPage();
  await q.goto("http://127.0.0.1:8765/?prueba", { waitUntil: "domcontentloaded" }); await q.waitForSelector(".perfil");
  await q.evaluate(() => [...document.querySelectorAll(".perfil")].find(x => x.textContent.includes("Prueba")).click());
  for (const d of "2468") await q.evaluate(d => [...document.querySelectorAll(".key")].find(k => k.textContent === d).click(), d);
  const t = Date.now(); while (Date.now() - t < 15000 && !(await q.evaluate(() => JSON.parse(localStorage.getItem("oposicion.Prueba.usadas") || "[]").length))) await sleep(200);
  log.usadasEnServidor = await q.evaluate(() => JSON.parse(localStorage.getItem("oposicion.Prueba.usadas") || "[]").length);
  // limpieza
  await q.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.startsWith("Borrar los resultados")).click());
  await q.evaluate(() => document.querySelector(".btn.danger").click());
  const t2 = Date.now(); while (Date.now() - t2 < 15000 && await q.evaluate(() => document.querySelectorAll(".hist li").length)) await sleep(200);
  log.limpio = !(await q.evaluate(() => document.querySelectorAll(".hist li").length));
  log.err = err;
  console.log(JSON.stringify(log, null, 1));
  await browser.close();
})();
