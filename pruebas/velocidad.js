const puppeteer = require("puppeteer-core");
const URL = process.argv[2];
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", headless: true });
  const ctx = await browser.createBrowserContext(); const p = await ctx.newPage(); const err = [];
  p.on("pageerror", e => err.push(e.message));
  const medir = async (etiqueta, sel) => { const t = Date.now(); await p.goto(URL, { waitUntil: "domcontentloaded" }); await p.waitForSelector(sel, { timeout: 30000 }); return `${etiqueta}: ${((Date.now() - t) / 1000).toFixed(1)} s`; };
  const out = [];
  out.push(await medir("1.ª visita (sin nada guardado), tarjetas", ".perfil"));
  await sleep(500);
  out.push(await medir("2.ª visita, tarjetas", ".perfil"));
  // entrar como Prueba y recargar: sesión abierta
  await p.goto(URL + (URL.includes("?") ? "&" : "?") + "prueba", { waitUntil: "domcontentloaded" }); await p.waitForSelector(".perfil");
  await p.evaluate(() => [...document.querySelectorAll(".perfil")].find(x => x.textContent.includes("Prueba")).click());
  let t = Date.now();
  for (const d of "2468") await p.evaluate(d => [...document.querySelectorAll(".key")].find(k => k.textContent === d).click(), d);
  await p.waitForSelector("#quien .chip", { timeout: 30000 });
  out.push(`comprobar el PIN: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  t = Date.now(); await p.reload({ waitUntil: "domcontentloaded" }); await p.waitForSelector(".choice", { timeout: 30000 });
  out.push(`volver con la sesión abierta, pantalla de inicio: ${((Date.now() - t) / 1000).toFixed(1)} s`);
  await sleep(6000);
  out.push("sigue dentro tras sincronizar: " + await p.evaluate(() => !!document.querySelector("#quien .chip")));
  out.push("errores: " + JSON.stringify(err));
  console.log(out.join("\n"));
  await browser.close();
})();
