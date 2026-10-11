// Servidor de la web de tests (11/10/2026), en el VPS de Vultr de Madrid. Sustituye a Cloudflare, que LaLiga bloquea
// en España durante los partidos. Sirve la web y su API desde el mismo sitio:
//   /             → index.html, admin.html, preguntas.json y robots.txt (solo esos ficheros)
//   /api/…        → el mismo servidor de siempre (servidor/src/index.js) sobre SQLite (d1.mjs)
// Escucha solo en 127.0.0.1; lo publica Caddy en https://testibsalut.duckdns.org (certificado de Let's Encrypt).
//   En el VPS lo arranca el servicio systemd test-oposicion, con DATOS=/var/lib/test-oposicion/datos.sqlite
//   y SECRETOS=/etc/test-oposicion/secretos.json. En un Mac, sin variables, usa las rutas de abajo.
// Datos:    ~/Library/Application Support/test-oposicion/datos.sqlite
// Secretos: ~/.config/test-oposicion/secretos.json  {"SAL": …, "ADMIN": …}  (permisos 600)
import http from "node:http";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { abrirD1 } from "./d1.mjs";
import worker from "../servidor/src/index.js";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUERTO = Number(process.env.PUERTO || 8090);
const DATOS = process.env.DATOS || join(homedir(), "Library/Application Support/test-oposicion/datos.sqlite");
const SECRETOS = JSON.parse(readFileSync(process.env.SECRETOS || join(homedir(), ".config/test-oposicion/secretos.json"), "utf8"));
const env = { DB: abrirD1(DATOS), SAL: SECRETOS.SAL, ADMIN: SECRETOS.ADMIN };

const ESTATICOS = {
  "/": ["index.html", "text/html; charset=utf-8"],
  "/index.html": ["index.html", "text/html; charset=utf-8"],
  "/admin.html": ["admin.html", "text/html; charset=utf-8"],
  "/preguntas.json": ["preguntas.json", "application/json; charset=utf-8"],
  "/robots.txt": ["robots.txt", "text/plain; charset=utf-8"],
};

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const cuerpo = [];
      for await (const trozo of req) cuerpo.push(trozo);
      const pedido = new Request(url, { method: req.method, headers: req.headers,
        body: ["GET", "HEAD", "OPTIONS"].includes(req.method) ? undefined : Buffer.concat(cuerpo) });
      const r = await worker.fetch(pedido, env);
      res.writeHead(r.status, Object.fromEntries(r.headers));
      return res.end(Buffer.from(await r.arrayBuffer()));
    }
    const f = ESTATICOS[url.pathname];
    if (!f || !["GET", "HEAD"].includes(req.method)) { res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }); return res.end("No existe."); }
    // la web se lee de disco en cada petición: un «git pull» del repo la actualiza sin reiniciar
    const datos = readFileSync(join(RAIZ, f[0]));
    res.writeHead(200, { "Content-Type": f[1], "Cache-Control": f[0] === "preguntas.json" ? "no-cache" : "no-store",
      "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" });
    res.end(req.method === "HEAD" ? undefined : datos);
  } catch (err) {
    console.error(new Date().toISOString(), err);
    if (!res.headersSent) res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Error del servidor.");
  }
}).listen(PUERTO, "127.0.0.1", () => console.log(`test-oposicion en http://127.0.0.1:${PUERTO} · datos ${DATOS}`));
