// Registro de tests: al corregir se guarda el test entero; «Mis tests» lo enseña y genera sus PDF.
// Contra el servidor en local (wrangler dev --local, puerto 8787) y el perfil Prueba (PIN 2468):
//   node registro-de-tests.js http://127.0.0.1:8787/
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const sleep = ms => new Promise(r => setTimeout(r, ms));
const API = process.argv[2] || "http://127.0.0.1:8787/";
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const p = await browser.newPage(); const err = [], log = {};
  p.on("pageerror", e => err.push(e.message)); p.on("console", m => { if (m.type() === "error") err.push(m.text()); });
  const descargas = __dirname + "/descargas/registro";
  fs.rmSync(descargas, { recursive: true, force: true }); fs.mkdirSync(descargas, { recursive: true });
  const cdp = await p.createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: descargas });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  const esperar = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await sleep(150); } return false; };
  const btn = t => p.evaluate(t => [...document.querySelectorAll("button")].filter(b => b.textContent === t).pop().click(), t);
  await p.goto(`http://127.0.0.1:8765/?prueba&api=${encodeURIComponent(API)}`, { waitUntil: "domcontentloaded" });
  await p.waitForSelector(".perfil");
  await p.evaluate(() => [...document.querySelectorAll(".perfil")].find(x => x.textContent.includes("Prueba")).click());
  for (const d of "2468") await p.evaluate(d => [...document.querySelectorAll(".key")].find(k => k.textContent === d).click(), d);
  await esperar(() => !!document.querySelector(".choice"));

  // 1. un simulacro entero: todas en la a, salvo diez en blanco
  await p.evaluate(() => document.querySelectorAll(".choice")[0].click());
  await esperar(() => document.querySelectorAll(".q").length > 50);
  await p.evaluate(() => document.querySelectorAll(".q").forEach((q, i) => { if (i % 11) q.querySelectorAll(".opt")[0].click(); }));
  await btn("Corregir"); await sleep(300); await btn("Corregir");
  await esperar(() => !!document.querySelector(".ring"));
  log.notaEnPantalla = await p.evaluate(() => document.querySelector(".ring b").textContent);
  await esperar(() => !JSON.parse(localStorage.getItem("oposicion.Prueba.pendientes") || "[]").length, 20000);
  log.pendientesTrasEnviar = await p.evaluate(() => JSON.parse(localStorage.getItem("oposicion.Prueba.pendientes") || "[]").length);

  // 2. «Mis tests» desde el inicio
  await btn("Nuevo test"); await esperar(() => !!document.querySelector(".choice"));
  await btn("Ver todos tus tests y respuestas");
  await esperar(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Ver"));
  log.lista = await p.evaluate(() => [...document.querySelectorAll(".hist li")].map(li => li.innerText.replace(/\s+/g, " ")));
  await p.screenshot({ path: descargas + "/mis-tests.png" });
  await btn("Ver");
  await esperar(() => !!document.querySelector(".ring"));
  log.notaGuardada = await p.evaluate(() => document.querySelector(".ring b").textContent);
  log.preguntasGuardadas = await p.evaluate(() => document.querySelectorAll(".q").length);
  log.blancosGuardados = await p.evaluate(() => document.querySelectorAll(".q.res-blank").length);
  log.botones = await p.evaluate(() => [...document.querySelectorAll(".row button")].map(b => b.textContent));
  await p.screenshot({ path: descargas + "/test-guardado.png" });
  await btn("Descargar test"); await btn("Descargar respuestas"); await sleep(3000);
  log.pdf = fs.readdirSync(descargas).filter(f => f.endsWith(".pdf")).map(f => `${f}: ${Math.round(fs.statSync(descargas + "/" + f).size / 1024)} KB`);
  await btn("Volver a mis tests");
  log.vuelveALista = await esperar(() => [...document.querySelectorAll("button")].some(b => b.textContent === "Ver"));

  console.log(JSON.stringify(log, null, 1));
  console.log(err.length ? "ERRORES: " + err.join(" | ") : "sin errores en la consola");
  await browser.close();
  const bien = log.notaGuardada === log.notaEnPantalla && log.preguntasGuardadas === 110 && log.pdf.length === 2 && log.vuelveALista && !err.length;
  process.exit(bien ? 0 : 1);
})();
