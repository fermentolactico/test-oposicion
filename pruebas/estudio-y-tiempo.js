const puppeteer = require("puppeteer-core");
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const p = await browser.newPage(); const err = [], log = {};
  p.on("pageerror", e => err.push(e.message)); p.on("console", m => { if (m.type() === "error") err.push(m.text()); });
  const cdp = await p.createCDPSession(); await cdp.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: __dirname + "/descargas" });
  await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 }); await p.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  const esperar = async (fn, ms = 15000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await p.evaluate(fn)) return true; await sleep(150); } return false; };
  const btn = t => p.evaluate(t => [...document.querySelectorAll("button")].filter(b => b.textContent === t).pop().click(), t);
  await p.goto("http://127.0.0.1:8765/?prueba", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".perfil");
  await p.evaluate(() => [...document.querySelectorAll(".perfil")].find(x => x.textContent.includes("Prueba")).click());
  for (const d of "2468") await p.evaluate(d => [...document.querySelectorAll(".key")].find(k => k.textContent === d).click(), d);
  await esperar(() => !!document.querySelector(".choice"));
  await p.evaluate(() => document.querySelectorAll(".choice")[1].click());
  await p.evaluate(() => { [...document.querySelectorAll(".tema")].find(b => b.querySelector("b").textContent === "26").click(); const i = document.querySelector(".num input"); i.value = "8"; i.dispatchEvent(new Event("input")); });
  await btn("Empezar test");
  // simula que han pasado los minutos del test + 5:23
  await p.evaluate(() => { const k = "oposicion.Prueba.actual", a = JSON.parse(localStorage.getItem(k)); a.inicio = Date.now() - (a.minutos * 60 + 323) * 1000; localStorage.setItem(k, JSON.stringify(a)); });
  await p.reload({ waitUntil: "domcontentloaded" }); await esperar(() => !!document.querySelector(".choice"));
  await btn("Continuar"); await sleep(1200);
  log.reloj = await p.evaluate(() => document.querySelector(".clock").innerText);
  log.relojRojo = await p.evaluate(() => document.querySelector(".clock").classList.contains("over"));
  await p.screenshot({ path: "descargas/reloj.png", clip: { x: 0, y: 0, width: 390, height: 260 } });
  await p.evaluate(() => document.querySelectorAll(".q").forEach(q => q.querySelectorAll(".opt")[0].click()));
  await btn("Corregir");
  await esperar(() => !!document.querySelector(".ring"));
  log.resultado = await p.evaluate(() => [...document.querySelectorAll(".score p")].map(x => x.innerText).join(" | "));
  await p.screenshot({ path: "descargas/resultado.png" });
  await btn("Descargar respuestas"); await sleep(2000);
  // limpieza
  await p.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent === "Nuevo test").click());
  await esperar(() => (localStorage.getItem("oposicion.Prueba.pendientes") || "x") === "[]");
  await p.evaluate(() => [...document.querySelectorAll("button")].find(b => b.textContent.startsWith("Borrar los resultados")).click());
  await p.evaluate(() => document.querySelector(".btn.danger").click());
  log.limpio = await esperar(() => document.querySelectorAll(".hist li").length === 0);
  log.err = err; console.log(JSON.stringify(log, null, 1));
  await browser.close();
})();
