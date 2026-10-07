/**
 * Servidor de notas de la web de tests (Cloudflare Workers + D1).
 * Contesta igual que el Apps Script anterior, así la web solo cambia de dirección:
 *   GET  ?accion=estado                      → usuarias y tablero (público)
 *   POST {accion:"nueva", nombre}            → alta (máximo 5, sin contar «Prueba»)
 *   POST {accion:"crearPin", nombre, clave}  → primer PIN
 *   POST {accion:"entrar"|"guardar"|"borrar", nombre, clave, …}
 *   POST {accion:"admin", token, op, …}      → página de administración (secreto ADMIN)
 * La web manda el PIN ya resumido (SHA-256); aquí se resume otra vez con la sal secreta SAL.
 * Cinco fallos seguidos bloquean a esa persona 15 minutos.
 */
const PRUEBA = "Prueba";
const MAX_USUARIAS = 5, MAX_FALLOS = 5, BLOQUEO_MS = 15 * 60 * 1000;
const ORIGENES = ["https://fermentolactico.github.io", "http://127.0.0.1:8765", "http://localhost:8765"];

export default {
  async fetch(request, env) {
    const origen = request.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGENES.includes(origen) ? origen : ORIGENES[0],
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    let salida;
    try {
      if (request.method === "GET") {
        if ((new URL(request.url).searchParams.get("accion") || "estado") !== "estado") throw new Error("Acción desconocida.");
        salida = await estado(env);
      } else if (request.method === "POST") {
        salida = await accion(env, JSON.parse(await request.text() || "{}"));
      } else throw new Error("Método no admitido.");
    } catch (err) {
      salida = { ok: false, error: String(err.message || err) };
    }
    return new Response(JSON.stringify(salida), { headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  },
};

async function accion(env, d) {
  switch (d.accion) {
    case "nueva": return nueva(env, d.nombre);
    case "crearPin": return crearPin(env, d.nombre, d.clave);
    case "entrar": await comprobar(env, d.nombre, d.clave); return { ok: true, historial: await historial(env, d.nombre), usadas: await usadas(env, d.nombre) };
    case "guardar": await comprobar(env, d.nombre, d.clave); return guardar(env, d.nombre, d.resultado, d.usadas);
    case "borrar": await comprobar(env, d.nombre, d.clave); return borrarTodo(env, d.nombre);
    case "admin": return admin(env, d);
    default: throw new Error("Acción desconocida.");
  }
}

// ---------- utilidades ----------
async function sha256(texto) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");
}
const resumen = (env, clave) => sha256(env.SAL + ":" + clave);
function limpiaNombre(n) {
  n = String(n || "").trim().replace(/\s+/g, " ").slice(0, 30);
  if (!n) throw new Error("Falta el nombre.");
  return n;
}
function diaMadrid(ms) {     // «2026-10-07» en hora de Madrid
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(ms)).map(x => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
function lunesMadrid(ahora) {
  const dia = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Madrid", weekday: "short" }).format(new Date(ahora));
  const atras = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(dia);
  return diaMadrid(ahora - atras * 86400000);
}

// ---------- usuarias y PIN ----------
async function nueva(env, nombre) {
  nombre = limpiaNombre(nombre);
  if (await env.DB.prepare("SELECT 1 FROM usuarias WHERE nombre = ?").bind(nombre).first()) return { ok: true };
  const { n } = await env.DB.prepare("SELECT COUNT(*) AS n FROM usuarias WHERE nombre != ?").bind(PRUEBA).first();
  if (nombre !== PRUEBA && n >= MAX_USUARIAS) throw new Error(`Ya hay ${MAX_USUARIAS} personas.`);
  await env.DB.prepare("INSERT OR IGNORE INTO usuarias (nombre, pin, alta) VALUES (?, '', ?)").bind(nombre, Date.now()).run();
  return { ok: true };
}
async function crearPin(env, nombre, clave) {
  if (!/^[0-9a-f]{64}$/.test(String(clave))) throw new Error("PIN no válido.");
  const u = await env.DB.prepare("SELECT pin FROM usuarias WHERE nombre = ?").bind(nombre).first();
  if (!u) throw new Error("No existe esa persona.");
  if (u.pin) throw new Error("Esa persona ya tiene PIN.");
  // «AND pin = ''»: si dos dispositivos lo crean a la vez, solo vale el primero
  const r = await env.DB.prepare("UPDATE usuarias SET pin = ? WHERE nombre = ? AND pin = ''").bind(await resumen(env, clave), nombre).run();
  if (!r.meta.changes) throw new Error("Esa persona ya tiene PIN.");
  return { ok: true, historial: [], usadas: [] };
}
async function comprobar(env, nombre, clave) {
  const ahora = Date.now();
  const f = await env.DB.prepare("SELECT n, hasta FROM fallos WHERE nombre = ?").bind(nombre).first();
  if (f && f.n >= MAX_FALLOS && f.hasta > ahora) throw new Error("Demasiados intentos. Espera 15 minutos.");
  const u = await env.DB.prepare("SELECT pin FROM usuarias WHERE nombre = ?").bind(nombre).first();
  if (!u || !u.pin || u.pin !== await resumen(env, String(clave))) {
    const n = f && f.hasta > ahora ? f.n + 1 : 1;     // los fallos viejos (bloqueo ya pasado) no cuentan
    await env.DB.prepare("INSERT INTO fallos (nombre, n, hasta) VALUES (?, ?, ?) ON CONFLICT(nombre) DO UPDATE SET n = excluded.n, hasta = excluded.hasta")
      .bind(nombre, n, ahora + BLOQUEO_MS).run();
    throw new Error("PIN incorrecto.");
  }
  if (f) await env.DB.prepare("DELETE FROM fallos WHERE nombre = ?").bind(nombre).run();
}

// ---------- resultados ----------
async function guardar(env, nombre, r, ids) {
  if (!r || typeof r.nota !== "number") throw new Error("Resultado no válido.");
  const fin = Number(r.fin) || Date.now();
  const lote = [env.DB.prepare(`INSERT OR IGNORE INTO resultados (nombre, tipo, descr, nota, maximo, aprobado, a, e, b, n, fin)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(nombre, r.tipo === "simulacro" ? "simulacro" : "test", String(r.desc || "").slice(0, 120), r.nota, Number(r.maximo) || 0,
      r.aprobado ? 1 : 0, r.a ?? null, r.e ?? null, r.b ?? null, r.n ?? null, fin)];
  for (const h of (Array.isArray(ids) ? ids : []).slice(0, 5000)) lote.push(env.DB.prepare("INSERT OR IGNORE INTO usadas (nombre, h) VALUES (?, ?)").bind(nombre, String(h).slice(0, 16)));
  for (let i = 0; i < lote.length; i += 200) await env.DB.batch(lote.slice(i, i + 200));
  return { ok: true, tablero: await tablero(env) };
}
async function historial(env, nombre) {
  const { results } = await env.DB.prepare("SELECT tipo, descr, nota, maximo, aprobado, fin FROM resultados WHERE nombre = ? ORDER BY fin DESC LIMIT 50").bind(nombre).all();
  return results.map(x => ({ tipo: x.tipo, desc: x.descr, nota: x.nota, maximo: x.maximo, aprobado: !!x.aprobado, fin: x.fin }));
}
async function usadas(env, nombre) {
  const { results } = await env.DB.prepare("SELECT h FROM usadas WHERE nombre = ?").bind(nombre).all();
  return results.map(x => x.h);
}
async function borrarTodo(env, nombre) {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM resultados WHERE nombre = ?").bind(nombre),
    env.DB.prepare("DELETE FROM usadas WHERE nombre = ?").bind(nombre),
  ]);
  return { ok: true, tablero: await tablero(env) };
}

// ---------- tablero (público) ----------
async function estado(env) {
  const { results } = await env.DB.prepare("SELECT nombre, pin != '' AS tienePin FROM usuarias ORDER BY alta, nombre").all();
  const us = results.map(x => ({ nombre: x.nombre, tienePin: !!x.tienePin }));
  return { ok: true, usuarias: us, tablero: await tablero(env, us.map(u => u.nombre)) };
}
async function tablero(env, nombres) {
  if (!nombres) nombres = (await env.DB.prepare("SELECT nombre FROM usuarias ORDER BY alta, nombre").all()).results.map(x => x.nombre);
  nombres = nombres.filter(n => n !== PRUEBA);
  const { results } = await env.DB.prepare("SELECT nombre, tipo, nota, fin FROM resultados WHERE nombre != ? ORDER BY fin DESC").bind(PRUEBA).all();
  const lunes = lunesMadrid(Date.now());
  return nombres.map(n => {
    const mias = results.filter(x => x.nombre === n);
    const sims = mias.filter(x => x.tipo === "simulacro").map(x => x.nota);
    const ult = sims.slice(0, 5);
    return {
      nombre: n,
      mejor: sims.length ? Math.max(...sims) : null,
      media5: ult.length ? Math.round(ult.reduce((a, b) => a + b, 0) / ult.length * 100) / 100 : null,
      simulacros: sims.length,
      semana: mias.filter(x => diaMadrid(x.fin) >= lunes).length,
      total: mias.length,
    };
  });
}

// ---------- administración (contraseña en el secreto ADMIN) ----------
async function admin(env, d) {
  if (!env.ADMIN || String(d.token || "") !== env.ADMIN) {
    await new Promise(r => setTimeout(r, 800));       // frena a quien pruebe contraseñas
    throw new Error("Contraseña de administración incorrecta.");
  }
  if (d.op === "reiniciarPin") {
    await env.DB.batch([
      env.DB.prepare("UPDATE usuarias SET pin = '' WHERE nombre = ?").bind(d.nombre),
      env.DB.prepare("DELETE FROM fallos WHERE nombre = ?").bind(d.nombre),
    ]);
  } else if (d.op === "borrarUsuaria") {
    await env.DB.batch(["usuarias", "resultados", "usadas", "fallos"].map(t => env.DB.prepare(`DELETE FROM ${t} WHERE nombre = ?`).bind(d.nombre)));
  } else if (d.op !== "listar") throw new Error("Operación desconocida.");
  const us = (await env.DB.prepare("SELECT nombre, pin != '' AS tienePin, alta FROM usuarias ORDER BY alta, nombre").all()).results;
  const res = (await env.DB.prepare("SELECT nombre, tipo, descr, nota, maximo, aprobado, a, e, b, n, fin FROM resultados ORDER BY fin DESC").all()).results;
  return { ok: true, usuarias: us.map(u => ({ ...u, tienePin: !!u.tienePin })), resultados: res, tablero: await tablero(env) };
}
